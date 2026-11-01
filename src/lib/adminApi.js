import { base44 } from "@/api/base44Client";

/**
 * The admin dashboard's only way to talk to the server. The token lives in
 * sessionStorage, so closing the tab ends the session; the password is never
 * kept anywhere in the browser.
 */
const TOKEN_KEY = "devopslife.admin.token";
const DEVICE_KEY = "devopslife.admin.device";

export class AdminAuthError extends Error {
  constructor(message) {
    super(message || "Not allowed");
    this.name = "AdminAuthError";
  }
}

export class AdminLoginError extends Error {
  constructor(message, { locked = false, retryAfter = 0, status = 0 } = {}) {
    super(message || "Wrong password");
    this.name = "AdminLoginError";
    this.locked = locked;
    this.retryAfter = retryAfter;
    this.status = status;
  }
}

export function adminToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAdminToken(token) {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // A blocked sessionStorage only means the session lasts this page load.
  }
}

export function clearAdminToken() {
  setAdminToken("");
}

/** A stable id for this browser, so the attempt limit cannot be dodged by IP. */
export function adminDevice() {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export async function adminCall(action, payload = {}) {
  const token = adminToken();
  if (!token) throw new AdminAuthError();

  let res;
  try {
    res = await base44.functions.invoke("admin", { ...payload, action, token });
  } catch (error) {
    const status = error?.response?.status;
    const data = error?.response?.data || {};
    if (status === 401) {
      clearAdminToken();
      // Tells the gate to drop back to the password screen.
      window.dispatchEvent(new Event("devopslife:admin-signed-out"));
      throw new AdminAuthError(data.error);
    }
    throw new Error(data.error || "The dashboard could not reach the server. Try again.");
  }

  const data = res?.data || {};
  if (data.error) throw new Error(data.error);
  return data;
}

export async function adminLogin(password) {
  try {
    const res = await base44.functions.invoke("admin", {
      action: "login",
      password,
      device: adminDevice(),
    });
    const data = res?.data || {};
    if (!data.token) throw new AdminLoginError("Wrong password");
    setAdminToken(data.token);
    return data;
  } catch (error) {
    if (error instanceof AdminLoginError) throw error;
    const status = error?.response?.status;
    const data = error?.response?.data || {};
    if (status === 429 || data.locked) {
      throw new AdminLoginError(data.message || "Too many attempts. Try again in a few minutes.", {
        locked: true,
        retryAfter: Number(data.retry_after) || 0,
        status,
      });
    }
    if (status === 503) {
      throw new AdminLoginError(data.error || "Admin sign in is not set up yet.", { status });
    }
    throw new AdminLoginError("Wrong password");
  }
}

export async function adminLogout() {
  await adminCall("logout").catch(() => null);
  clearAdminToken();
}