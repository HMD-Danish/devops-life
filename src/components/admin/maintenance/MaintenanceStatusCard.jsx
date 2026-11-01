import { FlaskConical, Loader2, PowerOff, ShieldCheck } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const localTime = (iso) => {
  const at = new Date(iso || "");
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** The switch at the top of the Maintenance section: one pill, one button. */
export default function MaintenanceStatusCard({ status, busy, onToggle, onTest }) {
  const on = status?.maintenanceOn === true;

  return (
    <GlassPanel className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em]",
            on ? "bg-danger/14 text-danger" : "bg-success/14 text-success"
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", on ? "bg-danger" : "bg-success")} aria-hidden="true" />
          {on ? "Maintenance on" : "Live"}
        </span>
        {status?.testActive ? (
          <span className="rounded-full bg-warning/14 px-2.5 py-1 text-[11px] font-medium text-warning">
            Test token active
          </span>
        ) : null}
      </div>

      <dl className="mt-4 divide-y divide-separator/60">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-[12.5px] text-label-secondary">Turned on by</dt>
          <dd className="text-right text-[12.5px] font-medium">{on ? status?.startedBy || "Admin" : "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-[12.5px] text-label-secondary">Since</dt>
          <dd className="text-right text-[12.5px] font-medium tabular-nums">{on ? localTime(status?.startedAt) : "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-[12.5px] text-label-secondary">Expected back</dt>
          <dd className="text-right text-[12.5px] font-medium tabular-nums">
            {on && status?.expectedBackAt ? localTime(status.expectedBackAt) : "Not set"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-[12.5px] text-label-secondary">Players blocked since it started</dt>
          <dd className="text-[12.5px] font-medium tabular-nums">{on ? status?.blockedCount ?? 0 : 0}</dd>
        </div>
      </dl>

      {on && status?.reason ? (
        <div className="mt-3 rounded-inner bg-fill/70 px-3 py-2.5">
          <p className="type-overline text-[10px]">Reason players see</p>
          <p className="mt-1 text-[13px] leading-relaxed">{status.reason}</p>
          {status?.internalNote ? (
            <p className="mt-2 border-t border-separator/60 pt-2 text-[12px] text-label-secondary">
              <span className="font-medium text-label">Internal:</span> {status.internalNote}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          variant={on ? "secondary" : "destructive"}
          className="h-11 rounded-full sm:min-w-[220px]"
          onClick={onToggle}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : on ? (
            <PowerOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          )}
          {on ? "Turn off maintenance mode" : "Turn on maintenance mode"}
        </Button>

        <Button variant="outline" className="h-11 rounded-full" onClick={onTest} disabled={!on || busy}>
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Test environment
        </Button>
      </div>
      {!on ? <p className="type-caption mt-2 text-[11px]">Turn on maintenance mode first</p> : null}
    </GlassPanel>
  );
}