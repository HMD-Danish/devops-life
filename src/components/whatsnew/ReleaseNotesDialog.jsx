import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import Logo from "@/components/glass/Logo";
import ReleaseBlock from "@/components/whatsnew/ReleaseBlock";
import { Button } from "@/components/ui/button";
import { releaseDateLabel } from "@/lib/releases";
import { cn } from "@/lib/utils";

/**
 * The full history, newest first, with the newest release open and the rest
 * folded away. It reads whatever the shared status already holds, so it opens
 * on every screen and offline. Reading it marks nothing as seen.
 */
export default function ReleaseNotesDialog({ version, releases = [], onClose }) {
  const closeRef = useRef(null);
  const booted = useRef(false);
  const [open, setOpen] = useState(() => releases[0]?.version || "");

  // The newest release is open from the start, even if the history arrives late.
  useEffect(() => {
    if (booted.current || !releases.length) return;
    booted.current = true;
    setOpen((current) => current || releases[0].version);
  }, [releases]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" data-whatsnew>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="overlay-in absolute inset-0 h-full w-full bg-black/35 backdrop-blur-[3px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-title"
        data-whatsnew
        className="feedback-pop glass-thick relative flex max-h-[80vh] w-full max-w-[520px] flex-col"
      >
        <div className="flex items-start gap-3 border-b border-separator/50 p-5">
          <span className="logo-glass-ring shrink-0 p-1.5">
            <Logo size={36} decorative />
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-overline">Release notes</p>
            <h2 id="release-notes-title" className="type-title mt-1 text-[19px]">
              Everything shipped so far
            </h2>
            <p className="type-caption mt-1 text-[11.5px]">You are on v{version}.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {releases.length ? (
            <ul className="divide-y divide-separator/50">
              {releases.map((release) => {
                const expanded = open === release.version;
                return (
                  <li key={release.version}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? "" : release.version)}
                      className="press flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-fill/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="terminal-font text-[13px] font-medium">v{release.version}</span>
                          <span className="type-caption text-[11px]">{releaseDateLabel(release.date)}</span>
                          {release.important ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="Important" />
                          ) : null}
                        </span>
                        {release.title ? (
                          <span className="mt-0.5 block text-[13.5px] leading-snug text-label">
                            {release.title}
                          </span>
                        ) : null}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-label-secondary transition-transform duration-300",
                          expanded && "rotate-180"
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    {expanded ? (
                      <div className="px-5 pb-4">
                        <ReleaseBlock release={release} heading={false} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-5">
              <p className="type-body text-[13.5px] text-label-secondary">
                No release notes yet. Check back after the next update.
              </p>
              <p className="type-caption mt-2 text-[11.5px]">You are on v{version}.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-separator/50 p-4">
          <Button ref={closeRef} variant="secondary" className="rounded-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}