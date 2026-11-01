// Abuse controls shared by every backend function: rate limits, scraping
// detection, session lockouts and the security event log.
//
// Counters live in the function instance (fast, no extra database round trip);
// anything that must survive a cold start — a lockout — is written to the
// profile, and every violation is recorded as a SecurityEvent row.

const windows = new Map<string, number[]>();

/**
 * The platform caps entity reads per minute per caller. When that ceiling is hit
 * it is a burst, not a broken app — answer with a calm 429, never a 500 that
 * leaks the internal message.
 */
export const isThrottled = (error: any) =>
  /rate limit/i.test(String(error?.message || error || ""));

export const LIMITS = {
  perSessionMinute: 60,
  perIpMinute: 120,
  nameLookupMinute: 5,
  chatMinute: 20,
  hintMinute: 10,
  failedCommandsMinute: 10,
  violationsBeforeLock: 5,
  violationWindowMs: 10 * 60 * 1000,
};

export function clientIp(req: Request): string {
  const headers = req.headers;
  const raw =
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    (headers.get("x-forwarded-for") || "").split(",")[0] ||
    "";
  return raw.trim().slice(0, 64) || "unknown";
}

/** Sliding window over the last `windowMs`, keyed by bucket. */
export function take(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (windows.get(key) || []).filter((at) => now - at < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] || now;
    windows.set(key, hits);
    return { ok: false as const, retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  hits.push(now);
  windows.set(key, hits);
  // Keep the map from growing without bound in a long-lived instance.
  if (windows.size > 5000) {
    for (const [k, list] of windows) {
      if (!list.some((at) => now - at < windowMs)) windows.delete(k);
    }
  }
  return { ok: true as const, retryAfter: 0 };
}

export async function logSecurityEvent(
  db: any,
  event: { type: string; ip: string; detail?: string; profileId?: string }
) {
  await db.entities.SecurityEvent.create({
    type: String(event.type).slice(0, 60),
    ip: String(event.ip || "unknown").slice(0, 64),
    detail: String(event.detail || "").slice(0, 200),
    profile_id: event.profileId ? String(event.profileId) : "",
  }).catch(() => null);
}

/**
 * A violation is cheap to record and expensive to repeat: five inside ten
 * minutes locks the session for fifteen.
 */
export async function registerViolation(
  db: any,
  profile: any,
  ip: string,
  type: string,
  detail = ""
) {
  await logSecurityEvent(db, { type, ip, detail, profileId: profile?.id });
  if (!profile) return null;

  const id = String(profile.id);
  const hit = take(`violation:${id}`, LIMITS.violationsBeforeLock, LIMITS.violationWindowMs);
  if (hit.ok) return null;

  const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await db.entities.PlayerProfile.update(id, { session_locked_until: until }).catch(() => null);
  await logSecurityEvent(db, { type: "session_locked", ip, detail: type, profileId: id });
  return until;
}

/** Rejects a caller that walks through ids or fires requests back to back. */
export async function checkScraping(
  db: any,
  profile: any,
  ip: string,
  kind: string,
  id: string
) {
  if (!profile || !id) return null;
  const key = `seen:${profile.id}:${kind}`;
  const seen = (windows.get(key) || []) as any;
  const entry = Array.isArray(seen) ? seen : [];
  const distinct = new Set(entry.map((item: any) => item.id));
  distinct.add(id);
  entry.push({ id, at: Date.now() });
  const recent = entry.filter((item: any) => Date.now() - item.at < 60_000);
  windows.set(key, recent);
  const count = new Set(recent.map((item: any) => item.id)).size;
  if (count > 8) {
    return await registerViolation(db, profile, ip, "scraping_pattern", `${kind}:${count}`);
  }
  return null;
}