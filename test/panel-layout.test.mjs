import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lcars-home-panel.js", import.meta.url), "utf8");

test("panel uses a functional LCARS rail and flush elbow headers", () => {
  assert.match(source, /class="rail-nav"/);
  assert.match(source, /class="rail-status"/);
  assert.match(source, /class="rail-cap"/);
  assert.match(source, /class="tab[^>]*"><span>/);
  assert.match(source, /clip-path:polygon/);
  assert.doesNotMatch(source, /\srail-elbow/);
  assert.doesNotMatch(source, /\srail-spine\s/);
});

test("calendar is content-sized while weather claims the reclaimed right-column space", () => {
  assert.match(source, /right-column[\s\S]*HOURLY WEATHER[\s\S]*DAILY WEATHER/);
  assert.match(source, /\.forecast-panel \{ display:flex; flex-direction:column; \}/);
  assert.match(source, /\.forecast \{ padding:6px 8px; display:grid; grid-template-columns:repeat\(5,1fr\); gap:4px; align-content:center; flex:1; min-height:0; \}/);
  assert.doesNotMatch(source, /\.calendar-panel \{\s*flex:1/);
});

test("the camera pair consumes its intentional left-column field", () => {
  assert.match(source, /\.cameras-panel \{ --panel:var\(--sky\); \}/);
  assert.match(source, /\.cameras \{ display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:6px; \}/);
  assert.match(source, /\.camera \{[^}]*aspect-ratio:16\/9/);
  assert.match(source, /\.camera-stream \{ display:block; width:100%; height:100%; background:#0a0b0e; \}/);
});

test("feed cards share the compact face while Word remains sentence case", () => {
  assert.match(source, /formatFeed\(this\._state\(e\.word\)\?\.state,[^\n]+\{ uppercase: false \}\)/);
  assert.match(source, /font-family:"Arial Narrow","Roboto Condensed"/);
  assert.match(source, /\.feed-panel\.fuel \.feed \{[^}]*text-transform:uppercase/);
  assert.match(source, /\.feed-panel\.word \.feed \{[^}]*text-transform:none/);
  assert.doesNotMatch(source, /^\.feed \{/m);
  assert.doesNotMatch(source, /feed-panel\.word \{ min-height:175px/);
});
