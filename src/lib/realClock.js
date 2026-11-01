// Real time only. Nothing in the game scales, pauses or fast-forwards the clock:
// every label here is the player's own device time in their own time zone.
const two = (value) => String(value).padStart(2, "0");

/** The top bar pill: "Sun 1 Nov, 14:32" in 24-hour local time. */
export function clockLabel(nowMs = Date.now()) {
  const date = new Date(nowMs);
  const parts = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("weekday")} ${part("day")} ${part("month")}, ${two(date.getHours())}:${two(
    date.getMinutes()
  )}`;
}

/** "14:05" — the time a chat message was posted. */
export function timeLabel(value) {
  const ms = Date.parse(value || "");
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** "14:05" today, "yesterday at 14:05", otherwise "Sun 1 Nov, 14:05". */
export function whenLabel(value, nowMs = Date.now()) {
  const ms = Date.parse(value || "");
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const now = new Date(nowMs);
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return timeLabel(ms);
  const yesterday = new Date(nowMs - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${timeLabel(ms)}`;
  return clockLabel(ms);
}

const MINUTE = 60000;
const HOUR = 3600000;

/** Safe timestamp: anything unparseable becomes now, never an invalid date. */
export function toIso(value = Date.now()) {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(String(value ?? ""));
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

/** A real span: "8 min", "3h 12m", "2d 4h". */
export function formatSpan(ms) {
  const abs = Math.abs(Number(ms) || 0);
  if (abs < HOUR) return `${Math.max(1, Math.round(abs / MINUTE))} min`;
  const hours = Math.floor(abs / HOUR);
  const minutes = Math.round((abs % HOUR) / MINUTE);
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(abs / (24 * HOUR));
  return `${days}d ${hours % 24}h`;
}

/** Real milliseconds the current project has actually been played. */
export function elapsedMs(save, nowMs = Date.now()) {
  const started = Date.parse(save?.started_at || "");
  if (!Number.isFinite(started)) return 0;
  const paused = Number(save?.paused_ms) || 0;
  return Math.max(0, nowMs - started - paused);
}

/** The player is away when the tab was closed for longer than this. */
export const AWAY_MS = 120000;