import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Every backend call the browser makes passes through here.
 *
 * The rules are deliberately boring and never-ending:
 *  1. One request in flight per function+action. A second call for the same one
 *     waits its turn instead of racing it.
 *  2. At most three retries per request. A rate limit is waited out with the
 *     server's own retry-after value; anything else waits 2s, 5s and 10s with a
 *     little jitter so ten tabs do not wake up together.
 *  3. One 429 opens a breaker for every non-essential call (status, events,
 *     feedback, chat writes) for retry-after + 5s. They do not even leave the
 *     browser while it is open, and they resume one at a time.
 *  4. After the last retry the app goes offline: nothing else is attempted, the
 *     screen keeps working from local data, and the player gets one small note
 *     with a Try again button that cannot be pressed twice in 30 seconds.
 */
const LOG_WINDOW_MS = 5 * 60 * 1000;
const RETRY_DELAYS = [2000, 5000, 10000];
const MAX_RETRIES = RETRY_DELAYS.length;
const BREAKER_GRACE_MS = 5000;
const MAX_WAIT_MS = 60000;
export const MANUAL_RETRY_GAP_MS = 30000;

const RETRY_EVENT = "devopslife:retry-now";

/** Calls that may always wait and try again: they carry the game itself. */
const NON_ESSENTIAL_CALLS = new Set(["getStatus", "events", "feedback"]);
const NON_ESSENTIAL_ACTIONS = new Set(["chat.append"]);

const log = [];
const listeners = new Set();
const chains = new Map();

let pausedUntil = 0;
let offline = false;
let lastManualRetry = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function trim() {
  const cut = Date.now() - LOG_WINDOW_MS;
  while (log.length && log[0].at < cut) log.shift();
}

export function recordRequest(name) {
  log.push({ name: String(name || "unknown"), at: Date.now() });
  trim();
}

/** Requests this browser made in the last `ms`, by function. */
export function requestsInWindow(ms = 60000) {
  const since = Date.now() - ms;
  const rows = log.filter((row) => row.at >= since);
  const by = {};
  rows.forEach((row) => {
    by[row.name] = (by[row.name] || 0) + 1;
  });
  return { total: rows.length, by };
}

/** Start of a measured window, for counting the requests one screen makes. */
export const markRequestWindow = () => Date.now();

/** What left the browser since `mark`. Logged once per workspace load. */
export function requestsSince(mark) {
  const rows = log.filter((row) => row.at >= mark);
  const by = {};
  rows.forEach((row) => {
    const key = row.name;
    by[key] = (by[key] || 0) + 1;
  });
  return { total: rows.length, by };
}

const snapshot = () => ({
  offline,
  paused: Date.now() < pausedUntil,
  retryInMs: Math.max(0, MANUAL_RETRY_GAP_MS - (Date.now() - lastManualRetry)),
});

function emit() {
  const value = snapshot();
  listeners.forEach((listener) => listener(value));
}

export function isPaused() {
  return Date.now() < pausedUntil;
}

export function isOffline() {
  return offline;
}

export function pauseAll(ms) {
  pausedUntil = Math.max(pausedUntil, Date.now() + Math.max(0, ms));
  emit();
}

export function markOnline() {
  if (!offline) return;
  offline = false;
  emit();
}

function markOffline() {
  if (offline) return;
  offline = true;
  emit();
}

/** The Try again button: one press, then thirty seconds of quiet. */
export function retryNow() {
  if (Date.now() - lastManualRetry < MANUAL_RETRY_GAP_MS) return false;
  lastManualRetry = Date.now();
  offline = false;
  pausedUntil = 0;
  emit();
  window.dispatchEvent(new Event(RETRY_EVENT));
  return true;
}

export const RETRY_EVENT_NAME = RETRY_EVENT;

export function retryAfterMs(error) {
  const header = error?.response?.headers?.get?.("retry-after");
  const seconds =
    Number(error?.response?.data?.retry_after) ||
    Number(header) ||
    Number(error?.retryAfter) ||
    2;
  return Math.min(MAX_WAIT_MS, Math.max(1000, Math.round(seconds * 1000)));
}

function defaultEssential(name, payload) {
  if (NON_ESSENTIAL_CALLS.has(name)) return false;
  if (NON_ESSENTIAL_ACTIONS.has(payload?.action)) return false;
  // Keeping a profile warm is never worth a retry; signing in is.
  if (name === "playerProfile" && payload?.action !== "enter") return false;
  return true;
}

function pausedError() {
  const error = new Error("Offline. Your progress is saved on this device.");
  error.name = "PausedError";
  error.paused = true;
  error.rateLimited = false;
  return error;
}

/** One call per key at a time; everything else queues behind it. */
function serial(key, task) {
  const previous = chains.get(key) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => {});
  chains.set(key, tail);
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}

function waitFor(attempt, serverMs) {
  if (serverMs) return Math.min(MAX_WAIT_MS, Math.max(1000, serverMs));
  const base = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

async function attempt(name, payload, essential) {
  let lastError = null;

  for (let tries = 0; tries <= MAX_RETRIES; tries += 1) {
    // A quiet breaker: nothing non-essential even leaves the browser.
    if (!essential && isPaused()) throw pausedError();

    // Counted per action, so "game:save.get" and "game:chat.list" are told apart.
    const label = `${name}${payload?.action ? `:${payload.action}` : ""}`;
    recordRequest(label);
    console.info(`[net] ${label}`);

    try {
      const response = await base44.functions.invoke(name, payload);
      markOnline();
      return response;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const rateLimited = status === 429 || error?.rateLimited === true;

      if (rateLimited) {
        // Every non-essential call steps aside for the wait the server gave us.
        pauseAll(retryAfterMs(error) + BREAKER_GRACE_MS);
        // The game's own reads and writes are refused: say so at once, keep the
        // screen on local data, and let the retries below clear the note.
        if (essential) markOffline();
        // A non-essential call does not retry: it stays local until the pause ends.
        else throw error;
      }

      // A real answer is not a flaky line: a bad request, an ended session or a
      // maintenance window is passed straight on instead of being hammered.
      if (status && status !== 429 && (status < 500 || status === 503)) throw error;

      if (tries >= MAX_RETRIES) {
        markOffline();
        throw error;
      }

      await sleep(waitFor(tries, rateLimited ? retryAfterMs(error) : 0));
    }
  }

  markOffline();
  throw lastError;
}

/** One non-essential request at a time, in the order they were asked for. */
let quietTail = Promise.resolve();
function oneAtATime(task) {
  const run = quietTail.then(task, task);
  quietTail = run.catch(() => {});
  return run;
}

/**
 * Invokes a backend function.
 * `essential: false` marks a call that may simply be skipped while rate limited.
 */
export function invoke(name, payload = {}, options = {}) {
  const essential = options.essential ?? defaultEssential(name, payload);
  const key = `${name}:${payload?.action || ""}`;
  const run = () => attempt(name, payload, essential);
  return essential ? serial(key, run) : serial(key, () => oneAtATime(run));
}

export function useNetState() {
  const [value, setValue] = useState(snapshot);

  useEffect(() => {
    listeners.add(setValue);
    setValue(snapshot());
    // The countdown and the moment a pause ends are the only clock here.
    const id = setInterval(() => setValue(snapshot()), 1000);
    return () => {
      listeners.delete(setValue);
      clearInterval(id);
    };
  }, []);

  return value;
}