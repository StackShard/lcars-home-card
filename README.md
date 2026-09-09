# LCARS Home Card

A dependency-free custom Lovelace card for a 768×1024 portrait tablet kiosk, with a clear status hierarchy rather than a generic card grid. Ships with the `lcars`, `cinnamoroll`, and `cinnamoroll-dark` themes.

**Current release: [v0.1.22](https://github.com/StackShard/lcars-home-card/releases/tag/v0.1.22)** (source commit `d11ca24`). This documentation is an as-built guide to that release. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for internals.

## Capabilities

- Three security rows (front door, back door, main-floor windows) with alert states reserved for actual open states.
- Two native Home Assistant camera feeds via `<ha-hls-player>` (HLS/MSE over plain HTTP, not WebRTC), with persistent tiles that never restart the stream on re-render, tap-to-magnify into a fixed overlay, a watchdog that self-heals a dead stream session by renegotiating with backoff, and a degraded still-frame fallback so a lost session shows the last-good image instead of a black box.
- A full local-day calendar fetched through HA's authenticated frontend API, including all-day events and dimmed past events.
- Hourly (5 tile) and daily (4 tile) weather forecast strips from `weather/subscribe_forecast`, with real provider precipitation amounts.
- Direct, clamped `climate.set_temperature` controls with dead-band-safe step handling.
- Outside conditions: temperature, humidity, wind, and pressure in kPa with a 3-hour recorder trend arrow.
- Word-of-the-day and fuel feed panels rendered as escaped text - never HTML.
- A live "lights on" chip list derived from the HA state map.

No external font, animation, framework, build step, or custom-card dependency. Vanilla custom element, `type: module`, zero npm dependencies.

## Installation (immutable)

Always pin a release tag - never `@main`. The URL below is the current release:

```yaml
url: https://cdn.jsdelivr.net/gh/StackShard/lcars-home-card@v0.1.22/src/lcars-home-panel.js
type: module
```

The card registers itself as `lcars-home-panel` and advertises via `customCards` (preview disabled), so it appears in the add-card picker automatically. The Cinnamoroll mascot image is served from the same tag-pinned jsDelivr path and cannot drift from the panel (see [docs/THEMES.md](docs/THEMES.md)).

## Configuration

The source ships with generic entity defaults, so the card renders even without an `entities` map. Supply real entity IDs in the dashboard only - never in this repository.

```yaml
type: custom:lcars-home-panel
theme: lcars            # lcars | cinnamoroll | cinnamoroll-dark (default: lcars)
entities:
  climate: climate.home
  weather: weather.home
  front_door: binary_sensor.front_door
  back_door: binary_sensor.back_door
  windows: binary_sensor.windows
  front_camera: camera.front_door
  back_camera: camera.back_door
  calendar: calendar.home
  word: sensor.word_of_day
  fuel: sensor.fuel_price
```

An unknown `theme` value falls back to `lcars`. If `entities` is omitted entirely, the built-in defaults above are used.

## Behavior highlights

- **Weather** subscribes to HA's `weather/subscribe_forecast` frontend message for `hourly` and `daily`; if the provider never pushes, the card falls back to classifying the weather entity's `forecast` attribute by cadence.
- **Calendar** uses the authenticated `callApi` local-day query, so completed events remain visible (dimmed) until local midnight.
- **Cameras** use Home Assistant's native `<ha-hls-player>` (HLS over MSE, plain HTTP) - deliberately not `<ha-camera-stream>` WebRTC. HA's HLS streams are not bound to the websocket connection, so a camera blip degrades to a player retry instead of tearing down the connection that carries every other card update. Offline cameras show a placeholder glyph plus the last-good `entity_picture` frame - never a black live box.
- **Setpoint** commands respect the climate entity's reported `min_temp`, `max_temp`, and `target_temp_step` (with precision inference when HA omits the step), clamped to range.
- **Pressure trend** compares current pressure against the oldest valid recorder sample from the last 3 hours with a 0.15 hPa deadband (rising/falling/steady).

Full details, fallback behavior, and failure modes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Target and accessibility

- Primary target is 768×1024 CSS pixels at DPR2, matching a first-generation 9.7-inch iPad Pro in portrait.
- Touch controls use at least 44-pixel minimum targets where the user acts.
- Camera zoom closes by tapping the enlarged tile or pressing Escape.
- `aria-expanded` mirrors the zoom state; the overlay's `aria-hidden` mirrors it in reverse.
- Meaning is carried by labels and symbols, not color alone.
- Dark Cinnamoroll's accepted text/background samples measured no lower than 7.48:1.
- The layout is motion-free and uses system resources only.

## Development

```text
npm test          # 41 adapter unit tests + source-contract layout tests
npm run check     # node --check on both src files
```

Local visual harness (see ARCHITECTURE § Local harness):

```text
python3 -m http.server 8124 --bind 127.0.0.1   # repo root
# Chrome with --remote-debugging-port=9222, then:
python3 harness_shot.py /tmp/shot.png cinnamoroll   # 768×1024 @ DPR2 PNG
python3 harness_inspect.py                           # live shadow-DOM state
```

`harness.html` is the canonical 768×1024 fixture with stub entity states and a stub connection; pass `?theme=lcars|cinnamoroll|cinnamoroll-dark` to preview themes.

## Repository hygiene

No production entity IDs, IPs, secrets, camera images, credentials, or household data belong in this repository. The source uses generic defaults; all real identifiers live in the HA dashboard configuration.
