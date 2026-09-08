# LCARS Home Card - Architecture (as-built)

As-built contract for **v0.1.18**, source commit `8a45eeaf79af1f972c20f521f283651e22475993`. This document describes what the shipped code actually does; where behavior is surprising, the reason is noted.

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

- `constructor` - opens an `open` shadow root, seeds state, and installs two delegated listeners on the shadow root: `click` (camera tile → zoom) and `keydown` (Enter/Space on a camera tile, Escape to close the overlay). Event delegation means these survive full innerHTML re-renders.
- `setConfig(config)` - deep-merges `{ ...DEFAULTS, ...(config?.entities ?? {}) }`, then resets the camera tile cache, expanded-camera state, and pressure-trend key, tears down all subscriptions, and renders. Called once per dashboard config load.
- `hass` setter - stores the HA object, runs the three "ensure" passes (forecast subscriptions, calendar, pressure trend), and renders. Called on every HA state push.
- `connectedCallback` - renders. `disconnectedCallback` - tears down all subscriptions.
- `getCardSize()` - returns `16`.
- Render guard - with no config or no `hass`, the shadow root shows `LCARS LINK ESTABLISHING` with the stylesheet, nothing else.
- The element is registered only if `customElements.get("lcars-home-panel")` is empty; `window.customCards` gets `{ type: "lcars-home-panel", name: "LCARS Home Panel", preview: false }`.

Rendering is one big template literal assigned to `shadowRoot.innerHTML` (stylesheet included), followed by three post-passes: `_mountCameras` (DOM node reconciliation), assigning `hass`/`stateObj` to every `<ha-camera-stream>`, and wiring the climate `−`/`+` buttons. All dynamic text passes `esc()` (HTML-escaping of `& < > ' "`); adapter-generated markup escapes attributes the same way.

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

## Camera subsystem (native HA stream, persistence, fixed overlay)

This is the most behavior-rich part; source-contract tests pin it (v0.1.15 fixed a flicker bug where streams restarted on every render).

- **Markup.** `cameraStreamMarkup` emits `<ha-camera-stream class="camera-stream" data-camera=…>` - HA's own element - with HA handling the authenticated live feed; there is no proxy-token markup. The tile wrapper is `role="button" tabindex="0" aria-expanded="false"`. `cameraOfflineMarkup` (used when the camera state is `unknown`/`unavailable`/`none`/`""`/`off`) emits a glyph placeholder (◐) plus an optional last-good frame: `entity_picture` resolved through `hass.hassUrl`, `loading="lazy"`, hidden on load error via `onerror`. Offline tiles never show a black live box.
- **Persistence.** `_mountCameras` keeps a per-entity cache: `this._cameraTiles[entity] = { key, node }` where `key = ${entity}|${state}`. The render pass calls `container.replaceChildren()` / `expandedMount.replaceChildren()` and re-appends **the same cached DOM node** whenever the key is unchanged - so the `<ha-camera-stream>` element is never recreated while the camera state is stable, and the live feed never restarts. Only a state change rebuilds a tile. The cache and expanded-camera state reset in `setConfig`.
- **Fixed overlay.** Each `<ha-camera-stream>` also gets `hass` and `stateObj` assigned after every render. Click (delegated) or Enter/Space toggles `_expandedCamera`; the *same persistent node* is then appended into the `[data-camera-expanded]` mount inside `.camera-overlay` - `position:absolute; inset:0; z-index:20`, dimmed with backdrop blur, expanded tile up to 700px wide, 16:9, sky-colored border. `aria-expanded` mirrors the open state and the overlay's `aria-hidden` mirrors it in reverse.
- Two entries are hardcoded: `FRONT DOOR` and `BACK DOOR`, mapping to `entities.front_camera` / `entities.back_camera`.

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
| camera offline | glyph tile + last-good frame (if any), label `OFFLINE` |
| weather/climate/security unavailable | `--`, `OFFLINE`, `UNAVAILABLE` respectively |
| feeds empty | nightly-update fallback sentences |
| no lights on | `No lights are on right now.` |
| unknown theme | falls back to `lcars` |
| malformed forecast entries | filtered out by `Date.parse` validation |

## Testing

- `npm test` - 36 tests, zero npm dependencies:
  - `adapters.test.mjs`: 16 unit tests for every adapter - feed formatting/emoji stripping, security normalization, lights scan, camera markup (asserts no proxy-token markup), setpoint clamping/step inference, precipitation formatting, forecast filtering + cadence classification, pressure deadband, label maps, time formatting.
  - `panel-layout.test.mjs`: 20 source-contract tests asserting layout invariants directly against the source text - footer-to-rail merge, bare decorative rail, raised type scale, panel ordering, theme set + palette values, camera persistence (`_cameraTiles`, `replaceChildren`), overlay toggle, pressure history call, glyph choices (no ambiguous half-circle glyphs), sentence-case body copy.
- `npm run check` - `node --check` on both source files.
- Current status: **36/36 pass** at v0.1.18.

## Local harness

- `harness.html` - canonical fixture: 768×1024 locked body, stub states (streaming front camera, unavailable back camera, off binary sensors, heat climate, weather with pressure 1012, word + fuel with `last_updated`, four lights), a `subscribeMessage` stub that pushes generated hourly/daily arrays, a `callApi` stub that serves a 1011-hPa history sample (so the trend reads rising from live 1012) and an empty calendar. Theme selectable via `?theme=lcars|cinnamoroll|cinnamoroll-dark` (default `cinnamoroll`).
- `harness_shot.py` - CDP driver: expects Chrome on `--remote-debugging-port=9222`, page served from `127.0.0.1:8124`, sets 768×1024 @ DPR2, waits for `.forecast-item`, settles 2s, writes a PNG. Requires the `websockets` Python package.
- `harness_inspect.py` - CDP driver that dumps live shadow-DOM state (version, tabs, camera count, forecast count, shell height) for assertion-style checks.

## Release and immutability

- Publish by tagging: `git tag vX.Y.Z` on a commit where the `VERSION` constant in `src/lcars-home-panel.js` matches the tag.
- The resource URL and the mascot URL both derive from that tag (`@v0.1.18/…`), so a release ships a consistent, immutable pair. Never reference `@main` for a dashboard resource; never rewrite a tagged asset (jsDelivr caches tag-pinned content).
- Bumping `VERSION` changes the footer code and the mascot URL together; the source-contract tests pin the mascot URL shape.
