const EMPTY_STATES = new Set(["", "unknown", "unavailable", "none", null, undefined]);

export function formatFeed(value, fallback) {
  if (EMPTY_STATES.has(value) || typeof value !== "string") return [fallback];
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines : [fallback];
}

export function normalizeSecurity(state) {
  if (["on", "open", "opening", "detected", "alarm"].includes(state)) {
    return { label: "OPEN", alert: true };
  }
  if (["unavailable", "unknown", null, undefined].includes(state)) {
    return { label: "UNAVAILABLE", alert: false };
  }
  return { label: "SECURE", alert: false };
}

export function cameraStreamMarkup(name, entity, state) {
  const escapeAttribute = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
  const label = String(name ?? "Camera").toUpperCase();
  return `<div class="camera"><ha-camera-stream class="camera-stream" data-camera="${escapeAttribute(entity)}" aria-label="${escapeAttribute(label)} camera"></ha-camera-stream><div class="camera-label"><span>${escapeAttribute(label)}</span><b>${escapeAttribute(safeText(state, "UNAVAILABLE").toUpperCase())}</b></div></div>`;
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

export function visibleForecast(entries, maxEntries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && !Number.isNaN(Date.parse(entry.datetime)))
    .slice(0, maxEntries);
}

export function formatTime(value, locale = "en-CA", timezone) {
  if (Number.isNaN(Date.parse(value))) return "--";
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    hour12: true,
    timeZone: timezone,
  }).formatToParts(new Date(value));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
  const period = parts.find((part) => part.type === "dayPeriod")?.value?.replace(/\./g, "").toUpperCase() ?? "";
  return `${hour} ${period}`.trim();
}

export function formatDay(value, locale = "en-CA", timezone) {
  if (Number.isNaN(Date.parse(value))) return "--";
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: timezone }).format(new Date(value)).toUpperCase();
}

export function safeText(value, fallback = "--") {
  return EMPTY_STATES.has(value) ? fallback : String(value);
}
