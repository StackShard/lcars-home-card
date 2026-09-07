import test from "node:test";
import assert from "node:assert/strict";

import {
  formatFeed,
  formatTime,
  nextTemperature,
  normalizeSecurity,
  visibleForecast,
} from "../src/lcars-adapters.js";

test("formatFeed preserves lines as text and supplies a fallback", () => {
  assert.deepEqual(formatFeed("First line\nSecond line", "fallback"), ["First line", "Second line"]);
  assert.deepEqual(formatFeed("unavailable", "fallback"), ["fallback"]);
  assert.deepEqual(formatFeed("", "fallback"), ["fallback"]);
});

test("normalizeSecurity reserves alert status for actual open states", () => {
  assert.deepEqual(normalizeSecurity("off"), { label: "SECURE", alert: false });
  assert.deepEqual(normalizeSecurity("on"), { label: "OPEN", alert: true });
  assert.deepEqual(normalizeSecurity("unavailable"), { label: "UNAVAILABLE", alert: false });
});

test("nextTemperature clamps, respects step, and handles missing values", () => {
  assert.equal(nextTemperature(20.5, 1, { min_temp: 10, max_temp: 21, target_temp_step: 0.5 }), 21);
  assert.equal(nextTemperature(10, -1, { min_temp: 10, max_temp: 30, target_temp_step: 0.5 }), 10);
  assert.equal(nextTemperature(undefined, -1, { min_temp: 7, max_temp: 35, target_temp_step: 1 }), 20);
});

test("nextTemperature infers tenth-degree control for a decimal setpoint when HA omits a step", () => {
  assert.equal(nextTemperature(26.4, -1, { min_temp: 10, max_temp: 32, target_temp_step: null }), 26.3);
});

test("visibleForecast filters malformed entries and caps a dense iPad strip", () => {
  const entries = [
    { datetime: "2026-09-07T19:00:00Z", temperature: 24 },
    { datetime: "bad", temperature: 22 },
    { datetime: "2026-09-07T20:00:00Z", temperature: 23 },
  ];
  assert.deepEqual(visibleForecast(entries, 2), [entries[0], entries[2]]);
});

test("formatTime produces a compact local clock label", () => {
  assert.equal(formatTime("2026-09-07T19:00:00Z", "en-CA", "America/Toronto"), "3 PM");
});
