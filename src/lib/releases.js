import { invoke } from "@/lib/net";

/**
 * Release versions on the browser side: which number is higher, what this
 * browser has already been shown, and the one write a dismissal costs.
 *
 * A version is three numbers of any size compared as numbers, so 12.0.0 sits
 * above 2.10.0. Nothing here trusts a version to mean anything: the server
 * decides what is live and what a player may see.
 */
const SEEN_KEY = "devopslife.version.seen";
const VISITOR_KEY = "devopslife.visitor";
const RUNTIME_KEY = "devopslife.version.runtime";
const FORCE_KEY = "devopslife.whatsnew.force";

export const BASE_VERSION = "1.1.0";
export const RELEASE_EVENT = "devopslife:releases-changed";
export const OPEN_UPDATE_EVENT = "devopslife:open-update";

/** Opens the one Update dialog from anywhere in the admin, such as an empty state. */
export const openUpdateModal = () => window.dispatchEvent(new Event(OPEN_UPDATE_EVENT));
export const CHANGE_TYPES = ["new", "improved", "fixed", "removed"];

const VERSION_RE = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;

export const isVersion = (value) => VERSION_RE.test(String(value || "").trim());

export function compareVersions(a, b) {
  if (!isVersion(a) || !isVersion(b)) return 0;
  const x = String(a).split(".").map(Number);
  const y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

const bump = (version, part) => {
  const [major, minor, patch] = String(isVersion(version) ? version : BASE_VERSION)
    .split(".")
    .map((part_) => Number(part_) || 0);
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

/** The three versions offered at the top of the dropdown. */
export const suggestions = (live) => [bump(live, "patch"), bump(live, "minor"), bump(live, "major")];

/** Every version after the live one, generated on demand, with no ceiling. */
export function versionWindow(live, count) {
  const [major, minorStart, patchStart] = String(isVersion(live) ? live : BASE_VERSION)
    .split(".")
    .map((part) => Number(part) || 0);

  const out = [];
  let minor = minorStart;
  let patch = patchStart;

  for (let i = 0; i < count; i += 1) {
    patch += 1;
    if (patch > 999) {
      patch = 0;
      minor += 1;
    }
    out.push(`${major}.${minor}.${patch}`);
  }
  return out;
}

const readText = (key) => {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage only means this browser forgets between visits.
  }
};

const drop = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
};

/** The version this browser was last shown, and the reset generation it knows. */
export function readSeen() {
  let raw = null;
  try {
    raw = JSON.parse(readText(SEEN_KEY) || "null");
  } catch {
    raw = null;
  }
  return {
    version: isVersion(raw?.version) ? String(raw.version) : "",
    generation: Number.isFinite(raw?.generation) ? Number(raw.generation) : null,
  };
}

export function writeSeen(version, generation) {
  write(SEEN_KEY, JSON.stringify({ version, generation, at: new Date().toISOString() }));
}

/** One stable id per browser, hashed on the server so the row never holds it. */
export function visitorId() {
  let id = readText(VISITOR_KEY);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    write(VISITOR_KEY, id);
  }
  return id;
}

/** The single write a dismissal makes: this visitor has seen this version. */
export function markReleaseSeen(version) {
  return invoke(
    "getStatus",
    { action: "release.seen", version, visitor: visitorId() },
    { essential: false }
  ).catch(() => null);
}

/** The version this tab was running when it loaded, so a newer one is spotted. */
export const readRuntime = () => readText(RUNTIME_KEY);
export const writeRuntime = (version) => write(RUNTIME_KEY, version);

export const readForce = () => readText(FORCE_KEY);
export const setForce = (version) => write(FORCE_KEY, version);
export const clearForce = () => drop(FORCE_KEY);

export function releaseDateLabel(iso) {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}