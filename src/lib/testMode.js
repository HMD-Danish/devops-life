/**
 * The admin test environment's browser state.
 *
 * While it is active the player app talks to the server with the test token
 * instead of a player session, and every route builds its links under
 * /admin/test so nothing in the copy navigates into the real game.
 */
const ACTIVE_KEY = "devopslife.test.active";
const TOKEN_KEY = "devopslife.test.token";
const NAME_KEY = "devopslife.test.player";

const read = (key) => {
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const write = (key, value) => {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Blocked storage: the test copy simply cannot remember this.
  }
};

export const isTestMode = () => read(ACTIVE_KEY) === "1";

export const testToken = () => (isTestMode() ? read(TOKEN_KEY) : "");

export const testName = () => read(NAME_KEY);

export function enterTestMode(token) {
  write(TOKEN_KEY, token);
  write(ACTIVE_KEY, "1");
}

export function setTestName(name) {
  write(NAME_KEY, name);
}

export function leaveTestMode() {
  write(ACTIVE_KEY, "");
  write(TOKEN_KEY, "");
  write(NAME_KEY, "");
}

/** The credentials a player request carries from inside the test environment. */
export function testAuth() {
  const token = testToken();
  return token ? { testToken: token } : {};
}

export const TEST_BASE = "/admin/test";

/* ---------------------------------------------- simulated failure (admin tool) */

const FAIL_KEY = "devopslife.test.failSave";

/** Arms the next career save to fail, so the admin can see the error path. */
export function simulateFailNextSave() {
  write(FAIL_KEY, "1");
}

/** Consumes the armed failure. Throws once, exactly where a real one would. */
export function consumeSimulatedFailure(action) {
  if (!isTestMode() || read(FAIL_KEY) !== "1") return;
  if (action !== "save.patch") return;
  write(FAIL_KEY, "");
  const error = new Error("Simulated failure: this save did not reach the server.");
  error.simulated = true;
  throw error;
}

/** A player route, built for wherever the app is running. */
export const playPath = (suffix = "") => `${isTestMode() ? TEST_BASE : "/play"}${suffix}`;