import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Side drawer used below 1200px, where the dashboard column no longer fits.
 */
export default function Drawer({ open, onClose, title, children }) {
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
    <div className="fixed inset-0 z-50 min-[1200px]:hidden">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="overlay-in absolute inset-0 h-full w-full bg-black/25 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="drawer-in glass-thick absolute inset-y-0 left-0 flex w-[min(340px,88vw)] flex-col rounded-l-none rounded-r-[26px]"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-separator/50 px-4 py-3">
          <h2 className="type-headline text-[15px]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press ml-auto flex h-11 w-11 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}