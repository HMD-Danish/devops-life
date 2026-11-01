import { useEffect, useRef, useState } from "react";
import GlassPanel from "@/components/glass/GlassPanel";
import Logo from "@/components/glass/Logo";
import useShell from "@/hooks/useShell";
import { commandAllowed, commandName } from "@/lib/projectEngine";
import { cn } from "@/lib/utils";

const TONE = {
  err: "text-[#FF8A8A]",
  ok: "text-[#63E6A8]",
  warn: "text-[#FFC46B]",
  muted: "text-[#98A1B2]",
  head: "text-[#9EC5FF]",
  dim: "text-[#767F8F]",
};

export default function TerminalPanel({ project, save, services, resources, onCommand, onMistake, onServiceUpdates }) {
  const shell = useShell({ save, services, resources });
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(-1);
  const endRef = useRef(null);
  const bootedRef = useRef(false);
  const saveId = save?.id;

  useEffect(() => {
    if (!saveId || bootedRef.current) return;
    bootedRef.current = true;
    shell.boot();
  }, [saveId, shell]);

  // The shell keeps its own state in this browser; leaving writes it out.
  useEffect(() => () => shell.flush(), [shell.flush]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [shell.lines.length]);

  const submit = async (event) => {
    event.preventDefault();
    const command = input.trim();
    if (!command || shell.busy) return;
    setInput("");
    setCursor(-1);

    if (!commandAllowed(project, command)) {
      shell.append([
        { text: `${command}`, tone: "cmd" },
        { text: `bash: ${commandName(command)}: command not found`, tone: "err" },
      ]);
      onMistake?.(command);
      return;
    }
    const data = await shell.run(command);
    onServiceUpdates?.(data?.serviceUpdates);
    const failed = data?.error || (Array.isArray(data?.lines) && data.lines.some((line) => line.tone === "err"));
    if (failed) onMistake?.(command);
    else onCommand?.(command, data?.history);
  };

  const onKeyDown = async (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const list = shell.history;
      if (!list.length) return;
      const next = Math.min(list.length - 1, (cursor < 0 ? list.length : cursor) - 1);
      setCursor(next);
      setInput(list[next] || "");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const list = shell.history;
      if (cursor < 0) return;
      const next = cursor + 1;
      if (next >= list.length) {
        setCursor(-1);
        setInput("");
      } else {
        setCursor(next);
        setInput(list[next] || "");
      }
    } else if (event.key === "Tab") {
      event.preventDefault();
      const candidates = shell.complete(input);
      if (candidates.length === 1) setInput(`${candidates[0]} `);
      else if (candidates.length > 1) shell.append([{ text: candidates.join("  "), tone: "muted" }]);
    }
  };

  return (
    <GlassPanel className="flex h-full min-h-0 flex-col overflow-hidden bg-[#080B10]/95">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
        <Logo size={16} decorative />
        <span className="terminal-font text-[11px] uppercase tracking-[0.1em] text-white/55">
          {project?.terminal?.host || "bastion"}
        </span>
        <span className="ml-auto hidden text-[10.5px] text-white/40 sm:inline">↑ ↓ history · tab completes</span>
      </div>

      <div className="terminal-font min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[14px] leading-[1.6]">
        {shell.lines.map((line) => (
          <div
            key={line.id}
            className={cn(
              "whitespace-pre-wrap break-words",
              line.tone === "cmd" ? "text-white" : TONE[line.tone] || "text-[#D6DBE4]"
            )}
          >
            {line.tone === "cmd" ? <span className="text-[#63E6A8]/75">{shell.prompt} </span> : null}
            {line.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 py-2">
        <label htmlFor="terminal-input" className="terminal-font shrink-0 text-[14px] text-[#63E6A8]">
          {shell.prompt}
        </label>
        <input
          id="terminal-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          disabled={shell.busy}
          placeholder={shell.busy ? "running…" : ""}
          className="terminal-font h-11 min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/25 focus-visible:outline-none"
          aria-label="Terminal command"
        />
      </form>
    </GlassPanel>
  );
}