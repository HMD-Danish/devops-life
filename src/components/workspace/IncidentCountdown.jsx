import { cn } from "@/lib/utils";
import { formatSpan } from "@/lib/realClock";
import { slaRemainingMs } from "@/lib/tickets";

const WARN_MS = 15 * 60000;

/**
 * The only ticking countdown in the game, shown on an open incident. It reads
 * the stored real deadline against the device clock, and says so when the
 * clock was stopped while the player was away.
 */
export default function IncidentCountdown({ ticket, now, awayMs = 0 }) {
  const remaining = slaRemainingMs(ticket, now);
  if (remaining === null) return null;

  const breached = remaining <= 0;
  const text = breached
    ? `Incident: breached ${formatSpan(-remaining)} ago`
    : `Incident: ${formatSpan(remaining)} left`;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]">
      <span
        className={cn(
          "terminal-font tabular-nums",
          breached ? "text-danger" : remaining <= WARN_MS ? "text-warning" : "text-label-secondary"
        )}
      >
        {text}
      </span>
      {awayMs > 0 && !breached ? (
        <span className="text-label-secondary">Paused while you were away</span>
      ) : null}
    </p>
  );
}