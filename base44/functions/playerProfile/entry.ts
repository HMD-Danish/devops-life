// Player identity without sign-in, protected by a real session.
//
// A name is only a display label. Entering it mints a random token; the browser
// keeps the token and every later request is authorized by it. A PIN, when set,
// is verified here against a salted PBKDF2 hash, and five wrong tries lock the
// name for fifteen minutes. Lookups never reveal whether a name exists.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import {
  RETENTION_DAYS,
  RETENTION_MS,
  cleanName,
  expiryFrom,
  findProfile,
  isExpired,
  normalizeName,
  pinLockedUntil,
  publicProfile,
  purgeExpired,
  savesOf,
  summaryFor,
  touchProfile,
  wipeProfile,
} from "../../shared/playerProfile.ts";
import {
  MAX_PIN_ATTEMPTS,
  PIN_LOCK_MS,
  SAFE_NAME,
  derivePin,
  invalidSession,
  isLockedUntil,
  legacyPinHash,
  newSalt,
  newSessionToken,
  profileForToken,
  safeText,
  sessionExpiryFrom,
  sha256Hex,
  tooManyRequests,
} from "../../shared/session.ts";
import { LIMITS, clientIp, logSecurityEvent, take } from "../../shared/abuse.ts";
import { TEST_DISPLAY, TEST_NAMESPACE, maintenanceGuard } from "../../shared/maintenance.ts";

const PIN_RULE = /^\d{4}$/;

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

export default async function (req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "lookup");
    const ip = clientIp(req);
    const db = createClientFromRequest(req).asServiceRole;

    // Starting a career is a player write: maintenance refuses it here first.
    const gate = await maintenanceGuard(db, body, ip);
    if (gate.blocked) return gate.blocked;
    if (gate.test) return testIdentity(action, body);

    if (action === "purge") {
      const hit = take(`purge:${ip}`, 2, 60_000);
      if (!hit.ok) return tooManyRequests(hit.retryAfter);
      const purged = await purgeExpired(db);
      return Response.json({ purged });
    }

    // ------------------------------------------------ name-only entry points
    if (action === "lookup" || action === "open") {
      const limit = action === "lookup" ? LIMITS.nameLookupMinute : 10;
      const hit = take(`name:${ip}:${action}`, limit, 60_000);
      if (!hit.ok) {
        await logSecurityEvent(db, { type: "rate_limited", ip, detail: action });
        return tooManyRequests(hit.retryAfter);
      }

      const normalized = normalizeName(body.name);
      if (!normalized) return bad("A name is required.");
      if (!SAFE_NAME.test(cleanName(body.name))) {
        return bad("Use 2–30 letters, numbers, spaces, dots or dashes.");
      }

      let profile = await findProfile(db, normalized);
      if (profile && isExpired(profile)) {
        await wipeProfile(db, profile);
        profile = null;
      }

      // Same answer for "no profile" and "profile without a PIN", so a lookup
      // cannot be used to discover which names are taken.
      if (action === "lookup") {
        return Response.json({
          pin_required: !!profile?.pin_hash,
          locked_until: pinLockedUntil(profile),
          retention_days: RETENTION_DAYS,
        });
      }

      const pin = String(body.pin || "").trim();
      if (!profile) {
        if (pin && !PIN_RULE.test(pin)) return bad("A PIN is exactly 4 digits.");
        const now = new Date().toISOString();
        const salt = pin ? newSalt() : "";
        profile = await db.entities.PlayerProfile.create({
          normalized_name: normalized,
          display_name: cleanName(body.name) || normalized,
          created_at: now,
          last_active_at: now,
          expires_at: expiryFrom(now),
          pin_salt: salt,
          pin_hash: pin ? await derivePin(pin, salt) : "",
          pin_attempts: 0,
        });
        const token = await issueToken(db, profile);
        return Response.json({
          ok: true,
          created: true,
          ...publicProfile(profile),
          token,
          retention_days: RETENTION_DAYS,
          summary: { has_career: false, open_tickets: 0 },
        });
      }

      const lockedUntil = pinLockedUntil(profile);
      if (lockedUntil) return Response.json({ locked: true, locked_until: lockedUntil });

      if (profile.pin_hash) {
        const ok = await verifyPin(profile, pin, normalized);
        if (!ok) {
          const attempts = Number(profile.pin_attempts || 0) + 1;
          const hitsLimit = attempts >= MAX_PIN_ATTEMPTS;
          const until = hitsLimit ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null;
          await db.entities.PlayerProfile
            .update(profile.id, { pin_attempts: hitsLimit ? 0 : attempts, pin_locked_until: until })
            .catch(() => null);
          await logSecurityEvent(db, {
            type: "failed_pin",
            ip,
            detail: hitsLimit ? "locked" : `attempt ${attempts}`,
            profileId: profile.id,
          });
          return Response.json({
            wrong_pin: true,
            attempts_left: Math.max(0, MAX_PIN_ATTEMPTS - attempts),
            locked: hitsLimit,
            locked_until: until,
          });
        }
        // An unsalted legacy hash is re-derived with a per-profile salt the first
        // time the PIN proves correct, so it never stays cheap to crack.
        const reset: Record<string, any> = { pin_attempts: 0, pin_locked_until: null };
        if (!profile.pin_salt) {
          const salt = newSalt();
          reset.pin_salt = salt;
          reset.pin_hash = await derivePin(pin, salt);
        }
        await db.entities.PlayerProfile.update(profile.id, reset).catch(() => null);
      }

      const touched = await touchProfile(db, profile);
      const token = await issueToken(db, profile);
      return Response.json({
        ok: true,
        ...publicProfile({ ...profile, ...touched }),
        token,
        retention_days: RETENTION_DAYS,
        summary: await summaryFor(db, profile),
      });
    }

    // ------------------------------------------------ everything else: token
    const profile = await profileForToken(db, body.token);
    if (!profile) return invalidSession();

    const lockedUntil = isLockedUntil(profile.session_locked_until);
    if (lockedUntil) {
      const wait = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
      return tooManyRequests(wait, "This session is paused for a few minutes. Try again shortly.");
    }

    const hit = take(`profile:${profile.id}`, 30, 60_000);
    if (!hit.ok) return tooManyRequests(hit.retryAfter);

    if (action === "me") {
      const touched = await touchProfile(db, profile);
      return Response.json({
        ok: true,
        ...publicProfile({ ...profile, ...touched }),
        retention_days: RETENTION_DAYS,
        summary: await summaryFor(db, profile),
      });
    }

    if (action === "touch") {
      const touched = await touchProfile(db, profile);
      return Response.json({ ok: true, ...touched, retention_days: RETENTION_DAYS });
    }

    if (action === "pin.set") {
      const pin = String(body.pin || "").trim();
      if (!PIN_RULE.test(pin)) return bad("A PIN is exactly 4 digits.");
      const salt = newSalt();
      await db.entities.PlayerProfile.update(profile.id, {
        pin_salt: salt,
        pin_hash: await derivePin(pin, salt),
        pin_attempts: 0,
        pin_locked_until: null,
      });
      return Response.json({ ok: true, pin_required: true });
    }

    if (action === "rename") {
      const display = safeText(body.display_name, 30);
      if (!SAFE_NAME.test(display)) return bad("Use 2–30 letters, numbers, spaces, dots or dashes.");
      await db.entities.PlayerProfile.update(profile.id, { display_name: display });
      const saves = await savesOf(db, profile.normalized_name);
      await Promise.all(
        saves.map((save: any) =>
          db.entities.CareerSave.update(save.id, { player_name: display }).catch(() => null)
        )
      );
      return Response.json({ ok: true, display_name: display });
    }

    if (action === "reset") {
      await wipeProfile(db, profile, { keepProfile: true });
      await db.entities.PlayerProfile.update(profile.id, { session_token_hash: "" }).catch(() => null);
      const token = await issueToken(db, profile);
      return Response.json({ ok: true, token });
    }

    if (action === "delete") {
      await wipeProfile(db, profile);
      return Response.json({ ok: true });
    }

    return bad(`Unknown action: ${action}`);
  } catch (error: any) {
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

/**
 * The test environment needs a name page that behaves like the real one without
 * ever writing a player profile: the answer is shaped correctly and the token it
 * hands back is the test token the server already issued.
 */
function testIdentity(action: string, body: any) {
  if (action === "lookup") {
    return Response.json({ pin_required: false, locked_until: null, retention_days: 5 });
  }
  if (action !== "open") return Response.json({ ok: true, token: body.testToken });

  return Response.json({
    ok: true,
    created: true,
    normalized_name: TEST_NAMESPACE,
    display_name: safeText(body.name, 30) || TEST_DISPLAY,
    token: body.testToken,
    retention_days: 5,
    summary: { has_career: false, open_tickets: 0 },
  });
}

/** Verifies a PIN, upgrading an unsalted legacy hash in place on success. */
async function verifyPin(profile: any, pin: string, normalized: string) {
  if (!PIN_RULE.test(pin)) return false;
  if (profile.pin_salt) {
    const candidate = await derivePin(pin, profile.pin_salt);
    return candidate === profile.pin_hash;
  }
  const legacy = await legacyPinHash(normalized, pin);
  return legacy === profile.pin_hash;
}

/** Mints a fresh token, keeps only its hash, and returns it once. */
async function issueToken(db: any, profile: any) {
  const token = newSessionToken();
  const now = new Date();
  await db.entities.PlayerProfile.update(profile.id, {
    session_token_hash: await sha256Hex(token),
    session_issued_at: now.toISOString(),
    session_last_used_at: now.toISOString(),
    session_expires_at: sessionExpiryFrom(now.getTime()),
    session_locked_until: null,
    last_active_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
  }).catch(() => null);
  return token;
}