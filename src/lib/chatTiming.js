// Scripted chat is paced in real seconds, measured from the moment a message
// became available. The release stamps live in the browser only, so nothing is
// written to the database to make the thread move.
const PREFIX = "devopslife.chat.release.";
const MAX_ENTRIES = 120;

/** A follow-up lands 25 real seconds after the step it answers is finished. */
export const FOLLOW_UP_DELAY_MS = 25000;

/** The reminder only speaks when the player has been quiet for three minutes. */
export const IDLE_REMINDER_MS = 180000;

/** A good status update buys three minutes of quiet on the channel. */
export const CALM_WINDOW_MS = IDLE_REMINDER_MS;

// The step you are on speaks immediately; everything that follows a finished
// decision waits a beat.
const IMMEDIATE = new Set(["project_start", "step_start"]);

export function followUpDelayMs(trigger) {
  return IMMEDIATE.has(trigger) ? 0 : FOLLOW_UP_DELAY_MS;
}

export function readReleaseStamps(saveId) {
  if (!saveId || typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFIX + saveId) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/**
 * Returns the stamp map with every id in `ids` present. New ids are stamped
 * with now, so their delay is counted from the moment they were released.
 */
export function stampReleased(saveId, ids, nowMs = Date.now()) {
  const map = readReleaseStamps(saveId);
  let added = false;
  ids.forEach((id) => {
    if (!id || map[id]) return;
    map[id] = nowMs;
    added = true;
  });
  if (!added || !saveId || typeof window === "undefined") return map;

  const entries = Object.entries(map)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(-MAX_ENTRIES);
  try {
    window.localStorage.setItem(PREFIX + saveId, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // A full or blocked storage only costs the delay, never the message.
  }
  return map;
}