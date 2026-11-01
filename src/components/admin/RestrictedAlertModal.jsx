import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Loader2, TriangleAlert, X } from "lucide-react";
import { LAYER } from "@/lib/layers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogin } from "@/lib/adminApi";

const lockLabel = (seconds) => {
  const minutes = Math.max(1, Math.ceil(Number(seconds || 0) / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
};

/**
 * Red-tinted restricted-area alert. Continue reveals the password field; the
 * password is only ever sent to the server, which answers with a session token.
 */
export default function RestrictedAlertModal({ onClose, onSignedIn }) {
  const [step, setStep] = useState("alert");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const passwordRef = useRef(null);

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!password) {
      setError("Enter the admin password.");
      return;
    }
    setError("");
    setSending(true);
    try {
      await adminLogin(password);
      setPassword("");
      onSignedIn();
    } catch (err) {
      // The fifth wrong password is still a refusal; the lock is what the next
      // attempt hits, so the two read differently.
      if (err?.locked && err?.status !== 401) setError(lockLabel(err.retryAfter));
      else if (err?.message && /not set up/i.test(err.message)) setError(err.message);
      else setError("Access denied");
    } finally {
      setSending(false);
    }
  };

  // Focus starts inside the dialog and lands on the field once it is revealed.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (step === "password") passwordRef.current?.focus();
      else cancelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  // Escape behaves like Cancel, and Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const items = [...node.querySelectorAll("button, input, [href]")].filter((el) => !el.disabled);
      if (!items.length) return;
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
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className={cn("fixed inset-0 flex items-center justify-center p-4", LAYER.overlay)}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="overlay-in absolute inset-0 h-full w-full bg-black/30 backdrop-blur-[2px]"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restricted-title"
        className={cn(
          "sheet-in glass-thick relative flex max-h-[calc(100dvh-32px)] w-full max-w-[440px] flex-col border-danger/45 shadow-[0_0_0_1px_rgba(255,59,48,0.16),0_18px_56px_-20px_rgba(255,59,48,0.55)]",
          LAYER.modal
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(255,59,48,0.17),rgba(255,59,48,0.05)_58%,transparent_100%)]"
        />

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger/14 text-danger">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </span>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-danger">Restricted area</p>
          <h2 id="restricted-title" className="type-title mt-1.5 pr-10 text-[19px]">
            Authorized administrators only
          </h2>
          <p className="type-body mt-2 text-[13.5px] text-label-secondary">
            This area is monitored. Unauthorized access attempts are logged.
          </p>

          {step === "password" ? (
            <div className="mt-4">
              <Label htmlFor="admin-password" className="text-[12px]">
                Admin password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  ref={passwordRef}
                  id="admin-password"
                  type={shown ? "text" : "password"}
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Admin password"
                  aria-describedby={error ? "admin-gate-error" : undefined}
                  className="h-11 pr-12"
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={() => setShown((value) => !value)}
                  aria-label={shown ? "Hide password" : "Show password"}
                  aria-pressed={shown}
                  className="press absolute right-0.5 top-0.5 flex h-10 w-10 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
                >
                  {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error ? (
                <p id="admin-gate-error" role="alert" className="mt-2 text-[12.5px] font-medium leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-2">
            <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} className="h-11">
              Cancel
            </Button>
            {step === "alert" ? (
              <Button type="button" variant="destructive" onClick={() => setStep("password")} className="h-11">
                Continue
              </Button>
            ) : (
              <Button type="submit" variant="destructive" disabled={sending} className="h-11">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {sending ? "Checking…" : "Sign in"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}