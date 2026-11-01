import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";
import ModalShell from "@/components/shell/ModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const REASON_MIN = 10;
const REASON_MAX = 300;
const NOTE_MAX = 300;

/** The red alert that turns maintenance on. Cancel left, the red action right. */
export default function MaintenanceConfirmDialog({ open, busy, error, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setReason("");
    setExpected("");
    setNote("");
    cancelRef.current?.focus();
    return undefined;
  }, [open]);

  if (!open) return null;

  const text = reason.trim();
  const valid = text.length >= REASON_MIN && text.length <= REASON_MAX;
  const close = () => {
    if (!busy) onCancel?.();
  };

  return (
    <ModalShell
      role="alertdialog"
      titleId="maintenance-on-title"
      width="max-w-[480px]"
      onClose={close}
      bodyClassName="space-y-3 p-4 sm:p-5"
      header={
        <div className="flex shrink-0 items-start gap-2.5 border-b border-separator/50 p-4 sm:p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/12 text-danger">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="maintenance-on-title" className="type-title text-[18px]">
              Turn on maintenance mode?
            </h2>
            <p className="type-caption mt-1 text-[12px]">
              Every player is closed out of the app until you turn it back off.
            </p>
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
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button ref={cancelRef} variant="ghost" className="rounded-full" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-full sm:min-w-[130px]"
            disabled={!valid || busy}
            onClick={() =>
              onConfirm?.({
                reason: text,
                expectedBackAt: expected ? new Date(expected).toISOString() : "",
                internalNote: note.trim(),
              })
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Turn on
          </Button>
        </div>
      }
    >
      <div>
        <Label htmlFor="maintenance-reason" className="text-[12px]">
          Reason <span className="text-danger">*</span>
        </Label>
        <Textarea
          id="maintenance-reason"
          value={reason}
          maxLength={REASON_MAX}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Database failover — the app is read-only for about 20 minutes."
          className="mt-1.5 min-h-[88px] text-[13.5px]"
          aria-describedby="maintenance-reason-count"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p id="maintenance-reason-count" className="type-caption text-[11px] tabular-nums">
            {text.length}/{REASON_MAX}
          </p>
          {text.length > 0 && !valid ? (
            <p className="type-caption text-[11px] text-danger">At least {REASON_MIN} characters.</p>
          ) : null}
        </div>
        <p className="type-caption mt-0.5 text-[11px]">Players see this text on the maintenance screen.</p>
      </div>

      <div>
        <Label htmlFor="maintenance-back" className="text-[12px]">
          Expected back at (optional)
        </Label>
        <Input
          id="maintenance-back"
          type="datetime-local"
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          className="mt-1.5 h-11 text-[13.5px]"
        />
        <p className="type-caption mt-1 text-[11px]">Shown to players in their own local time.</p>
      </div>

      <div>
        <Label htmlFor="maintenance-note" className="text-[12px]">
          Internal note (optional)
        </Label>
        <Input
          id="maintenance-note"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Only admins see this"
          className="mt-1.5 h-11 text-[13.5px]"
        />
      </div>

      <p className="rounded-inner bg-danger/8 px-3 py-2.5 text-[12px] leading-relaxed text-danger">
        Players are blocked immediately. Their progress is saved and the 5-day retention timer is paused.
      </p>

      {error ? <p className="type-caption text-[12px] text-danger">{error}</p> : null}
    </ModalShell>
  );
}