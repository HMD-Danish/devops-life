import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import WhatsNewDialog from "@/components/whatsnew/WhatsNewDialog";
import ReleaseNotesDialog from "@/components/whatsnew/ReleaseNotesDialog";
import UpdateBanner from "@/components/whatsnew/UpdateBanner";
import { ensureStatusFresh, useMaintenanceStatus } from "@/lib/maintenanceStatus";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { isNamePage } from "@/lib/namePage";
import { isTestMode } from "@/lib/testMode";
import { readActiveSaveId } from "@/lib/activeSave";
import { readToken } from "@/lib/playerSession";
import { game } from "@/lib/gameApi";
import {
  BASE_VERSION,
  clearForce,
  compareVersions,
  markReleaseSeen,
  readForce,
  readSeen,
  setForce,
  writeRuntime,
  writeSeen,
} from "@/lib/releases";

const WhatsNewContext = createContext(null);
const PENDING_ATTR = "data-whatsnew-pending";

/** Opening the notes reuses the cached status unless it is older than this. */
const NOTES_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * The release popup, the refresh banner and the notes dialog.
 *
 * It reads the one status payload the app already polls, so a release costs no
 * request of its own and nothing is fetched per version. The popup waits for
 * everything that outranks it — the intro, a project step, the tutorial, the
 * feedback prompt, maintenance — and never opens in the test environment.
 */
export function WhatsNewProvider({ children }) {
  const { pathname } = useLocation();
  const status = useMaintenanceStatus();
  const { active: tourActive } = useTutorial();

  const [popup, setPopup] = useState(null);
  const [notes, setNotes] = useState(false);
  const [seenVersion, setSeenVersion] = useState(() => readSeen().version);
  const [baseVersion, setBaseVersion] = useState("");
  const baselineRef = useRef("");

  const version = status.currentVersion || BASE_VERSION;
  const releases = useMemo(() => status.releases || [], [status.releases]);

  /** Everything published after a version, newest first. */
  const newerThan = useCallback(
    (from) => {
      if (!from) return releases.slice(0, 1);
      const missed = releases.filter((release) => compareVersions(release.version, from) > 0);
      return missed.length ? missed : releases.slice(0, 1);
    },
    [releases]
  );

  /* ------------------------------------------------------------- the popup */

  /** What is owed to this browser right now, ignoring whatever is on screen. */
  const owedNow = useCallback(() => {
    if (isTestMode() || pathname.startsWith("/admin")) return null;
    if (!status.currentVersion || !releases.length) return null;

    // A refresh the player asked for shows the notes wherever they land.
    if (readForce()) {
      return {
        mode: "whatsnew",
        version: status.currentVersion,
        releases: newerThan(readSeen().version),
      };
    }
    if (!isNamePage(pathname)) return null;

    const seen = readSeen();

    // A brand new browser: one welcome, then the notes are known.
    if (!seen.version) {
      return { mode: "welcome", version: status.currentVersion, releases: newerThan("") };
    }

    // Everything published since the last visit, newest first.
    if (compareVersions(seen.version, status.currentVersion) < 0) {
      const missed = releases.filter((release) => compareVersions(release.version, seen.version) > 0);
      return missed.length ? { mode: "whatsnew", version: status.currentVersion, releases: missed } : null;
    }

    // "Show again to all players" moves the generation on.
    if (seen.generation !== null && seen.generation !== status.seenGeneration) {
      return { mode: "whatsnew", version: status.currentVersion, releases: releases.slice(0, 1) };
    }
    return null;
  }, [newerThan, pathname, releases, status.currentVersion, status.seenGeneration]);

  /** Anything that outranks the release popup. */
  const blocked = useCallback(() => {
    if (isTestMode() || pathname.startsWith("/admin")) return true;
    if (!status.ready || status.maintenanceOn) return true;
    if (tourActive) return true;
    if (document.querySelector(".intro-overlay")) return true;
    return Boolean(
      document.querySelector(
        '[role="dialog"][aria-modal="true"]:not([data-whatsnew]):not([data-tour-card])'
      )
    );
  }, [pathname, status.ready, status.maintenanceOn, tourActive]);

  useEffect(() => {
    const root = document.documentElement;

    const tick = () => {
      if (popup || notes) {
        root.removeAttribute(PENDING_ATTR);
        return;
      }
      const owed = owedNow();
      if (!owed) {
        root.removeAttribute(PENDING_ATTR);
        return;
      }
      // Marked so the tutorial waits its turn: What's new comes first.
      root.setAttribute(PENDING_ATTR, "1");
      if (blocked()) return;
      setPopup(owed);
    };

    tick();
    const timer = setInterval(tick, 1200);
    return () => {
      clearInterval(timer);
      root.removeAttribute(PENDING_ATTR);
    };
  }, [blocked, notes, owedNow, popup]);

  const closePopup = useCallback(() => {
    const shown = popup;
    setPopup(null);
    clearForce();
    document.documentElement.removeAttribute(PENDING_ATTR);
    if (!shown) return;

    writeSeen(status.currentVersion, status.seenGeneration);
    setSeenVersion(status.currentVersion);
    writeRuntime(status.currentVersion);
    markReleaseSeen(status.currentVersion);

    // The career remembers it too, for as long as the career is kept.
    const saveId = readActiveSaveId();
    if (saveId && readToken()) {
      game("save.patch", {
        saveId,
        fields: { last_seen_version: status.currentVersion },
      }).catch(() => null);
    }
  }, [popup, status.currentVersion, status.seenGeneration]);

  /* ------------------------------------------------------------ the banner */

  // The version this tab opened with. Anything above it arrives mid-session,
  // which is exactly what the banner is for.
  useEffect(() => {
    if (!status.ready || !status.currentVersion) return;
    if (baselineRef.current) return;
    baselineRef.current = status.currentVersion;
    setBaseVersion(status.currentVersion);
    writeRuntime(status.currentVersion);
  }, [status.ready, status.currentVersion]);

  const newest = releases[0] || null;
  const newer = Boolean(
    status.currentVersion && baseVersion && compareVersions(status.currentVersion, baseVersion) > 0
  );
  const sticky = Boolean(newest && newest.important && newest.forceRefresh);
  const showBanner =
    newer &&
    !popup &&
    !notes &&
    !isTestMode() &&
    !pathname.startsWith("/admin") &&
    !status.maintenanceOn;

  const refresh = useCallback(() => {
    if (!status.currentVersion) return;
    // The progress is already on this device; the notes are owed after the reload.
    setForce(status.currentVersion);
    writeRuntime(status.currentVersion);
    window.location.reload();
  }, [status.currentVersion]);

  const seeWhatsNew = useCallback(() => {
    if (!status.currentVersion) return;
    setPopup({
      mode: "whatsnew",
      version: status.currentVersion,
      releases: newerThan(readSeen().version),
    });
  }, [newerThan, status.currentVersion]);

  /* ------------------------------------------------------------- the notes */

  const openNotes = useCallback(() => {
    setNotes(true);
    // The cached history is enough unless it is more than five minutes old.
    ensureStatusFresh(NOTES_MAX_AGE_MS).catch(() => null);
  }, []);

  const closeNotes = useCallback(() => {
    setNotes(false);
    // Reading the notes counts as having seen this version, but only for someone
    // who had already met an earlier one — a first visit still gets its welcome.
    if (!readSeen().version || !status.currentVersion) return;
    if (compareVersions(readSeen().version, status.currentVersion) >= 0) return;
    writeSeen(status.currentVersion, status.seenGeneration);
    setSeenVersion(status.currentVersion);
    writeRuntime(status.currentVersion);
    clearForce();
  }, [status.currentVersion, status.seenGeneration]);

  const unseen = Boolean(
    status.currentVersion && (!seenVersion || compareVersions(seenVersion, status.currentVersion) < 0)
  );

  const value = useMemo(
    () => ({
      version,
      releases,
      unseen,
      openNotes,
      closeNotes,
    }),
    [closeNotes, openNotes, releases, unseen, version]
  );

  return (
    <WhatsNewContext.Provider value={value}>
      {children}
      {showBanner ? (
        <UpdateBanner
          version={status.currentVersion}
          sticky={sticky}
          onSee={seeWhatsNew}
          onRefresh={refresh}
        />
      ) : null}
      {popup ? (
        <WhatsNewDialog
          mode={popup.mode}
          version={popup.version}
          releases={popup.releases}
          onClose={closePopup}
        />
      ) : null}
      {notes ? <ReleaseNotesDialog version={version} releases={releases} onClose={closeNotes} /> : null}
    </WhatsNewContext.Provider>
  );
}

export function useWhatsNew() {
  const context = useContext(WhatsNewContext);
  return (
    context || {
      version: BASE_VERSION,
      releases: [],
      unseen: false,
      openNotes: () => {},
      closeNotes: () => {},
    }
  );
}