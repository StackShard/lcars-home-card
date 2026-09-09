const EMPTY_STATES = new Set(["", "unknown", "unavailable", "none", null, undefined]);

export function formatFeed(value, fallback, { uppercase = true } = {}) {
  const source = EMPTY_STATES.has(value) || typeof value !== "string" ? fallback : value;
  const normalizeCase = (line) => uppercase ? line.toUpperCase() : line;
  const lines = source
    .split(/\r?\n/)
    .map((line) => normalizeCase(line.replace(/^\s*[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]+\s*/gu, "").trim()))
    .filter(Boolean);
  return lines.length ? lines : [normalizeCase(String(fallback))];
}

export function normalizeSecurity(state) {
  if (["on", "open", "opening", "detected", "alarm"].includes(state)) {
    return { label: "OPEN", alert: true };
  }
  if (EMPTY_STATES.has(state)) {
    return { label: "UNAVAILABLE", alert: false };
  }
  return { label: "SECURE", alert: false };
}

function escapeAttribute(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
}

export function cameraStreamMarkup(name, entity, state) {
  const label = String(name ?? "Camera").toUpperCase();
  return `<div class="camera" data-camera-tile="${escapeAttribute(entity)}" role="button" tabindex="0" aria-expanded="false"><ha-hls-player class="camera-stream" data-camera="${escapeAttribute(entity)}" autoplay playsinline muted aria-label="${escapeAttribute(label)} camera live stream"></ha-hls-player><div class="camera-label"><span>${escapeAttribute(label)}</span><b>LIVE</b></div></div>`;
}

export function cameraOfflineMarkup(name, entity, state, stillUrl) {
  const label = String(name ?? "Camera").toUpperCase();
  const picture = stillUrl
    ? `<img class="camera-still" src="${escapeAttribute(stillUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : "";
  return `<div class="camera camera-offline" data-camera-tile="${escapeAttribute(entity)}" role="button" tabindex="0" aria-expanded="false"><div class="camera-frame">${picture}<span class="camera-glyph" aria-hidden="true">&#9680;</span></div><div class="camera-label"><span>${escapeAttribute(label)}</span><b>OFFLINE</b></div></div>`;
}

export function cameraDegradedMarkup(name, entity, state, stillUrl) {
  const label = String(name ?? "Camera").toUpperCase();
  const picture = stillUrl
    ? `<img class="camera-still" src="${escapeAttribute(stillUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : "";
  return `<div class="camera camera-degraded" data-camera-tile="${escapeAttribute(entity)}" role="button" tabindex="0" aria-expanded="false"><div class="camera-frame">${picture}<span class="camera-glyph" aria-hidden="true">&#9680;</span></div><div class="camera-label"><span>${escapeAttribute(label)}</span><b>RECONNECTING</b></div></div>`;
}

export function lightsOn(states) {
  return Object.values(states ?? {})
    .filter((entity) => entity?.entity_id?.startsWith("light.") && entity.state === "on")
    .map((entity) => ({ id: entity.entity_id, name: entity.attributes?.friendly_name ?? entity.entity_id }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
}

export function nextTemperature(current, direction, attributes = {}) {
  const numeric = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
  const min = numeric(attributes.min_temp) ? Number(attributes.min_temp) : 7;
  const max = numeric(attributes.max_temp) ? Number(attributes.max_temp) : 35;
  const currentValue = numeric(current) ? Number(current) : null;
  const statedStep = numeric(attributes.target_temp_step) ? Number(attributes.target_temp_step) : null;
  const inferredStep = currentValue !== null && !Number.isInteger(currentValue) ? 0.1 : 0.5;
  const step = statedStep && statedStep > 0 ? statedStep : inferredStep;
  const base = currentValue ?? (min + max) / 2;
  const shifted = base + (direction * step);
  const clamped = Math.min(max, Math.max(min, shifted));
  return Math.round((clamped + Number.EPSILON) / step) * step;
}

export function formatPrecipitation(entry) {
  const amount = Number(entry?.precipitation);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toFixed(1).replace(/\.0$/, "")} mm`;
}

export function visibleForecast(entries, maxEntries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && !Number.isNaN(Date.parse(entry.datetime)))
    .slice(0, maxEntries);
}

export function classifyForecast(entries) {
  if (!Array.isArray(entries)) return { hourly: [], daily: [] };
  const valid = entries.filter((entry) => entry && !Number.isNaN(Date.parse(entry.datetime)));
  if (!valid.length) return { hourly: [], daily: [] };
  const sorted = [...valid].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  if (sorted.length < 2) return { hourly: [], daily: sorted };
  const steps = [];
  for (let i = 1; i < sorted.length; i++) {
    steps.push((Date.parse(sorted[i].datetime) - Date.parse(sorted[i - 1].datetime)) / 3600000);
  }
  const ordered = [...steps].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)];
  return median <= 6 ? { hourly: sorted, daily: [] } : { hourly: [], daily: sorted };
}

export function pressureTrend(currentPressure, history, deadband = 0.15) {
  const current = Number(currentPressure);
  if (!Number.isFinite(current)) return { direction: "unknown", arrow: "", delta: null };
  const records = Array.isArray(history) ? history.flat().filter(Boolean) : [];
  const baseline = records
    .map((record) => Number(record?.attributes?.pressure))
    .find((value) => Number.isFinite(value));
  if (!Number.isFinite(baseline)) return { direction: "unknown", arrow: "", delta: null };
  const delta = Math.round((current - baseline) * 10) / 10;
  if (delta > deadband) return { direction: "rising", arrow: "↑", delta };
  if (delta < -deadband) return { direction: "falling", arrow: "↓", delta };
  return { direction: "steady", arrow: "", delta };
}

export function formatTime(value, locale = "en-CA", timezone) {
  if (Number.isNaN(Date.parse(value))) return "--";
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).formatToParts(new Date(value));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const period = parts.find((part) => part.type === "dayPeriod")?.value?.replace(/\./g, "").toUpperCase() ?? "";
  // Always include minutes for a uniform clock label ("3:00 PM", "5:45 PM").
  return `${hour}:${minute} ${period}`.trim();
}

export function formatDay(value, locale = "en-CA", timezone) {
  if (Number.isNaN(Date.parse(value))) return "--";
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: timezone }).format(new Date(value)).toUpperCase();
}

export function safeText(value, fallback = "--") {
  return EMPTY_STATES.has(value) ? fallback : String(value);
}

export function conditionLabel(state) {
  const labels = {
    clear: "Clear",
    "clear-night": "Clear night",
    partlycloudy: "Partly cloudy",
    cloudy: "Cloudy",
    rainy: "Rain",
    pouring: "Heavy rain",
    snowy: "Snow",
    lightning: "Storms",
    fog: "Fog",
    windy: "Windy",
    hail: "Hail",
    exceptional: "Extreme",
  };
  return labels[state] ?? (EMPTY_STATES.has(state) ? "Offline" : String(state));
}

export function hvacLabel(state) {
  const labels = {
    heat: "Heating",
    cool: "Cooling",
    dry: "Drying",
    fan_only: "Fan only",
    auto: "Auto",
    heat_cool: "Auto heat · cool",
    off: "Off",
  };
  return labels[state] ?? (EMPTY_STATES.has(state) ? "Offline" : String(state));
}
