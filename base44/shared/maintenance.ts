// Maintenance mode and the admin test environment, enforced on the server.
//
// Every player function calls `maintenanceGuard` before it touches the database.
// While maintenance is on, the only callers that get through are a live admin
// session and a live test-environment token; everything else is refused with a
// flat 503 that carries the player-facing message and nothing else about the
// admin side of the app.
//
// Test data lives in its own namespace (TEST_NAMESPACE on every record it owns),
// so it never shows up in the players list, the feedback inbox or the analytics,
// and one call wipes all of it when the admin leaves the test environment.
import { resolveAdminSession } from "./admin.ts";
import { safeText, sha256Hex } from "./session.ts";

export const SETTINGS_KEY = "global";
export const REASON_MIN = 10;
export const REASON_MAX = 300;
export const NOTE_MAX = 300;
export const TEST_TTL_MS = 4 * 60 * 60 * 1000;
export const TEST_NAMESPACE = "test-run";
export const TEST_DISPLAY = "Test run";
export const TEST_VISITOR = "test-namespace";
export const BLOCKED_KEPT = 500;

export const pageOf = (res: any): any[] => (Array.isArray(res) ? res : res?.items ?? []);

export const MAINTENANCE_MESSAGE =
  "DevOps Life is in maintenance. Your progress is saved — try again in a few minutes.";

/* ----------------------------------------------------------------- settings */

export async function settings(db: any) {
  // The row everything reads is the one written last, so a publish and a status
  // check can never disagree about which row holds the live version.
  const rows = pageOf(
    await db.entities.AppSettings
      .filter({ key: SETTINGS_KEY }, { limit: 1, sort: "-updated_date" })
      .catch(() => [])
  );
  return rows[0] || null;
}

export async function ensureSettings(db: any) {
  const row = await settings(db);
  if (row) return row;
  return await db.entities.AppSettings.create({ key: SETTINGS_KEY, maintenanceOn: false, blockedCount: 0 });
}

export const isOn = (row: any) => row?.maintenanceOn === true;

/** The three fields a player may ever see. Nothing else leaves the server. */
export function publicStatus(row: any) {
  if (!isOn(row)) return { maintenanceOn: false };
  return {
    maintenanceOn: true,
    reason: safeText(row?.reason, REASON_MAX),
    expectedBackAt: textIso(row?.expectedBackAt),
    startedAt: textIso(row?.startedAt),
  };
}

export function adminStatus(row: any) {
  if (!row) {
    return {
      maintenanceOn: false,
      reason: "",
      expectedBackAt: "",
      internalNote: "",
      startedAt: "",
      startedBy: "",
      blockedCount: 0,
      testActive: false,
    };
  }
  return {
    ...publicStatus(row),
    internalNote: safeText(row?.internalNote, NOTE_MAX),
    startedBy: safeText(row?.startedBy, 40),
    blockedCount: Math.max(0, Math.round(Number(row?.blockedCount) || 0)),
    testActive: !!row?.testTokenHash && testTokenLive(row),
  };
}

const textIso = (value: any) => {
  const at = new Date(String(value || "")).getTime();
  return Number.isFinite(at) && at > 0 ? new Date(at).toISOString() : "";
};

export const validReason = (value: any) => {
  const text = safeText(value, REASON_MAX);
  return text.length >= REASON_MIN && text.length <= REASON_MAX ? text : "";
};

/* ------------------------------------------------------------------ refusals */

export function maintenanceResponse(row: any) {
  return Response.json(
    { ...publicStatus(row), error: MAINTENANCE_MESSAGE, maintenance: true },
    { status: 503, headers: { "Retry-After": "60" } }
  );
}

/** Counts a refused visitor once. The visitor id is hashed; the address is not kept. */
export async function noteBlockedVisit(db: any, row: any, visitor: any, ip: string) {
  const key = await sha256Hex(`${safeText(visitor, 64) || ip || "unknown"}:maintenance`);
  const seen = Array.isArray(row?.blockedVisitors) ? row.blockedVisitors : [];
  if (seen.includes(key)) return;
  await db.entities.AppSettings
    .update(row.id, {
      blockedCount: Math.max(0, Math.round(Number(row?.blockedCount) || 0)) + 1,
      blockedVisitors: [...seen, key].slice(-BLOCKED_KEPT),
    })
    .catch(() => null);
}

/* ---------------------------------------------------------------- test token */

export function testTokenLive(row: any) {
  const at = new Date(String(row?.testTokenExpiresAt || "")).getTime();
  return Number.isFinite(at) && at > Date.now();
}

export async function resolveTestToken(db: any, token: any) {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) return null;
  const row = await settings(db);
  if (!isOn(row) || !row?.testTokenHash || !testTokenLive(row)) return null;
  return (await sha256Hex(token)) === row.testTokenHash ? row : null;
}

/* -------------------------------------------------------------------- guard */

/**
 * The one check every player function runs first.
 * `blocked` is a ready 503 response, or null when the caller may continue.
 * `test` is true only for a live test-environment token.
 */
export async function maintenanceGuard(db: any, body: any, ip: string) {
  const row = await settings(db);
  if (!isOn(row)) return { blocked: null, test: false, row: null };

  if (await resolveAdminSession(db, body?.adminToken)) return { blocked: null, test: false, row };
  if (await resolveTestToken(db, body?.testToken)) return { blocked: null, test: true, row };

  await noteBlockedVisit(db, row, body?.visitor, ip);
  return { blocked: maintenanceResponse(row), test: false, row };
}

/** The identity test-mode writes are owned by. No player profile row is created. */
export function testProfile() {
  return { id: "test-environment", normalized_name: TEST_NAMESPACE, display_name: TEST_DISPLAY };
}

/* ---------------------------------------------------------- retention pause */

/**
 * The five-day retention clock is paused while maintenance is on: turning it off
 * pushes every live player's expiry out by the length of the window.
 */
export async function extendPlayerExpiry(db: any, ms: number) {
  const shift = Math.max(0, Math.round(ms));
  if (shift < 60_000) return 0;
  const now = Date.now();
  let moved = 0;
  let cursor = "";

  for (let page = 0; page < 20; page += 1) {
    const batch = await db.entities.PlayerProfile
      .filter(
        { expires_at: { $gt: new Date(now).toISOString() } },
        { limit: 200, sort: "created_date", ...(cursor ? { cursor } : {}) }
      )
      .catch(() => null);
    const rows = pageOf(batch);
    const patches = rows
      .map((row: any) => {
        const current = new Date(row.expires_at || 0).getTime();
        if (!Number.isFinite(current)) return null;
        return { id: row.id, expires_at: new Date(current + shift).toISOString() };
      })
      .filter(Boolean);
    if (patches.length) {
      await db.entities.PlayerProfile.bulkUpdate(patches).catch(() => null);
      moved += patches.length;
    }
    const next = batch?.next_cursor || "";
    if (!rows.length || !batch?.has_more || !next) break;
    cursor = next;
  }
  return moved;
}

/* -------------------------------------------------------------- test cleanup */

/** Deletes every record the test environment wrote. Real data is never touched. */
export async function purgeTestData(db: any) {
  const scope = { player_normalized_name: TEST_NAMESPACE };
  const sessions = pageOf(
    await db.entities.TerminalSession.filter(scope, { limit: 50 }).catch(() => [])
  );
  const sessionIds = sessions.map((row: any) => row.id).filter(Boolean);

  await Promise.allSettled([
    db.entities.CareerSave.deleteMany(scope),
    db.entities.ChatMessage.deleteMany(scope),
    db.entities.Ticket.deleteMany(scope),
    db.entities.Service.deleteMany(scope),
    db.entities.InfraResource.deleteMany(scope),
    db.entities.TerminalSession.deleteMany(scope),
    db.entities.GameEvent.deleteMany({ playerName: TEST_DISPLAY }),
    db.entities.Feedback.deleteMany({ visitor: TEST_VISITOR }),
  ]);

  if (sessionIds.length) {
    // CommandLog exists in some builds of the app and not in others.
    try {
      await db.entities.CommandLog?.deleteMany({ session_id: { $in: sessionIds } });
    } catch {
      // Nothing to clean up if the table is not part of this app.
    }
  }
}