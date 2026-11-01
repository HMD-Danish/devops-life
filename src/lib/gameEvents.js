import { invoke } from "@/lib/net";
import { readToken } from "@/lib/playerSession";
import { testAuth } from "@/lib/testMode";

/**
 * Player activity, queued in the browser and sent in one batch.
 *
 * At most one request leaves the page every ten seconds, and an identical event
 * inside a minute is dropped rather than sent twice. Plain terminal input never
 * produces an event: only the few types below exist at all.
 */
const TYPES = new Set([
  "career_started",
  "project_started",
  "project_completed",
  "hint_used",
  "mistake",
  "feedback_sent",
]);

const GAP_MS = 10000;
const BATCH_MAX = 25;
const SAME_EVENT_MS = 60000;

const queue = [];
const sent = new Map();
let timer = null;

const keyOf = (event) => `${event.type}|${event.projectId}|${event.difficulty}`;

async function flush() {
  timer = null;
  const batch = queue.splice(0, BATCH_MAX);
  if (!batch.length) return;
  const token = readToken();
  if (token) {
    await invoke("events", { token, events: batch, ...testAuth() }).catch(() => null);
  }
  if (queue.length) timer = setTimeout(flush, GAP_MS);
}

export function trackEvent(type, { projectId = "", difficulty = "" } = {}) {
  if (!TYPES.has(type)) return;
  if (!readToken()) return;

  const event = {
    type,
    projectId: String(projectId || ""),
    difficulty: String(difficulty || ""),
  };
  const key = keyOf(event);

  const now = Date.now();
  const last = sent.get(key);
  if (last && now - last < SAME_EVENT_MS) return;
  if (queue.some((item) => keyOf(item) === key)) return;

  sent.set(key, now);
  queue.push(event);
  if (!timer) timer = setTimeout(flush, GAP_MS);
}