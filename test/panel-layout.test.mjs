import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lcars-home-panel.js", import.meta.url), "utf8");

test("shell hugs content and anchors the footer to the content bottom, not the viewport", () => {
  assert.match(source, /\.shell \{ [^}]*display:flex; flex-direction:column/);
  assert.doesNotMatch(source, /\.shell \{[\s\S]*?min-height:100vh/);
  assert.match(source, /class="footer"/);
  assert.match(source, /<footer class="footer">/);
});

test("rail is one continuous column from the elbow to the footer with flush-stacked buttons", () => {
  assert.match(source, /\.top \{ display:grid; grid-template-columns:160px minmax\(0,1fr\)/);
  assert.match(source, /\.rail \{ display:flex; flex-direction:column; background:var\(--apricot\)/);
  assert.match(source, /\.rail-nav \{ display:flex; flex-direction:column; gap:4px/);
  assert.match(source, /clip-path:polygon\(0 0,100% 0,100% calc\(100% - 12px\)/);
  assert.doesNotMatch(source, /\.rail-nav span \{[^}]*border-radius/);
  assert.doesNotMatch(source, /rail-cap/);
  assert.doesNotMatch(source, /rail-spine/);
  assert.match(source, /class="rail-readout"/);
  assert.match(source, /class="rail-row"/);
});

test("header spans full width flush against the rail with the date inline, no orphan pill", () => {
  assert.match(source, /<header class="masthead">/);
  assert.match(source, /\.masthead \{ [^}]*background:var\(--apricot\)/);
  assert.match(source, /class="masthead-copy"/);
  assert.match(source, /<time>[\s\S]*?<\/time>/);
  assert.doesNotMatch(source, /\.masthead time \{[^}]*background:var\(--gold\)/);
  assert.doesNotMatch(source, /\.masthead time \{[^}]*border-radius/);
});

test("climate card reads current first, setpoint beside the controls, outside tertiary", () => {
  assert.match(source, /current_temperature/);
  assert.match(source, /class="climate-hero"/);
  assert.match(source, /\.climate-hero strong \{[\s\S]*?font-size:38px/);
  assert.match(source, /class="climate-outside"/);
  assert.match(source, /class="climate-setpoint"/);
  assert.match(source, /SET \$\{setpointLabel\}/);
  assert.match(source, /\.adjust/);
});

test("failed cameras render a placeholder glyph plus last-good frame", () => {
  assert.match(source, /cameraOfflineMarkup/);
  assert.match(source, /CAMERA_FAILED/);
  assert.match(source, /\.camera-glyph/);
  assert.match(source, /\.camera-still/);
  assert.match(source, /\.camera-offline \.camera-label b/);
});

test("hourly forecast labels each tile from its own datetime so times increment", () => {
  assert.match(source, /formatTime\(entry\.datetime, "en-CA", tz\)/);
  assert.match(source, /classifyForecast/);
});

test("calendar and forecast empty states are one dimmed line in a collapsed card", () => {
  assert.match(source, /class="event empty"/);
  assert.match(source, /No family events today\./);
  assert.match(source, /class="forecast-empty"/);
  assert.match(source, /\.event\.empty \{[\s\S]*?color:#8d857c/);
});

test("body copy is sentence case and legible; headers stay uppercase", () => {
  assert.match(source, /formatFeed\(this\._state\(e\.word\)\?\.state,[^\n]+\{ uppercase: false \}\)/);
  assert.match(source, /formatFeed\(this\._state\(e\.fuel\)\?\.state,[^\n]+\{ uppercase: false \}\)/);
  assert.match(source, /\.feed \{[\s\S]*?text-transform:none/);
  assert.match(source, /\.feed \{[\s\S]*?font-size:12px/);
  assert.doesNotMatch(source, /\.feed-panel\.fuel \.feed \{[^}]*uppercase/);
  assert.doesNotMatch(source, /align-self:start/);
  assert.match(source, /class="tab [a-z]+"><span>[A-Z ]+/);
});
