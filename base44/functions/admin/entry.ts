// The private admin API. One endpoint, one action per call.
//
// Sign-in checks ADMIN_PASSCODE (a secret, never in this repository), refuses
// after five failures from one address inside fifteen minutes, and returns a
// 128-bit token whose hash is all the database ever sees. Every other action
// runs only after that token resolves to an unexpired session. Player session
// tokens are never read here, so a player can never reach any of it.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { secrets } from "base44:runtime";
import { clientIp, logSecurityEvent } from "../../shared/abuse.ts";
import {
  ADMIN_TTL_MS,
  APP_VERSION,
  FAILURE_DELAY_MS,
  createAdminSession,
  destroyAdminSession,
  deviceKey,
  literal,
  lockWaitSeconds,
  newAdminToken,
  notAllowed,
  pageOf,
  pause,
  recentFailures,
  recordFailure,
  resolveAdminSession,
  sameSecret,
} from "../../shared/admin.ts";
import { groupCounts, projectRollup, rollupFor, scanSaves, toCsv } from "../../shared/adminStats.ts";
import { findProfile, publicProfile, purgeExpired, savesOf, wipeProfile } from "../../shared/playerProfile.ts";
import { safeText, sha256Hex } from "../../shared/session.ts";
import {
  BASE_VERSION,
  CHANGES_MAX,
  CHANGE_MAX,
  CHANGE_TYPES,
  DETAILS_MAX,
  TITLE_MAX,
  TITLE_MIN,
  cleanChanges,
  cleanDetails,
  cleanTitle,
  compareVersions,
  isVersion,
  isoOrNow,
  liveVersion,
  sortNewest,
} from "../../shared/releases.ts";
import {
  NOTE_MAX,
  REASON_MAX,
  REASON_MIN,
  TEST_DISPLAY,
  TEST_NAMESPACE,
  TEST_TTL_MS,
  TEST_VISITOR,
  adminStatus,
  ensureSettings,
  extendPlayerExpiry,
  isOn,
  purgeTestData,
  settings,
  validReason,
} from "../../shared/maintenance.ts";

const STATUSES = ["new", "read", "in_progress", "done"];
const CATEGORIES = ["bug", "idea", "content", "design"];
const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  idea: "Idea",
  content: "Content",
  design: "Design",
};
const LEVELS = ["easy", "medium", "hard"];
const PAGE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function (req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = safeText(body.action, 40);
    const db = createClientFromRequest(req).asServiceRole;
    const ip = clientIp(req);

    if (action === "login") return await signIn(db, ip, body);
    if (action === "logout") {
      // Leaving admin always wipes the test namespace and its token.
      await purgeTestData(db).catch(() => null);
      await clearTestToken(db);
      await destroyAdminSession(db, body.token);
      return Response.json({ ok: true });
    }

    // Everything below requires a live admin session.
    const session = await resolveAdminSession(db, body.token);
    if (!session) return notAllowed();

    switch (action) {
      case "session":
        return Response.json({ ok: true, expires_at: session.expires_at, version: APP_VERSION });
      case "dashboard":
        return Response.json(await dashboard(db, body));
      case "feedback.list":
        return Response.json(await feedbackList(db, body));
      case "feedback.update":
        return await feedbackUpdate(db, body);
      case "feedback.delete":
        return await feedbackDelete(db, body);
      case "feedback.export":
        return Response.json(await feedbackExport(db, body));
      case "players.list":
        return Response.json(await playersList(db, body));
      case "players.progress":
        return await playerProgress(db, body);
      case "players.delete":
        return await playerDelete(db, body);
      case "players.extend":
        return await playerExtend(db, body);
      case "players.purge":
        return Response.json({ ok: true, purged: await purgeExpired(db) });
      case "notes.get":
        return Response.json({ notes: (await metaGet(db, "linkedin_notes")) || "" });
      case "notes.save":
        return Response.json({ ok: true, notes: await metaSet(db, "linkedin_notes", safeText(body.notes, 8000)) });
      case "maintenance.status":
        return Response.json({ status: adminStatus(await settings(db)) });
      case "maintenance.on":
        return await maintenanceOn(db, session, body);
      case "maintenance.off":
        return await maintenanceOff(db);
      case "maintenance.history":
        return Response.json(await maintenanceHistory(db, body));
      case "test.start":
        return await testStart(db);
      case "test.exit":
        return await testExit(db);
      case "test.reset":
        await purgeTestData(db);
        return Response.json({ ok: true });
      case "release.current":
        return Response.json(await releaseCurrent(db));
      case "release.list":
        return Response.json(await releaseList(db, body));
      case "release.get":
        return await releaseGet(db, body);
      case "release.save":
        return await releaseSave(db, body);
      case "release.publish":
        return await releasePublish(db, session, body);
      case "release.unpublish":
        return await releaseUnpublish(db, session, body);
      case "release.delete":
        return await releaseDelete(db, body);
      case "release.resetSeen":
        return await releaseResetSeen(db, body);
      case "settings":
        return Response.json({
          version: APP_VERSION,
          last_cleanup_at: (await metaGet(db, "last_cleanup_at")) || "",
          feedback_total:
            Number(await db.entities.Feedback.count({ visitor: { $ne: TEST_VISITOR } }).catch(() => 0)) || 0,
        });
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "The admin request could not be completed." }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ sign in */

const lockMessage = (seconds: number) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts from this network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
};

/** The longest lock held against either the address or the admin browser. */
async function lockWait(db: any, ip: string, device: string) {
  const [byIp, byDevice] = await Promise.all([
    recentFailures(db, { ip }),
    device ? recentFailures(db, { detail: `device:${device}` }) : Promise.resolve([]),
  ]);
  return Math.max(lockWaitSeconds(byIp), lockWaitSeconds(byDevice));
}

async function signIn(db: any, ip: string, body: any) {
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 200) {
    return Response.json({ error: "Wrong password" }, { status: 400 });
  }

  // Two keys on purpose: the address, and an id the admin browser keeps. Edge
  // addresses rotate between requests, so the second one is what actually locks.
  const device = await deviceKey(body.device);
  const blocking = await lockWait(db, ip, device);
  if (blocking > 0) {
    return Response.json(
      { error: "Wrong password", locked: true, retry_after: blocking, message: lockMessage(blocking) },
      { status: 429, headers: { "Retry-After": String(blocking) } }
    );
  }

  const expected = secrets.get("ADMIN_PASSCODE");
  if (!expected) {
    return Response.json(
      { error: "Admin sign in is not set up yet. Add ADMIN_PASSCODE in the app secrets." },
      { status: 503 }
    );
  }

  if (!(await sameSecret(password, expected))) {
    await recordFailure(db, ip, device);
    await pause(FAILURE_DELAY_MS);
    const locked = await lockWait(db, ip, device);
    return Response.json(
      {
        error: "Wrong password",
        locked: locked > 0,
        retry_after: locked,
        message: locked > 0 ? lockMessage(locked) : "",
      },
      { status: 401, headers: locked > 0 ? { "Retry-After": String(locked) } : {} }
    );
  }

  const token = newAdminToken();
  await createAdminSession(db, ip, token);
  return Response.json({ ok: true, token, expires_at: new Date(Date.now() + ADMIN_TTL_MS).toISOString() });
}

/* ---------------------------------------------------------------- dashboard */

const isoOf = (at: number) => new Date(at).toISOString();

function dayKey(iso: any) {
  return String(iso || "").slice(0, 10);
}

function lastDays(count: number) {
  const days: string[] = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i -= 1) days.push(dayKey(isoOf(now - i * DAY_MS)));
  return days;
}

async function dashboard(db: any, body: any) {
  const now = Date.now();
  const today = `${isoOf(now).slice(0, 10)}T00:00:00.000Z`;

  const asked = Array.isArray(body.projectKeys)
    ? body.projectKeys.map((key: any) => safeText(key, 60)).filter(Boolean).slice(0, 20)
    : [];

  const settled = await Promise.allSettled([
    db.entities.PlayerProfile.count({ created_at: { $gte: today } }),
    db.entities.PlayerProfile.count({ created_at: { $gte: isoOf(now - 7 * DAY_MS) } }),
    db.entities.CareerSave.count({
      status: "active",
      player_normalized_name: { $ne: TEST_NAMESPACE },
      updated_date: { $gte: isoOf(now - 5 * DAY_MS) },
    }),
    db.entities.GameEvent.count({ type: "project_started", playerName: { $ne: TEST_DISPLAY } }),
    db.entities.GameEvent.count({ type: "project_completed", playerName: { $ne: TEST_DISPLAY } }),
    db.entities.CareerSave.aggregate({
      query: { score: { $gt: 0 }, player_normalized_name: { $ne: TEST_NAMESPACE } },
      avg: ["score"],
    }),
    db.entities.GameEvent.aggregate({
      query: { type: "project_started", playerName: { $ne: TEST_DISPLAY } },
      groupBy: "projectId",
    }),
    db.entities.GameEvent.aggregate({
      query: { type: "project_completed", playerName: { $ne: TEST_DISPLAY } },
      groupBy: "projectId",
    }),
    db.entities.GameEvent.filter({ playerName: { $ne: TEST_DISPLAY } }, { sort: "-created_date", limit: 500 }),
    scanSaves(db),
  ]);
  const pick = (index: number, fallback: any) =>
    settled[index].status === "fulfilled" ? (settled[index] as any).value : fallback;

  const playersToday = Number(pick(0, 0)) || 0;
  const playersWeek = Number(pick(1, 0)) || 0;
  const activeCareers = Number(pick(2, 0)) || 0;
  const projectsStarted = Number(pick(3, 0)) || 0;
  const projectsCompleted = Number(pick(4, 0)) || 0;

  const scoreRows = pageOf(pick(5, { rows: [] })?.rows ?? pick(5, []));
  const avgScore = Math.round(Number(scoreRows[0]?.avg_score ?? scoreRows[0]?.score ?? 0) || 0);

  const startsByProject = groupCounts(pick(6, []), "projectId");
  const completedByProject = groupCounts(pick(7, []), "projectId");

  const events = pageOf(pick(8, []));
  // The test namespace never enters analytics.
  const saves = (Array.isArray(pick(9, [])) ? pick(9, []) : []).filter(
    (save: any) => save?.player_normalized_name !== TEST_NAMESPACE
  );
  const rollup = projectRollup(saves);

  const days = lastDays(14);
  const perDay = new Map<string, number>(days.map((day) => [day, 0]));
  for (const event of events) {
    if (event?.type !== "project_started") continue;
    const key = dayKey(event.createdAt || event.created_date);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) || 0) + 1);
  }

  // Popularity combines fresh events with the careers that already exist, so the
  // card is useful before the first event has been written.
  const popularity = new Map<string, number>(startsByProject);
  for (const [key, row] of rollup) {
    if (!key || key === "unknown") continue;
    popularity.set(key, (popularity.get(key) || 0) + row.careers);
  }
  const popular = [...popularity.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];

  const difficulty = { easy: 0, medium: 0, hard: 0 };
  let hintsTotal = 0;
  let mistakesTotal = 0;
  for (const save of saves) {
    if (LEVELS.includes(save?.difficulty)) difficulty[save.difficulty] += 1;
  }
  for (const row of rollup.values()) {
    hintsTotal += row.hints;
    mistakesTotal += row.mistakes;
  }
  const careerCount = saves.length;

  const keys = new Set<string>([
    ...asked,
    ...startsByProject.keys(),
    ...completedByProject.keys(),
    ...rollup.keys(),
  ]);

  return {
    overview: {
      playersToday,
      playersWeek,
      activeCareers,
      projectsStarted,
      projectsCompleted,
      completionRate: projectsStarted ? Math.round((projectsCompleted / projectsStarted) * 100) : 0,
      avgScore,
      mostPopular: { projectId: popular[0], count: popular[1] },
      difficulty,
      avgHints: careerCount ? Math.round((hintsTotal / careerCount) * 10) / 10 : 0,
      avgMistakes: careerCount ? Math.round((mistakesTotal / careerCount) * 10) / 10 : 0,
      careersScanned: careerCount,
      daily: days.map((day) => ({ day, count: perDay.get(day) || 0 })),
      completionsByProject: [...completedByProject.entries()].map(([projectId, count]) => ({ projectId, count })),
    },
    projects: [...keys].filter(Boolean).map((projectId) => ({
      projectId,
      starts: startsByProject.get(projectId) || 0,
      completions: completedByProject.get(projectId) || 0,
      ...rollupFor(rollup, projectId),
    })),
  };
}

/* ----------------------------------------------------------------- feedback */

function feedbackQuery(body: any) {
  // Test-environment feedback is never part of the inbox.
  const query: any = { visitor: { $ne: TEST_VISITOR } };
  if (STATUSES.includes(body.status)) query.status = body.status;
  const rating = Number(body.rating);
  if (rating >= 1 && rating <= 5) query.rating = rating;

  // A ticket now carries a list of categories, so the filter matches a ticket
  // when any one of its chips is the chosen one.
  const category = CATEGORIES.includes(body.category)
    ? [
        { category: body.category },
        { categories: { $in: [CATEGORY_LABELS[body.category]] } },
      ]
    : null;

  const search = literal(body.search, 60);
  const text = search
    ? [
        { message: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { contact: { $regex: search, $options: "i" } },
        { projectTitle: { $regex: search, $options: "i" } },
      ]
    : null;

  if (category && text) query.$and = [{ $or: category }, { $or: text }];
  else if (category) query.$or = category;
  else if (text) query.$or = text;
  return query;
}

function feedbackRow(row: any) {
  return {
    id: row.id,
    rating: Number(row.rating) || 0,
    category: row.category || "idea",
    categories: Array.isArray(row.categories) && row.categories.length
      ? row.categories.filter((label: any) => typeof label === "string").slice(0, 4)
      : [CATEGORY_LABELS[row.category] || "Idea"],
    message: row.message || "",
    name: row.name || "",
    contact: row.contact || "",
    difficulty: LEVELS.includes(row.difficulty) ? row.difficulty : "",
    projectTitle: row.projectTitle || "",
    score: Number(row.score) || 0,
    hintsUsed: Number(row.hintsUsed) || 0,
    mistakes: Number(row.mistakes) || 0,
    trigger: ["auto_after_project", "auto_after_first_project"].includes(row.trigger) ? row.trigger : "manual",
    status: STATUSES.includes(row.status) ? row.status : "new",
    adminNote: row.adminNote || "",
    at: row.createdAt || row.created_date || "",
  };
}

async function feedbackList(db: any, body: any) {
  const query = feedbackQuery(body);
  const cursor = safeText(body.cursor, 200);
  const [page, total] = await Promise.all([
    db.entities.Feedback.filter(query, { sort: "-created_date", limit: PAGE, ...(cursor ? { cursor } : {}) }),
    db.entities.Feedback.count(query).catch(() => 0),
  ]);
  return {
    rows: pageOf(page).map(feedbackRow),
    next_cursor: page?.next_cursor || "",
    has_more: !!page?.has_more,
    total: Number(total) || 0,
  };
}

async function feedbackById(db: any, id: any) {
  const key = safeText(id, 60);
  if (!key) return null;
  return await db.entities.Feedback.get(key).catch((error: any) => (error?.status === 404 ? null : Promise.reject(error)));
}

async function feedbackUpdate(db: any, body: any) {
  const row = await feedbackById(db, body.id);
  if (!row) return Response.json({ error: "That feedback no longer exists." }, { status: 404 });

  const patch: any = {};
  if (STATUSES.includes(body.status)) patch.status = body.status;
  if (typeof body.adminNote === "string") patch.adminNote = safeText(body.adminNote, 1000);
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change" }, { status: 400 });

  const updated = await db.entities.Feedback.update(row.id, patch);
  return Response.json({ ok: true, row: feedbackRow(updated) });
}

async function feedbackDelete(db: any, body: any) {
  const row = await feedbackById(db, body.id);
  if (!row) return Response.json({ error: "That feedback no longer exists." }, { status: 404 });
  await db.entities.Feedback.delete(row.id);
  return Response.json({ ok: true, id: row.id });
}

async function feedbackExport(db: any, body: any) {
  const query = feedbackQuery(body);
  const rows: any[] = [];
  let cursor = "";
  for (let page = 0; page < 8; page += 1) {
    const batch = await db.entities.Feedback
      .filter(query, { sort: "-created_date", limit: 200, ...(cursor ? { cursor } : {}) })
      .catch(() => null);
    const items = pageOf(batch);
    rows.push(...items);
    const next = batch?.next_cursor || "";
    if (!items.length || !batch?.has_more || !next) break;
    cursor = next;
  }

  const csv = toCsv(
    ["Date", "Status", "Rating", "Category", "Message", "Name", "Contact", "Difficulty", "Project", "Admin note"],
    rows.map((row: any) => {
      const item = feedbackRow(row);
      return [item.at, item.status, item.rating, item.category, item.message, item.name, item.contact, item.difficulty, item.projectTitle, item.adminNote];
    })
  );

  return { csv, count: rows.length, filename: `feedback-${isoOf(Date.now()).slice(0, 10)}.csv` };
}

/* ------------------------------------------------------------------ players */

async function playersList(db: any, body: any) {
  const now = Date.now();
  const query: any = { expires_at: { $gt: isoOf(now) } };
  const search = literal(body.search, 40);
  if (search) {
    query.$or = [
      { display_name: { $regex: search, $options: "i" } },
      { normalized_name: { $regex: search.toLowerCase(), $options: "i" } },
    ];
  }

  const cursor = safeText(body.cursor, 200);
  const [page, total] = await Promise.all([
    db.entities.PlayerProfile.filter(query, { sort: "-last_active_at", limit: PAGE, ...(cursor ? { cursor } : {}) }),
    db.entities.PlayerProfile.count(query).catch(() => 0),
  ]);

  const profiles = pageOf(page);
  const names = profiles.map((profile: any) => profile.normalized_name).filter(Boolean);
  const saves = names.length
    ? pageOf(
        await db.entities.CareerSave
          .filter({ player_normalized_name: { $in: names } }, { sort: "-updated_date", limit: 200 })
          .catch(() => [])
      )
    : [];

  const latest = new Map<string, any>();
  for (const save of saves) {
    const key = String(save.player_normalized_name || "");
    const current = latest.get(key);
    if (!current || String(save.updated_date || "") > String(current.updated_date || "")) latest.set(key, save);
  }

  return {
    rows: profiles.map((profile: any) => {
      const save = latest.get(profile.normalized_name) || null;
      const expires = new Date(profile.expires_at || now).getTime();
      return {
        id: profile.id,
        display_name: profile.display_name || "",
        normalized_name: profile.normalized_name || "",
        project_key: save?.project_key || "",
        project_title: save?.project_title || "",
        step_number: (Number(save?.step_index) || 0) + 1,
        difficulty: save?.difficulty || "",
        score: Number(save?.score) || 0,
        last_active_at: profile.last_active_at || profile.created_at || "",
        expires_at: profile.expires_at || "",
        days_left: Math.max(0, Math.ceil((expires - now) / DAY_MS)),
      };
    }),
    next_cursor: page?.next_cursor || "",
    has_more: !!page?.has_more,
    total: Number(total) || 0,
  };
}

async function playerProgress(db: any, body: any) {
  const normalized = safeText(body.normalized, 40).toLowerCase();
  const profile = await findProfile(db, normalized);
  if (!profile) return Response.json({ error: "That player's data has already been deleted." }, { status: 404 });

  const saves = await savesOf(db, normalized);
  const [resolved, open] = await Promise.all([
    db.entities.Ticket.count({ player_normalized_name: normalized, status: "resolved" }).catch(() => 0),
    db.entities.Ticket.count({ player_normalized_name: normalized, status: { $in: ["open", "in_progress", "blocked"] } }).catch(() => 0),
  ]);

  return Response.json({
    profile: publicProfile(profile),
    tickets: { resolved: Number(resolved) || 0, open: Number(open) || 0 },
    saves: saves
      .sort((a: any, b: any) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")))
      .map((save: any) => ({
        id: save.id,
        project_key: save.project_key || "",
        project_title: save.project_title || "",
        difficulty: save.difficulty || "",
        step_index: Number(save.step_index) || 0,
        steps_done: Array.isArray(save.steps_done) ? save.steps_done : [],
        score: Number(save.score) || 0,
        hints: save.hints || {},
        mistakes: save.mistakes || {},
        status: save.status || "active",
        last_seen_at: save.last_seen_at || save.updated_date || "",
      })),
  });
}

async function playerDelete(db: any, body: any) {
  const normalized = safeText(body.normalized, 40).toLowerCase();
  const profile = await findProfile(db, normalized);
  if (!profile) return Response.json({ error: "That player's data has already been deleted." }, { status: 404 });
  const result = await wipeProfile(db, profile);
  return Response.json({ ok: true, ...result });
}

async function playerExtend(db: any, body: any) {
  const normalized = safeText(body.normalized, 40).toLowerCase();
  const profile = await findProfile(db, normalized);
  if (!profile) return Response.json({ error: "That player's data has already been deleted." }, { status: 404 });

  const now = Date.now();
  const current = new Date(profile.expires_at || 0).getTime();
  const base = Number.isFinite(current) && current > now ? current : now;
  const expires_at = new Date(base + 5 * DAY_MS).toISOString();
  await db.entities.PlayerProfile.update(profile.id, { expires_at });
  return Response.json({ ok: true, expires_at });
}

/* ------------------------------------------------------------- small things */

async function metaGet(db: any, key: string) {
  const rows = pageOf(await db.entities.AppMeta.filter({ key }, { limit: 1 }).catch(() => []));
  return rows[0]?.value || "";
}

async function metaSet(db: any, key: string, value: string) {
  const rows = pageOf(await db.entities.AppMeta.filter({ key }, { limit: 1 }).catch(() => []));
  if (rows[0]?.id) await db.entities.AppMeta.update(rows[0].id, { value });
  else await db.entities.AppMeta.create({ key, value });
  return value;
}

/* ------------------------------------------------------------- maintenance */

const isoOrEmpty = (value: any) => {
  if (!value) return "";
  const at = new Date(String(value)).getTime();
  return Number.isFinite(at) && at > 0 ? new Date(at).toISOString() : "";
};

/** One write for the switch, plus the history row that window needs. */
async function maintenanceOn(db: any, session: any, body: any) {
  const reason = validReason(body.reason);
  if (!reason) {
    return Response.json(
      { error: `Add a reason of ${REASON_MIN} to ${REASON_MAX} characters. Players see it.` },
      { status: 400 }
    );
  }
  const asked = body.expectedBackAt ? isoOrEmpty(body.expectedBackAt) : "";
  if (body.expectedBackAt && !asked) {
    return Response.json({ error: "That expected-back time is not a valid date." }, { status: 400 });
  }

  const row = await ensureSettings(db);
  if (isOn(row)) return Response.json({ ok: true, status: adminStatus(row) });

  const now = new Date().toISOString();
  const label = `admin ${safeText(session?.ip || "", 40)}`.trim();
  const log = await db.entities.MaintenanceLog
    .create({ turnedOnAt: now, reason, admin: label, blockedCount: 0 })
    .catch(() => null);

  const updated = await db.entities.AppSettings.update(row.id, {
    maintenanceOn: true,
    reason,
    expectedBackAt: asked,
    internalNote: safeText(body.internalNote, NOTE_MAX),
    startedAt: now,
    startedBy: label,
    blockedCount: 0,
    blockedVisitors: [],
    logId: log?.id || "",
  });
  return Response.json({ ok: true, status: adminStatus(updated) });
}

/** Off: close the history row, pause the retention clock out of every player, wipe test data. */
async function maintenanceOff(db: any) {
  const row = await ensureSettings(db);
  if (!isOn(row)) return Response.json({ ok: true, status: adminStatus(row), extended: 0 });

  const nowMs = Date.now();
  const started = new Date(String(row.startedAt || "")).getTime();
  const duration = Number.isFinite(started) && started > 0 ? Math.max(0, nowMs - started) : 0;

  if (row.logId) {
    await db.entities.MaintenanceLog
      .update(row.logId, {
        turnedOffAt: new Date(nowMs).toISOString(),
        blockedCount: Math.max(0, Math.round(Number(row.blockedCount) || 0)),
        durationMs: duration,
        extendedMs: duration,
      })
      .catch(() => null);
  }

  const extended = await extendPlayerExpiry(db, duration);
  await purgeTestData(db);

  const updated = await db.entities.AppSettings.update(row.id, {
    maintenanceOn: false,
    reason: "",
    expectedBackAt: "",
    internalNote: "",
    startedAt: "",
    startedBy: "",
    blockedCount: 0,
    blockedVisitors: [],
    logId: "",
    testTokenHash: "",
    testTokenExpiresAt: "",
  });
  return Response.json({ ok: true, status: adminStatus(updated), extended });
}

async function maintenanceHistory(db: any, body: any) {
  const cursor = safeText(body.cursor, 200);
  const page = await db.entities.MaintenanceLog
    .filter({}, { sort: "-turnedOnAt", limit: PAGE, ...(cursor ? { cursor } : {}) })
    .catch(() => null);
  return {
    rows: pageOf(page).map((row: any) => ({
      id: row.id,
      turnedOnAt: row.turnedOnAt || row.created_date || "",
      turnedOffAt: row.turnedOffAt || "",
      reason: row.reason || "",
      admin: row.admin || "",
      blockedCount: Number(row.blockedCount) || 0,
      durationMs: Number(row.durationMs) || 0,
    })),
    next_cursor: page?.next_cursor || "",
    has_more: !!page?.has_more,
  };
}

/* -------------------------------------------------------- test environment */

async function clearTestToken(db: any) {
  const row = await settings(db);
  if (!row || (!row.testTokenHash && !row.testTokenExpiresAt)) return;
  await db.entities.AppSettings
    .update(row.id, { testTokenHash: "", testTokenExpiresAt: "" })
    .catch(() => null);
}

/** A short-lived token the test copy of the app presents instead of a player session. */
async function testStart(db: any) {
  const row = await ensureSettings(db);
  if (!isOn(row)) {
    return Response.json({ error: "Turn on maintenance mode first." }, { status: 409 });
  }
  const token = newAdminToken() + newAdminToken();
  const expires_at = new Date(Date.now() + TEST_TTL_MS).toISOString();
  await db.entities.AppSettings.update(row.id, {
    testTokenHash: await sha256Hex(token),
    testTokenExpiresAt: expires_at,
  });
  return Response.json({ ok: true, token, expires_at });
}

async function testExit(db: any) {
  await purgeTestData(db);
  await clearTestToken(db);
  return Response.json({ ok: true });
}

/* ---------------------------------------------------------------- releases */

const refuse = (message: string, status = 400) => Response.json({ error: message }, { status });

/** The admin shape of a release. Only this endpoint ever sees these fields. */
const adminRelease = (row: any) => ({
  id: row.id,
  version: safeText(row.version, 20),
  title: safeText(row.title, TITLE_MAX),
  changes: (Array.isArray(row.changes) ? row.changes : [])
    .slice(0, CHANGES_MAX)
    .map((change: any) => ({
      type: CHANGE_TYPES.includes(change?.type) ? change.type : "new",
      text: safeText(change?.text, CHANGE_MAX),
    })),
  details: safeText(row.details, DETAILS_MAX),
  releaseDate: isoOrNow(row.releaseDate || row.created_date),
  status: row.status === "published" ? "published" : "draft",
  important: row.important === true,
  notifyPlayers: row.notifyPlayers !== false,
  forceRefresh: row.forceRefresh !== false,
  publishedAt: row.publishedAt ? isoOrNow(row.publishedAt) : "",
  seenCount: Math.max(0, Math.round(Number(row.seenCount) || 0)),
});

const versionsTaken = async (db: any, version: string, exceptId = "") =>
  pageOf(await db.entities.Release.filter({ version }, { limit: 2 }).catch(() => [])).find(
    (row: any) => row.id !== exceptId
  ) || null;

/** The one place a release form is checked, for drafts and for publishing. */
function releaseForm(body: any) {
  const version = safeText(body.version, 20);
  if (!isVersion(version)) return { error: "A version is three numbers, like 1.1.1." };
  const title = cleanTitle(body.title);
  if (!title) return { error: `A title between ${TITLE_MIN} and ${TITLE_MAX} characters.` };
  const changes = cleanChanges(body.changes);
  if (!changes) return { error: "Between 1 and 30 changes, each at least 3 characters." };
  return {
    fields: {
      version,
      title,
      changes,
      details: cleanDetails(body.details),
      releaseDate: isoOrNow(body.releaseDate),
      important: body.important === true,
      notifyPlayers: body.notifyPlayers !== false,
      forceRefresh: body.forceRefresh !== false,
    },
  };
}

async function releaseCurrent(db: any) {
  const row = await ensureSettings(db);
  const versions = pageOf(await db.entities.Release.filter({}, { sort: "-created_date", limit: 500 }))
    .map((item: any) => safeText(item?.version, 20))
    .filter(Boolean);
  return {
    currentVersion: liveVersion(row),
    currentReleaseId: String(row?.currentReleaseId || ""),
    versions,
  };
}

async function releaseList(db: any, body: any) {
  const cursor = safeText(body.cursor, 400);
  // filter({}) rather than list(): it is the call the rest of this file uses and
  // the one that reliably returns the page. An error is left to bubble up so the
  // dashboard shows the exact reason instead of "No releases yet".
  const page = await db.entities.Release.filter(
    {},
    { sort: "-created_date", limit: PAGE, ...(cursor ? { cursor } : {}) }
  );
  return {
    rows: sortNewest(pageOf(page)).map(adminRelease),
    has_more: page?.has_more === true,
    next_cursor: page?.next_cursor || "",
  };
}

async function releaseGet(db: any, body: any) {
  const row = await db.entities.Release.get(safeText(body.id, 60)).catch(() => null);
  if (!row) return refuse("That release no longer exists.", 404);
  return Response.json({ release: adminRelease(row) });
}

/** Draft only: publishing is its own action and carries its own rules. */
async function releaseSave(db: any, body: any) {
  const form = releaseForm(body);
  if (form.error) return refuse(form.error);
  const fields = form.fields;
  const id = safeText(body.id, 60);

  if (id) {
    const row = await db.entities.Release.get(id).catch(() => null);
    if (!row) return refuse("That release no longer exists.", 404);
    if (row.status === "published" && safeText(row.version, 20) !== fields.version) {
      return refuse("The version is locked once a release is published.");
    }
    if (await versionsTaken(db, fields.version, id)) return refuse(`v${fields.version} already exists.`);
    const saved = await db.entities.Release.update(id, fields);
    return Response.json({ ok: true, release: adminRelease(saved) });
  }

  if (await versionsTaken(db, fields.version)) return refuse(`v${fields.version} already exists.`);
  const saved = await db.entities.Release.create({ ...fields, status: "draft", seenCount: 0, seenVisitors: [] });
  return Response.json({ ok: true, release: adminRelease(saved) });
}

/**
 * One call publishes: the version rule, the row, the live number and the audit
 * entry all move together, so a release can never be half published.
 */
async function releasePublish(db: any, session: any, body: any) {
  const form = releaseForm(body);
  if (form.error) return refuse(form.error);
  const fields = form.fields;

  const row = await ensureSettings(db);
  const live = liveVersion(row);
  if (compareVersions(fields.version, live) <= 0) {
    return refuse(`v${fields.version} must be higher than the live v${live}.`);
  }

  const id = safeText(body.id, 60);
  const draft = id ? await db.entities.Release.get(id).catch(() => null) : null;
  if (await versionsTaken(db, fields.version, id)) return refuse(`v${fields.version} already exists.`);

  const patch = {
    ...fields,
    status: "published",
    publishedAt: new Date().toISOString(),
    publishedBy: safeText(session?.ip, 64) || "Admin",
    seenCount: 0,
    seenVisitors: [],
  };
  const saved = draft
    ? await db.entities.Release.update(draft.id, patch)
    : await db.entities.Release.create(patch);

  await db.entities.AppSettings.update(row.id, {
    currentVersion: fields.version,
    currentReleaseId: saved.id,
  });

  await logSecurityEvent(db, {
    type: "release_published",
    ip: safeText(session?.ip, 64),
    detail: `v${fields.version} — ${fields.title}`.slice(0, 200),
  });

  return Response.json({ ok: true, release: adminRelease(saved), currentVersion: fields.version });
}

/** Back to draft, and the live number falls to the next published release. */
async function releaseUnpublish(db: any, session: any, body: any) {
  const row = await db.entities.Release.get(safeText(body.id, 60)).catch(() => null);
  if (!row) return refuse("That release no longer exists.", 404);

  await db.entities.Release.update(row.id, { status: "draft" });

  const settingsRow = await ensureSettings(db);
  const published = pageOf(
    await db.entities.Release.filter({ status: "published" }, { sort: "-created_date", limit: 200 }).catch(() => [])
  );
  const newest = sortNewest(published)[0] || null;
  const next = newest ? safeText(newest.version, 20) : BASE_VERSION;

  await db.entities.AppSettings.update(settingsRow.id, {
    currentVersion: next,
    currentReleaseId: newest?.id || "",
  });

  await logSecurityEvent(db, {
    type: "release_unpublished",
    ip: safeText(session?.ip, 64),
    detail: `v${safeText(row.version, 20)}`,
  });

  return Response.json({ ok: true, currentVersion: next });
}

async function releaseDelete(db: any, body: any) {
  const row = await db.entities.Release.get(safeText(body.id, 60)).catch(() => null);
  if (!row) return refuse("That release no longer exists.", 404);
  if (row.status === "published") return refuse("Unpublish a release before deleting it.");
  await db.entities.Release.delete(row.id);
  return Response.json({ ok: true });
}

/** Show again to everyone: the seen list empties and the generation moves on. */
async function releaseResetSeen(db: any, body: any) {
  const row = await db.entities.Release.get(safeText(body.id, 60)).catch(() => null);
  if (!row) return refuse("That release no longer exists.", 404);
  await db.entities.Release.update(row.id, { seenCount: 0, seenVisitors: [] });

  const settingsRow = await ensureSettings(db);
  await db.entities.AppSettings.update(settingsRow.id, {
    seenGeneration: Math.max(0, Math.round(Number(settingsRow.seenGeneration) || 0)) + 1,
  });

  return Response.json({ ok: true });
}