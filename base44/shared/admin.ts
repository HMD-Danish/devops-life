// Admin access for the private dashboard.
//
// The password never exists in this repository: it is read from the
// ADMIN_PASSCODE secret at the moment of a sign-in. A correct password mints a
// 128-bit token; only its SHA-256 is stored, so a database read cannot replay it.
// Player sessions are never consulted here, and a missing admin token is always
// the same flat refusal.
import { logSecurityEvent } from "./abuse.ts";
import { safeText, sha256Hex } from "./session.ts";

export const APP_VERSION = "1.0.0";
export const ADMIN_TTL_MS = 2 * 60 * 60 * 1000;
export const SESSION_TOUCH_MS = 60 * 1000;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_LOGIN_FAILURES = 5;
export const ADMIN_TOKEN_RE = /^[a-f0-9]{32}$/;
export const FAILURE_DELAY_MS = 520;

export const pageOf = (res: any): any[] => (Array.isArray(res) ? res : res?.items ?? []);

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

/** 128 bits from the platform CSPRNG. */
export function newAdminToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function notAllowed() {
  return Response.json({ error: "Not allowed" }, { status: 401 });
}

/** Both values are hashed first, so the comparison never leaks length or timing. */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = [await sha256Hex(String(given)), await sha256Hex(String(expected))];
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A stable key for the admin browser. Edge addresses change between requests,
 * so the address alone cannot hold a guesser back; this id can.
 */
export async function deviceKey(raw: any): Promise<string> {
  const value = safeText(raw, 64);
  if (value.length < 8) return "";
  return sha256Hex(`${value}:devopslife-admin`);
}

/** The five most recent failures matching a key, newest first. */
export async function recentFailures(db: any, query: any) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  return pageOf(
    await db.entities.SecurityEvent
      .filter({ type: "admin_login_failed", created_date: { $gte: since }, ...query }, { sort: "-created_date", limit: MAX_LOGIN_FAILURES })
      .catch(() => [])
  );
}

/** Seconds until the lock lifts, or 0 when this address is not locked. */
export function lockWaitSeconds(rows: any[]): number {
  if (!Array.isArray(rows) || rows.length < MAX_LOGIN_FAILURES) return 0;
  const oldest = new Date(rows[rows.length - 1]?.created_date || 0).getTime();
  if (!Number.isFinite(oldest) || !oldest) return Math.round(LOGIN_WINDOW_MS / 1000);
  return Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - Date.now()) / 1000));
}

export async function recordFailure(db: any, ip: string, device = "") {
  // Time of the attempt is the row's own created_date. No password is ever written.
  await logSecurityEvent(db, { type: "admin_login_failed", ip, detail: device ? `device:${device}` : "" });
}

export async function createAdminSession(db: any, ip: string, token: string) {
  const now = Date.now();
  const cutoff = new Date(now).toISOString();
  await db.entities.AdminSession.deleteMany({ expires_at: { $lt: cutoff } }).catch(() => null);
  await db.entities.AdminSession.create({
    token_hash: await sha256Hex(token),
    ip: safeText(ip, 64),
    last_used_at: new Date(now).toISOString(),
    expires_at: new Date(now + ADMIN_TTL_MS).toISOString(),
  });
}

/** Resolves a token to a live admin session, sliding the two-hour window. */
export async function resolveAdminSession(db: any, token: any) {
  if (typeof token !== "string" || !ADMIN_TOKEN_RE.test(token)) return null;
  const hash = await sha256Hex(token);
  const rows = pageOf(await db.entities.AdminSession.filter({ token_hash: hash }, { limit: 1 }));
  const row = rows[0];
  if (!row) return null;

  const expiry = new Date(row.expires_at || 0).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    await db.entities.AdminSession.delete(row.id).catch(() => null);
    return null;
  }

  const last = new Date(row.last_used_at || 0).getTime();
  if (!Number.isFinite(last) || Date.now() - last > SESSION_TOUCH_MS) {
    const now = Date.now();
    const next = new Date(now + ADMIN_TTL_MS).toISOString();
    await db.entities.AdminSession
      .update(row.id, { last_used_at: new Date(now).toISOString(), expires_at: next })
      .catch(() => null);
    return { ...row, expires_at: next };
  }
  return row;
}

export async function destroyAdminSession(db: any, token: any) {
  if (typeof token !== "string" || !ADMIN_TOKEN_RE.test(token)) return false;
  await db.entities.AdminSession.deleteMany({ token_hash: await sha256Hex(token) }).catch(() => null);
  return true;
}

/** Escapes a user-typed search term so it can only ever match, never pattern. */
export function literal(value: any, max = 60): string {
  return safeText(value, max).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}