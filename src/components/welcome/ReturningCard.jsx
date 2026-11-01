import { useState } from "react";
import { ArrowRight, KeyRound, RotateCcw, ShieldCheck, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ago(iso) {
  const ms = Date.now() - new Date(iso || 0).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const PIN_RULE = /^\d{4}$/;

/** Strongly recommends a PIN for a name that does not have one yet. */
function PinSuggestion({ onSetPin }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (saved) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-success">
        <ShieldCheck className="h-3.5 w-3.5" /> PIN saved. This name is protected from now on.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-3 flex items-start justify-between gap-3 rounded-inner bg-fill/70 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium">Protect this name with a PIN</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Recommended. Without one, anyone who types this name can open your career.
          </p>
        </div>
        <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setOpen(true)}>
          Set PIN
        </Button>
      </div>
    );
  }

  const save = async () => {
    if (!PIN_RULE.test(pin)) return setError("A PIN is exactly 4 digits.");
    setBusy(true);
    setError("");
    try {
      const result = await onSetPin(pin);
      if (result?.error) return setError(result.error);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-inner bg-fill/70 p-3.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
        <KeyRound className="h-3.5 w-3.5 text-primary" /> Choose a 4-digit PIN
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            if (error) setError("");
          }}
          inputMode="numeric"
          type="password"
          maxLength={4}
          autoComplete="off"
          placeholder="••••"
          aria-label="New PIN"
          className="terminal-font h-10 w-[112px] text-center text-base tracking-[0.4em]"
        />
        <Button size="sm" className="rounded-full" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={() => {
            setOpen(false);
            setPin("");
            setError("");
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
      {error ? <p className="mt-2 text-[11.5px] text-danger">{error}</p> : null}
    </div>
  );
}

export default function ReturningCard({
  name,
  summary,
  retentionDays = 5,
  busy,
  pinRequired = false,
  onSetPin,
  onContinue,
  onStartFresh,
}) {
  const [confirming, setConfirming] = useState(false);
  const hasCareer = !!summary?.has_career;

  return (
    <div className="glass-panel w-full max-w-[460px] p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-[13px] font-semibold text-success">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="type-overline">Welcome back</p>
          <h2 className="type-title truncate">{name}</h2>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="glass-subtle px-3 py-2.5">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Project</dt>
          <dd className="mt-0.5 text-[12.5px] font-medium leading-snug">
            {summary?.project || (hasCareer ? "Between projects" : "Not started")}
          </dd>
        </div>
        <div className="glass-subtle px-3 py-2.5">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">In-game date</dt>
          <dd className="mt-0.5 text-[12.5px] font-medium">{summary?.month_day || "—"}</dd>
        </div>
        <div className="glass-subtle px-3 py-2.5">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Last activity</dt>
          <dd className="mt-0.5 text-[12.5px] font-medium">{ago(summary?.last_active_at)}</dd>
        </div>
        <div className="glass-subtle px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Ticket className="h-2.5 w-2.5" /> Open tickets
          </dt>
          <dd className="mt-0.5 text-[12.5px] font-medium">{summary?.open_tickets ?? 0}</dd>
        </div>
      </dl>

      {hasCareer ? (
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          {summary?.role}
          {summary?.company ? ` · ${summary.company}` : ""}
        </p>
      ) : (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Your name exists but no career was started yet. Continue to pick a company and a project.
        </p>
      )}

      {!pinRequired && onSetPin ? <PinSuggestion onSetPin={onSetPin} /> : null}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Your progress is kept for {retentionDays} days after your last visit.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <Button onClick={onContinue} disabled={busy} className="w-full rounded-full">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>

        {confirming ? (
          <div className="glass-subtle space-y-2 p-3">
            <p className="text-[11.5px] leading-relaxed">
              Starting fresh deletes this name's career, tickets, chat and terminal history. It cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="flex-1 rounded-full" onClick={onStartFresh} disabled={busy}>
                {busy ? "Deleting…" : "Yes, start fresh"}
              </Button>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full rounded-full text-muted-foreground"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Start fresh
          </Button>
        )}
      </div>
    </div>
  );
}