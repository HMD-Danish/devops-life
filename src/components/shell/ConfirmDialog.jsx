import { useEffect, useRef } from "react";
import ModalShell from "@/components/shell/ModalShell";
import { Button } from "@/components/ui/button";

/**
 * Two-button glass confirm. Escape and the scrim both choose the safe option.
 * It is a portal like every other modal, so it always sits above the page.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Continue",
  cancelLabel = "Stay",
  tone = "default",
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <ModalShell
      role="alertdialog"
      titleId="confirm-title"
      title={title}
      width="max-w-[380px]"
      bodyClassName="px-4 pb-1 sm:px-5"
      onClose={() => onCancel?.()}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" className="rounded-full" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            className="rounded-full"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p id="confirm-body" className="type-body text-[13.5px] text-label-secondary">
        {body}
      </p>
    </ModalShell>
  );
}