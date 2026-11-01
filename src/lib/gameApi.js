import { clearToken, readToken } from "@/lib/playerSession";
import { invoke } from "@/lib/net";
import { reportBlocked } from "@/lib/maintenanceStatus";
import { consumeSimulatedFailure, testAuth } from "@/lib/testMode";

/** Thrown when the server no longer recognizes this device's session. */
export class SessionEndedError extends Error {
  constructor(message) {
    super(message || "Your session ended. Enter your name again.");
    this.name = "SessionEndedError";
  }
}

/**
 * The only way the browser reads or writes game data. The session token rides
 * along with every call; the server decides what may be returned.
 */
export async function game(action, payload = {}) {
  const token = readToken();
  if (!token) throw new SessionEndedError();
  // The admin tool that simulates a failed save fails exactly here, once.
  consumeSimulatedFailure(action);

  try {
    // A rate limit is waited out and retried once inside invoke().
    const res = await invoke("game", { token, action, ...testAuth(), ...payload });
    const data = res?.data || {};
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    // The breaker is open: not one byte left the browser, and nothing was lost.
    if (err?.paused) {
      const offline = new Error("Offline mode. Your progress is saved on this device.");
      offline.offline = true;
      throw offline;
    }
    const status = err?.response?.status;
    const raw = err?.response?.data?.error || err?.message || "";
    // Never the transport's wording: a player reads a sentence, not a status.
    const message =
      status === 429
        ? "Busy right now. Your progress is safe — try again in a moment."
        : String(raw).replace(/^Request failed with status code \d+$/, "The server is not reachable right now.");
    // Maintenance: the whole app switches to the maintenance screen at once.
    if (status === 503) reportBlocked(err?.response?.data);
    if (status === 401) {
      clearToken();
      throw new SessionEndedError(message);
    }
    // A rate limit carries the wait with it, so the caller can honour it.
    const error = new Error(message || "The server is not reachable right now.");
    error.status = status;
    error.rateLimited = status === 429;
    error.retryAfter =
      Number(err?.response?.data?.retry_after) ||
      Number(err?.response?.headers?.get?.("retry-after")) ||
      0;
    throw error;
  }
}

/** Identity actions live on the profile function, also token-authorized. */
export async function profile(action, payload = {}) {
  const token = readToken();
  const res = await invoke("playerProfile", { token, action, ...testAuth(), ...payload });
  return res?.data || {};
}