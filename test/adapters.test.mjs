import test from "node:test";
import assert from "node:assert/strict";

import {
  cameraDegradedMarkup,
  cameraOfflineMarkup,
  cameraStreamMarkup,
  classifyForecast,
  conditionLabel,
  formatFeed,
  formatPrecipitation,
  formatTime,
  hvacLabel,
  lightsOn,
  nextTemperature,
  normalizeSecurity,
  pressureTrend,
  visibleForecast,
} from "../src/lcars-adapters.js";

test("formatFeed preserves readable sentence case when uppercase is disabled", () => {
  assert.deepEqual(formatFeed("📖 Peripeteia\nA sudden turn", "fallback", { uppercase: false }), ["Peripeteia", "A sudden turn"]);
  assert.deepEqual(formatFeed("unavailable", "Word unavailable.", { uppercase: false }), ["Word unavailable."]);
});

test("formatFeed removes decorative emoji and uppercases compact status feeds", () => {
  assert.deepEqual(formatFeed("⛽ Fuel 153.9¢/L\nUpdate nightly", "fallback"), ["FUEL 153.9¢/L", "UPDATE NIGHTLY"]);
  assert.deepEqual(formatFeed("unavailable", "fallback"), ["FALLBACK"]);
  assert.deepEqual(formatFeed("", "fallback"), ["FALLBACK"]);
});

test("normalizeSecurity reserves alert status for actual open states", () => {
  assert.deepEqual(normalizeSecurity("off"), { label: "SECURE", alert: false });
  assert.deepEqual(normalizeSecurity("on"), { label: "OPEN", alert: true });
  assert.deepEqual(normalizeSecurity("unavailable"), { label: "UNAVAILABLE", alert: false });
});

test("lightsOn lists only light-domain entities that are on, sorted by name", () => {
  const states = {
    "light.dining_room_lightstrip": { entity_id: "light.dining_room_lightstrip", state: "on", attributes: { friendly_name: "Dining Room Lightstrip" } },
    "light.kitchen_under_cabinet_light": { entity_id: "light.kitchen_under_cabinet_light", state: "on", attributes: { friendly_name: "Kitchen Under Cabinet Light" } },
    "light.living_room_main_lights": { entity_id: "light.living_room_main_lights", state: "off", attributes: { friendly_name: "Living Room Main Lights" } },
    "light.back_entrance_light": { entity_id: "light.back_entrance_light", state: "unavailable", attributes: { friendly_name: "Back Entrance Light" } },
    "switch.dining_room_lightstrip": { entity_id: "switch.dining_room_lightstrip", state: "on", attributes: { friendly_name: "Dining Room Lightstrip" } },
    "sensor.word_of_day": { entity_id: "sensor.word_of_day", state: "on", attributes: {} },
  };
  assert.deepEqual(lightsOn(states), [
    { id: "light.dining_room_lightstrip", name: "Dining Room Lightstrip" },
    { id: "light.kitchen_under_cabinet_light", name: "Kitchen Under Cabinet Light" },
  ]);
});

test("lightsOn returns an empty list when nothing is on, and tolerates missing state maps", () => {
  const allOff = {
    "light.dining_room_lightstrip": { entity_id: "light.dining_room_lightstrip", state: "off", attributes: {} },
  };
  assert.deepEqual(lightsOn(allOff), []);
  assert.deepEqual(lightsOn(undefined), []);
  assert.deepEqual(lightsOn({}), []);
});

test("cameraStreamMarkup makes the HLS player tile tappable without proxy token markup", () => {
  const markup = cameraStreamMarkup("Front Door", "camera.front_door_camera", "streaming");
  assert.match(markup, /<ha-hls-player/);
  assert.match(markup, /data-camera="camera\.front_door_camera"/);
  assert.match(markup, /data-camera-tile="camera\.front_door_camera"/);
  assert.match(markup, /role="button"/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /FRONT DOOR/);
  assert.match(markup, /LIVE/);
  assert.doesNotMatch(markup, /camera_proxy|token=/);
});

test("cameraOfflineMarkup renders a placeholder glyph with last-good frame, never a black stream box", () => {
  const markup = cameraOfflineMarkup("Back Door", "camera.back_door", "unavailable", "/api/camera_proxy/back");
  assert.match(markup, /class="camera camera-offline"/);
  assert.match(markup, /class="camera-glyph"/);
  assert.match(markup, /camera-still/);
  assert.match(markup, /OFFLINE/);
  assert.doesNotMatch(markup, /<ha-hls-player/);
  const noFrame = cameraOfflineMarkup("Back Door", "camera.back_door", "off", "");
  assert.doesNotMatch(noFrame, /camera-still/);
  assert.match(noFrame, /camera-glyph/);
});

test("cameraDegradedMarkup renders a reconnecting still tile with no live player", () => {
  const markup = cameraDegradedMarkup("Front Door", "camera.front_door_camera", "streaming", "/api/camera_proxy/front");
  assert.match(markup, /class="camera camera-degraded"/);
  assert.match(markup, /class="camera-glyph"/);
  assert.match(markup, /camera-still/);
  assert.match(markup, /RECONNECTING/);
  assert.match(markup, /data-camera-tile="camera\.front_door_camera"/);
  assert.doesNotMatch(markup, /<ha-hls-player/);
  assert.doesNotMatch(markup, /LIVE/);
  const noFrame = cameraDegradedMarkup("Front Door", "camera.front_door_camera", "streaming", "");
  assert.doesNotMatch(noFrame, /camera-still/);
  assert.match(noFrame, /RECONNECTING/);
});

test("nextTemperature clamps, respects step, and handles missing values", () => {
  assert.equal(nextTemperature(20.5, 1, { min_temp: 10, max_temp: 21, target_temp_step: 0.5 }), 21);
  assert.equal(nextTemperature(10, -1, { min_temp: 10, max_temp: 30, target_temp_step: 0.5 }), 10);
  assert.equal(nextTemperature(undefined, -1, { min_temp: 7, max_temp: 35, target_temp_step: 1 }), 20);
});

test("nextTemperature infers tenth-degree control for a decimal setpoint when HA omits a step", () => {
  assert.equal(nextTemperature(26.4, -1, { min_temp: 10, max_temp: 32, target_temp_step: null }), 26.3);
});

test("formatPrecipitation shows the provider's real expected amount without inventing a probability", () => {
  assert.equal(formatPrecipitation({ precipitation: 0 }), "0 mm");
  assert.equal(formatPrecipitation({ precipitation: 1.25 }), "1.3 mm");
  assert.equal(formatPrecipitation({}), "—");
});

test("visibleForecast filters malformed entries and caps a dense iPad strip", () => {
  const entries = [
    { datetime: "2026-09-07T19:00:00Z", temperature: 24 },
    { datetime: "bad", temperature: 22 },
    { datetime: "2026-09-07T20:00:00Z", temperature: 23 },
  ];
  assert.deepEqual(visibleForecast(entries, 2), [entries[0], entries[2]]);
});

test("classifyForecast distinguishes hourly cadence from daily cadence by step size", () => {
  const hourly = [
    { datetime: "2026-09-07T17:00:00Z", temperature: 20 },
    { datetime: "2026-09-07T18:00:00Z", temperature: 21 },
    { datetime: "2026-09-07T19:00:00Z", temperature: 22 },
  ];
  const daily = [
    { datetime: "2026-09-07T12:00:00Z", temperature: 20 },
    { datetime: "2026-09-08T12:00:00Z", temperature: 21 },
    { datetime: "2026-09-09T12:00:00Z", temperature: 22 },
  ];
  assert.deepEqual(classifyForecast(hourly), { hourly, daily: [] });
  assert.deepEqual(classifyForecast(daily), { hourly: [], daily });
  assert.deepEqual(classifyForecast([{ datetime: "bad" }]), { hourly: [], daily: [] });
  assert.deepEqual(classifyForecast(undefined), { hourly: [], daily: [] });
});

test("pressureTrend compares current pressure with the oldest valid recorder sample", () => {
  const history = [[
    { attributes: { pressure: 1020.4 } },
    { attributes: { pressure: 1021.0 } },
  ]];
  assert.deepEqual(pressureTrend(1021.0, history), { direction: "rising", arrow: "↑", delta: 0.6 });
  assert.deepEqual(pressureTrend(1020.0, history), { direction: "falling", arrow: "↓", delta: -0.4 });
});

test("pressureTrend suppresses recorder noise and tolerates unavailable history", () => {
  assert.deepEqual(pressureTrend(1020.45, [[{ attributes: { pressure: 1020.4 } }]]), { direction: "steady", arrow: "", delta: 0.1 });
  assert.deepEqual(pressureTrend(1020, []), { direction: "unknown", arrow: "", delta: null });
  assert.deepEqual(pressureTrend(undefined, [[{ attributes: { pressure: 1020 } }]]), { direction: "unknown", arrow: "", delta: null });
});

test("conditionLabel and hvacLabel give readable sentence-case labels", () => {
  assert.equal(conditionLabel("partlycloudy"), "Partly cloudy");
  assert.equal(conditionLabel("rainy"), "Rain");
  assert.equal(conditionLabel("unavailable"), "Offline");
  assert.equal(hvacLabel("heat"), "Heating");
  assert.equal(hvacLabel("heat_cool"), "Auto heat · cool");
  assert.equal(hvacLabel("off"), "Off");
});

test("formatTime produces a uniform clock label with minutes always shown", () => {
  assert.equal(formatTime("2026-09-07T19:00:00Z", "en-CA", "America/Toronto"), "3:00 PM");
  assert.equal(formatTime("2026-09-08T16:00:00Z", "en-CA", "America/Toronto"), "12:00 PM");
  assert.equal(formatTime("2026-09-08T17:00:00Z", "en-CA", "America/Toronto"), "1:00 PM");
  assert.equal(formatTime("2026-09-07T21:45:00Z", "en-CA", "America/Toronto"), "5:45 PM");
  assert.equal(formatTime("2026-09-07T12:05:00Z", "en-CA", "America/Toronto"), "8:05 AM");
  assert.equal(formatTime("2026-09-08T00:30:00Z", "en-CA", "America/Toronto"), "8:30 PM");
});
