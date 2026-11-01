import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeLabel } from "@/lib/realClock";

function initials(name) {
  return String(name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Body({ text }) {
  const parts = String(text).split(/(@[\w.]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("@") ? (
          <span key={index} className="rounded-md bg-primary/12 px-1 font-medium text-primary">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

function Quality({ score = 0, tip }) {
  return (
    <div className="glass-thin mt-2 w-full rounded-inner px-3 py-2 text-left">
      <div className="flex items-center gap-2">
        <span className="type-overline text-[9.5px]">Message quality</span>
        <span className="flex items-center gap-0.5" aria-label={`${score} out of 5`}>
          {[1, 2, 3, 4, 5].map((step) => (
            <Star
              key={step}
              className={cn(
                "h-2.5 w-2.5",
                step <= score ? "fill-warning text-warning" : "text-label-secondary/40"
              )}
            />
          ))}
        </span>
        <span className="terminal-font ml-auto text-[10px] text-label-secondary">{score}/5</span>
      </div>
      {tip ? <p className="type-caption mt-1 text-[11px]">{tip}</p> : null}
    </div>
  );
}

/** Team messages sit left, the player's own messages sit right. */
export default function ChatMessageRow({ message, ticket, active, onReply, onRetry }) {
  const mine = message.isPlayer;
  const stamp = timeLabel(message.sentAt);

  return (
    <div className={cn("flex gap-2.5", mine ? "flex-row-reverse" : null)}>
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold",
          mine || active ? "bg-primary/15 text-primary" : "bg-fill-strong text-label-secondary"
        )}
        aria-hidden="true"
      >
        {initials(message.author)}
      </div>

      <div className={cn("min-w-0 flex-1", mine ? "flex flex-col items-end" : null)}>
        <div
          className={cn(
            "flex w-full flex-wrap items-baseline gap-x-1.5 gap-y-1",
            mine ? "justify-end text-right" : null
          )}
        >
          <span className="type-headline text-[14px]">{message.author}</span>
          <span className="type-caption text-[11px]">{message.role}</span>
          {message.senior ? (
            <span className="rounded-full bg-warning/18 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-warning">
              joined
            </span>
          ) : null}
          {stamp ? (
            <span className="terminal-font text-[10px] tabular-nums text-label-secondary">{stamp}</span>
          ) : null}
          {ticket ? (
            <span
              className={cn(
                "terminal-font rounded-md bg-fill/90 px-1.5 py-0.5 text-[10px] text-label-secondary",
                mine ? null : "ml-auto"
              )}
            >
              {ticket.key}
            </span>
          ) : null}
        </div>

        <div
          className={cn(
            "glass-thin mt-2 max-w-[85%] rounded-inner px-4 py-3 text-left",
            mine ? "border-primary/25 bg-primary/[0.09]" : null
          )}
        >
          <p className="type-body whitespace-pre-wrap text-[13.5px] leading-[1.5]">
            <Body text={message.body} />
          </p>
        </div>

        {message.showReplies ? (
          <div className={cn("mt-2 flex flex-wrap gap-1.5", mine ? "justify-end" : null)}>
            {message.replies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                onClick={() => onReply(message.id, reply.id)}
                className="press min-h-[44px] rounded-full border border-primary/25 bg-primary/10 px-3.5 text-[12.5px] font-medium text-primary hover:bg-primary/16"
              >
                {reply.label}
              </button>
            ))}
          </div>
        ) : null}

        {message.status === "sending" || message.status === "retrying" ? (
          <p className={cn("type-caption mt-1 text-[10.5px]", mine ? "text-right" : null)}>Retrying…</p>
        ) : null}

        {message.status === "failed" ? (
          <p className={cn("mt-1 flex items-center gap-2 text-[10.5px] text-warning", mine ? "justify-end" : null)}>
            Not saved yet
            <button
              type="button"
              onClick={() => onRetry?.(message.id)}
              className="press rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 font-medium text-warning"
            >
              Retry
            </button>
          </p>
        ) : null}

        {message.answered ? (
          <p className="type-caption mt-1.5 w-full text-[11px]">you replied: {message.replies.find((reply) => reply.id === message.answered)?.label}</p>
        ) : null}

        {mine ? <Quality score={message.quality || 0} tip={message.tip} /> : null}
      </div>
    </div>
  );
}