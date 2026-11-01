// Game time lives in the browser. One real hour is one game month, so a game
// minute passes every 83ms at 1x; the save is only written every 30 seconds.
export const MINUTES_PER_MONTH = 43200;
export const MINUTES_PER_DAY = 1440;
export const MS_PER_GAME_MINUTE = 83;

const SPEEDS = [0, 1, 10, 60];

export const SPEED_LABELS = { 0: "Paused", 1: "1x", 10: "10x", 60: "60x" };

export function speeds() {
  return SPEEDS;
}

export function baseMinute(save) {
  const value = Number(save?.clock_minutes);
  return Number.isFinite(value) ? value : 540;
}

/** Game minute right now, computed locally — no request involved. */
export function minutesNow(save, nowMs = Date.now()) {
  const speed = Number(save?.clock_speed) || 0;
  const anchor = Date.parse(save?.clock_anchor_at || "");
  if (!speed || !Number.isFinite(anchor)) return baseMinute(save);
  return baseMinute(save) + Math.max(0, nowMs - anchor) / MS_PER_GAME_MINUTE * speed;
}

export function clockLabel(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  const dayIndex = Math.floor(total / MINUTES_PER_DAY);
  const minuteOfDay = total % MINUTES_PER_DAY;
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mins = String(minuteOfDay % 60).padStart(2, "0");
  return `Day ${dayIndex + 1} · ${hours}:${mins}`;
}

export function monthLabel(minutes) {
  return `Month ${Math.floor(Math.max(0, minutes || 0) / MINUTES_PER_MONTH) + 1}`;
}

export function formatSpan(gameMinutes) {
  const abs = Math.abs(Math.round(gameMinutes || 0));
  const days = Math.floor(abs / MINUTES_PER_DAY);
  const hours = Math.floor((abs % MINUTES_PER_DAY) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${abs % 60}m`;
  return `${abs}m`;
}

/** SLA text from the game clock, never from a wall-clock date. */
export function slaState(ticket, minutes) {
  const raw = ticket?.sla_due_minute;
  if (raw === null || raw === undefined || raw === "") return { text: "No SLA", tone: "muted" };
  if (ticket.status === "resolved" || ticket.status === "closed") return { text: "Closed", tone: "muted" };
  const remaining = Number(raw) - minutes;
  if (!Number.isFinite(remaining)) return { text: "No SLA", tone: "muted" };
  if (remaining <= 0) return { text: `Breached ${formatSpan(remaining)} ago`, tone: "bad" };
  if (remaining <= 120) return { text: `${formatSpan(remaining)} left`, tone: "warn" };
  return { text: `${formatSpan(remaining)} left`, tone: "muted" };
}