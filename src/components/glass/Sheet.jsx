import { useEffect } from "react";
import { X } from "lucide-react";
import BackButton from "@/components/shell/BackButton";
import { cn } from "@/lib/utils";

/**
 * The one modal used in the workspace: centred, 520px wide, title top left,
 * close top right. Closes on the scrim, the X, Back or Escape.
 */
export default function Sheet({ open, onClose, title, children, className }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="overlay-in absolute inset-0 h-full w-full bg-black/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "sheet-in glass-thick relative flex max-h-[calc(100dvh-32px)] w-full max-w-[520px] flex-col",
          className
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-separator/50 px-3 py-2">
          <BackButton insideOverlay onClick={onClose} />
          <h2 className="type-headline min-w-0 flex-1 truncate px-1 text-[15px]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}