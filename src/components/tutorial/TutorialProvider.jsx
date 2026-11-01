import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import TutorialOverlay from "@/components/tutorial/TutorialOverlay";
import {
  STEPS,
  TOTAL_STEPS,
  hasOpenModal,
  isTutorialDone,
  markTutorialDone,
  pageOf,
  rectOf,
  visibleTarget,
} from "@/lib/tutorial";
import { isNamePage } from "@/lib/namePage";
import { readActiveSaveId } from "@/lib/activeSave";
import { readToken } from "@/lib/playerSession";
import { game } from "@/lib/gameApi";

const TutorialContext = createContext(null);

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) throw new Error("useTutorial must be used inside TutorialProvider");
  return context;
}

/**
 * Runs the guided tour: it decides which step belongs on the screen you are
 * looking at, measures that element, and keeps the whole thing inside one
 * saved flag. It never fetches anything — the one write happens on finish.
 */
export function TutorialProvider({ children }) {
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const [active, setActive] = useState(false);
  const [view, setView] = useState({ index: null, rect: null, centered: false });
  const indexRef = useRef(null);
  const pointerRef = useRef(0);
  const timers = useRef([]);
  const auto = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  }, []);

  const hide = useCallback(() => {
    indexRef.current = null;
    setView({ index: null, rect: null, centered: false });
  }, []);

  const measure = useCallback(() => {
    const index = indexRef.current;
    if (index === null) return;
    const step = STEPS[index];
    if (!step.target) {
      setView({ index, rect: null, centered: true });
      return;
    }
    const el = visibleTarget(step.target);
    if (el) setView({ index, rect: rectOf(el), centered: false });
  }, []);

  const showRef = useRef(null);

  const skipSilently = useCallback(
    (index) => {
      const page = STEPS[index].page;
      let next = index + 1;
      while (next < STEPS.length && STEPS[next].page !== page) next += 1;
      if (next < STEPS.length) {
        showRef.current?.(next);
        return;
      }
      pointerRef.current = index + 1;
      hide();
    },
    [hide]
  );

  const show = useCallback(
    (index) => {
      clearTimers();
      pointerRef.current = index;
      indexRef.current = index;
      const step = STEPS[index];
      if (!step.target) {
        setView({ index, rect: null, centered: true });
        return;
      }
      // Measure straight away so the card never lands a frame in the wrong place.
      const found = visibleTarget(step.target);
      setView({ index, rect: found ? rectOf(found) : null, centered: false });

      const settle = (attempt) => {
        if (indexRef.current !== index) return;
        const el = visibleTarget(step.target);
        if (el) {
          measure();
          return;
        }
        // On a phone the panel may be behind another tab: open that tab first.
        if (attempt === 0 && step.tab) {
          const tab = document.querySelector(`[data-tour-tab="${step.tab}"]`);
          if (tab) tab.click();
        }
        if (attempt < 14) {
          timers.current.push(setTimeout(() => settle(attempt + 1), 70));
          return;
        }
        if (step.fallback) {
          setView({ index, rect: null, centered: true });
          return;
        }
        skipSilently(index);
      };
      timers.current.push(setTimeout(() => settle(0), 0));
    },
    [clearTimers, measure, skipSilently]
  );

  useEffect(() => {
    showRef.current = show;
  }, [show]);

  const finish = useCallback(() => {
    clearTimers();
    markTutorialDone();
    hide();
    setActive(false);
    // One small write, and only when a career is already open.
    const saveId = readActiveSaveId();
    if (saveId && readToken()) {
      game("save.patch", { saveId, fields: { tutorialDone: true } }).catch(() => null);
    }
  }, [clearTimers, hide]);

  const reveal = useCallback(() => {
    const page = pageOf(pathRef.current);
    if (!page) {
      hide();
      return;
    }
    let index = pointerRef.current;
    while (index < STEPS.length && STEPS[index].page !== page) index += 1;
    if (index >= STEPS.length) {
      hide();
      return;
    }
    show(index);
  }, [hide, show]);

  const next = useCallback(() => {
    const index = indexRef.current;
    if (index === null) return;
    if (index >= TOTAL_STEPS - 1) {
      finish();
      return;
    }
    pointerRef.current = index + 1;
    reveal();
  }, [finish, reveal]);

  const back = useCallback(() => {
    const index = indexRef.current;
    if (index === null) return;
    const page = STEPS[index].page;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (STEPS[i].page === page) {
        show(i);
        return;
      }
    }
  }, [show]);

  const start = useCallback(() => {
    clearTimers();
    pointerRef.current = 0;
    hide();
    setActive(true);
  }, [clearTimers, hide]);

  // Each new screen picks up the first step it still owes.
  useEffect(() => {
    if (!active) return;
    reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pathname]);

  // Reposition when the window changes or the highlighted element moves.
  useEffect(() => {
    if (view.index === null) return undefined;
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure());
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const selector = STEPS[view.index].target;
    const el = selector ? visibleTarget(selector) : null;
    const observer = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(onMove) : null;
    if (observer) observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      observer?.disconnect();
    };
  }, [view.index, measure]);

  // First run only: the name page, once the welcome animation is gone.
  useEffect(() => {
    if (auto.current || active) return undefined;
    const attemptStart = () => {
      if (auto.current) return;
      if (isTutorialDone()) {
        auto.current = true;
        return;
      }
      if (!isNamePage(pathRef.current)) return;
      if (document.querySelector(".intro-overlay")) return;
      // What's new always comes first: the tour waits while it is owed.
      if (document.documentElement.getAttribute("data-whatsnew-pending") === "1") return;
      if (hasOpenModal()) return;
      if (!document.querySelector("#player-name")) return;
      auto.current = true;
      start();
    };

    attemptStart();
    const observer = new MutationObserver(attemptStart);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, start]);

  const value = useMemo(() => ({ active, start, finish }), [active, start, finish]);

  const step = view.index === null ? null : STEPS[view.index];

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {step ? (
        <TutorialOverlay
          step={step}
          index={view.index}
          total={TOTAL_STEPS}
          rect={view.rect}
          centered={view.centered}
          canBack={view.index > 0 && STEPS[view.index - 1].page === step.page}
          last={view.index === TOTAL_STEPS - 1}
          onNext={next}
          onBack={back}
          onFinish={finish}
        />
      ) : null}
    </TutorialContext.Provider>
  );
}