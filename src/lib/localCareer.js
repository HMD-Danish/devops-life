/**
 * The career as this browser last saw it.
 *
 * Written after every successful read and every change on screen, so opening the
 * workspace never waits for the network: the screen is built from here first and
 * the server is asked afterwards, in the background.
 *
 * Only the rows a screen needs are kept — the career itself, its tickets, its
 * services, its inventory and the last fifty chat lines.
 */
const KEY = "devopslife.career.local";
const KEEP_SAVES = 2;
const KEEP_CHAT = 50;

function readAll() {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveAll(rows) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // A full or blocked storage only means this browser starts from the server.
  }
}

/** The cached copy of one career, or null when this browser has never seen it. */
export function readLocalCareer(saveId) {
  if (!saveId) return null;
  const hit = readAll()[saveId];
  return hit && hit.save ? hit : null;
}

/** Merges a change into the cached copy and drops the older careers. */
export function writeLocalCareer(saveId, patch) {
  if (!saveId || !patch) return;
  const rows = readAll();
  const previous = rows[saveId] || {};
  rows[saveId] = {
    ...previous,
    ...patch,
    save: patch.save || previous.save || null,
    chatLog: patch.chatLog ? patch.chatLog.slice(-KEEP_CHAT) : previous.chatLog || [],
    at: Date.now(),
  };

  const newest = Object.entries(rows)
    .sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))
    .slice(0, KEEP_SAVES);
  saveAll(Object.fromEntries(newest));
}

export function clearLocalCareer(saveId) {
  if (typeof window === "undefined") return;
  if (!saveId) {
    saveAll({});
    return;
  }
  const rows = readAll();
  delete rows[saveId];
  saveAll(rows);
}