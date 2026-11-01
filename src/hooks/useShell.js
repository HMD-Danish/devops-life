import { useCallback, useRef, useState } from "react";
import { openShell, shellBoot, shellRun, shellComplete, flushShell } from "@/lib/terminal/engine";

/**
 * The simulated shell, running entirely in this browser.
 *
 * No command touches the network: the engine resolves it against the project's
 * seeded filesystem and the save's services, exactly as before. Only the shell's
 * own state is written — to this browser, not to the server.
 */
export default function useShell({ save, services, resources }) {
  const [lines, setLines] = useState([]);
  const [prompt, setPrompt] = useState("engineer@bastion:~/repo$");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const stateRef = useRef(null);

  const engine = useCallback(() => {
    if (!stateRef.current || stateRef.current.save?.id !== save?.id) {
      stateRef.current = openShell({ save, services, resources });
    }
    return stateRef.current;
  }, [resources, save, services]);

  const append = useCallback((items) => {
    setLines((prev) => {
      const next = [
        ...prev,
        ...items.map((item) => ({ id: (seq.current += 1), text: item.text ?? "", tone: item.tone })),
      ];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  }, []);

  const take = useCallback(
    (data) => {
      if (!data) return null;
      if (Array.isArray(data.lines) && data.lines.length) {
        if (data.lines.some((line) => line.text === "\u001bCLEAR")) setLines([]);
        else append(data.lines.filter((line) => line.text !== "\u001bCLEAR"));
      }
      if (data.prompt) setPrompt(data.prompt);
      if (Array.isArray(data.history)) setHistory(data.history);
      return data;
    },
    [append]
  );

  const boot = useCallback(() => {
    if (!save?.id) return;
    const state = engine();
    take(shellBoot(state));
  }, [engine, save?.id, take]);

  const run = useCallback(
    async (input) => {
      const command = String(input || "").trim();
      if (!command) return null;
      append([{ text: command, tone: "cmd", prompt }]);
      setBusy(true);
      try {
        return take(await shellRun(engine(), command));
      } finally {
        setBusy(false);
      }
    },
    [append, engine, prompt, take]
  );

  const complete = useCallback(
    (input) => shellComplete(engine(), input),
    [engine]
  );

  const flush = useCallback(() => {
    flushShell(stateRef.current);
  }, []);

  return { lines, prompt, history, busy, boot, run, complete, append, flush };
}