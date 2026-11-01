import { useState } from "react";
import WorkspaceSection from "@/components/workspace/WorkspaceSection";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, slaState } from "@/lib/tickets";

const PRIORITY = {
  P1: "bg-danger/15 text-danger",
  P2: "bg-warning/18 text-warning",
  P3: "bg-primary/12 text-primary",
  P4: "bg-fill-strong text-label-secondary",
};

const STATUS_TONE = {
  open: "bg-fill-strong text-label-secondary",
  in_progress: "bg-primary/12 text-primary",
  blocked: "bg-danger/15 text-danger",
  resolved: "bg-success/15 text-success",
};

const TONE = {
  bad: "text-danger",
  warn: "text-warning",
  muted: "text-label-secondary",
};

const PREVIEW = 3;

export default function TicketList({ tickets, now, currentStepKey }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tickets : tickets.slice(0, PREVIEW);

  return (
    <WorkspaceSection title="Tickets" count={tickets.length} defaultOpen>
      <div className="space-y-2">
        {tickets.length === 0 ? <p className="type-caption">No tickets for this project yet.</p> : null}

        {visible.map((ticket) => {
          const sla = slaState(ticket, now);
          const active = ticket.step_key === currentStepKey;
          return (
            <div
              key={ticket.id}
              className={cn("rounded-inner bg-fill/60 p-3", active ? "ring-1 ring-primary/25" : null)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="terminal-font text-[11px] text-label-secondary">{ticket.key}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.02em]",
                    PRIORITY[ticket.priority]
                  )}
                >
                  {ticket.priority}
                </span>
              </div>

              <p className="type-headline mt-1.5 text-[12.5px] leading-snug">{ticket.title}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                    STATUS_TONE[ticket.status] || STATUS_TONE.open
                  )}
                >
                  {STATUS_LABEL[ticket.status] || ticket.status}
                </span>
                <span className={cn("text-[11px]", TONE[sla.tone])}>{sla.text}</span>
              </div>
            </div>
          );
        })}
      </div>

      {tickets.length > PREVIEW ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="press mt-2 inline-flex min-h-[36px] items-center text-[12px] font-medium text-primary"
        >
          {showAll ? "Show less" : `View all ${tickets.length}`}
        </button>
      ) : null}
    </WorkspaceSection>
  );
}