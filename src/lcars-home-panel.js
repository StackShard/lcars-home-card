import {
  cameraOfflineMarkup,
  cameraStreamMarkup,
  classifyForecast,
  formatDay,
  formatFeed,
  formatPrecipitation,
  formatTime,
  hvacLabel,
  lightsOn,
  nextTemperature,
  normalizeSecurity,
  pressureTrend,
  safeText,
  visibleForecast,
} from "./lcars-adapters.js";

const VERSION = "0.1.17";
const UNAVAILABLE = new Set(["unknown", "unavailable", "none", ""]);
const CAMERA_FAILED = new Set(["unknown", "unavailable", "none", "", "off", "unavailable"]);

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

const MASCOT_CINNAMOROLL = `<img class="mascot" src="https://cdn.jsdelivr.net/gh/StackShard/lcars-home-card@v${VERSION}/assets/cinnamoroll.png" alt="Cinnamoroll keeps watch over the house" />`;

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

function hoursAgo(hours, now = new Date()) {
  return new Date(now.getTime() - (hours * 60 * 60 * 1000)).toISOString();
}

function formatCalendarTime(value, timeZone) {
  if (!value?.dateTime) return "ALL DAY";
  return formatTime(value.dateTime, "en-CA", timeZone);
}

function conditionGlyph(condition) {
  const glyphs = {
    sunny: "☀", "clear-night": "☾", partlycloudy: "⛅", cloudy: "☁", rainy: "☂",
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
    this._cameraTiles = {};
    this._expandedCamera = null;
    this._pressureTrend = { direction: "unknown", arrow: "", delta: null };
    this._pressureTrendKey = null;
    this.shadowRoot.addEventListener("click", (event) => {
      const tile = event.target.closest?.("[data-camera-tile]");
      if (tile) this._toggleCameraZoom(tile.dataset.cameraTile);
    });
    this.shadowRoot.addEventListener("keydown", (event) => {
      const tile = event.target.closest?.("[data-camera-tile]");
      if (tile && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        this._toggleCameraZoom(tile.dataset.cameraTile);
      } else if (event.key === "Escape" && this._expandedCamera) {
        this._toggleCameraZoom(this._expandedCamera);
      }
    });
  }

  setConfig(config) {
    this._config = { ...config, entities: { ...DEFAULTS, ...(config?.entities ?? {}) } };
    this._cameraTiles = {};
    this._expandedCamera = null;
    this._pressureTrendKey = null;
    this._resetSubscriptions();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureForecastSubscriptions();
    this._ensureCalendar();
    this._ensurePressureTrend();
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
        this._calendarError = "Calendar unavailable.";
        this._render();
      });
  }

  _ensurePressureTrend() {
    const weatherEntity = this._config?.entities?.weather;
    const weather = this._state(weatherEntity);
    const currentPressure = weather?.attributes?.pressure;
    const key = weatherEntity && weather ? `${weatherEntity}:${weather.last_updated ?? weather.last_changed ?? "current"}` : null;
    if (!key || this._pressureTrendKey === key || !this._hass?.callApi) return;
    this._pressureTrendKey = key;
    const start = hoursAgo(3);
    this._hass.callApi("GET", `history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(weatherEntity)}`)
      .then((history) => {
        if (this._pressureTrendKey !== key) return;
        this._pressureTrend = pressureTrend(currentPressure, history);
        this._render();
      })
      .catch(() => {
        if (this._pressureTrendKey !== key) return;
        this._pressureTrend = { direction: "unknown", arrow: "", delta: null };
        this._render();
      });
  }

  _toggleCameraZoom(entity) {
    if (!entity) return;
    this._expandedCamera = this._expandedCamera === entity ? null : entity;
    this._render();
  }

  _setClimate(direction) {
    const entity = this._config.entities.climate;
    const climate = this._state(entity);
    if (!climate || UNAVAILABLE.has(climate.state)) return;
    const current = climate.attributes.temperature ?? climate.attributes.target_temp_low;
    const temperature = nextTemperature(current, direction, climate.attributes);
    this._hass.callService("climate", "set_temperature", { entity_id: entity, temperature })
      .catch(() => {
        this._serviceError = "Climate command did not complete.";
        this._render();
      });
  }

  _cameraTile(name, entity) {
    const stateObj = this._state(entity);
    const state = stateObj?.state;
    const failed = !stateObj || CAMERA_FAILED.has(state);
    if (failed) {
      const picture = stateObj?.attributes?.entity_picture;
      const url = picture ? (this._hass?.hassUrl ? this._hass.hassUrl(picture) : picture) : "";
      return cameraOfflineMarkup(name, entity, state, url);
    }
    return cameraStreamMarkup(name, entity, state);
  }

  _mountCameras(container) {
    if (!container) return;
    const expandedMount = this.shadowRoot.querySelector("[data-camera-expanded]");
    const entries = this._config?.entities ? [["FRONT DOOR", this._config.entities.front_camera], ["BACK DOOR", this._config.entities.back_camera]] : [];
    container.replaceChildren();
    expandedMount?.replaceChildren();
    for (const [name, entity] of entries) {
      const key = `${entity}|${this._state(entity)?.state ?? "missing"}`;
      const cached = this._cameraTiles[entity];
      if (!cached || cached.key !== key) {
        const template = document.createElement("template");
        template.innerHTML = this._cameraTile(name, entity);
        this._cameraTiles[entity] = { key, node: template.content.firstElementChild };
      }
      const tile = this._cameraTiles[entity].node;
      const expanded = this._expandedCamera === entity;
      tile.setAttribute("aria-expanded", String(expanded));
      tile.classList.toggle("camera-expanded", expanded);
      (expanded && expandedMount ? expandedMount : container).appendChild(tile);
    }
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
    const roomTemp = climate?.attributes?.current_temperature;
    const setpoint = climate?.attributes?.temperature ?? climate?.attributes?.target_temp_low;
    const outsideTemp = weather?.attributes?.temperature;
    const greeting = new Date().getHours() < 12 ? "GOOD MORNING" : new Date().getHours() < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
    const today = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date()).replace(/\./g, "").toUpperCase();

    const securityRows = [
      ["FRONT DOOR", e.front_door],
      ["BACK DOOR", e.back_door],
      ["MAIN FLOOR WINDOWS", e.windows],
    ].map(([name, entity]) => {
      const status = normalizeSecurity(this._state(entity)?.state);
      return `<div class="security-row ${status.alert ? "alert" : ""}"><span>${name}</span><b>${status.label}</b></div>`;
    }).join("");
    const splitForecast = classifyForecast(weather?.attributes?.forecast);
    const hourlyEntries = this._hourly.length ? this._hourly : splitForecast.hourly;
    const dailyEntries = this._daily.length ? this._daily : splitForecast.daily;
    const hourly = visibleForecast(hourlyEntries, 5).map((entry) => `<div class="forecast-item"><span>${esc(formatTime(entry.datetime, "en-CA", tz))}</span><i>${conditionGlyph(entry.condition)}</i><b>${Math.round(entry.temperature)}°</b><small>${esc(formatPrecipitation(entry))}</small></div>`).join("") || `<div class="forecast-empty">Awaiting hourly data.</div>`;
    const daily = visibleForecast(dailyEntries, 4).map((entry) => `<div class="forecast-item"><span>${esc(formatDay(entry.datetime, "en-CA", tz))}</span><i>${conditionGlyph(entry.condition)}</i><b>${Math.round(entry.temperature)}°</b><small>${entry.templow != null ? `${Math.round(entry.templow)}°` : ""}</small><em>${esc(formatPrecipitation(entry))}</em></div>`).join("") || `<div class="forecast-empty">Awaiting daily data.</div>`;

    const now = Date.now();
    const events = this._calendar.map((event) => {
      const isPast = event.end?.dateTime && Date.parse(event.end.dateTime) < now;
      return `<div class="event ${isPast ? "past" : ""}"><time>${esc(formatCalendarTime(event.start, tz))}</time><span>${esc(event.summary ?? "Untitled event")}</span></div>`;
    }).join("") || `<div class="event empty">${esc(this._calendarError ?? "No family events today.")}</div>`;

    const word = formatFeed(this._state(e.word)?.state, "The word of the day updates nightly.", { uppercase: false }).map((line) => `<p>${esc(line)}</p>`).join("");
    const fuelState = this._state(e.fuel);
    const fuelPolled = fuelState && !UNAVAILABLE.has(fuelState.state) && fuelState.last_updated
      ? (() => {
        const parts = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).formatToParts(new Date(fuelState.last_updated));
        const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
        return `${part("hour")}:${part("minute")} ${part("dayPeriod").replace(/\./g, "").toUpperCase()}`.trim();
      })()
      : "";
    const fuel = formatFeed(fuelState?.state, "Fuel prices update nightly.", { uppercase: false }).map((line) => `<p>${esc(line)}</p>`).join("") + (fuelPolled ? `<p class="feed-meta">LAST POLLED ${esc(fuelPolled)}</p>` : "");
    const lights = lightsOn(this._hass?.states).map(({ name }) => `<div class="light-chip"><b aria-hidden="true"></b><span>${esc(name)}</span></div>`).join("") || `<div class="lights-empty">No lights are on right now.</div>`;
    const climateDisabled = !climate || UNAVAILABLE.has(climate.state) ? "disabled" : "";

    const heroTemp = roomTemp == null ? "--" : `${Math.round(roomTemp)}°`;
    const outsideLabel = outsideTemp == null ? "--" : `${Math.round(outsideTemp)}°`;
    const humidityLabel = weather?.attributes?.humidity == null ? "--" : `${Math.round(weather.attributes.humidity)}%`;
    const windLabel = weather?.attributes?.wind_speed == null ? "--" : `${Math.round(weather.attributes.wind_speed)} km/h`;
    const pressureHpa = Number(weather?.attributes?.pressure);
    const pressureKpa = Number.isFinite(pressureHpa) ? `${(pressureHpa / 10).toFixed(1)} kPa` : "--";
    const pressureArrow = this._pressureTrend?.arrow ?? "";
    const pressureDirection = this._pressureTrend?.direction ?? "unknown";
    const setpointLabel = setpoint == null ? "--" : `${Math.round(setpoint)}°`;
    const climateMode = climateDisabled ? "OFFLINE" : esc(hvacLabel(climate?.state).toUpperCase());

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <main class="shell" aria-label="LCARS household dashboard" data-version="${VERSION}" data-theme="${this._config?.theme === "cinnamoroll" ? "cinnamoroll" : "lcars"}">
        <div class="top">
          <aside class="rail" aria-hidden="true"></aside>
          <section class="console">
            <header class="masthead">
              <div class="masthead-copy"><small>HOME ENVIRONMENT</small><h1>${greeting}</h1></div>
              <time>${today}</time>
            </header>
            <div class="columns">
              <section class="left-column">
                <article class="panel security-panel"><div class="tab sky"><span>SECURITY</span></div><div class="security-list">${securityRows}</div></article>
                <article class="panel cameras-panel"><div class="tab sky"><span>ENTRY CAMERAS</span></div><div class="cameras" data-cameras></div></article>
                <div class="climate-weather-row">
                  <article class="panel climate-panel"><div class="tab salmon"><span>FAMILY ROOM · NEST</span></div><div class="climate-body">
                    <div class="climate-hero"><strong>${heroTemp}</strong><em>${climateMode}</em></div>
                    <div class="climate-controls"><button class="adjust" data-adjust="-1" ${climateDisabled} aria-label="Decrease thermostat setpoint">−</button><span class="climate-setpoint">SET ${setpointLabel}</span><button class="adjust" data-adjust="1" ${climateDisabled} aria-label="Increase thermostat setpoint">+</button></div>
                  </div>${this._serviceError ? `<div class="service-error">${esc(this._serviceError)}</div>` : ""}</article>
                  <article class="panel conditions-panel"><div class="tab lilac"><span>OUTSIDE</span></div><div class="outside-stack">
                    <div class="outside-reading"><small>TEMP</small><b>${outsideLabel}</b></div>
                    <div class="outside-reading"><small>HUMIDITY</small><b>${humidityLabel}</b></div>
                    <div class="outside-reading"><small>WIND</small><b>${windLabel}</b></div>
                    <div class="outside-reading"><small>PRESSURE</small><b>${pressureKpa} <span class="pressure-arrow ${pressureDirection}" title="Pressure ${pressureDirection}">${pressureArrow}</span></b></div>
                  </div></article>
                </div>
                <article class="panel lights-panel"><div class="tab mint"><span>LIGHTS ON</span></div><div class="lights">${lights}</div></article>
              </section>
              <section class="right-column">
                <article class="panel calendar-panel"><div class="tab apricot"><span>CALENDAR · TODAY</span></div><div class="events">${events}</div></article>
                <article class="panel forecast-panel"><div class="tab lilac"><span>HOURLY WEATHER</span></div><div class="forecast">${hourly}</div></article>
                <article class="panel forecast-panel daily"><div class="tab lilac"><span>DAILY WEATHER</span></div><div class="forecast">${daily}</div></article>
                <article class="panel feed-panel fuel"><div class="tab gold"><span>FUEL · MARKHAM</span></div><div class="feed">${fuel}</div></article>
                <article class="panel feed-panel word"><div class="tab gold"><span>WORD OF THE DAY</span></div><div class="feed">${word}</div></article>
              </section>
            </div>
          </section>
        </div>
        <div class="camera-overlay ${this._expandedCamera ? "open" : ""}" data-camera-overlay aria-hidden="${this._expandedCamera ? "false" : "true"}"><div class="camera-expanded-mount" data-camera-expanded></div></div>
        <footer class="footer"><span>ALL SYSTEMS NOMINAL</span><span class="footer-code">LCARS HOME · ${VERSION}</span></footer>
        ${this._config?.theme === "cinnamoroll" ? MASCOT_CINNAMOROLL : ""}
      </main>`;
    this._mountCameras(this.shadowRoot.querySelector("[data-cameras]"));
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
.shell { --bg:#06070b; --apricot:#eab18c; --salmon:#e48878; --lilac:#baadd8; --sky:#83bdd2; --gold:#d7bd67; --mint:#8ed0a6; --ink:#101117; --muted:#b8b0bc; --panel-bg:#101117; --row:#181a22; --row-2:#241a1d; --text:#e8e3db; --text-2:#9a91a3; --on-header:#101117; --on-header-soft:rgba(10,10,14,.55); --on-header-dim:rgba(10,10,14,.72); --on-tab:#09090e; --sky-ink:#83bdd2; --salmon-ink:#e6a295; --apricot-ink:#eab18c; --lilac-ink:#c8b6e6; --mint-ink:#8ed0a6; --fc-ink:#b9cde7; --cam-glyph:rgba(234,177,140,.5); --event-past-line:#75615a; --panel-line:transparent; background:var(--bg); display:flex; flex-direction:column; min-height:100vh; padding:10px 10px 0; overflow:clip; color:var(--text); position:relative; }
.shell[data-theme="cinnamoroll"] { --bg:#fbf6ef; --apricot:#a9d8ef; --salmon:#ffc2cf; --lilac:#c9d6f0; --sky:#b7e0f5; --gold:#ffdf9e; --mint:#b2e6cf; --ink:#3d4c5f; --muted:#6f8298; --panel-bg:#ffffff; --row:#f2f8fc; --row-2:#eaf3f9; --text:#3d4c5f; --text-2:#6f8298; --on-header:#26506d; --on-header-soft:rgba(38,80,109,.62); --on-header-dim:rgba(38,80,109,.8); --on-tab:#1f4560; --sky-ink:#2e7fb2; --salmon-ink:#b15870; --apricot-ink:#3f7fa8; --lilac-ink:#8296d8; --mint-ink:#3fae7d; --fc-ink:#5f9cc4; --cam-glyph:rgba(255,175,195,.7); --event-past-line:#c6d5e2; --panel-line:#e6eef6; }
.shell[data-theme="cinnamoroll"] .panel { border:1px solid var(--panel-line); border-radius:14px; }
.shell[data-theme="cinnamoroll"] .tab { border-radius:14px 0 0 0; }
.shell[data-theme="cinnamoroll"] .camera, .shell[data-theme="cinnamoroll"] .camera-frame { border-radius:0 0 12px 12px; }
.mascot { position:absolute; right:16px; bottom:58px; width:128px; height:auto; pointer-events:none; z-index:1; }
.top { flex:1; min-height:0; display:grid; grid-template-columns:28px minmax(0,1fr); align-items:stretch; }
.rail { background:var(--apricot); border-radius:22px 0 0 0; min-width:0; }
.console { min-width:0; display:flex; flex-direction:column; }
.masthead { display:flex; align-items:center; justify-content:space-between; gap:14px; background:var(--apricot); border-radius:0 34px 0 0; padding:10px 22px; min-height:72px; } .masthead-copy { min-width:0; } .masthead small { display:block; color:var(--on-header-soft); font-size:10px; font-weight:900; letter-spacing:.2em; } .masthead h1 { margin:2px 0 0; color:var(--on-header); font-size:23px; letter-spacing:.1em; line-height:1.05; } .masthead time { color:var(--on-header-dim); font-size:13.5px; font-weight:950; letter-spacing:.08em; white-space:nowrap; }
.columns { display:grid; grid-template-columns:minmax(0,.94fr) minmax(0,1.06fr); gap:10px; padding:12px 12px 16px; align-items:start; } .left-column,.right-column { min-width:0; display:flex; flex-direction:column; gap:10px; }
.panel { min-width:0; background:var(--panel-bg); overflow:hidden; } .tab { color:var(--on-tab); font-weight:950; letter-spacing:.13em; font-size:11px; min-height:29px; padding:7px 10px 7px 0; display:flex; align-items:center; width:100%; clip-path:polygon(0 0,100% 0,100% 48%,calc(100% - 16px) 100%,0 100%); } .tab span { display:block; padding-left:13px; } .tab.sky { background:var(--sky); } .tab.apricot { background:var(--apricot); } .tab.salmon { background:var(--salmon); } .tab.lilac { background:var(--lilac); } .tab.gold { background:var(--gold); } .tab.mint { background:var(--mint); }
.security-panel { --panel:var(--sky); } .security-list { display:grid; grid-template-columns:1fr 1fr; padding:8px; gap:5px; } .security-row { background:var(--row); padding:7px 9px; display:flex; justify-content:space-between; gap:4px; align-items:center; color:var(--text); font-size:10.5px; font-weight:800; letter-spacing:.05em; } .security-row:last-child { grid-column:span 2; } .security-row b { color:var(--sky-ink); font-size:9.5px; } .security-row.alert { background:#412227; color:#ffd6cd; } .security-row.alert b { color:#ff9c8d; }
.cameras-panel { --panel:var(--sky); } .cameras { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; padding:7px; } .camera { background:#15171e; min-width:0; min-height:0; aspect-ratio:16/9; overflow:hidden; position:relative; cursor:pointer; touch-action:manipulation; } .camera:focus-visible { outline:3px solid var(--sky-ink); outline-offset:-3px; } .camera-stream { display:block; width:100%; height:100%; background:#0a0b0e; } .camera-frame { position:absolute; inset:0; display:grid; place-items:center; background:#0c0d11; } .camera-still { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; opacity:.4; filter:grayscale(.4); } .camera-glyph { font-size:26px; color:var(--cam-glyph); position:relative; } .camera-label { position:absolute; inset:auto 0 0; min-height:24px; padding:5px 6px; background:rgba(5,6,9,.78); display:flex; justify-content:space-between; align-items:center; color:#edf5f6; font-size:8.5px; font-weight:850; letter-spacing:.05em; pointer-events:none; } .camera-label b { color:var(--sky-ink); font-size:8px; } .camera-offline .camera-label b { color:#ff9c8d; }
.camera-overlay { position:absolute; inset:0; z-index:20; display:none; place-items:center; padding:34px; background:rgba(8,14,22,.88); backdrop-filter:blur(8px); } .camera-overlay.open { display:grid; } .camera-expanded-mount { width:min(700px,100%); } .camera-expanded-mount .camera { width:100%; aspect-ratio:16/9; border:3px solid var(--sky); border-radius:16px; box-shadow:0 18px 60px rgba(0,0,0,.45); } .camera-expanded-mount .camera-label { min-height:38px; padding:8px 12px; font-size:13px; } .camera-expanded-mount .camera-label b { font-size:11px; }
.events { padding:7px 9px; display:flex; flex-direction:column; gap:5px; } .event { display:grid; grid-template-columns:48px 1fr; gap:8px; align-items:start; border-left:3px solid var(--apricot-ink); padding:6px 7px; background:var(--row); color:var(--text); font-size:11.5px; line-height:1.3; } .event time { color:var(--apricot-ink); font-weight:900; font-size:9.5px; letter-spacing:.04em; padding-top:1px; } .event.past { opacity:.57; border-left-color:var(--event-past-line); } .event.empty { display:block; background:transparent; border-left-color:transparent; color:var(--text-2); font-size:11px; padding:2px 6px; }
.climate-weather-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; align-items:stretch; } .climate-weather-row .panel { display:flex; flex-direction:column; } .climate-weather-row .tab { font-size:8px; letter-spacing:.06em; padding-right:5px; } .climate-weather-row .tab span { padding-left:9px; white-space:nowrap; }
.climate-panel { --panel:var(--salmon); } .climate-body { flex:1; padding:10px 8px 8px; display:flex; flex-direction:column; justify-content:space-between; gap:9px; } .climate-hero strong { display:block; color:var(--text); font-size:38px; line-height:.95; letter-spacing:-.04em; } .climate-hero em { display:block; font-style:normal; color:var(--salmon-ink); font-size:8px; font-weight:900; letter-spacing:.16em; margin-top:5px; } .climate-controls { display:grid; grid-template-columns:32px minmax(0,1fr) 32px; gap:4px; align-items:center; } .climate-setpoint { min-width:0; text-align:center; color:var(--text); font-size:8px; font-weight:900; letter-spacing:.05em; white-space:nowrap; background:var(--row-2); border-radius:0 0 9px 0; padding:8px 1px; } .adjust { height:32px; border:0; padding:0; display:flex; align-items:center; justify-content:center; background:var(--salmon); color:#141014; font-size:23px; line-height:1; font-weight:700; cursor:pointer; } .adjust:first-child { border-radius:0 0 0 9px; } .adjust:last-child { border-radius:0 9px 0 0; } .adjust:disabled { background:#5c454b; color:#8c7f83; cursor:not-allowed; } .service-error { background:#4a2228; color:#ffd4cc; font-size:9px; padding:4px 7px; }
.conditions-panel,.forecast-panel { --panel:var(--lilac); } .outside-stack { flex:1; display:flex; flex-direction:column; padding:6px 8px 7px; gap:3px; } .outside-reading { flex:1; min-height:25px; display:flex; align-items:center; justify-content:space-between; gap:5px; padding:4px 6px; background:var(--row); } .outside-reading small { color:var(--text-2); font-size:7.5px; font-weight:900; letter-spacing:.05em; } .outside-reading b { color:var(--text); font-size:10.5px; white-space:nowrap; } .pressure-arrow { display:inline-block; min-width:10px; font-size:15px; line-height:.7; font-weight:950; vertical-align:-1px; } .pressure-arrow.rising { color:var(--mint-ink); } .pressure-arrow.falling { color:var(--salmon-ink); } .forecast-panel { display:flex; flex-direction:column; } .forecast { padding:7px 9px; display:grid; grid-template-columns:repeat(5,1fr); gap:5px; } .daily .forecast { grid-template-columns:repeat(4,1fr); } .forecast-item { min-width:0; min-height:62px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; background:var(--row); color:var(--text); padding:4px 2px; } .forecast-item span,.forecast-item small,.forecast-item em { color:var(--text-2); font-size:9px; font-weight:850; letter-spacing:.04em; } .forecast-item span { font-size:9.5px; } .forecast-item em { color:var(--fc-ink); font-style:normal; } .forecast-item i { color:var(--lilac-ink); font-style:normal; font-size:21px; line-height:1; } .forecast-item b { font-size:15px; } .forecast-empty { grid-column:1 / -1; color:var(--text-2); font-size:11px; letter-spacing:.04em; text-align:center; padding:4px 6px; }
.lights-panel { --panel:var(--mint); } .lights { display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:5px; padding:8px; } .light-chip { min-width:0; display:flex; align-items:center; gap:8px; background:var(--row); padding:7px 9px; } .light-chip b { flex:none; width:8px; height:20px; background:var(--mint-ink); } .light-chip span { min-width:0; color:var(--text); font-size:11px; font-weight:800; letter-spacing:.02em; overflow-wrap:anywhere; } .lights-empty { color:var(--text-2); font-size:11px; letter-spacing:.04em; padding:2px 6px; }
.feed-panel { --panel:var(--gold); } .feed { padding:9px 11px; color:var(--text); font-family:"Arial Narrow","Roboto Condensed","Helvetica Neue Condensed",sans-serif; font-stretch:condensed; font-size:13.5px; font-weight:600; line-height:1.5; letter-spacing:.03em; text-transform:none; } .feed p { margin:0 0 3px; } .feed p:last-child { margin-bottom:0; } .feed-meta { margin-top:5px; color:var(--text-2); font-size:10.5px; font-weight:800; letter-spacing:.14em; } .feed-panel.word .feed { font-weight:560; }
.footer { display:flex; align-items:center; justify-content:space-between; gap:10px; background:var(--apricot); min-height:46px; padding:0 20px; color:var(--on-header-dim); font-size:11px; font-weight:950; letter-spacing:.18em; } .footer .footer-code { color:var(--on-header); }
@media (max-width:620px) { .shell { padding:7px 7px 0; } .top { grid-template-columns:20px minmax(0,1fr); } .rail { border-radius:22px 0 0 0; } .masthead { min-height:50px; padding:7px 12px; border-radius:0 22px 0 0; } .masthead h1 { font-size:15px; } .masthead small { font-size:8px; } .masthead time { font-size:10px; } .columns { grid-template-columns:1fr; padding:8px; } .footer { min-height:32px; font-size:8px; } }
`;

if (!customElements.get("lcars-home-panel")) {
  customElements.define("lcars-home-panel", LcarsHomePanel);
}

window.customCards = window.customCards || [];
window.customCards.push({ type: "lcars-home-panel", name: "LCARS Home Panel", description: "A first-party LCARS household dashboard panel", preview: false });
