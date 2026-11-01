// Feedback intake for visitors who have no account.
//
// The browser never touches the Feedback table: every submission arrives here,
// is bounded and stripped of control characters, then written with the service
// role. Reads stay admin-only, so nobody can list what anyone else sent.
//
// The three-per-hour quota is counted from the rows themselves rather than from
// an in-memory window, because those windows do not survive a cold start.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { clientIp, logSecurityEvent } from "../../shared/abuse.ts";
import { ownedSave, profileForToken, safeText, sha256Hex } from "../../shared/session.ts";
import { TEST_VISITOR, maintenanceGuard } from "../../shared/maintenance.ts";

const CATEGORIES = ["bug", "idea", "content", "design"];
const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  idea: "Idea",
  content: "Content",
  design: "Design",
};
const LEVELS = ["easy", "medium", "hard"];
const PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

const quotaMessage = (wait: number) => ({
  error: "Three tickets an hour is the limit. Send this one on LinkedIn instead.",
  retry_after: wait,
});

export default async function (req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ip = clientIp(req);
    const db = createClientFromRequest(req).asServiceRole;

    // Maintenance blocks feedback like every other player write.
    const gate = await maintenanceGuard(db, body, ip);
    if (gate.blocked) return gate.blocked;

    // Quota is per visitor: the browser keeps one stable id and sends it along.
    // An address alone cannot be the key, because edge addresses change between
    // requests; the id falls back to the address when a client sends none.
    const device = safeText(body.visitorId, 64);
    const visitor = gate.test ? TEST_VISITOR : await sha256Hex(`${device || ip}:devopslife-feedback`);
    const ratingRaw = Math.round(Number(body.rating) || 0);
    const rating = Math.max(0, Math.min(5, Number.isFinite(ratingRaw) ? ratingRaw : 0));
    const message = safeText(body.message, 500);
    // The chat prompt sends its quick reply before the visitor types anything,
    // so an automatic ticket may carry just its category and stars.
    const auto = body.trigger === "auto_after_project" || body.trigger === "auto_after_first_project";
    if (!rating && message.length < 5 && !auto) {
      return Response.json({ error: "Add a star rating or a few words." }, { status: 400 });
    }

    // The completion prompt fills these in; plain feedback leaves them at zero.
    const count = (value: any, max: number) => {
      const n = Math.round(Number(value) || 0);
      return Math.max(0, Math.min(max, Number.isFinite(n) ? n : 0));
    };

    // Second half of the same chat ticket: the visitor's own words, as one update.
    const updateId = safeText(body.updateId, 40);
    if (updateId) {
      const row = await db.entities.Feedback.get(updateId).catch(() => null);
      if (!row || row.visitor !== visitor) {
        return Response.json({ error: "That ticket was not found." }, { status: 404 });
      }
      const patch: Record<string, any> = { message };
      if (rating) patch.rating = rating;
      // The star is saved first and the chip comes after it, so the ticket's
      // category is settled by this second call.
      if (CATEGORIES.includes(body.category)) patch.category = body.category;
      if (LEVELS.includes(body.difficulty)) patch.difficulty = body.difficulty;
      const updated = await db.entities.Feedback.update(row.id, patch);
      return Response.json({ ok: true, id: updated?.id || row.id });
    }

    // Only a brand-new ticket counts against the hourly quota.
    const since = new Date(Date.now() - HOUR_MS).toISOString();
    const recent = gate.test
      ? 0
      : await db.entities.Feedback.count({ visitor, created_date: { $gte: since } }).catch(() => 0);
    if (Number(recent) >= PER_HOUR) {
      await logSecurityEvent(db, { type: "rate_limited", ip, detail: "feedback" });
      return Response.json(quotaMessage(3600), { status: 429, headers: { "Retry-After": "3600" } });
    }

    // The chips are multi-select: the chosen labels are kept as a list, and the
    // oldest single-value field holds the first one so nothing downstream breaks.
    const picked = Array.isArray(body.categories) ? body.categories : [];
    const chosen: string[] = Array.from(
      new Set(
        picked
          .map((value: any) => String(value ?? "").trim().toLowerCase())
          .filter((id: string) => CATEGORIES.includes(id))
      )
    ).slice(0, 4);
    const labels = chosen.map((id) => CATEGORY_LABELS[id]);
    const primary = chosen[0] || (CATEGORIES.includes(body.category) ? body.category : "idea");

    const created = await db.entities.Feedback.create({
      rating,
      category: primary,
      categories: labels,
      message,
      name: safeText(body.name, 30),
      contact: safeText(body.contact, 80),
      // Only a level the schema knows is written; otherwise the field is left out.
      ...(LEVELS.includes(body.difficulty) ? { difficulty: body.difficulty } : {}),
      projectTitle: safeText(body.projectTitle, 120),
      score: count(body.score, 1_000_000),
      hintsUsed: count(body.hintsUsed, 999),
      mistakes: count(body.mistakes, 999),
      trigger: auto ? "auto_after_project" : "manual",
      visitor,
      createdAt: new Date().toISOString(),
    });

    // The career remembers it was answered, so it never asks on its own again.
    // Best effort: a failed flag never costs the player their ticket.
    const token = safeText(body.token, 200);
    if (token) {
      const profile = await profileForToken(db, token).catch(() => null);
      const save = profile ? await ownedSave(db, profile, body.saveId).catch(() => null) : null;
      if (save) {
        // Per project, so finishing another project still asks once more.
        const projectKey = safeText(body.projectKey, 60);
        const answered = { ...(save.feedback_submitted_projects || {}) };
        if (projectKey) answered[projectKey] = true;
        await db.entities.CareerSave.update(save.id, {
          feedbackSubmitted: true,
          feedback_submitted_projects: answered,
        }).catch(() => null);
      }
    }

    return Response.json({ ok: true, id: created?.id || "" });
  } catch {
    return Response.json({ error: "Feedback could not be saved." }, { status: 500 });
  }
}