// Hourly sweep: anything a player has not touched in 5 days is deleted, profile
// included, and security events older than 30 days are dropped. Safe to run at
// any time and any number of times.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { purgeExpired, purgeSecurityEvents } from "../../shared/playerProfile.ts";

export default async function (req: Request) {
  try {
    const db = createClientFromRequest(req).asServiceRole;
    const purged = await purgeExpired(db);
    await purgeSecurityEvents(db);

    // One small row so the private dashboard can show when this last ran.
    const ranAt = new Date().toISOString();
    const existing = await db.entities.AppMeta.filter({ key: "last_cleanup_at" }, { limit: 1 }).catch(() => null);
    const row = Array.isArray(existing) ? existing[0] : existing?.items?.[0];
    if (row?.id) await db.entities.AppMeta.update(row.id, { value: ranAt }).catch(() => null);
    else await db.entities.AppMeta.create({ key: "last_cleanup_at", value: ranAt }).catch(() => null);

    return Response.json({ ok: true, purged, ran_at: ranAt });
  } catch (error: any) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}