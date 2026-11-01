import { useEffect, useState } from "react";
import { invoke, isPaused } from "@/lib/net";

/**
 * One status for the whole app.
 *
 * It is read once on load, then once every 60 seconds, and it is flipped at once
 * when any player request comes back refused — so a player already inside a
 * project is stopped on their very next action rather than after a minute.
 *
 * The same payload carries the live version and the published release notes, so
 * a release is never fetched on its own.
 */
export const STATUS_POLL_MS = 60000;

const OFF = {
  maintenanceOn: false,
  reason: "",
  expectedBackAt: "",
  startedAt: "",
  currentVersion: "",
  seenGeneration: 0,
  releases: [],
};

const CACHE_KEY = "devopslife.status.cache";

let state = { ready: false, ...OFF };
// When the answer in hand arrived, so a reader can decide whether it is old
// enough to be worth one request. A cached answer survives a reload.
let at = 0;
let running = null;
const listeners = new Set();
let started = false;

const read = (data) => ({
  ready: true,
  maintenanceOn: data?.maintenanceOn === true,
  reason: data?.maintenanceOn ? String(data.reason || "") : "",
  expectedBackAt: data?.maintenanceOn ? String(data.expectedBackAt || "") : "",
  startedAt: data?.maintenanceOn ? String(data.startedAt || "") : "",
  currentVersion: String(data?.currentVersion || ""),
  seenGeneration: Number.isFinite(Number(data?.seenGeneration)) ? Number(data.seenGeneration) : 0,
  releases: Array.isArray(data?.releases) ? data.releases : [],
});

const publish = (next) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
};

export const statusSnapshot = () => state;

/** How old the answer in hand is, in milliseconds. Infinity when there is none. */
export const statusAge = () => (at ? Date.now() - at : Infinity);

const remember = () => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at, data: state }));
  } catch {
    // Blocked storage only means the cache lives in memory for this visit.
  }
};

function hydrate() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (!saved || !saved.data) return;
    state = { ...read(saved.data), ready: true };
    at = Number(saved.at) || 0;
  } catch {
    // Nothing usable on this device.
  }
}

hydrate();

export async function checkStatus() {
  // While the breaker is open the check is skipped entirely: no request, no wait.
  if (isPaused()) return state;
  // One check at a time, however many screens ask for a fresh one.
  if (running) return running;

  running = (async () => {
    try {
      const res = await invoke("getStatus", {}, { essential: false });
      publish(read(res?.data));
      at = Date.now();
      remember();
    } catch {
      // No answer (offline or rate limited) keeps the answer we already have and
      // lets the app run: an unreachable status is not a maintenance window.
      publish({ ready: true });
    } finally {
      running = null;
    }
    return state;
  })();

  return running;
}

/**
 * Reads the shared status only when the answer in hand is older than `maxAgeMs`,
 * so opening the release notes inside the minute costs no request at all.
 */
export async function ensureStatusFresh(maxAgeMs) {
  if (statusAge() <= maxAgeMs) return state;
  return checkStatus();
}

/** Called whenever a player function answers 503. */
export function reportBlocked(data) {
  if (!data?.maintenance) return;
  // A refusal carries the maintenance block only: the version facts stay put.
  publish({
    ...read(data),
    currentVersion: state.currentVersion,
    seenGeneration: state.seenGeneration,
    releases: state.releases,
  });
}

export function startStatusWatch() {
  if (started) return;
  started = true;
  checkStatus();
  setInterval(checkStatus, STATUS_POLL_MS);
}

export function useMaintenanceStatus() {
  const [value, setValue] = useState(statusSnapshot);

  useEffect(() => {
    startStatusWatch();
    listeners.add(setValue);
    setValue(statusSnapshot());
    return () => listeners.delete(setValue);
  }, []);

  return value;
}