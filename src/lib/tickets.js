import { formatSpan } from "@/lib/realClock";

export const BOARD_COLUMNS = [
  { id: "todo", label: "To do", statuses: ["open", "blocked"] },
  { id: "doing", label: "In progress", statuses: ["in_progress"] },
  { id: "review", label: "In review", statuses: ["in_review"] },
  { id: "done", label: "Done", statuses: ["resolved", "closed"] },
];

export const PRIORITY_STYLE = {
  P1: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  P2: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  P3: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  P4: "border-foreground/20 bg-foreground/5 text-muted-foreground",
};

export const STATUS_LABEL = {
  open: "To do",
  blocked: "Blocked",
  in_progress: "In progress",
  in_review: "In review",
  resolved: "Resolved",
  closed: "Closed",
};

export const BUILD_TONE = {
  passing: "text-emerald-600 dark:text-emerald-400",
  failing: "text-rose-600 dark:text-rose-400",
  running: "text-sky-600 dark:text-sky-400",
  none: "text-muted-foreground",
};

const WARN_MS = 15 * 60000;

/** Real time left on a deadline, measured against the device clock. */
export function slaRemainingMs(ticket, nowMs = Date.now()) {
  const due = Date.parse(ticket?.sla_due_at || "");
  if (!Number.isFinite(due)) return null;
  return due - nowMs;
}

/** "SLA 4h left" / "SLA breached 12 min ago", from the stored real deadline. */
export function slaState(ticket, nowMs = Date.now()) {
  const done = ticket.status === "resolved" || ticket.status === "closed";
  const remaining = slaRemainingMs(ticket, nowMs);
  // A ticket with no stored deadline says so instead of counting down from zero.
  if (remaining === null) return { text: "No SLA", tone: "text-muted-foreground" };
  if (done) return { text: "Closed", tone: "text-muted-foreground" };
  if (remaining <= 0)
    return { text: `SLA breached ${formatSpan(-remaining)} ago`, tone: "text-rose-600 dark:text-rose-400" };
  if (remaining <= WARN_MS)
    return { text: `SLA ${formatSpan(remaining)} left`, tone: "text-amber-600 dark:text-amber-400" };
  return { text: `SLA ${formatSpan(remaining)} left`, tone: "text-muted-foreground" };
}

export function initials(name) {
  return String(name || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}