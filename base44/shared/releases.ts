// Versions and release notes, shared by the admin endpoint and the public one.
//
// A version is three numbers of any size, compared as numbers rather than as
// text, so 12.0.0 is correctly above 2.10.0. Nothing here decides who may
// publish: that lives in the admin function, behind the session check.
import { safeText } from "./session.ts";

export const BASE_VERSION = "1.1.0";
export const CHANGE_TYPES = ["new", "improved", "fixed", "removed"];
export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const CHANGE_MIN = 3;
export const CHANGE_MAX = 200;
export const CHANGES_MAX = 30;
export const DETAILS_MAX = 1000;
export const SEEN_KEPT = 4000;
/** The history a player gets: the ten newest published releases. */
export const PUBLIC_RELEASES = 10;

const VERSION_RE = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;

export const pageOf = (res: any): any[] => (Array.isArray(res) ? res : res?.items ?? []);

export function parseVersion(value: any): string[] | null {
  const match = VERSION_RE.exec(String(value ?? "").trim());
  return match ? [match[1], match[2], match[3]] : null;
}

export const isVersion = (value: any) => parseVersion(value) !== null;

const trimZeros = (digits: string) => digits.replace(/^0+(?=\d)/, "");

const compareDigits = (a: string, b: string) => {
  const x = trimZeros(a);
  const y = trimZeros(b);
  if (x.length !== y.length) return x.length < y.length ? -1 : 1;
  if (x === y) return 0;
  return x < y ? -1 : 1;
};

export function compareVersions(a: any, b: any): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i += 1) {
    const step = compareDigits(x[i], y[i]);
    if (step) return step;
  }
  return 0;
}

/** Newest version first, whatever order the rows arrived in. */
export function sortNewest(rows: any[]): any[] {
  return [...rows].sort(
    (a, b) =>
      compareVersions(b?.version, a?.version) ||
      String(b?.publishedAt || "").localeCompare(String(a?.publishedAt || ""))
  );
}

export const liveVersion = (row: any) =>
  isVersion(row?.currentVersion) ? String(row.currentVersion) : BASE_VERSION;

export const isoOrNow = (value: any) => {
  const at = new Date(String(value || "")).getTime();
  return Number.isFinite(at) && at > 0 ? new Date(at).toISOString() : new Date().toISOString();
};

export function cleanTitle(raw: any): string {
  const title = safeText(raw, TITLE_MAX);
  return title.length >= TITLE_MIN ? title : "";
}

/** Null when the list breaks a rule, so the caller can refuse the whole form. */
export function cleanChanges(raw: any): any[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > CHANGES_MAX) return null;
  const out: any[] = [];
  for (const item of raw) {
    const type = CHANGE_TYPES.includes(item?.type) ? item.type : "";
    const text = safeText(item?.text, CHANGE_MAX);
    if (!type || text.length < CHANGE_MIN) return null;
    out.push({ type, text });
  }
  return out;
}

export const cleanDetails = (raw: any) => safeText(raw, DETAILS_MAX);

/**
 * What a player may ever see of a release. A draft returns null, and the
 * publishing admin's label, the seen list and the raw status never leave.
 */
export function publicRelease(row: any) {
  if (!row || row.status !== "published") return null;
  const version = safeText(row.version, 20);
  if (!isVersion(version)) return null;
  return {
    version,
    title: safeText(row.title, TITLE_MAX),
    changes: (Array.isArray(row.changes) ? row.changes : [])
      .slice(0, CHANGES_MAX)
      .map((change: any) => ({
        type: CHANGE_TYPES.includes(change?.type) ? change.type : "new",
        text: safeText(change?.text, CHANGE_MAX),
      }))
      .filter((change: any) => change.text),
    details: safeText(row.details, DETAILS_MAX),
    date: isoOrNow(row.publishedAt || row.releaseDate),
    important: row.important === true,
    forceRefresh: row.forceRefresh === true,
  };
}