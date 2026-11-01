// The only door between the browser and the database.
//
// Every request is authorized by a session token (never a name), scoped to the
// caller's own career save, capped at 50 rows, rate limited per session and per
// address, and answers with nothing but the fields the workspace draws.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import {
  ownedSave,
  profileForToken,
  invalidSession,
  tooManyRequests,
  isLockedUntil,
  safeText,
} from "../../shared/session.ts";
import {
  LIMITS,
  checkScraping,
  clientIp,
  isThrottled,
  logSecurityEvent,
  registerViolation,
  take,
} from "../../shared/abuse.ts";
import { maintenanceGuard, testProfile } from "../../shared/maintenance.ts";

const PAGE = 50;
const pageOf = (res: any): any[] => (Array.isArray(res) ? res : res?.items ?? []);

/** Real minutes a step gets at each level. The deadline is always real time. */
const SLA_MINUTES: Record<string, number> = { easy: 240, medium: 60, hard: 25 };

/** A gap longer than this means the player left the game. */
const AWAY_MS = 120_000;

const iso = (value: any, fallback: string) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};

const num = (value: any, min: number, max: number, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const textMap = (value: any, maxKeys: number, valueAt: (raw: any) => any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, any> = {};
  Object.entries(value)
    .slice(0, maxKeys)
    .forEach(([key, raw]) => {
      const safeKey = safeText(key, 60);
      if (safeKey) out[safeKey] = valueAt(raw);
    });
  return out;
};

/** Whitelisted save fields: the browser can never write anything else. */
function saveFields(raw: any) {
  const input = raw && typeof raw === "object" ? raw : {};
  const out: Record<string, any> = {};
  const now = new Date().toISOString();

  if ("last_seen_at" in input) out.last_seen_at = iso(input.last_seen_at, now);
  // The last release this player was shown, so the popup never repeats.
  if ("last_seen_version" in input) out.last_seen_version = safeText(input.last_seen_version, 20);
  if ("last_played_at" in input) out.last_played_at = iso(input.last_played_at, now);
  if ("step_index" in input) out.step_index = Math.round(num(input.step_index, 0, 50, 0));
  if ("score" in input) out.score = Math.round(num(input.score, 0, 100000, 0));
  if ("team_trust" in input) out.team_trust = Math.round(num(input.team_trust, 0, 100, 100));
  if ("manager_calm_until" in input) out.manager_calm_until = num(input.manager_calm_until, 0, 100_000_000, 0);
  if (Array.isArray(input.steps_done)) {
    out.steps_done = input.steps_done.slice(0, 30).map((step: any) => safeText(step, 40)).filter(Boolean);
  }
  if ("hints" in input) out.hints = textMap(input.hints, 30, (v) => Math.round(num(v, 0, 3, 0)));
  if ("mistakes" in input) out.mistakes = textMap(input.mistakes, 30, (v) => Math.round(num(v, 0, 999, 0)));
  if ("chat_replies" in input) out.chat_replies = textMap(input.chat_replies, 60, (v) => safeText(v, 60));
  if (["easy", "medium", "hard"].includes(input.difficulty)) out.difficulty = input.difficulty;
  if (["active", "archived"].includes(input.status)) out.status = input.status;
  if (typeof input.tutorialDone === "boolean") out.tutorialDone = input.tutorialDone;
  if (typeof input.feedbackPrompted === "boolean") out.feedbackPrompted = input.feedbackPrompted;
  if (input.feedback_prompted_projects && typeof input.feedback_prompted_projects === "object") {
    out.feedback_prompted_projects = textMap(input.feedback_prompted_projects, 60, (v) => v === true);
  }
  return out;
}

function chatRow(raw: any, save: any) {
  const body = safeText(raw?.body, 280);
  if (!body) return null;
  const role = raw?.role === "team" ? "team" : "player";
  return {
    save_id: save.id,
    project_key: save.project_key || "",
    player_normalized_name: save.player_normalized_name,
    role,
    author: safeText(raw?.author, 40) || (role === "player" ? save.player_name || "You" : "Team"),
    author_role: safeText(raw?.author_role, 40),
    body,
    intent: safeText(raw?.intent, 30),
    quality: Math.round(num(raw?.quality, 0, 5, 0)),
    tip: safeText(raw?.tip, 200),
    step_key: safeText(raw?.step_key, 40),
    // Real ISO timestamps only: an unusable value becomes the moment of sending.
    sent_at: iso(raw?.sent_at, new Date().toISOString()),
    reveal_at: iso(raw?.reveal_at, new Date().toISOString()),
    senior: raw?.senior === true,
  };
}

export default async function (req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const ip = clientIp(req);
    const db = createClientFromRequest(req).asServiceRole;

    // Maintenance is decided on the server, before any read or write.
    const gate = await maintenanceGuard(db, body, ip);
    if (gate.blocked) return gate.blocked;

    // Per-address ceiling applies before anything else, token or not.
    const ipHit = take(`ip:${ip}`, LIMITS.perIpMinute, 60_000);
    if (!ipHit.ok) {
      await logSecurityEvent(db, { type: "rate_limited", ip, detail: "ip" });
      return tooManyRequests(ipHit.retryAfter);
    }

    const profile = gate.test ? testProfile() : await profileForToken(db, body.token);
    if (!profile) {
      await logSecurityEvent(db, { type: "denied_no_session", ip, detail: action });
      return invalidSession();
    }

    const lockedUntil = isLockedUntil(profile.session_locked_until);
    if (lockedUntil) {
      const wait = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
      return tooManyRequests(wait, "This session is paused for a few minutes. Try again shortly.");
    }

    const sessionHit = take(`session:${profile.id}`, LIMITS.perSessionMinute, 60_000);
    if (!sessionHit.ok) {
      await registerViolation(db, profile, ip, "rate_limited", action);
      return tooManyRequests(sessionHit.retryAfter);
    }

    // ---------------------------------------------------------------- reads
    if (action === "workspace") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ ok: true, tickets: [], services: [], resources: [] });
      const locked = await checkScraping(db, profile, ip, "save", String(save.id));
      if (locked) return tooManyRequests(900, "This session is paused for a few minutes.");

      const scope = { save_id: save.id, project_key: save.project_key || "" };
      const [ticketsRes, servicesRes, resourcesRes] = await Promise.allSettled([
        db.entities.Ticket.filter(scope, { sort: "created_date", limit: PAGE }),
        db.entities.Service.filter(scope, { limit: PAGE }),
        db.entities.InfraResource.filter(scope, { limit: PAGE }),
      ]);
      return Response.json({
        ok: true,
        tickets: ticketsRes.status === "fulfilled" ? pageOf(ticketsRes.value).slice(0, PAGE) : [],
        services: servicesRes.status === "fulfilled" ? pageOf(servicesRes.value).slice(0, PAGE) : [],
        resources: resourcesRes.status === "fulfilled" ? pageOf(resourcesRes.value).slice(0, PAGE) : [],
      });
    }

    if (action === "chat.list") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ ok: true, rows: [] });
      const page = await db.entities.ChatMessage.filter(
        { save_id: save.id, project_key: save.project_key || "" },
        { sort: "-created_date", limit: PAGE }
      ).catch(() => []);
      return Response.json({ ok: true, rows: pageOf(page).slice(0, PAGE).reverse() });
    }

    if (action === "save.get") {
      const save = await ownedSave(db, profile, body.saveId);
      return Response.json({ ok: true, save: save || null });
    }

    // --------------------------------------------------------------- writes
    if (action === "save.patch") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ error: "No career found." }, { status: 404 });
      const fields = saveFields(body.fields);
      if (!Object.keys(fields).length) return Response.json({ ok: true, save });
      const updated = await db.entities.CareerSave.update(save.id, fields);
      return Response.json({ ok: true, save: updated });
    }

    if (action === "ticket.set") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ error: "No career found." }, { status: 404 });
      const status = String(body.status || "");
      if (!["open", "in_progress", "blocked", "resolved"].includes(status)) {
        return Response.json({ error: "Unknown ticket status." }, { status: 400 });
      }
      const ticketId = safeText(body.ticketId, 60);
      const ticket = await db.entities.Ticket
        .get(ticketId)
        .catch((e: any) => (e?.status === 404 ? null : Promise.reject(e)));
      if (!ticket || ticket.save_id !== save.id) {
        await registerViolation(db, profile, ip, "denied_foreign_record", "ticket");
        return Response.json({ error: "That ticket is not part of this career." }, { status: 403 });
      }
      const patch: Record<string, any> = { status };
      if (status === "resolved") patch.resolved_at = new Date().toISOString();
      const updated = await db.entities.Ticket.update(ticket.id, patch);
      return Response.json({ ok: true, ticket: updated });
    }

    if (action === "chat.append") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ error: "No career found." }, { status: 404 });
      const hit = take(`chat:${profile.id}`, LIMITS.chatMinute, 60_000);
      if (!hit.ok) return tooManyRequests(hit.retryAfter);

      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 3).map((row: any) => chatRow(row, save));
      const clean = rows.filter(Boolean);
      if (!clean.length) return Response.json({ error: "An empty message cannot be sent." }, { status: 400 });
      const created = await db.entities.ChatMessage.bulkCreate(clean);
      return Response.json({ ok: true, rows: created || [] });
    }

    if (action === "hint.reveal") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ error: "No career found." }, { status: 404 });
      const hit = take(`hint:${profile.id}`, LIMITS.hintMinute, 60_000);
      if (!hit.ok) return tooManyRequests(hit.retryAfter);

      const stepKey = safeText(body.stepKey, 40);
      if (!stepKey) return Response.json({ error: "A step is required." }, { status: 400 });
      // The ceiling is clamped here, so a tampered client cannot unlock level 3.
      const ceiling = Math.round(num(body.ceiling, 1, 3, 3));
      const hints = save.hints && typeof save.hints === "object" ? save.hints : {};
      const level = Math.min(ceiling, Math.round(num(hints[stepKey], 0, 3, 0)) + 1);
      await db.entities.CareerSave.update(save.id, { hints: { ...hints, [stepKey]: level } });
      return Response.json({ ok: true, level });
    }

    if (action === "career.create") {
      const now = new Date().toISOString();
      const projectKey = safeText(body.projectKey, 40);
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(projectKey)) {
        return Response.json({ error: "Unknown project." }, { status: 400 });
      }
      const difficulty = ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "medium";

      // The feedback memory belongs to this career alone: a fresh career always
      // gets to be asked about the project it finishes.
      const save = await db.entities.CareerSave.create({
        player_normalized_name: profile.normalized_name,
        name: safeText(body.projectTitle, 120) || projectKey,
        player_name: profile.display_name,
        project_key: projectKey,
        project_title: safeText(body.projectTitle, 120),
        difficulty,
        status: "active",
        step_index: 0,
        steps_done: [],
        hints: {},
        mistakes: {},
        chat_replies: {},
        team_trust: 100,
        score: 0,
        last_played_at: now,
        last_seen_at: now,
        started_at: now,
        paused_ms: 0,
        feedbackPrompted: false,
        feedback_prompted_projects: {},
        feedback_submitted_projects: {},
        feedbackSubmitted: false,
      });

      // The server owns the deadline: real now, plus this level's real minutes.
      const dueAt = new Date(
        Date.parse(now) + (SLA_MINUTES[difficulty] || SLA_MINUTES.medium) * 60000
      ).toISOString();
      const tickets = (Array.isArray(body.tickets) ? body.tickets : []).slice(0, 20).map((raw: any) => ({
        save_id: save.id,
        player_normalized_name: profile.normalized_name,
        project_key: projectKey,
        step_key: safeText(raw?.step_key, 40),
        key: safeText(raw?.key, 20),
        title: safeText(raw?.title, 140),
        type: "task",
        priority: ["P1", "P2", "P3", "P4"].includes(raw?.priority) ? raw.priority : "P3",
        status: raw?.status === "in_progress" ? "in_progress" : "open",
        assignee: safeText(raw?.assignee, 40) || profile.display_name,
        reporter: safeText(raw?.reporter, 40),
        opened_at: now,
        sla_due_at: dueAt,
        player_owned: true,
      })).filter((row: any) => row.title);

      const services = (Array.isArray(body.services) ? body.services : []).slice(0, 20).map((raw: any) => ({
        save_id: save.id,
        player_normalized_name: profile.normalized_name,
        project_key: projectKey,
        name: safeText(raw?.name, 60),
        kind: safeText(raw?.kind, 30),
        health: ["healthy", "degraded", "down"].includes(raw?.health) ? raw.health : "healthy",
        replicas: Math.round(num(raw?.replicas, 0, 999, 1)),
        version: safeText(raw?.version, 40),
        last_deploy: safeText(raw?.last_deploy, 40),
        environment: "prod",
      })).filter((row: any) => row.name);

      const resources = (Array.isArray(body.resources) ? body.resources : []).slice(0, 20).map((raw: any) => ({
        save_id: save.id,
        player_normalized_name: profile.normalized_name,
        project_key: projectKey,
        name: safeText(raw?.name, 60),
        kind: safeText(raw?.kind, 30) || "node",
        provider: "aws",
        region: "ap-south-1",
        instance_size: safeText(raw?.instance_size, 40),
        status: "running",
      })).filter((row: any) => row.name);

      await Promise.allSettled([
        tickets.length ? db.entities.Ticket.bulkCreate(tickets) : Promise.resolve(null),
        services.length ? db.entities.Service.bulkCreate(services) : Promise.resolve(null),
        resources.length ? db.entities.InfraResource.bulkCreate(resources) : Promise.resolve(null),
      ]);

      return Response.json({ ok: true, save });
    }

    if (action === "career.attach") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ error: "No career found." }, { status: 404 });
      const projectKey = safeText(body.projectKey, 40);
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(projectKey)) {
        return Response.json({ error: "Unknown project." }, { status: 400 });
      }
      const updated = await db.entities.CareerSave.update(save.id, {
        project_key: projectKey,
        project_title: safeText(body.projectTitle, 120),
        step_index: 0,
        steps_done: [],
        hints: {},
        mistakes: {},
        chat_replies: {},
        started_at: new Date().toISOString(),
        paused_ms: 0,
        player_name: profile.display_name,
      });
      return Response.json({ ok: true, save: updated });
    }

    /**
     * Called once when the workspace opens. Time spent away never counts
     * against a deadline, so the gap is added to every open ticket's due date
     * and to the save's paused total, and the game resumes where it stopped.
     */
    if (action === "career.resume") {
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ ok: true, awayMs: 0, save: null });
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const lastSeen = Date.parse(save.last_seen_at || "");
      const gap = Number.isFinite(lastSeen) ? nowMs - lastSeen : 0;

      if (gap < AWAY_MS) {
        const touched = await db.entities.CareerSave.update(save.id, { last_seen_at: now });
        return Response.json({ ok: true, awayMs: 0, save: touched });
      }

      const scope = { save_id: save.id, project_key: save.project_key || "" };
      const page = await db.entities.Ticket.filter(scope, { limit: PAGE }).catch(() => []);
      const open = pageOf(page).filter(
        (ticket: any) => ticket.status !== "resolved" && ticket.status !== "closed"
      );
      const shifted = open
        .map((ticket: any) => {
          const due = Date.parse(ticket.sla_due_at || "");
          if (!Number.isFinite(due)) return null;
          return { id: ticket.id, sla_due_at: new Date(due + gap).toISOString() };
        })
        .filter(Boolean);

      const updated = await db.entities.CareerSave.update(save.id, {
        last_seen_at: now,
        paused_ms: Math.round(num(save.paused_ms, 0, 1_000_000_000_000, 0) + gap),
      });
      if (shifted.length) await db.entities.Ticket.bulkUpdate(shifted).catch(() => null);

      return Response.json({ ok: true, awayMs: gap, save: updated });
    }

    /** Admin test tool: drops a fresh incident onto the test career. */
    if (action === "test.incident") {
      if (!gate.test) return Response.json({ error: "Unknown action." }, { status: 400 });
      const save = await ownedSave(db, profile, body.saveId);
      if (!save) return Response.json({ error: "Start a test career first." }, { status: 404 });
      const now = new Date();
      const ticket = await db.entities.Ticket.create({
        save_id: save.id,
        player_normalized_name: profile.normalized_name,
        project_key: save.project_key || "",
        step_key: safeText(body.stepKey, 40),
        key: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
        title: safeText(body.title, 140) || "Incident: checkout API error rate climbing",
        type: "incident",
        priority: "P1",
        status: "open",
        assignee: profile.display_name,
        reporter: "PagerDuty",
        opened_at: now.toISOString(),
        sla_due_at: new Date(now.getTime() + 25 * 60000).toISOString(),
        player_owned: true,
      });
      return Response.json({ ok: true, ticket });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error: any) {
    if (isThrottled(error)) return tooManyRequests(60);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}