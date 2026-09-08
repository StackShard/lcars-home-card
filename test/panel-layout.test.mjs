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

test("lights-on section sits under the climate and Outside row as its own panel", () => {
  const climateRow = source.indexOf("<div class=\"climate-weather-row\">");
  const lightsIndex = source.indexOf("<article class=\"panel lights-panel\">");
  const outsideConditions = source.indexOf("<article class=\"panel conditions-panel\"");
  assert.ok(climateRow > 0 && outsideConditions > climateRow && lightsIndex > outsideConditions);
  assert.match(source, /const lights = lightsOn\(this\._hass\?\.states\)/);
  assert.match(source, /No lights are on right now\./);
  assert.match(source, /\.tab\.mint \{ background:var\(--mint\)/);
  assert.match(source, /\.light-chip \{[^}]*background:var\(--row\)/);
  assert.match(source, /\.light-chip b \{[^}]*background:var\(--mint-ink\)/);
  assert.match(source, /\.light-chip span \{[^}]*font-size:11px/);
});

test("cinnamoroll themes share rounded character styling while preserving light, dark, and LCARS palettes", () => {
  assert.match(source, /const SUPPORTED_THEMES = new Set\(\["lcars", "cinnamoroll", "cinnamoroll-dark"\]\)/);
  assert.match(source, /const theme = SUPPORTED_THEMES\.has\(this\._config\?\.theme\) \? this\._config\.theme : "lcars"/);
  assert.match(source, /const isCinnamoroll = theme\.startsWith\("cinnamoroll"\)/);
  assert.match(source, /data-theme="\$\{theme\}"/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll"\] \{ [^}]*--apricot:#a9d8ef/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll"\] \{ [^}]*--bg:#fbf6ef/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll-dark"\] \{ [^}]*--bg:#0b1421/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll-dark"\] \{ [^}]*--panel-bg:#111d2d/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll-dark"\] \{ [^}]*--text:#edf7ff/);
  assert.match(source, /\.shell\[data-theme="cinnamoroll"\], \.shell\[data-theme="cinnamoroll-dark"\]/);
  assert.match(source, /const MASCOT_CINNAMOROLL = `<img class="mascot" src="https:\/\/cdn\.jsdelivr\.net\/gh\/StackShard\/lcars-home-card@v\$\{VERSION\}\/assets\/cinnamoroll\.png"/);
  assert.match(source, /\.mascot \{ position:absolute; right:16px; bottom:58px; width:128px/);
  assert.match(source, /\$\{isCinnamoroll \? MASCOT_CINNAMOROLL : ""\}/);
  assert.match(source, /\.shell \{ [^}]*--bg:#06070b/);
});

test("cameras are restored to their compact slot in the left column", () => {
  const leftColumn = source.indexOf("<section class=\"left-column\">");
  const security = source.indexOf("<article class=\"panel security-panel\">");
  const cameras = source.indexOf("<article class=\"panel cameras-panel\">");
  const climateRow = source.indexOf("<div class=\"climate-weather-row\">");
  const rightColumn = source.indexOf("<section class=\"right-column\">");
  assert.ok(leftColumn > 0 && security > leftColumn && cameras > security && climateRow > cameras && rightColumn > climateRow);
  assert.match(source, /\.cameras \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\); gap:5px; padding:7px/);
  assert.doesNotMatch(source, /\.cameras \{ max-width:560px/);
});

test("camera stream elements persist across renders so feeds never restart (flicker fix)", () => {
  assert.match(source, /this\._cameraTiles = \{\};/);
  assert.match(source, /_mountCameras\(container\)/);
  assert.match(source, /container\.replaceChildren\(\.\.\.entries\.map/);
  assert.match(source, /const cached = this\._cameraTiles\[entity\];/);
  assert.match(source, /if \(!cached \|\| cached\.key !== key\)/);
  assert.match(source, /this\._mountCameras\(this\.shadowRoot\.querySelector\("\[data-cameras\]"\)\)/);
  assert.match(source, /<div class="cameras" data-cameras><\/div>/);
});

test("camera tile tap toggles the same persistent stream into and out of a magnified overlay", () => {
  assert.match(source, /this\._expandedCamera = null/);
  assert.match(source, /_toggleCameraZoom\(entity\)/);
  assert.match(source, /this\._expandedCamera = this\._expandedCamera === entity \? null : entity/);
  assert.match(source, /data-camera-expanded/);
  assert.match(source, /\.camera-overlay\.open/);
  assert.match(source, /aria-expanded/);
});

test("fuel card stamps the last poll time so freshness is visible", () => {
  assert.match(source, /LAST POLLED/);
  assert.match(source, /fuelState\.last_updated/);
  assert.match(source, /!UNAVAILABLE\.has\(fuelState\.state\)/);
  assert.match(source, /\.feed-meta \{ margin-top:5px; color:var\(--text-2\)/);
});

test("header spans full width flush against the rail with the date inline", () => {
  assert.match(source, /<header class="masthead"[^>]*>/);
  assert.match(source, /\.masthead \{ [^}]*background:var\(--apricot\)/);
  assert.match(source, /class="masthead-copy"/);
  assert.match(source, /<time>[\s\S]*?<\/time>/);
});

test("family room and Outside share the left column equally", () => {
  assert.match(source, /<div class="climate-weather-row">/);
  assert.match(source, /\.climate-weather-row \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /<article class="panel climate-panel"[^>]*>/);
  assert.match(source, /<article class="panel conditions-panel"[^>]*>/);
  assert.match(source, /OUTSIDE<\/span>/);
  assert.doesNotMatch(source, /CURRENT CONDITIONS/);
  assert.doesNotMatch(source, /class="climate-outside"/);
});

test("Outside is a vertical stack ordered temperature, humidity, wind, pressure in kPa", () => {
  const outside = source.indexOf("<div class=\"outside-stack\">");
  const temperature = source.indexOf("<small>TEMP</small>", outside);
  const humidity = source.indexOf("<small>HUMIDITY</small>", outside);
  const wind = source.indexOf("<small>WIND</small>", outside);
  const pressure = source.indexOf("<small>PRESSURE</small>", outside);
  assert.ok(outside > 0 && temperature > outside && humidity > temperature && wind > humidity && pressure > wind);
  assert.match(source, /pressureKpa/);
  assert.match(source, /pressureArrow/);
  assert.match(source, /kPa/);
  assert.match(source, /\.outside-stack \{[^}]*display:flex; flex-direction:column/);
});

test("pressure arrow comes from a three-hour Home Assistant recorder trend", () => {
  assert.match(source, /pressureTrend/);
  assert.match(source, /_ensurePressureTrend\(\)/);
  assert.match(source, /hoursAgo\(3\)/);
  assert.match(source, /history\/period/);
  assert.match(source, /filter_entity_id/);
});

test("failed cameras render a placeholder glyph plus last-good frame", () => {
  assert.match(source, /cameraOfflineMarkup/);
  assert.match(source, /\.camera-glyph/);
  assert.match(source, /\.camera-still/);
});

test("weather glyphs use recognizable moon and partly-cloudy symbols, never ambiguous half circles", () => {
  assert.match(source, /"clear-night": "☾"/);
  assert.match(source, /partlycloudy: "⛅"/);
  assert.doesNotMatch(source, /"clear-night": "◐"/);
  assert.doesNotMatch(source, /partlycloudy: "◒"/);
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
  assert.match(source, /formatFeed\(fuelState\?\.state,[^\n]+\{ uppercase: false \}\)/);
  assert.match(source, /\.feed \{[\s\S]*?text-transform:none/);
  assert.doesNotMatch(source, /\.feed-panel\.fuel \.feed \{[^}]*uppercase/);
  assert.doesNotMatch(source, /align-self:start/);
  assert.match(source, /class="tab [a-z]+"><span>[A-Z ]+/);
});
