import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LAYER } from "@/lib/layers";
import { cn } from "@/lib/utils";

/**
 * Every admin modal goes through here, so none of them can be clipped again:
 * the portal lives on document.body, outside the sticky bars, the blurred
 * headers and anything else that would otherwise contain it.
 *
 * One z-index, a dim layer over the whole window, Escape and the dim layer to
 * close, focus kept inside and given back to the button that opened it, and a
 * pinned header and footer with only the middle scrolling.
 *
 * A dialog that has unsaved work renders itself once more as the discard
 * prompt. Only the topmost modal listens for the keyboard.
 */
const stack = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ModalShell({
  onClose,
  titleId = "admin-modal-title",
  overline,
  title,
  subtitle,
  header,
  footer,
  children,
  width = "max-w-[640px]",
  bodyClassName = "p-4 sm:p-5",
  role = "dialog",
  dirty = false,
  discardTitle = "Discard your changes?",
  discardBody = "Nothing here has been saved yet.",
}) {
  const cardRef = useRef(null);
  const closeRef = useRef(() => {});
  const idRef = useRef(null);
  const [askDiscard, setAskDiscard] = useState(false);

  if (!idRef.current) idRef.current = `modal-${Math.random().toString(36).slice(2)}`;

  const close = useCallback(() => {
    if (dirty) setAskDiscard(true);
    else onClose?.();
  }, [dirty, onClose]);
  closeRef.current = close;

  useEffect(() => {
    const id = idRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const node = cardRef.current;
      if (!node || node.contains(document.activeElement)) return;
      node.focus();
    });

    stack.push(id);
    const onKey = (event) => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const node = cardRef.current;
      if (!node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null && el.tabIndex !== -1
      );
      if (!items.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      const index = stack.lastIndexOf(id);
      if (index >= 0) stack.splice(index, 1);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus?.();
    };
  }, []);

  return createPortal(
    <div className={cn("fixed inset-0 flex items-center justify-center p-3 sm:p-6", LAYER.overlay)}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={close}
        className="overlay-in absolute inset-0 h-full w-full cursor-default bg-black/35 backdrop-blur-[3px]"
      />

      <div
        ref={cardRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("rise-in glass-thick relative flex max-h-[90vh] w-full flex-col outline-none", LAYER.modal, width)}
      >
        {header || (
          <div className="flex shrink-0 items-start gap-3 border-b border-separator/50 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              {overline ? <p className="type-overline">{overline}</p> : null}
              <h2 id={titleId} className="type-title mt-1 text-[19px]">
                {title}
              </h2>
              {subtitle ? <p className="type-caption mt-1 text-[11.5px]">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="press -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", bodyClassName)}>{children}</div>

        {footer ? <div className="shrink-0 border-t border-separator/50 p-4">{footer}</div> : null}
      </div>

      {askDiscard ? (
        <ModalShell
          onClose={() => setAskDiscard(false)}
          titleId={`${titleId}-discard`}
          overline="Unsaved"
          title={discardTitle}
          width="max-w-[380px]"
          bodyClassName="px-4 pb-1 sm:px-5"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="rounded-full" onClick={() => setAskDiscard(false)}>
                Keep editing
              </Button>
              <Button variant="destructive" className="rounded-full" onClick={onClose}>
                Discard
              </Button>
            </div>
          }
        >
          <p className="type-body text-[13.5px] text-label-secondary">{discardBody}</p>
        </ModalShell>
      ) : null}
    </div>,
    document.body
  );
}