import { useEffect, useRef, useState } from "react";
import { ArrowUp, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_CHAT_LENGTH } from "@/data/chatRules";
import { cn } from "@/lib/utils";

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 96;

/**
 * The free-text composer. Chips fill the box so the player can edit before
 * sending; everything the message means is decided by the rule engine.
 */
export default function ChatComposer({ suggestions = [], onSend, level = "medium" }) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  const remaining = MAX_CHAT_LENGTH - text.length;

  // Two lines at rest, up to four while typing, then it scrolls.
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, field.scrollHeight))}px`;
  }, [text]);

  const submit = async () => {
    if (sending || !onSend) return;
    setSending(true);
    setNotice("");
    try {
      const result = await onSend(text);
      if (!result?.ok) {
        setNotice(result?.notice || "That message could not be sent.");
        return;
      }
      setText("");
    } catch {
      setNotice("The message could not be saved. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const fillFromChip = (chip) => {
    setText(chip.slice(0, MAX_CHAT_LENGTH));
    setNotice("");
    inputRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 border-t border-separator/50 px-4 pb-3 pt-2.5">
      {suggestions.length ? (
        <div className="mb-2 flex max-h-[88px] gap-2 overflow-x-auto pb-1">
          {suggestions.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => fillFromChip(chip)}
              className="glass-thin press flex min-h-[44px] w-[190px] shrink-0 items-center rounded-2xl px-3 py-1.5 text-left"
            >
              <span className="line-clamp-2 text-[12px] leading-4 text-label/85">{chip}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value.slice(0, MAX_CHAT_LENGTH));
            if (notice) setNotice("");
          }}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_CHAT_LENGTH}
          placeholder={level === "easy" ? "Write your update — tap a suggestion" : "Your message to the team"}
          aria-label="Message the team"
          className="type-body min-h-[56px] flex-1 resize-none overflow-y-auto rounded-inner border border-separator/70 bg-surface/60 px-3 py-2 text-[13.5px] leading-5 outline-none transition-colors duration-250 ease-spring placeholder:text-label-secondary/70 focus:border-primary/50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || !text.trim()}
          aria-label={sending ? "Sending" : "Send message"}
          className={cn(
            "press mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            sending || !text.trim()
              ? "bg-fill-strong text-label-secondary"
              : "bg-primary text-primary-foreground"
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3">
        {notice ? (
          <p className="type-caption text-[10.5px] text-danger" role="status">
            {notice}
          </p>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About these replies"
                  className="press flex h-5 w-5 items-center justify-center rounded-full text-label-secondary/80 hover:text-label"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Rule-based replies · no AI, no external chat service</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <span className="terminal-font shrink-0 text-[10px] tabular-nums text-label-secondary">{remaining}</span>
      </div>
    </div>
  );
}