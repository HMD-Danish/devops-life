// The public status. No token, no session — the browser asks this on load and
// once a minute afterwards, and it is the only place a player learns anything
// about the app's state.
//
// It answers with the maintenance switch, the player-facing reason, the live
// version and the published release notes. Drafts, the internal note, the admin
// who flicked the switch, the blocked-visit count and every admin field never
// leave the admin function.
//
// The same endpoint takes one write: a dismissal of the What's new popup, which
// counts the visitor once per version. No release is ever fetched on its own.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { clientIp, take } from "../../shared/abuse.ts";
import { publicStatus, settings } from "../../shared/maintenance.ts";
import {
  PUBLIC_RELEASES,
  SEEN_KEPT,
  isVersion,
  liveVersion,
  pageOf,
  publicRelease,
  sortNewest,
} from "../../shared/releases.ts";
import { safeText, sha256Hex } from "../../shared/session.ts";

const OFF = { maintenanceOn: false, currentVersion: "", seenGeneration: 0, releases: [] };

export default async function (req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ip = clientIp(req);
    // One minute is the polling interval; a dismissal shares the same allowance.
    const hit = take(`status:${ip}`, 90, 60_000);
    if (!hit.ok) {
      return Response.json(OFF, { status: 429, headers: { "Retry-After": String(hit.retryAfter) } });
    }

    const db = createClientFromRequest(req).asServiceRole;

    if (safeText(body?.action, 30) === "release.seen") return await recordSeen(db, body, ip);

    const row = await settings(db);
    const published = pageOf(
      await db.entities.Release
        .filter({ status: "published" }, { sort: "-publishedAt", limit: PUBLIC_RELEASES * 2 })
        .catch(() => [])
    );
    const releases = sortNewest(published)
      .slice(0, PUBLIC_RELEASES)
      .map(publicRelease)
      .filter(Boolean);

    return Response.json(
      {
        ...publicStatus(row),
        currentVersion: liveVersion(row),
        seenGeneration: Math.max(0, Math.round(Number(row?.seenGeneration) || 0)),
        releases,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // A status check must never block the app: an unreadable switch reads as off,
    // and the player functions stay the real gate.
    return Response.json(OFF, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}

/**
 * One write per dismissal, and none at all for a visitor already counted.
 * The browser id is hashed with a fixed salt, so the row never holds it.
 */
async function recordSeen(db: any, body: any, ip: string) {
  const version = safeText(body?.version, 20);
  if (!isVersion(version)) return Response.json({ ok: false }, { status: 400 });

  const visitor = safeText(body?.visitor, 64);
  const key = await sha256Hex(`${visitor || `ip:${ip}`}:devopslife-release`);

  const row = pageOf(
    await db.entities.Release.filter({ version, status: "published" }, { limit: 1 }).catch(() => [])
  )[0];
  if (!row) return Response.json({ ok: true, counted: false });

  const seen = Array.isArray(row.seenVisitors) ? row.seenVisitors : [];
  if (seen.includes(key)) return Response.json({ ok: true, counted: false });

  const next = [...seen, key].slice(-SEEN_KEPT);
  await db.entities.Release.update(row.id, { seenVisitors: next, seenCount: next.length }).catch(() => null);
  return Response.json({ ok: true, counted: true });
}