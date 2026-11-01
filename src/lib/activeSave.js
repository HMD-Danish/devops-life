const KEY = "devopslife.activeSaveId";

export function readActiveSaveId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function writeActiveSaveId(id) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(KEY, id);
  else window.localStorage.removeItem(KEY);
}