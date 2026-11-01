import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import Logo from "@/components/glass/Logo";
import { Button } from "@/components/ui/button";
import ReleaseBlock from "@/components/whatsnew/ReleaseBlock";

/**
 * The one player-facing release popup: the welcome notes for a brand new
 * visitor, and the "What's new" list for someone who missed a few versions.
 * An important release can only be closed with its button.
 */
export default function WhatsNewDialog({ mode, version, releases = [], onClose }) {
  const primaryRef = useRef(null);
  const important = releases.some((release) => release.important);
  const welcome = mode === "welcome";
  // "v1.1.1 Real-time clock and feedback popup"
  const heading = welcome
    ? `Welcome to DevOps Life, v${version}`
    : `v${version}${releases[0]?.title ? ` ${releases[0].title}` : ""}`;

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== "Escape" || important) return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [important, onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" data-whatsnew>
      {important ? (
        <div className="overlay-in absolute inset-0 bg-black/45 backdrop-blur-[3px]" aria-hidden="true" />
      ) : (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="overlay-in absolute inset-0 h-full w-full bg-black/35 backdrop-blur-[3px]"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        data-whatsnew
        className="feedback-pop glass-thick relative flex max-h-[80vh] w-full max-w-[520px] flex-col"
      >
        <div className="flex items-start gap-3 border-b border-separator/50 p-5">
          <span className="logo-glass-ring shrink-0 p-1.5">
            <Logo size={36} decorative />
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-overline flex items-center gap-1.5">
              What&apos;s new
              {important ? <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="Important" /> : null}
            </p>
            <h2 id="whatsnew-title" className="type-title mt-1 text-[19px]">
              {heading}
            </h2>
          </div>
          {important ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="press -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {releases.length ? (
            releases.map((release) => (
              <ReleaseBlock key={release.version} release={release} heading={releases.length > 1} />
            ))
          ) : (
            <p className="type-body text-[13.5px] text-label-secondary">No release notes yet.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-separator/50 p-4">
          <span className="type-caption text-[11px]">
            {important ? "This update needs a moment of your attention." : `v${version}`}
          </span>
          <Button ref={primaryRef} className="rounded-full" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}