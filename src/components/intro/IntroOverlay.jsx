import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import IntroLogomark from "@/components/intro/IntroLogomark";
import IntroTerminal from "@/components/intro/IntroTerminal";

const EXIT_MS = 620;
const SKIP_AFTER_MS = 500;

const PLANS = {
  full: {
    exitAt: 1380,
    terminal: true,
    tagline: "Learn DevOps by doing the job.",
    logo: 0.1,
    spin: 0.28,
    title: 0.98,
  },
  short: {
    exitAt: 1400,
    terminal: false,
    tagline: "Welcome back",
    logo: 0.3,
    spin: 0.78,
    title: 0.88,
  },
  reduced: {
    exitAt: 880,
    terminal: false,
    tagline: "Learn DevOps by doing the job.",
    logo: 0,
    spin: 0,
    title: 0,
  },
};

/**
 * Full-screen welcome animation. It sits above the first screen and never
 * touches it: dismissing reveals whatever was already rendered underneath.
 */
export default function IntroOverlay({ mode = "full", onReveal, onDone }) {
  const plan = PLANS[mode] || PLANS.full;
  const reduced = mode === "reduced";
  const [exiting, setExiting] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const rootRef = useRef(null);
  const doneRef = useRef(false);
  const endTimer = useRef(null);
  const callbacks = useRef({ onReveal, onDone });
  callbacks.current = { onReveal, onDone };

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setExiting(true);
    callbacks.current.onReveal?.();
    endTimer.current = window.setTimeout(() => callbacks.current.onDone?.(), EXIT_MS);
  }, []);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    const exitTimer = window.setTimeout(finish, plan.exitAt);
    const skipTimer = window.setTimeout(() => setShowSkip(true), SKIP_AFTER_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(skipTimer);
      if (endTimer.current) window.clearTimeout(endTimer.current);
    };
  }, [finish, plan.exitAt]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish]);

  return (
    <div
      ref={rootRef}
      role="presentation"
      tabIndex={-1}
      onClick={finish}
      className={cn("intro-overlay outline-none", reduced && "intro-reduced", exiting && "intro-exit")}
    >
      <div className="intro-bg" aria-hidden="true">
        <span className="intro-blob intro-blob-1" />
        <span className="intro-blob intro-blob-2" />
        <span className="intro-blob intro-blob-3" />
      </div>

      <div className={cn("relative z-10 flex w-full flex-col items-center px-5", reduced && "intro-static")}>
        <IntroLogomark logoDelay={plan.logo} spinDelay={plan.spin} />

        <div className="intro-swap mt-6 sm:mt-7">
          {plan.terminal ? <IntroTerminal /> : null}

          <div className="intro-title-block text-center" style={{ "--intro-title-delay": `${plan.title}s` }}>
            <h1 className="type-large-title">DevOps Life</h1>
            <p className="type-body mt-2 text-label-secondary">{plan.tagline}</p>
          </div>
        </div>
      </div>

      {showSkip ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            finish();
          }}
          className="intro-skip press glass-thin absolute bottom-5 right-5 rounded-full px-4 py-2 text-[13px] font-medium text-label-secondary hover:text-label"
        >
          Skip
        </button>
      ) : null}
    </div>
  );
}