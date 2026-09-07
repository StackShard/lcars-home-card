# LCARS Home Card

A dependency-free custom Lovelace card for a portrait household console. It is designed for a 768×1024 CSS pixel tablet kiosk, with a clear status hierarchy rather than a generic card grid.

## What it does

- Shows three security states, two native HA camera streams, and a full local-day calendar.
- Subscribes to Home Assistant hourly and daily weather forecasts, including the provider's expected precipitation amount when supplied.
- Provides direct, clamped `climate.set_temperature` controls.
- Renders local Word and Fuel feeds as text, never HTML.
- Uses no external font, animation, framework, or custom-card dependency.

## Resource

Use a pinned release URL:

```yaml
url: https://cdn.jsdelivr.net/gh/StackShard/lcars-home-card@v0.1.3/src/lcars-home-panel.js
type: module
```

## Configuration

The source uses generic defaults. Supply the real entity IDs in the dashboard only.

```yaml
type: custom:lcars-home-panel
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

## Safety and behavior

- Weather uses HA's supported `weather/subscribe_forecast` frontend message.
- Calendar uses HA's authenticated `callApi` local-day query, so completed events remain visible.
- Camera surfaces use Home Assistant's native `<ha-camera-stream>` element, with HA handling authenticated live-stream access.
- Setpoint commands use the climate entity's reported min, max, and temperature step.
- No entity IDs, event text, feeds, camera files, credentials, or household data belong in this repository.

## Development

```text
npm test
npm run check
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `demo.html` through the local server for a 768×1024 fixture.
