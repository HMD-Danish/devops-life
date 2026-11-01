import { useEffect, useRef } from "react";
import GlassPanel from "@/components/glass/GlassPanel";
import Logo from "@/components/glass/Logo";
import ChatMessageRow from "@/components/project/ChatMessageRow";
import ChatComposer from "@/components/project/ChatComposer";

export default function ChatPanel({
  messages,
  tickets,
  onReply,
  onRetry,
  currentStepKey,
  onSend,
  suggestions = [],
  level = "medium",
}) {
  const scrollRef = useRef(null);
  const ticketFor = (stepKey) => tickets.find((ticket) => ticket.step_key === stepKey);

  // The newest message stays in view: the list follows the thread end.
  useEffect(() => {
    const list = scrollRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  return (
    <GlassPanel className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-separator/50 px-4 py-2.5">
        <h2 className="type-headline text-[14px]">Project chat</h2>
        <span className="type-caption ml-auto hidden truncate text-[11px] min-[420px]:inline">scripted team</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="glass-thin flex h-11 w-11 items-center justify-center rounded-full">
              <Logo size={24} decorative />
            </span>
            <p className="type-caption max-w-[220px]">No messages yet. The team speaks when work moves.</p>
          </div>
        ) : null}

        {messages.map((message) => (
          <ChatMessageRow
            key={message.id}
            message={message}
            ticket={ticketFor(message.step)}
            active={message.step === currentStepKey}
            onReply={onReply}
            onRetry={onRetry}
          />
        ))}
      </div>

      <ChatComposer suggestions={suggestions} onSend={onSend} level={level} />
    </GlassPanel>
  );
}