// Session identity for a sign-in-free app.
//
// The browser never proves who it is with a name. Entering a name mints a random
// 128-bit token; only its SHA-256 is stored, so a database read cannot replay a
// session. Every request after that is authorized by the token, never the name.
// PINs are salted and stretched with PBKDF2 — the digits are never stored.

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// The runtime refuses PBKDF2 above 100k iterations, so this is the ceiling.
export const PIN_ITERATIONS = 100_000;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;
export const SESSION_LOCK_MS = 15 * 60 * 1000;

const pageOf = (res: any): any[] => (Array.isArray(res) ? res : res?.items ?? []);

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** 256 bits from the platform CSPRNG. */
export function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

/** Salted, stretched PIN hash (bcrypt is unavailable in this runtime). */
export async function derivePin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(pin)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(salt), iterations: PIN_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

/** Profiles made before this change carry an unsalted hash of name + digits. */
export async function legacyPinHash(normalized: string, pin: string): Promise<string> {
  return sha256Hex(`${normalized}:${String(pin || "").trim()}`);
}

export function isLockedUntil(iso: any): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && at > Date.now() ? String(iso) : null;
}

export function sessionExpiryFrom(now = Date.now()): string {
  return new Date(now + SESSION_TTL_MS).toISOString();
}

/** Resolves a token to its profile, sliding the idle window forward. */
export async function profileForToken(db: any, token: any) {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) return null;
  const hash = await sha256Hex(token);
  // A failed lookup must not read as "no session": that would tell a player with
  // a perfectly good token that they were signed out. Let it surface as an error.
  const rows = pageOf(await db.entities.PlayerProfile.filter({ session_token_hash: hash }, { limit: 1 }));
  const profile = rows[0];
  if (!profile) return null;

  const expired =
    (profile.expires_at && new Date(profile.expires_at).getTime() <= Date.now()) ||
    (profile.session_expires_at && new Date(profile.session_expires_at).getTime() <= Date.now());
  if (expired) return null;

  // Slide both windows, but not on every single request.
  const lastUsed = profile.session_last_used_at ? new Date(profile.session_last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > 5 * 60 * 1000) {
    const now = new Date();
    await db.entities.PlayerProfile
      .update(profile.id, {
        session_last_used_at: now.toISOString(),
        session_expires_at: sessionExpiryFrom(now.getTime()),
        last_active_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .catch(() => null);
  }
  return profile;
}

export function invalidSession() {
  return Response.json(
    { error: "Your session has ended. Enter your name again to continue." },
    { status: 401 }
  );
}

export function tooManyRequests(retryAfterSeconds: number, message?: string) {
  const wait = Math.max(1, Math.round(retryAfterSeconds));
  return Response.json(
    {
      error: message || `That is a lot of requests at once. Please wait ${wait} second${wait === 1 ? "" : "s"} and try again.`,
      retry_after: wait,
    },
    { status: 429, headers: { "Retry-After": String(wait) } }
  );
}

/**
 * Resolves the caller's own active career save. A save id supplied by the
 * browser is only accepted when it belongs to this player's profile.
 */
export async function ownedSave(db: any, profile: any, saveId?: any) {
  const scope = { player_normalized_name: profile.normalized_name };
  if (saveId) {
    const row = await db.entities.CareerSave
      .get(String(saveId))
      .catch((e: any) => (e?.status === 404 ? null : Promise.reject(e)));
    if (!row || row.player_normalized_name !== profile.normalized_name) return null;
    return row;
  }
  const rows = pageOf(
    await db.entities.CareerSave.filter(scope, { sort: "-updated_date", limit: 5 }).catch(() => [])
  );
  return rows.find((row: any) => row.status === "active") || rows[0] || null;
}

/** Caps every text value that reaches storage or another player's screen. */
export function safeText(value: any, max = 280): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, max)
    .trim();
}

export const SAFE_NAME = /^[\p{L}\p{N} .'-]{2,30}$/u;