/**
 * Remembers that the welcome intro already played in this browser tab.
 * sessionStorage survives a refresh but not a new tab. If storage is
 * unavailable the module flag still keeps it to one play per page load.
 */
const KEY = "devopslife.intro";

let playedThisLoad = false;

export function hasIntroPlayed() {
  if (playedThisLoad) return true;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markIntroPlayed() {
  playedThisLoad = true;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Private mode or storage blocked: the in-memory flag is enough.
  }
}