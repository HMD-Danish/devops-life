import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The tour card: counter, title, one short paragraph, dots, and the controls.
 * Focus stays here, Escape asks before skipping, arrows move between steps.
 */
export default function TutorialCard({
  index,
  total,
  title,
  text,
  canBack,
  last,
  confirming,
  onNext,
  onBack,
  onRequestSkip,
  onStay,
  onConfirmSkip,
}) {
  const innerRef = useRef(null);

  useEffect(() => {
    innerRef.current?.focus({ preventScroll: true });
  }, [index]);

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onRequestSkip();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onNext();
      return;
    }
    if (event.key === "ArrowLeft") {
      if (!canBack) return;
      event.preventDefault();
      onBack();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [...(innerRef.current?.querySelectorAll(FOCUSABLE) || [])];
    if (!nodes.length) return;
    const first = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastNode.focus();
    }
  };

  return (
    <div
      ref={innerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-text"
      data-tour-card="true"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="glass-thick sheet-in rounded-[24px] p-4 outline-none sm:p-5"
    >
      <div aria-live="polite" aria-atomic="true">
        <div className="flex items-start justify-between gap-3">
          <p className="type-overline text-[10.5px] text-primary">
            Step {index + 1} of {total}
          </p>
          <button
            type="button"
            onClick={onRequestSkip}
            className="press -mt-1 shrink-0 rounded-full px-1.5 py-1 text-[12px] font-medium text-label-secondary underline decoration-label-secondary/40 underline-offset-2 hover:text-label"
          >
            Skip tutorial
          </button>
        </div>

        <h2 id="tour-title" className="type-title mt-1.5 pr-2 text-[18px] leading-snug">
          {title}
        </h2>
        <p id="tour-text" className="type-body mt-1.5 text-[13.5px] leading-relaxed text-label-secondary">
          {text}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-250 ease-spring",
              i === index ? "w-4 bg-primary" : "w-1.5 bg-label/20"
            )}
          />
        ))}
      </div>

      {confirming ? (
        <div className="mt-4 rounded-inner border border-separator/70 bg-fill/60 p-3">
          <p className="type-body text-[13px]">Skip the tutorial? You can replay it from Help.</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={onStay}>
              Stay
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-full" onClick={onConfirmSkip}>
              Skip
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-full"
            onClick={onBack}
            disabled={!canBack}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button type="button" className="h-10 rounded-full px-4" onClick={onNext}>
            {last ? "Start playing" : "Next"}
            {last ? null : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}