/**
 * Player identity without a sign-in.
 *
 * The name is a display label the player picked. The session token is what
 * actually authorizes anything: it is minted by the server when a name is
 * entered, and only its hash is stored there. Clearing it ends the session.
 */
import { isTestMode, testToken } from "@/lib/testMode";

const NAME_KEY = "devopslife.player";
const TOKEN_KEY = "devopslife.session";

export function cleanName(raw) {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeName(raw) {
  return cleanName(raw).toLowerCase();
}

const ALLOWED = /^[\p{L}\p{N} .'-]+$/u;

export function validateName(raw) {
  const name = cleanName(raw);
  if (name.length < 2) return "A name needs at least 2 characters.";
  if (name.length > 30) return "Keep it under 30 characters.";
  if (!ALLOWED.test(name)) return "Letters, numbers, spaces, dots and dashes only.";
  return "";
}

export function readStoredPlayer() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NAME_KEY);
}

export function storePlayer(name) {
  if (typeof window === "undefined") return;
  if (name) window.localStorage.setItem(NAME_KEY, name);
  else window.localStorage.removeItem(NAME_KEY);
}

export function clearStoredPlayer() {
  storePlayer(null);
}

export function readToken() {
  if (typeof window === "undefined") return "";
  // Nothing here may ever write into the real player session. /admin/test carries
  // its own token, and reading it back lets the shared player screens run unchanged.
  if (isTestMode()) return testToken();
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function storeToken(token) {
  if (typeof window === "undefined") return;
  if (isTestMode()) return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  storeToken(null);
}

export function pinLockLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}