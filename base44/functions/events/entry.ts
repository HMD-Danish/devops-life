// Player activity intake.
//
// The browser batches these rows and sends at most one request every two
// seconds, so playing a project costs a handful of writes. A row is only
// accepted with a live player session, and the player name always comes from
// that session — never from the request body.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { clientIp, take } from "../../shared/abuse.ts";
import { profileForToken, safeText } from "../../shared/session.ts";
import { maintenanceGuard, testProfile } from "../../shared/maintenance.ts";

const TYPES = ["career_started", "project_started", "project_completed", "hint_used", "mistake", "feedback_sent"];
const LEVELS = ["easy", "medium", "hard"];
const BATCH_MAX = 25;
const BURST_PER_MINUTE = 30;

export default async function (req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const db = createClientFromRequest(req).asServiceRole;

    const gate = await maintenanceGuard(db, body, clientIp(req));
    if (gate.blocked) return gate.blocked;

    const profile = gate.test ? testProfile() : await profileForToken(db, body.token);
    if (!profile) return Response.json({ error: "Not allowed" }, { status: 401 });

    // A burst is dropped quietly: analytics must never interrupt play.
    const burst = take(`events:${profile.id}`, BURST_PER_MINUTE, 60_000);
    if (!burst.ok) return Response.json({ ok: true, saved: 0, skipped: true });

    const incoming = Array.isArray(body.events) ? body.events.slice(0, BATCH_MAX) : [];
    const at = new Date().toISOString();
    const rows = incoming
      .filter((event: any) => event && TYPES.includes(event.type))
      .map((event: any) => ({
        type: event.type,
        difficulty: LEVELS.includes(event.difficulty) ? event.difficulty : "",
        projectId: safeText(event.projectId, 60),
        playerName: profile.display_name || "",
        createdAt: at,
      }));

    if (!rows.length) return Response.json({ ok: true, saved: 0 });
    await db.entities.GameEvent.bulkCreate(rows);
    return Response.json({ ok: true, saved: rows.length });
  } catch {
    return Response.json({ error: "The event batch was dropped." }, { status: 500 });
  }
}