import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lcars-home-panel.js", import.meta.url), "utf8");

test("panel uses a functional LCARS rail and flush elbow headers", () => {
  assert.match(source, /class="rail-nav"/);
  assert.match(source, /class="tab[^>]*"><span>/);
  assert.match(source, /clip-path:polygon/);
  assert.doesNotMatch(source, /\.panel \{[^}]*border-left:/);
});

test("calendar is content-sized while weather claims the reclaimed right-column space", () => {
  assert.match(source, /right-column[\s\S]*HOURLY WEATHER[\s\S]*DAILY WEATHER/);
  assert.match(source, /\.calendar-panel \{[^}]*flex:0 0 auto[^}]*min-height:0/);
  assert.match(source, /\.right-column \.forecast-panel \{[^}]*flex:1/);
  assert.doesNotMatch(source, /\.calendar-panel \{\s*flex:1/);
});

test("feed cards stay compact and do not render decorative emoji", () => {
  assert.match(source, /font-family:"Arial Narrow","Roboto Condensed"/);
  assert.match(source, /\.feed \{[^}]*text-transform:uppercase/);
  assert.doesNotMatch(source, /feed-panel\.word \{ min-height:175px/);
});
