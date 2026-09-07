import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lcars-home-panel.js", import.meta.url), "utf8");

test("footer rail is the absolute bottom of the screen", () => {
  assert.match(source, /\.shell \{ [^}]*min-height:100vh/);
  assert.match(source, /\.shell \{ [^}]*padding:10px 10px 0/);
  assert.match(source, /\.top \{ flex:1/);
  assert.doesNotMatch(source, /\.footer \{[^}]*border-radius/);
  assert.match(source, /<footer class="footer">/);
});

test("left rail is a bare decorative spine with no nav or readout text", () => {
  assert.match(source, /\.top \{ [^}]*grid-template-columns:28px minmax\(0,1fr\)/);
  assert.match(source, /<aside class="rail" aria-hidden="true"><\/aside>/);
  assert.doesNotMatch(source, /rail-nav/);
  assert.doesNotMatch(source, /rail-readout/);
  assert.doesNotMatch(source, /rail-row/);
  assert.doesNotMatch(source, /HOME STATUS/);
  assert.doesNotMatch(source, /SECURITY<\/span><span>CAMERAS/);
  assert.match(source, /\.rail \{ background:var\(--apricot\)/);
});

test("rail merges into the footer: no gap between top band and footer", () => {
  assert.match(source, /\.top \{ flex:1/);
  assert.match(source, /\.footer \{ display:flex; align-items:center; justify-content:space-between; gap:10px; background:var\(--apricot\)/);
});

test("climate adjust buttons center their glyphs", () => {
  assert.match(source, /\.adjust \{ [^}]*display:flex; align-items:center; justify-content:center/);
  assert.doesNotMatch(source, /\.adjust \{[^}]*text-align/);
});

test("type scale is raised across tabs, feeds, and panels", () => {
  assert.match(source, /\.tab \{ [^}]*font-size:11px/);
  assert.match(source, /\.feed \{[\s\S]*?font-size:13\.5px/);
  assert.match(source, /\.forecast-item b \{ font-size:15px/);
  assert.match(source, /\.masthead h1 \{ [^}]*font-size:23px/);
  assert.match(source, /\.event \{[\s\S]*?font-size:11\.5px/);
});

test("lights-on section sits under current conditions as its own panel", () => {
  const conditions = source.indexOf("CURRENT CONDITIONS");
  const lightsIndex = source.indexOf("<article class=\"panel lights-panel\"><div class=\"tab mint\"><span>LIGHTS ON</span></div>");
  assert.ok(conditions > 0 && lightsIndex > conditions);
  assert.match(source, /const lights = lightsOn\(this\._hass\?\.states\)/);
  assert.match(source, /No lights are on right now\./);
  assert.match(source, /\.tab\.mint \{ background:var\(--mint\)/);
  assert.match(source, /\.light-chip \{[^}]*background:var\(--row\)/);
  assert.match(source, /\.light-chip b \{[^}]*background:var\(--mint-ink\)/);
  assert.match(source, /\.light-chip span \{[^}]*font-size:11px/);
});

test("cinnamoroll theme: pastel palette, rounded panels, mascot, lcars default untouched", () => {
  assert.match(source, /data-theme="\$\{this\._config\?\.theme === "cinnamoroll" \? "cinnamoroll" : "lcars"\}"/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll"\] \{ [^}]*--apricot:#a9d8ef/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll"\] \{ [^}]*--bg:#fbf6ef/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll"\] \.panel \{ [^}]*border-radius:14px/);
  assert.match(source, /const MASCOT_CINNAMOROLL = `<img class="mascot" src="https:\/\/cdn\.jsdelivr\.net\/gh\/StackShard\/lcars-home-card@v\$\{VERSION\}\/assets\/cinnamoroll\.png"/);
  assert.match(source, /\.mascot \{ position:absolute; right:16px; bottom:58px; width:215px/);
  assert.match(source, /\$\{this\._config\?\.theme === "cinnamoroll" \? MASCOT_CINNAMOROLL : ""\}/);
  assert.match(source, /\.shell \{ [^}]*--bg:#06070b/);
});

test("header spans full width flush against the rail with the date inline", () => {
  assert.match(source, /<header class="masthead">/);
  assert.match(source, /\.masthead \{ [^}]*background:var\(--apricot\)/);
  assert.match(source, /class="masthead-copy"/);
  assert.match(source, /<time>[\s\S]*?<\/time>/);
});

test("climate card reads current first, setpoint beside the controls, outside tertiary", () => {
  assert.match(source, /current_temperature/);
  assert.match(source, /class="climate-hero"/);
  assert.match(source, /\.climate-hero strong \{[\s\S]*?font-size:42px/);
  assert.match(source, /class="climate-outside"/);
  assert.match(source, /class="climate-setpoint"/);
  assert.match(source, /SET \$\{setpointLabel\}/);
});

test("failed cameras render a placeholder glyph plus last-good frame", () => {
  assert.match(source, /cameraOfflineMarkup/);
  assert.match(source, /\.camera-glyph/);
  assert.match(source, /\.camera-still/);
});

test("hourly forecast labels each tile from its own datetime so times increment", () => {
  assert.match(source, /formatTime\(entry\.datetime, "en-CA", tz\)/);
  assert.match(source, /classifyForecast/);
});

test("empty states are one dimmed line in a collapsed card", () => {
  assert.match(source, /class="event empty"/);
  assert.match(source, /No family events today\./);
  assert.match(source, /class="forecast-empty"/);
});

test("body copy is sentence case and legible; headers stay uppercase", () => {
  assert.match(source, /formatFeed\(this\._state\(e\.word\)\?\.state,[^\n]+\{ uppercase: false \}\)/);
  assert.match(source, /formatFeed\(this\._state\(e\.fuel\)\?\.state,[^\n]+\{ uppercase: false \}\)/);
  assert.match(source, /\.feed \{[\s\S]*?text-transform:none/);
  assert.doesNotMatch(source, /\.feed-panel\.fuel \.feed \{[^}]*uppercase/);
  assert.doesNotMatch(source, /align-self:start/);
  assert.match(source, /class="tab [a-z]+"><span>[A-Z ]+/);
});
