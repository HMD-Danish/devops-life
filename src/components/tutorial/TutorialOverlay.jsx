import { useEffect, useLayoutEffect, useRef, useState } from "react";
import TutorialCard from "@/components/tutorial/TutorialCard";
import { cn } from "@/lib/utils";

const PAD = 6;
const GAP = 16;
const EDGE = 12;
const MOBILE = 640;
const CARD_W = 360;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function useViewport() {
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 1024 : window.innerWidth,
    h: typeof window === "undefined" ? 768 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return size;
}

/** Where the card can sit without leaving the window. */
function place({ rect, viewport, height, mobile }) {
  if (mobile) {
    const sheet = { left: 8, right: 8, width: "auto" };
    const atTop = rect ? rect.bottom + EDGE > viewport.h - (height || 240) - EDGE : false;
    return atTop
      ? { side: "top", style: { ...sheet, top: EDGE } }
      : { side: "bottom", style: { ...sheet, bottom: "calc(12px + env(safe-area-inset-bottom))" } };
  }

  if (!rect) {
    return {
      side: "center",
      style: {
        width: CARD_W,
        left: clamp((viewport.w - CARD_W) / 2, EDGE, Math.max(EDGE, viewport.w - CARD_W - EDGE)),
        top: Math.max(EDGE, (viewport.h - (height || 240)) / 2),
      },
    };
  }

  const left = clamp(rect.left + rect.width / 2 - CARD_W / 2, EDGE, Math.max(EDGE, viewport.w - CARD_W - EDGE));
  const below = rect.bottom + GAP;
  const above = rect.top - GAP - (height || 240);

  if (below + (height || 240) <= viewport.h - EDGE) {
    return { side: "below", style: { width: CARD_W, left, top: below } };
  }
  if (above >= EDGE) {
    return { side: "above", style: { width: CARD_W, left, top: above } };
  }

  const sideTop = clamp(rect.top + rect.height / 2 - (height || 240) / 2, EDGE, Math.max(EDGE, viewport.h - (height || 240) - EDGE));
  if (rect.right + GAP + CARD_W <= viewport.w - EDGE) {
    return { side: "right", style: { width: CARD_W, left: rect.right + GAP, top: sideTop } };
  }
  if (rect.left - GAP - CARD_W >= EDGE) {
    return { side: "left", style: { width: CARD_W, left: rect.left - GAP - CARD_W, top: sideTop } };
  }

  return {
    side: "center",
    style: {
      width: CARD_W,
      left: clamp((viewport.w - CARD_W) / 2, EDGE, Math.max(EDGE, viewport.w - CARD_W - EDGE)),
      top: EDGE,
    },
  };
}

/**
 * Dims the page, cuts a hole around the element being explained, and puts the
 * glass card beside it. Only the hole lets a click through.
 */
export default function TutorialOverlay({ step, index, total, rect, centered, canBack, last, onNext, onBack, onFinish }) {
  const cardRef = useRef(null);
  const [height, setHeight] = useState(240);
  const [confirming, setConfirming] = useState(false);
  const viewport = useViewport();

  useEffect(() => setConfirming(false), [index]);

  // The card's own height decides above or below.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const next = el.getBoundingClientRect().height;
    setHeight((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  });

  const hole = rect
    ? {
        top: Math.max(0, rect.top - PAD),
        left: Math.max(0, rect.left - PAD),
        right: Math.min(viewport.w, rect.right + PAD),
        bottom: Math.min(viewport.h, rect.bottom + PAD),
      }
    : null;

  const blocks = hole
    ? [
        { top: 0, left: 0, width: viewport.w, height: hole.top },
        { top: hole.bottom, left: 0, width: viewport.w, height: Math.max(0, viewport.h - hole.bottom) },
        { top: hole.top, left: 0, width: hole.left, height: Math.max(0, hole.bottom - hole.top) },
        { top: hole.top, left: hole.right, width: Math.max(0, viewport.w - hole.right), height: Math.max(0, hole.bottom - hole.top) },
      ]
    : [{ top: 0, left: 0, width: viewport.w, height: viewport.h }];

  const mobile = viewport.w < MOBILE;
  const layout = place({ rect: hole && rect ? rect : null, viewport, height, mobile });
  const arrowX = rect && layout.side !== "center" && !mobile ? clamp(rect.left + rect.width / 2 - Number(layout.style.left || 0), 26, (Number(layout.style.width) || CARD_W) - 26) : 0;

  const requestSkip = () => setConfirming(true);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {blocks.map((block, i) => (
        <div
          key={i}
          role="presentation"
          onClick={requestSkip}
          style={{ position: "fixed", ...block }}
          className="pointer-events-auto bg-black/45 backdrop-blur-[1.5px]"
        />
      ))}

      {hole ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: hole.top,
            left: hole.left,
            width: Math.max(0, hole.right - hole.left),
            height: Math.max(0, hole.bottom - hole.top),
          }}
          className="tour-glow pointer-events-none rounded-[14px] ring-2 ring-primary/80"
        />
      ) : null}

      <div ref={cardRef} style={{ position: "fixed", ...layout.style }} className="pointer-events-auto">
        {arrowX ? (
          <span
            aria-hidden="true"
            style={{ left: arrowX, background: "rgb(var(--glass-bg) / 0.92)" }}
            className={cn(
              "absolute h-3 w-3 rotate-45 rounded-[3px] ring-1 ring-white/40 dark:ring-white/15",
              layout.side === "below" ? "-top-1.5" : "-bottom-1.5"
            )}
          />
        ) : null}

        <TutorialCard
          index={index}
          total={total}
          title={centered && step.fallback ? step.fallback.title : step.title}
          text={centered && step.fallback ? step.fallback.text : step.text}
          canBack={canBack}
          last={last}
          confirming={confirming}
          onNext={onNext}
          onBack={onBack}
          onRequestSkip={requestSkip}
          onStay={() => setConfirming(false)}
          onConfirmSkip={onFinish}
        />
      </div>
    </div>
  );
}