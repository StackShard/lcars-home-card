import {
  cameraStreamMarkup,
  formatDay,
  formatFeed,
  formatPrecipitation,
  formatTime,
  nextTemperature,
  normalizeSecurity,
  safeText,
  visibleForecast,
} from "./lcars-adapters.js";

const VERSION = "0.1.5";
const UNAVAILABLE = new Set(["unknown", "unavailable", "none", ""]);

const DEFAULTS = {
  climate: "climate.home",
  weather: "weather.home",
  front_door: "binary_sensor.front_door",
  back_door: "binary_sensor.back_door",
  windows: "binary_sensor.windows",
  front_camera: "camera.front_door",
  back_camera: "camera.back_door",
  calendar: "calendar.home",
  word: "sensor.word_of_day",
  fuel: "sensor.fuel_price",
};

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character]));

function localDateParts(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return { year: value("year"), month: value("month"), day: value("day") };
}

function offsetFor(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const zonedAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((zonedAsUtc - date.getTime()) / 60000);
}

function isoAtLocalMidnight(timeZone, shiftDays = 0) {
  const today = localDateParts(timeZone);
  const utc = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) + shiftDays));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  const offset = offsetFor(timeZone, utc);
  const sign = offset >= 0 ? "+" : "-";
  const minutes = Math.abs(offset);
  return `${y}-${m}-${d}T00:00:00${sign}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatCalendarTime(value, timeZone) {
  if (!value?.dateTime) return "ALL DAY";
  return formatTime(value.dateTime, "en-CA", timeZone);
}

function conditionGlyph(condition) {
  const glyphs = {
    sunny: "☀", "clear-night": "◐", partlycloudy: "◒", cloudy: "☁", rainy: "☂",
    pouring: "☂", snowy: "✳", lightning: "ϟ", fog: "≈", windy: "≋",
  };
  return glyphs[condition] ?? "•";
}

export class LcarsHomePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._hourly = [];
    this._daily = [];
    this._calendar = [];
    this._calendarKey = null;
    this._calendarError = null;
    this._unsubscribers = [];
  }

  setConfig(config) {
    this._config = { ...config, entities: { ...DEFAULTS, ...(config?.entities ?? {}) } };
    this._resetSubscriptions();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureForecastSubscriptions();
    this._ensureCalendar();
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    this._resetSubscriptions();
  }

  getCardSize() {
    return 16;
  }

  _state(entity) {
    return this._hass?.states?.[entity];
  }

  _resetSubscriptions() {
    for (const unsubscribe of this._unsubscribers) {
      try { unsubscribe?.(); } catch (_) { /* connection may already be closed */ }
    }
    this._unsubscribers = [];
    this._subscriptionWeather = null;
  }

  _ensureForecastSubscriptions() {
    const weather = this._config?.entities?.weather;
    const connection = this._hass?.connection;
    if (!weather || !connection || this._subscriptionWeather === weather) return;
    this._resetSubscriptions();
    this._subscriptionWeather = weather;
    for (const forecastType of ["hourly", "daily"]) {
      Promise.resolve(connection.subscribeMessage(
        (event) => {
          const forecast = Array.isArray(event?.forecast) ? event.forecast : [];
          if (forecastType === "hourly") this._hourly = forecast;
          else this._daily = forecast;
          this._render();
        },
        { type: "weather/subscribe_forecast", forecast_type: forecastType, entity_id: weather },
      )).then((unsubscribe) => this._unsubscribers.push(unsubscribe)).catch(() => {
        if (forecastType === "hourly") this._hourly = [];
        else this._daily = [];
        this._render();
      });
    }
  }

  _ensureCalendar() {
    const calendar = this._config?.entities?.calendar;
    const timeZone = this._hass?.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const key = calendar ? `${calendar}:${isoAtLocalMidnight(timeZone)}` : null;
    if (!key || this._calendarKey === key || !this._hass?.callApi) return;
    this._calendarKey = key;
    this._calendarError = null;
    const start = isoAtLocalMidnight(timeZone);
    const end = isoAtLocalMidnight(timeZone, 1);
    this._hass.callApi("GET", `calendars/${encodeURIComponent(calendar)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then((events) => {
        this._calendar = Array.isArray(events) ? events.sort((a, b) => String(a.start?.dateTime ?? a.start?.date).localeCompare(String(b.start?.dateTime ?? b.start?.date))) : [];
        this._render();
      })
      .catch(() => {
        this._calendarError = "Calendar unavailable";
        this._render();
      });
  }

  _setClimate(direction) {
    const entity = this._config.entities.climate;
    const climate = this._state(entity);
    if (!climate || UNAVAILABLE.has(climate.state)) return;
    const current = climate.attributes.temperature ?? climate.attributes.target_temp_low;
    const temperature = nextTemperature(current, direction, climate.attributes);
    this._hass.callService("climate", "set_temperature", { entity_id: entity, temperature })
      .catch(() => {
        this._serviceError = "Climate command did not complete";
        this._render();
      });
  }

  _render() {
    if (!this.shadowRoot) return;
    if (!this._config || !this._hass) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="loading">LCARS LINK ESTABLISHING</div>`;
      return;
    }
    const e = this._config.entities;
    const tz = this._hass.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const weather = this._state(e.weather);
    const climate = this._state(e.climate);
    const currentTemp = weather?.attributes?.temperature;
    const setpoint = climate?.attributes?.temperature ?? climate?.attributes?.target_temp_low;
    const greeting = new Date().getHours() < 12 ? "GOOD MORNING" : new Date().getHours() < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
    const today = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: tz }).format(new Date()).toUpperCase();

    const security = [
      ["FRONT DOOR", this._state(e.front_door)],
      ["BACK DOOR", this._state(e.back_door)],
      ["MAIN FLOOR WINDOWS", this._state(e.windows)],
    ].map(([name, state]) => {
      const status = normalizeSecurity(state?.state);
      return `<div class="security-row ${status.alert ? "alert" : ""}"><span>${name}</span><b>${status.label}</b></div>`;
    }).join("");

    const cameras = [
      ["FRONT DOOR", e.front_camera],
      ["BACK DOOR", e.back_camera],
    ].map(([name, entity]) => cameraStreamMarkup(name, entity, this._state(entity)?.state)).join("");

    const hourly = visibleForecast(this._hourly, 5).map((entry) => `<div class="forecast-item"><span>${esc(formatTime(entry.datetime, "en-CA", tz))}</span><i>${conditionGlyph(entry.condition)}</i><b>${Math.round(entry.temperature)}°</b><small>${esc(formatPrecipitation(entry))}</small></div>`).join("") || `<div class="forecast-empty">HOURLY DATA LINKING</div>`;
    const daily = visibleForecast(this._daily, 4).map((entry) => `<div class="forecast-item"><span>${esc(formatDay(entry.datetime, "en-CA", tz))}</span><i>${conditionGlyph(entry.condition)}</i><b>${Math.round(entry.temperature)}°</b><small>${entry.templow != null ? `${Math.round(entry.templow)}°` : ""}</small><em>${esc(formatPrecipitation(entry))}</em></div>`).join("") || `<div class="forecast-empty">DAILY DATA LINKING</div>`;

    const now = Date.now();
    const events = this._calendar.map((event) => {
      const isPast = event.end?.dateTime && Date.parse(event.end.dateTime) < now;
      return `<div class="event ${isPast ? "past" : ""}"><time>${esc(formatCalendarTime(event.start, tz))}</time><span>${esc(event.summary ?? "Untitled event")}</span></div>`;
    }).join("") || `<div class="event empty">${esc(this._calendarError ?? "No family events today")}</div>`;

    const word = formatFeed(this._state(e.word)?.state, "Word of the day updates nightly.").map((line) => `<p>${esc(line)}</p>`).join("");
    const fuel = formatFeed(this._state(e.fuel)?.state, "Fuel prices update nightly.").map((line) => `<p>${esc(line)}</p>`).join("");
    const climateDisabled = !climate || UNAVAILABLE.has(climate.state) ? "disabled" : "";

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <main class="shell" aria-label="LCARS household dashboard" data-version="${VERSION}">
        <aside class="rail" aria-hidden="true"><div class="rail-elbow"></div><nav class="rail-nav"><span>SEC</span><span>CAM</span><span>ENV</span><span>DAY</span></nav><div class="rail-spine"></div><div class="rail-code">LCARS<br>HOME<br>${VERSION}</div></aside>
        <section class="console">
          <header class="masthead"><div class="mast-block"></div><div><small>HOME ENVIRONMENT</small><h1>${greeting}</h1></div><time>${today}</time></header>
          <div class="columns">
            <section class="left-column">
              <article class="panel security-panel"><div class="tab sky"><span>SECURITY</span></div><div class="security-list">${security}</div></article>
              <article class="panel cameras-panel"><div class="tab sky"><span>ENTRY CAMERAS</span></div><div class="cameras">${cameras}</div></article>
              <article class="panel climate-panel"><div class="tab salmon"><span>FAMILY ROOM · NEST</span></div><div class="climate-body"><div class="setpoint"><small>SETPOINT</small><strong>${esc(setpoint == null ? "--" : `${Math.round(setpoint)}°`)}</strong></div><div class="current"><small>OUTSIDE</small><b>${esc(currentTemp == null ? "--" : `${Math.round(currentTemp)}°`)}</b><span>${esc(safeText(weather?.state, "OFFLINE").toUpperCase())}</span></div><div class="climate-controls"><button class="adjust" data-adjust="-1" ${climateDisabled} aria-label="Decrease thermostat setpoint">−</button><span>ADJUST SETPOINT</span><button class="adjust" data-adjust="1" ${climateDisabled} aria-label="Increase thermostat setpoint">+</button></div></div>${this._serviceError ? `<div class="service-error">${esc(this._serviceError)}</div>` : ""}</article>
              <article class="panel conditions-panel"><div class="tab lilac"><span>CURRENT CONDITIONS</span></div><div class="conditions"><b>${esc(weather?.attributes?.humidity == null ? "--" : `${Math.round(weather.attributes.humidity)}%`)} <small>HUMIDITY</small></b><b>${esc(weather?.attributes?.wind_speed == null ? "--" : `${Math.round(weather.attributes.wind_speed)} km/h`)} <small>WIND</small></b><b>${esc(weather?.attributes?.pressure == null ? "--" : `${Math.round(weather.attributes.pressure)} hPa`)} <small>PRESSURE</small></b></div></article>
            </section>
            <section class="right-column">
              <article class="panel calendar-panel"><div class="tab apricot"><span>CALENDAR · TODAY</span></div><div class="events">${events}</div></article>
              <article class="panel forecast-panel"><div class="tab lilac"><span>HOURLY WEATHER · RAIN</span></div><div class="forecast">${hourly}</div></article>
              <article class="panel forecast-panel daily"><div class="tab lilac"><span>DAILY WEATHER · RAIN</span></div><div class="forecast">${daily}</div></article>
              <article class="panel feed-panel fuel"><div class="tab gold"><span>FUEL · MARKHAM</span></div><div class="feed">${fuel}</div></article>
              <article class="panel feed-panel word"><div class="tab gold"><span>WORD OF THE DAY</span></div><div class="feed">${word}</div></article>
            </section>
          </div>
        </section>
      </main>`;
    this.shadowRoot.querySelectorAll("ha-camera-stream[data-camera]").forEach((stream) => {
      stream.hass = this._hass;
      stream.stateObj = this._state(stream.dataset.camera);
    });
    this.shadowRoot.querySelectorAll("[data-adjust]").forEach((button) => button.addEventListener("click", () => this._setClimate(Number(button.dataset.adjust))));
  }
}

const STYLE = `
:host { display:block; box-sizing:border-box; color:var(--lcars-text,#f6f0ea); font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
* { box-sizing:border-box; } .loading { min-height:100vh; display:grid; place-items:center; background:#06070b; color:#e9b4a4; letter-spacing:.18em; font-weight:700; }
.shell { --bg:#06070b; --apricot:#eab18c; --salmon:#e48878; --lilac:#baadd8; --sky:#83bdd2; --gold:#d7bd67; --ink:#101117; --muted:#b8b0bc; min-height:100vh; background:var(--bg); display:grid; grid-template-columns:76px minmax(0,1fr); gap:0; padding:10px; overflow:hidden; }
.rail { min-height:100%; display:flex; flex-direction:column; align-items:stretch; } .rail-elbow { height:70px; background:var(--apricot); border-radius:40px 0 0 0; } .rail-nav { display:grid; gap:5px; padding:7px 0 7px 16px; background:var(--apricot); } .rail-nav span { min-height:26px; display:flex; align-items:center; justify-content:center; background:var(--gold); color:#09090e; font-size:8px; font-weight:950; letter-spacing:.11em; border-radius:13px 0 0 13px; } .rail-spine { background:var(--apricot); flex:1; margin-left:16px; } .rail-code { color:#07070a; background:var(--gold); padding:8px 4px; font-size:8px; line-height:1.3; font-weight:900; letter-spacing:.11em; text-align:center; border-radius:18px 0 0 0; }
.console { min-width:0; display:flex; flex-direction:column; gap:10px; } .masthead { min-height:62px; display:grid; grid-template-columns:38px 1fr auto; gap:10px; align-items:stretch; } .mast-block { background:var(--apricot); border-radius:0 0 20px 0; } .masthead div:nth-child(2) { background:var(--ink); padding:7px 12px; border-left:9px solid var(--apricot); } .masthead small,.climate-body small { color:var(--muted); font-size:9px; letter-spacing:.13em; font-weight:800; } h1 { margin:2px 0 0; color:var(--lcars-text,#f6f0ea); font-size:20px; letter-spacing:.08em; line-height:1; } .masthead time { background:var(--gold); color:#111116; font-weight:900; font-size:11px; letter-spacing:.06em; padding:12px; border-radius:0 18px 18px 0; display:flex; align-items:center; text-align:right; }
.columns { min-height:0; flex:1; display:grid; grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr); gap:8px; } .left-column,.right-column { min-width:0; display:flex; flex-direction:column; gap:8px; } .left-column .cameras-panel { flex:1; min-height:0; } .left-column .climate-panel,.left-column .conditions-panel { flex:none; } .calendar-panel { --panel:var(--apricot); flex:0 0 auto; min-height:0; } .right-column .forecast-panel { flex:1; min-height:0; display:flex; flex-direction:column; } .right-column .forecast { flex:1; } .feed-panel.word { min-height:0; flex:0 0 auto; } .feed-panel.fuel { min-height:0; flex:0 0 auto; }
.panel { min-width:0; background:var(--ink); overflow:hidden; } .tab { color:#09090e; font-weight:950; letter-spacing:.11em; font-size:10px; min-height:25px; padding:6px 10px 6px 0; display:flex; align-items:center; width:100%; clip-path:polygon(0 0,100% 0,100% 48%,calc(100% - 16px) 100%,0 100%); } .tab span { display:block; padding-left:10px; } .tab.sky { background:var(--sky); } .tab.apricot { background:var(--apricot); } .tab.salmon { background:var(--salmon); } .tab.lilac { background:var(--lilac); } .tab.gold { background:var(--gold); }
.security-panel { --panel:var(--sky); } .security-list { display:grid; grid-template-columns:1fr 1fr; padding:8px; gap:4px; } .security-row { background:#181a22; padding:6px 7px; display:flex; justify-content:space-between; gap:4px; align-items:center; color:#d6e0e6; font-size:9px; font-weight:800; letter-spacing:.06em; } .security-row:last-child { grid-column:span 2; } .security-row b { color:var(--sky); font-size:8px; } .security-row.alert { background:#412227; color:#ffd6cd; } .security-row.alert b { color:#ff9c8d; }
.cameras-panel { --panel:var(--sky); } .cameras { display:grid; grid-template-columns:1fr 1fr; grid-template-rows:minmax(0,1fr); gap:4px; padding:6px; flex:1; min-height:0; } .camera { background:#15171e; min-width:0; min-height:0; height:100%; overflow:hidden; position:relative; } .camera-stream { display:block; height:100%; width:100%; background:#0a0b0e; } .camera-label { position:absolute; inset:auto 0 0; min-height:23px; padding:5px 6px; background:rgba(5,6,9,.78); display:flex; justify-content:space-between; align-items:center; color:#edf5f6; font-size:8px; font-weight:850; letter-spacing:.06em; pointer-events:none; } .camera-label b { color:var(--sky); font-size:7px; }
.calendar-panel { --panel:var(--apricot); } .events { padding:6px 8px; display:flex; flex-direction:column; gap:4px; } .event { display:grid; grid-template-columns:45px 1fr; gap:7px; align-items:start; border-left:3px solid var(--apricot); padding:5px 6px; background:#19171b; color:#f7dfd3; font-size:10px; line-height:1.25; } .event time { color:var(--apricot); font-weight:900; font-size:8px; letter-spacing:.04em; padding-top:1px; } .event.past { opacity:.57; border-left-color:#75615a; } .event.empty { display:block; color:var(--muted); border-left-color:#6f6875; }
.climate-panel { --panel:var(--salmon); } .climate-body { min-height:99px; padding:8px 9px; display:grid; grid-template-columns:1fr 1fr; grid-template-areas:"setpoint current" "controls controls"; align-items:center; gap:8px; } .setpoint { grid-area:setpoint; } .climate-body strong { display:block; color:#ffd7ca; font-size:31px; line-height:1; letter-spacing:-.05em; } .current { grid-area:current; align-self:center; padding-left:9px; border-left:2px solid #4b3940; } .current small { display:block; } .current b { color:#f6f0ea; display:inline-block; font-size:19px; margin-right:5px; line-height:1; } .current span { color:#d5a99e; font-size:8px; font-weight:800; letter-spacing:.07em; } .climate-controls { grid-area:controls; display:grid; grid-template-columns:44px 1fr 44px; gap:6px; align-items:center; } .climate-controls span { text-align:center; color:#d5a99e; font-size:8px; font-weight:850; letter-spacing:.1em; } .adjust { height:36px; border:0; border-radius:0 11px 11px 0; background:var(--salmon); color:#120f12; font-size:27px; line-height:1; font-weight:500; cursor:pointer; } .adjust:last-child { border-radius:11px 0 0 11px; } .adjust:disabled { background:#5c454b; color:#8c7f83; cursor:not-allowed; } .service-error { background:#4a2228; color:#ffd4cc; font-size:9px; padding:4px 9px; }
.conditions-panel,.forecast-panel { --panel:var(--lilac); } .conditions { min-height:36px; padding:7px 9px; display:grid; grid-template-columns:repeat(3,1fr); gap:6px; } .conditions b { color:#e9e1fc; font-size:11px; } .conditions small { display:block; margin-top:2px; color:#aba2c1; letter-spacing:.05em; font-size:7px; } .forecast { min-height:78px; padding:6px 8px; display:grid; grid-template-columns:repeat(5,1fr); gap:4px; } .daily .forecast { min-height:90px; grid-template-columns:repeat(4,1fr); } .forecast-item { min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; background:#1b1923; color:#e8e1f8; padding:4px 2px; } .forecast-item span,.forecast-item small,.forecast-item em { color:#aca4c0; font-size:7px; font-weight:800; letter-spacing:.04em; } .forecast-item em { color:#b9cde7; font-style:normal; } .forecast-item i { color:#c8b6e6; font-style:normal; font-size:18px; line-height:1; } .forecast-item b { font-size:12px; } .forecast-empty { grid-column:1 / -1; align-self:center; color:#aaa0bb; font-size:9px; letter-spacing:.1em; text-align:center; }
.feed-panel { --panel:var(--gold); } .feed { padding:7px 10px; color:#ebe4d7; font-family:"Arial Narrow","Roboto Condensed","Helvetica Neue Condensed",sans-serif; font-stretch:condensed; font-size:9px; font-weight:750; line-height:1.28; letter-spacing:.06em; text-transform:uppercase; } .feed p { margin:0 0 3px; } .feed p:last-child { margin-bottom:0; }
@media (max-width:620px) { .shell { grid-template-columns:48px minmax(0,1fr); gap:7px; padding:7px; } .rail-cap.top { height:58px; } .rail-cap.bottom { height:74px; } .rail-spine { margin-left:13px; } .rail-code { font-size:6px; padding:5px 2px; } .masthead { min-height:49px; grid-template-columns:22px 1fr auto; gap:6px; } .masthead div:nth-child(2) { padding:6px 7px; border-left-width:6px; } h1 { font-size:13px; } .masthead small { font-size:7px; } .masthead time { font-size:8px; padding:7px; } .columns { gap:7px; } .left-column,.right-column { gap:7px; } .tab { min-height:20px; padding:5px 6px; font-size:7px; } .security-list,.cameras,.events,.forecast { padding:5px; gap:3px; } .security-row { padding:5px; font-size:7px; } .climate-body { grid-template-columns:1fr 1fr; grid-template-areas:"setpoint current" "controls controls"; padding:5px 6px; min-height:82px; gap:4px; } .climate-controls { grid-template-columns:36px 1fr 36px; gap:4px; } .climate-body strong { font-size:24px; } .current b { font-size:15px; } .adjust { height:32px; font-size:23px; } .conditions { padding:5px 6px; min-height:31px; } .conditions b { font-size:9px; } .forecast { min-height:52px; } .forecast-item i { font-size:14px; } .forecast-item b { font-size:10px; } .feed { padding:5px 7px; font-size:8px; } .event { grid-template-columns:35px 1fr; font-size:8px; padding:4px; gap:4px; } }
`;

if (!customElements.get("lcars-home-panel")) {
  customElements.define("lcars-home-panel", LcarsHomePanel);
}

window.customCards = window.customCards || [];
window.customCards.push({ type: "lcars-home-panel", name: "LCARS Home Panel", description: "A first-party LCARS household dashboard panel", preview: false });
