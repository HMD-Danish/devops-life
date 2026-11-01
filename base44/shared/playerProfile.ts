// Player identity for a sign-in-free app. A name is the whole account: it is
// normalized for matching, kept with its original spelling for display, and kept
// alive for 5 days after the last action before everything is deleted.

export const RETENTION_DAYS = 5;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_MONTH = 30;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

export const cleanName = (raw: any) => String(raw ?? "").replace(/\s+/g, " ").trim();
export const normalizeName = (raw: any) => cleanName(raw).toLowerCase();

export function expiryFrom(iso: string) {
  return new Date(new Date(iso).getTime() + RETENTION_MS).toISOString();
}

const pageOf = (res: any): any[] => (Array.isArray(res) ? res : res?.items ?? []);

// Every entity that stores something belonging to one career save.
export const PLAYER_ENTITIES = [
  "Service",
  "InfraResource",
  "Ticket",
  "TerminalSession",
  "ChatMessage",
  "CommandLog",
];

export async function findProfile(base44: any, normalized: string) {
  if (!normalized) return null;
  const rows = pageOf(
    await base44.entities.PlayerProfile.filter({ normalized_name: normalized }, { limit: 1 }).catch(() => [])
  );
  return rows[0] || null;
}

export function isExpired(profile: any) {
  if (!profile?.expires_at) return false;
  const at = new Date(profile.expires_at).getTime();
  return Number.isFinite(at) && at <= Date.now();
}

export function pinLockedUntil(profile: any) {
  if (!profile?.pin_locked_until) return null;
  const at = new Date(profile.pin_locked_until).getTime();
  return Number.isFinite(at) && at > Date.now() ? profile.pin_locked_until : null;
}

export function publicProfile(profile: any) {
  return {
    normalized_name: profile.normalized_name,
    display_name: profile.display_name,
    created_at: profile.created_at || null,
    last_active_at: profile.last_active_at || null,
    expires_at: profile.expires_at || null,
    pin_required: !!profile.pin_hash,
  };
}

export async function touchProfile(base44: any, profile: any) {
  const now = new Date().toISOString();
  const expires_at = expiryFrom(now);
  await base44.entities.PlayerProfile.update(profile.id, { last_active_at: now, expires_at }).catch(() => null);
  return { last_active_at: now, expires_at };
}

/** Keeps the retention window open when the action happened in a backend function. */
export async function touchByName(base44: any, normalized: string) {
  if (!normalized) return null;
  try {
    const profile = await findProfile(base44, normalized);
    if (!profile || isExpired(profile)) return null;
    return await touchProfile(base44, profile);
  } catch {
    return null;
  }
}

export async function savesOf(base44: any, normalized: string) {
  return pageOf(
    await base44.entities.CareerSave.filter({ player_normalized_name: normalized }).catch(() => [])
  );
}

async function wipeSaves(base44: any, saveIds: string[]) {
  for (const saveId of saveIds) {
    await Promise.all(
      PLAYER_ENTITIES.map((name) => {
        const entity = base44.entities?.[name];
        if (!entity?.deleteMany) return null;
        return entity.deleteMany({ save_id: saveId }).catch(() => null);
      })
    );
  }
}

/** Deletes every career save and every record under it. */
export async function wipeProfile(base44: any, profile: any, opts: { keepProfile?: boolean } = {}) {
  const saves = await savesOf(base44, profile.normalized_name);
  const saveIds = saves.map((s: any) => s.id);
  await wipeSaves(base44, saveIds);
  if (saveIds.length) {
    await base44.entities.CareerSave.deleteMany({ player_normalized_name: profile.normalized_name }).catch(() => null);
  }
  // The activity rows carry the display name, so they go with the player.
  if (profile.display_name) {
    await base44.entities.GameEvent?.deleteMany({ playerName: profile.display_name }).catch(() => null);
  }
  if (!opts.keepProfile) {
    await base44.entities.PlayerProfile.delete(profile.id).catch(() => null);
    // Nothing about the player survives, including what we logged about them.
    await base44.entities.SecurityEvent.deleteMany({ profile_id: profile.id }).catch(() => null);
  }
  return { saves: saveIds.length };
}

/** Removes expired profiles, or just the one being looked up. */
export async function purgeExpired(base44: any, normalized?: string) {
  let profiles: any[] = [];
  if (normalized) {
    const one = await findProfile(base44, normalized);
    profiles = one ? [one] : [];
  } else {
    profiles = pageOf(
      await base44.entities.PlayerProfile
        .filter({ expires_at: { $lt: new Date().toISOString() } }, { limit: 100 })
        .catch(() => [])
    );
  }
  let purged = 0;
  for (const profile of profiles) {
    if (!isExpired(profile)) continue;
    await wipeProfile(base44, profile);
    purged += 1;
  }
  return purged;
}

export async function activeSave(base44: any, normalized: string) {
  const saves = await savesOf(base44, normalized);
  return (
    saves
      .filter((s: any) => s.status === "active")
      .sort((a: any, b: any) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")))[0] ||
    saves.sort((a: any, b: any) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")))[0] ||
    null
  );
}

export function calendarOf(minutes: number) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const dayIndex = Math.floor(total / MINUTES_PER_DAY);
  const month = Math.floor(dayIndex / DAYS_PER_MONTH) + 1;
  const day = (dayIndex % DAYS_PER_MONTH) + 1;
  return { month, day, label: `Month ${month}, day ${day}` };
}

/** Security events are kept for 30 days, then dropped by the hourly sweep. */
export const SECURITY_EVENT_DAYS = 30;

export async function purgeSecurityEvents(base44: any) {
  const cutoff = new Date(Date.now() - SECURITY_EVENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await base44.entities.SecurityEvent.deleteMany({ created_date: { $lt: cutoff } }).catch(() => null);
  return cutoff;
}

/** What the welcome-back card shows. */
export async function summaryFor(base44: any, profile: any) {
  const save = await activeSave(base44, profile.normalized_name);
  if (!save) {
    return { has_career: false, project: null, month_day: null, last_active_at: profile.last_active_at || null, open_tickets: 0 };
  }
  const open = await base44.entities.Ticket.count({ save_id: save.id, status: "open" }).catch(() => 0);
  return {
    has_career: true,
    save_id: save.id,
    save_name: save.name || "",
    role: save.job_title || save.role_title || "",
    company: save.company_name || "",
    project: save.project_title || null,
    month_day: calendarOf(Number(save.clock_minutes || 0)).label,
    last_active_at: profile.last_active_at || save.last_seen_at || null,
    open_tickets: Number(open || 0),
    tutorial_done: Boolean(save.tutorialDone),
  };
}