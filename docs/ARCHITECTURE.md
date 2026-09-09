# LCARS Home Card - Architecture (as-built)

As-built contract for **v0.1.23**, source commit `6b5771d`. This document describes what the shipped code actually does; where behavior is surprising, the reason is noted. Camera playback moved from WebRTC (`<ha-camera-stream>`) to HLS (`<ha-hls-player>`) in v0.1.19, v0.1.20 fixed a stream-fetch ordering bug in the HLS handoff, v0.1.21 added a watchdog that self-heals dead stream sessions with a degraded still-frame fallback, v0.1.22 fixed calendar event times dropping minutes, and v0.1.23 made all clock labels uniformly include minutes; each is covered in the sections below.

## Module layout

| File | Role |
|---|---|
| `src/lcars-home-panel.js` | Custom element `lcars-home-panel`; rendering, subscriptions, service calls, embedded stylesheet (`STYLE`), customCards registration |
| `src/lcars-adapters.js` | Pure, dependency-free helper functions (formatting, markup builders, classification, setpoint math) - the unit-testable core |
| `test/adapters.test.mjs` | Unit tests for every adapter |
| `test/panel-layout.test.mjs` | Source-contract tests: regex assertions that layout/behavior invariants hold in the panel source |
| `harness.html` | 768×1024 local fixture with stub states/connection |
| `harness_shot.py` / `harness_inspect.py` | CDP screenshot / DOM-inspection drivers for the harness |
| `assets/cinnamoroll.png` | Theme mascot; immutable, tag-pinned (see THEMES.md) |
| `package.json` | `type: module`, zero dependencies; `test` = `node --test test/*.test.mjs`, `check` = `node --check` on both src files |

No build step. The deployed artifact is `src/lcars-home-panel.js` itself, served tag-pinned from jsDelivr; it imports `lcars-adapters.js` from the same release.

## Component lifecycle

- `constructor` - opens an `open` shadow root, seeds state, and installs two delegated listeners on the shadow root: `click` (camera tile → zoom) and `keydown` (Enter/Space on a camera tile, Escape to close the overlay). Event delegation means these survive panel updates.
- `setConfig(config)` - deep-merges `{ ...DEFAULTS, ...(config?.entities ?? {}) }`, then resets the camera tile cache, expanded-camera state, and pressure-trend key, tears down all subscriptions, and calls `_buildShell`. Called once per dashboard config load.
- `hass` setter - stores the HA object, runs the three "ensure" passes (forecast subscriptions, calendar, pressure trend), and calls `_updatePanels`. Called on every HA state push.
- `connectedCallback` - calls `_buildShell`. `disconnectedCallback` - tears down all subscriptions.
- `getCardSize()` - returns `16`.
- Render guard - with no config, `_buildShell` falls through to `_renderLoading`: the shadow root shows `LCARS LINK ESTABLISHING` with the stylesheet, nothing else. With a config but no `hass` yet, the shell is built but `_updatePanels` no-ops until the first `hass` push.
- The element is registered only if `customElements.get("lcars-home-panel")` is empty; `window.customCards` gets `{ type: "lcars-home-panel", name: "LCARS Home Panel", preview: false }`.

## Render architecture (v0.1.19+: shell built once, panels updated in place)

The shell is constructed exactly once per `setConfig`/`connectedCallback` via `_buildShell`: the full template literal (stylesheet, rail, masthead/columns/panels, camera overlay, footer, mascot) is assigned to `shadowRoot.innerHTML`, then `_mountCameras` reconciles the persistent camera tiles and `_updatePanels` fills every `[data-panel]` container. All dynamic text passes `esc()` (HTML-escaping of `& < > ' "`); adapter-generated markup escapes attributes the same way.

Every later state push calls `_updatePanels`, which writes ONLY the `[data-panel]` containers (`_setPanel(name, html)`) - never the whole shadow root. This is deliberate: a full `innerHTML` rebuild would destroy and recreate the live `<ha-hls-player>` elements, and each `disconnectedCallback` would kill its stream. Panels that change frequently (hourly weather, forecast) are separate `[data-panel]` containers; cameras and the climate buttons are reconciled separately (see below). `_updatePanels` also re-wires the climate `−`/`+` buttons after writing the climate container.

## Data flow by domain

### Weather forecast (subscription + fallback)

1. `_ensureForecastSubscriptions` opens exactly one pair of `connection.subscribeMessage` calls per weather entity - `{ type: "weather/subscribe_forecast", forecast_type: "hourly" | "daily", entity_id }` - guarded by a single `_subscriptionWeather` key. Changing the weather entity (or re-running `setConfig`) tears down and resubscribes.
2. Each incoming push replaces `_hourly`/`_daily` and re-renders. A rejected subscription clears that array and re-renders - silent degradation, no error UI.
3. **Fallback cadence classification:** if a subscription never delivers, the render falls back to `classifyForecast(weather.attributes.forecast)`: entries are validated by `Date.parse`, sorted, and the median time step between consecutive entries decides the bucket - median ≤ 6 h → hourly, else daily. Single valid entry → daily. This supports providers that expose attribute forecasts but not subscription pushes.
4. Display: `visibleForecast` filters out entries with unparseable datetimes and caps the strip (5 hourly, 4 daily). Each tile shows a local time/day label (Intl with the HA `time_zone`), a condition glyph (moon ☾, partly-cloudy ⛅, etc., with a bullet fallback), the rounded temperature, and `formatPrecipitation` - the provider's real `precipitation` in mm (`0 mm` is shown as-is; `-` when absent). No invented probability.
5. When both sources are empty, panels degrade to `Awaiting hourly data.` / `Awaiting daily data.`

### Calendar (authenticated local-day API)

- `_ensureCalendar` computes a key of `${calendarEntity}:${isoAtLocalMidnight(tz)}` - the fetch runs once per local day (or entity change), not on every state push. Local midnight is computed from `Intl.DateTimeFormat` parts plus an offset correction, making it DST-safe.
- Request: `hass.callApi("GET", "calendars/<entity>?start=<today 00:00>&end=<tomorrow 00:00>)` - the frontend's authenticated API; no tokens or credentials travel through the card source.
- Events are sorted by start (`dateTime` or all-day `date`). Entries without a `dateTime` render as `ALL DAY`. Events whose `end.dateTime` is in the past render dimmed (`.event.past`). Empty list → `No family events today.`; API failure → `Calendar unavailable.`
- Event times use `formatTime` via `formatCalendarTime`. Since v0.1.23 `formatTime` always includes minutes, so every clock label on the card is uniform: `3:00 PM`, `5:45 PM`, `12:00 AM` - no compact on-the-hour forms. The hourly forecast strip shares `formatTime`, so its labels carry minutes too (`1:00 AM, 2:00 AM, 3:00 AM`), verified to fit the tile geometry with no clipping. Regression-tested in `adapters.test.mjs`.

### Pressure trend (3-hour recorder + deadband)

- `_ensurePressureTrend` runs `hass.callApi("GET", "history/period/<now − 3h>?filter_entity_id=<weather entity>")`, keyed on `${weatherEntity}:${last_updated ?? last_changed ?? "current"}` so it re-queries only when the weather entity itself updates.
- `pressureTrend(currentPressure, history, deadband = 0.15)` compares the provider's raw pressure values. Home Assistant supplies this feed in hPa, so the default deadband is 0.15 hPa, equivalent to 0.015 kPa in the panel's displayed unit:
  - current = numeric `attributes.pressure` from the live weather state;
  - baseline = the **first** finite `attributes.pressure` across the flattened recorder records (oldest valid sample);
  - delta = current − baseline, rounded to 0.1;
  - delta > +0.15 → `rising ↑`; delta < −0.15 → `falling ↓`; else → `steady` (no arrow); missing current or history → `unknown` (no arrow).
- The panel renders pressure as kPa (`hPa / 10`, one decimal) with the arrow span; the arrow spans carry a `title` exposing the direction for assistive tech.

### Climate setpoint control

- `−` / `+` buttons call `_setClimate(±1)`, skipped entirely when the climate entity is missing or `unknown`/`unavailable`/`none`/empty; buttons also carry the `disabled` attribute in that case.
- `nextTemperature(current, direction, attributes)` (adapter):
  - range: `min_temp` (default 7) and `max_temp` (default 35), numeric-guarded;
  - step: `target_temp_step` when numeric and > 0, otherwise inferred from the current setpoint - 0.1 when the setpoint is non-integer, else 0.5;
  - base: current setpoint when numeric, otherwise the range midpoint;
  - result: base + direction × step, clamped to `[min, max]`, rounded to the step (EPSILON-guarded float rounding).
- Command: `hass.callService("climate", "set_temperature", { entity_id, temperature })`. Rejection renders an inline `Climate command did not complete.` banner inside the climate panel.

### Security normalization

`normalizeSecurity(state)` (adapter) - alert styling is deliberately reserved for actual open states:

| State | Label | Alert |
|---|---|---|
| `on`, `open`, `opening`, `detected`, `alarm` | OPEN | yes |
| `unknown`, `unavailable`, `none`, `""` | UNAVAILABLE | no |
| anything else (`off`, `closed`, …) | SECURE | no |

### Lights

`lightsOn(states)` scans the entire HA state map for `light.*` entities with state `on`, maps them to `friendly_name` (falling back to the entity id), and sorts case-insensitively. Empty → `No lights are on right now.`

### Feeds (word + fuel)

- `formatFeed(value, fallback, { uppercase })`: strips decorative leading emoji/pictographs per line (Extended_Pictographic / Emoji_Presentation / variation selector), uppercases by default, filters empty lines. The word and fuel panels pass `uppercase: false` for sentence-case body copy.
- Empty/unavailable states fall back to `The word of the day updates nightly.` / `Fuel prices update nightly.`
- The fuel panel derives a `LAST POLLED h:mm AM/PM` stamp from `last_updated` in the HA time zone (only when the state is present and not unavailable).
- Entities never enter the DOM unescaped - feeds are text-only by construction.

## Camera subsystem (HLS player, persistence, fixed overlay)

This is the most behavior-rich part; source-contract tests pin it. v0.1.15 fixed a flicker bug where streams restarted on every render; v0.1.19 replaced the transport (WebRTC → HLS) for kiosk resilience; v0.1.20 fixed a property-ordering bug in the HLS handoff; v0.1.21 added a dead-session watchdog with degraded still-frame fallback and backoff renegotiation (below).

### Why HLS, not WebRTC (v0.1.19)

v0.1.18 mounted `<ha-camera-stream>`, which prefers WebRTC. A WebRTC camera session is bound to the frontend's websocket connection: when the camera source blips (common with flaky cloud camera feeds), session teardown can throw inside `ha-web-rtc-player` and wedge the page event loop, dropping the websocket that carries every other card update. The kiosk then showed a persistent "Connection lost. Reconnecting." banner until a full app relaunch.

v0.1.19 mounts `<ha-hls-player>` instead. HA's HLS stream is a plain HTTP/MSE segment feed - it has zero websocket coupling, retries/self-heals via hls.js, and a camera blip degrades to a player retry, never a connection death. Two ordering traps were pinned in the same change:

1. **Assign `player.hass` before `player.entityid`.** `ha-hls-player.updated()` fetches its stream URL when `entityid` changes, and the fetch reads `this.hass.config`. If `entityid` lands first with no `hass`, the read throws.
2. **Never move or rebuild a mounted camera tile during a normal update.** `ha-hls-player.disconnectedCallback` calls `_cleanUp()`, which kills the stream. Tiles persist; only a camera state change rebuilds one.

### Markup and persistence

- **Markup.** `cameraStreamMarkup` emits `<ha-hls-player class="camera-stream" data-camera=… autoplay playsinline muted aria-label=…>` - HA's own HLS element - inside a tile div with `role="button" tabindex="0" aria-expanded="false"` and a `LIVE` label. `cameraOfflineMarkup` (used when the camera state is `unknown`/`unavailable`/`none`/`""`/`off`) emits a glyph placeholder (◐) plus an optional last-good frame: `entity_picture` resolved through `hass.hassUrl`, `loading="lazy"`, hidden on load error via `onerror`. Offline tiles never show a black live box.
- **Persistence.** `_mountCameras` keeps a per-entity cache: `this._cameraTiles[entity] = { key, node }` where `key = ${entity}|${state}`. When the key is unchanged, the render pass re-appends **the same cached DOM node** to `[data-cameras]`, so the `<ha-hls-player>` element is never recreated while the camera state is stable and the live feed never restarts. Only a state change (or `setConfig`) rebuilds a tile. `_toggleCameraZoom(entity)` flips `_expandedCamera` and re-runs `_mountCameras`, which moves the same cached node into `[data-camera-expanded]` and back; zoom is a class toggle plus `appendChild`, never a remount.
- **Property handoff (v0.1.20 fix).** `_pushCameraProps` is called after any camera rebuild. Its guard is the fix: it no-ops entirely when `this._hass` is falsy (`if (!this._hass) return;`), because assigning `entityid` before `hass` exists makes the player's `updated()` throw silently (the `isComponentLoaded(this.hass.config, …)` read sits outside its try/catch), leaving `_url` null forever - lit's `updated()` only refires when `entityid` *changes*, so a null-hass first assignment is never retried. When `hass` exists, it assigns `player.hass` first, then `player.entityid` only if it differs from `data-camera`; if `entityid` is unchanged it refreshes `player.hass` alone (keeps the player's hass fresh without triggering a refetch). Regression-tested in `panel-layout.test.mjs` ("never assign entityid before hass exists").
- **Fixed overlay.** `_syncCameraClasses` toggles `camera-expanded` on the tile and `open`/`aria-hidden` on `[data-camera-overlay]`. The overlay is `position:absolute; inset:0; z-index:20`, dimmed with backdrop blur; the expanded tile renders up to 700px wide, 16:9, sky-colored border. `aria-expanded` mirrors the open state; the overlay's `aria-hidden` mirrors it in reverse.
- Two entries are hardcoded: `FRONT DOOR` and `BACK DOOR`, mapping to `entities.front_camera` / `entities.back_camera`.

### Camera failure behavior (v0.1.19+)

The player distinguishes "source unreachable" (a real black screen that no card change can fix) from "entity offline" (a handled tile state):

- Entity state `unknown`/`unavailable`/`none`/`""`/`off` → `cameraOfflineMarkup` (glyph + last-good frame + `OFFLINE` label). This is a card-level, deterministic branch.
- Entity reports `streaming`/`idle` but HA's `camera/stream` websocket call never returns a playlist URL (e.g. the camera integration's signed stream session expired at the provider) → the player's `_url` stays null and the tile stays dark. Nothing in the card can render pixels the backend won't serve; the fix is provider-side (reload the camera integration so it re-negotiates stream credentials). Diagnosing this exact case is an operator runbook procedure (see the lcars-dashboard-workflow skill), not a card behavior.

### Dead-session watchdog and degraded fallback (v0.1.21)

A third failure mode surfaced in production: a player mounts a *healthy* session, then HA's `stream` worker for that session dies later (a provider blip that outlasts worker retries). The player keeps retrying its dead playlist URL - clock frozen, `readyState 2`, `_error` "Stream network error" - and nothing re-negotiates because the entity state never changed. Before v0.1.21 that meant a black tile until a human reloaded the page.

v0.1.21 adds a watchdog that closes the loop without any card state change or page reload:

- `_startCameraWatchdog()` runs a 10 s interval (`CAMERA_WATCH_MS`) while connected; `setConfig` and `connectedCallback` both start it (idempotent), `disconnectedCallback` stops it. Per-entity health lives in `this._cameraHealth` (seeded by `_mountCameras`) with `{ since, lastTime, attempts, retryAt, degradedAt }`.
- Each tick reads the player's `_error` and the underlying `<video>` (`readyState`, frozen `currentTime`). A player is unhealthy when `_error` is set, or when it has a URL but the video sits at `readyState ≤ 2` with an un-advancing clock. Unhealthy time accrues from `health.since`; after `CAMERA_STALL_MS` (25 s) of sustained stall the tile **degrades**.
- **Degraded mode** (`health.degradedAt` set) renders `cameraDegradedMarkup`: the last-good `entity_picture` frame as a still (full-opacity, gold `RECONNECTING` label) with no live player attached - never a black box. The camera tile cache key encodes the mode (`entity|degraded` vs `entity|<state>`), so the mode flip remounts cleanly.
- **Renegotiation with backoff**: the watchdog keeps the tile degraded for a backoff delay computed by `_cameraRetryDelay(attempt)` = min(`CAMERA_RETRY_BASE_MS` 30 s × 2^attempt, `CAMERA_RETRY_MAX_MS` 300 s), then clears `degradedAt` and remounts a fresh `<ha-hls-player>`. The fresh player's `entityid` assignment triggers a new `camera/stream` fetch → new session token. If the new session plays, health resets (attempts → 0). If it dies again, the tile re-degrades with the next (longer) backoff.
- Verified live 2026-09-09: a deliberately stale front-door session (frozen clock, `Stream network error`) self-healed in 64 s - stall detection → degraded still at 25 s → backoff → fresh player at ~60 s → `readyState 4`, clock advancing, new session token - with zero page reloads and no impact on the healthy back-door stream.

## Layout target and geometry

- **Target: 768×1024 CSS px portrait @ DPR2** - the harness drives `Emulation.setDeviceMetricsOverride` with `deviceScaleFactor: 2`.
- Shell: full-height flex column, `min-height:100vh`, 10px padding, `overflow:clip`; a 28px decorative rail (apricot, `aria-hidden`) + console grid; masthead band with greeting (time-of-day based) and the current date in HA time zone, uppercase, no period; footer band `ALL SYSTEMS NOMINAL` + `LCARS HOME · <version>`.
- Two-column body grid (0.94fr / 1.06fr). Left column: SECURITY → ENTRY CAMERAS (2× 16:9 tiles) → climate + OUTSIDE side by side → LIGHTS ON. Right column: CALENDAR · TODAY → HOURLY WEATHER (5 tiles) → DAILY WEATHER (4 tiles) → FUEL → WORD OF THE DAY.
- OUTSIDE is a vertical stack ordered TEMP, HUMIDITY, WIND, PRESSURE(kPa) - pinned by a source-contract test. Tabs use clipped LCARS parallelogram geometry; panel accents map to tab colors (`sky`, `salmon`, `lilac`, `apricot`, `gold`, `mint`).
- `@media (max-width: 620px)` collapses the columns to a single stack.

## Accessibility contract

- Camera tiles are keyboard-operable buttons (Enter/Space toggle, Escape closes, `aria-expanded`), with a `:focus-visible` outline.
- The shell carries `aria-label="LCARS household dashboard"`; the decorative rail and camera glyph are `aria-hidden`; the mascot has descriptive `alt` text; climate buttons have `aria-label`s and a `disabled` attribute when the entity is unavailable.
- Semantics: `main`, `header`, `footer`, `article`, `section`, `time` used throughout; tab labels are the section headings.
- Theme palettes are chosen so text-on-band and text-on-panel contrast is deliberate (see THEMES.md); the loading screen is legible text, not a spinner.

## Failure/fallback summary

| Failure | Behavior |
|---|---|
| No config / no hass | `LCARS LINK ESTABLISHING` screen |
| forecast subscription rejects | that strip empties; attribute-forecast fallback kicks in; else `Awaiting … data.` |
| calendar API rejects | `Calendar unavailable.` |
| history/period rejects | pressure direction `unknown`, no arrow, kPa still shown |
| climate service rejects | inline `Climate command did not complete.` banner |
| camera entity offline (`unknown`/`unavailable`/`none`/`""`/`off`) | glyph tile + last-good frame (if any), label `OFFLINE` |
| camera entity up but `camera/stream` yields no URL (provider session expired) | tile stays dark; fix is provider-side (reload the camera integration), not card behavior |
| camera session died mid-playback (entity still `streaming`, player `_error`, frozen clock) | watchdog degrades tile to last-good still (`RECONNECTING`) after 25 s, then renegotiates a fresh session with exponential backoff (30 s → 300 s cap) |
| weather/climate/security unavailable | `--`, `OFFLINE`, `UNAVAILABLE` respectively |
| feeds empty | nightly-update fallback sentences |
| no lights on | `No lights are on right now.` |
| unknown theme | falls back to `lcars` |
| malformed forecast entries | filtered out by `Date.parse` validation |

## Testing

- `npm test` - 40 tests, zero npm dependencies:
  - `adapters.test.mjs`: 17 unit tests for every adapter - feed formatting/emoji stripping, security normalization, lights scan, camera markup (asserts `<ha-hls-player>` is emitted for live tiles and never emitted for offline/degraded tiles, no proxy-token markup), setpoint clamping/step inference, precipitation formatting, forecast filtering + cadence classification, pressure deadband, label maps, time formatting (uniform clock labels always including `:MM` since v0.1.23).
  - `panel-layout.test.mjs`: 23 source-contract tests asserting layout invariants directly against the source text - footer-to-rail merge, bare decorative rail, raised type scale, panel ordering, theme set + palette values, camera persistence (`_cameraTiles`, `replaceChildren`, `_mountCameras`), the v0.1.20 `_pushCameraProps` hass guard (never assign entityid before hass exists), the v0.1.21 watchdog (interval, stall threshold, degrade, backoff, degraded still tile), overlay toggle, pressure history call, glyph choices (no ambiguous half-circle glyphs), sentence-case body copy.
- `npm run check` - `node --check` on both source files.
- Current status: **40/40 pass** at v0.1.23.

## Local harness

- `harness.html` - canonical fixture: 768×1024 locked body, stub states (streaming front camera, unavailable back camera, off binary sensors, heat climate, weather with pressure 1012, word + fuel with `last_updated`, four lights), a `subscribeMessage` stub that pushes generated hourly/daily arrays, a `callApi` stub that serves a 1011-hPa history sample (so the trend reads rising from live 1012) and an empty calendar. Theme selectable via `?theme=lcars|cinnamoroll|cinnamoroll-dark` (default `cinnamoroll`).
- `harness_shot.py` - CDP driver: expects Chrome on `--remote-debugging-port=9222`, page served from `127.0.0.1:8124`, sets 768×1024 @ DPR2, waits for `.forecast-item`, settles 2s, writes a PNG. Requires the `websockets` Python package.
- `harness_inspect.py` - CDP driver that dumps live shadow-DOM state (version, tabs, camera count, forecast count, shell height) for assertion-style checks.

## Release and immutability

- Publish by tagging: `git tag vX.Y.Z` on a commit where the `VERSION` constant in `src/lcars-home-panel.js` matches the tag.
- The resource URL and the mascot URL both derive from that tag (`@v0.1.23/…`), so a release ships a consistent, immutable pair. Never reference `@main` for a dashboard resource; never rewrite a tagged asset (jsDelivr caches tag-pinned content).
- Bumping `VERSION` changes the footer code and the mascot URL together; the source-contract tests pin the mascot URL shape.
