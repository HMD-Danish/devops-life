import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { game } from "@/lib/gameApi";
import { trackEvent } from "@/lib/gameEvents";
import { usePlayer } from "@/lib/PlayerContext";
import { readActiveSaveId, writeActiveSaveId } from "@/lib/activeSave";
import { getProject } from "@/data/projects";
import {
  activeSteps,
  chatMessages,
  difficultyOf,
  hintCap,
  hintLevel,
  hintsUsed,
  progressPercent,
  projectScore,
  projectStep,
  stepCommandsMet,
  stepIndexOf,
} from "@/lib/projectEngine";
import { createChatQueue } from "@/lib/chatQueue";
import { CALM_WINDOW_MS, IDLE_REMINDER_MS, stampReleased } from "@/lib/chatTiming";
import { toIso } from "@/lib/realClock";
import { loadWorkspace, patchTickets } from "@/lib/workspaceStore";
import { createSaveBatcher } from "@/lib/saveBatcher";
import { readLocalCareer, writeLocalCareer } from "@/lib/localCareer";
import { markRequestWindow, requestsSince, RETRY_EVENT_NAME } from "@/lib/net";
import {
  canCompleteStep,
  chooseReply,
  detectIntent,
  detectTarget,
  replyDelaySeconds,
  scoreQuality,
  seniorReply,
  suggestionChips,
  trustDelta,
  validateMessage,
} from "@/lib/chatComposer";

const SEEN_WRITE_MS = 30000;
const CHAT_LIMIT = 50;
const MAX_CHAT = 280;

/** Only the last 50 rows of this project, read newest first then flipped. */
async function loadChatLog(saveId) {
  const data = await game("chat.list", { saveId }).catch(() => ({ rows: [] }));
  return Array.isArray(data?.rows) ? data.rows.slice(-CHAT_LIMIT) : [];
}

export default function useProject() {
  const { player } = usePlayer();
  // The workspace is built from this browser's own copy first, so a slow or rate
  // limited server is never the reason a player stares at a loading screen.
  const [cached] = useState(() => readLocalCareer(readActiveSaveId()));
  const [save, setSave] = useState(cached?.save || null);
  const [tickets, setTickets] = useState(cached?.tickets || []);
  const [services, setServices] = useState(cached?.services || []);
  const [resources, setResources] = useState(cached?.resources || []);
  const [chatLog, setChatLog] = useState(cached?.chatLog || []);
  const [loading, setLoading] = useState(!cached?.save);
  const [error, setError] = useState("");
  const [outbox, setOutbox] = useState([]);
  const [awayMs, setAwayMs] = useState(0);
  // The real device clock, ticking once a second with no requests behind it.
  const [now, setNow] = useState(() => Date.now());

  const saveRef = useRef(null);
  const commandsRef = useRef([]);
  const lastActivityRef = useRef(Date.now());
  const outboxRef = useRef([]);
  saveRef.current = save;
  outboxRef.current = outbox;

  const project = save?.project_key ? getProject(save.project_key) : null;

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // One chat write at a time, at most one per second, with its own retries.
  const queueRef = useRef(null);
  if (!queueRef.current) {
    queueRef.current = createChatQueue({
      send: (rows) => game("chat.append", { saveId: saveRef.current?.id, rows }).then((data) => data.rows || []),
      onStatus: (localIds, status) => {
        const key = localIds?.[0];
        if (!key || status === "sent") return;
        setOutbox((prev) => prev.map((job) => (job.key === key ? { ...job, status } : job)));
      },
    });
  }

  const syncingRef = useRef(false);

  /**
   * One read of the career and its project, four calls at most. It never puts a
   * spinner on screen by itself: whatever this browser already holds stays where
   * it is, and a failure simply means the local copy carries on.
   */
  const sync = useCallback(async () => {
    if (syncingRef.current) return undefined;
    syncingRef.current = true;
    const mark = markRequestWindow();

    try {
      const id = readActiveSaveId();
      // The server resolves the caller's own active career from the session.
      const data = await game("save.get", { saveId: id || undefined });
      let row = data?.save || null;
      let away = 0;

      if (row?.id) {
        writeActiveSaveId(row.id);
        // Time away is never counted against a deadline: the server shifts them.
        const resumed = await game("career.resume", { saveId: row.id }).catch(() => null);
        if (resumed?.save) row = resumed.save;
        away = Number(resumed?.awayMs) || 0;
      }

      const workspace = row?.id
        ? await loadWorkspace(row.id, row.project_key, { force: true })
        : { tickets: [], services: [], resources: [] };
      const chat = row?.id ? await loadChatLog(row.id) : [];

      setSave(row);
      setTickets(workspace.tickets);
      setServices(workspace.services);
      setResources(workspace.resources || []);
      setChatLog(chat);
      setAwayMs(away);
      setNow(Date.now());
      setError("");
      lastActivityRef.current = Date.now();
      if (row?.id) {
        writeLocalCareer(row.id, {
          save: row,
          tickets: workspace.tickets,
          services: workspace.services,
          resources: workspace.resources || [],
          chatLog: chat,
        });
      }
    } catch (err) {
      // With a copy on this device the player never sees this: the game carries on.
      if (!cached?.save) setError(err?.message || "The workspace could not load.");
    } finally {
      // One short line per load, so a request storm shows up immediately.
      const counted = requestsSince(mark);
      console.info(`[workspace] ${counted.total} requests`, counted.by);
      setLoading(false);
      syncingRef.current = false;
    }
    return undefined;
  }, [cached?.save]);

  useEffect(() => {
    sync();
  }, [sync]);

  // "Try again" on the offline note asks for one fresh read.
  useEffect(() => {
    const retry = () => {
      sync();
    };
    window.addEventListener(RETRY_EVENT_NAME, retry);
    return () => window.removeEventListener(RETRY_EVENT_NAME, retry);
  }, [sync]);

  /** Opens from the copy on this device when the server cannot be reached. */
  const openOffline = useCallback(() => {
    const local = cached || readLocalCareer(readActiveSaveId());
    if (!local?.save) return false;
    setSave(local.save);
    setTickets(local.tickets || []);
    setServices(local.services || []);
    setResources(local.resources || []);
    setChatLog(local.chatLog || []);
    setError("");
    setLoading(false);
    return true;
  }, [cached]);

  const hasLocalCopy = Boolean(cached?.save);

  // The only clock in the app: the player's own time, read from the device.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // One writer for the career row: fields are merged and leave together.
  const batcherRef = useRef(null);
  if (!batcherRef.current) {
    batcherRef.current = createSaveBatcher({
      write: (fields) => game("save.patch", { saveId: saveRef.current?.id, fields }),
    });
  }

  /** On screen at once, written by the batcher, or immediately when it matters. */
  const persist = useCallback(async (fields, options = {}) => {
    setSave((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...fields };
      // Kept on this device at the same moment the screen changes.
      writeLocalCareer(prev.id, { save: next });
      return next;
    });
    if (!saveRef.current?.id) return;
    batcherRef.current.queue(fields);
    if (options.immediate) await batcherRef.current.flush();
  }, []);

  // Whatever the panels change is copied to this device, with no request at all.
  useEffect(() => {
    const id = saveRef.current?.id;
    if (!id) return;
    writeLocalCareer(id, { tickets, services, resources, chatLog });
  }, [chatLog, resources, services, tickets]);

  // Whatever is waiting leaves when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => {
      batcherRef.current.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  // A quiet heartbeat, at most every 30 seconds, so a return knows the gap.
  useEffect(() => {
    if (!save?.id) return undefined;
    const id = setInterval(() => {
      if (!saveRef.current?.id) return;
      persist({ last_seen_at: new Date().toISOString() });
    }, SEEN_WRITE_MS);
    return () => clearInterval(id);
  }, [persist, save?.id]);

  /** Service changes made in the shell show on the dashboard without a write. */
  const applyServiceUpdates = useCallback((updates) => {
    const ids = Object.keys(updates || {});
    if (!ids.length) return;
    setServices((prev) =>
      prev.map((service) => (updates[service.id] ? { ...service, ...updates[service.id] } : service))
    );
  }, []);

  // A deadline this player let slip. Only Hard charges score for it.
  const missedSlas = useMemo(
    () =>
      tickets.filter((ticket) => {
        if (ticket.status === "resolved" || ticket.status === "closed") return false;
        const due = Date.parse(ticket.sla_due_at || "");
        return Number.isFinite(due) && due < now;
      }).length,
    [now, tickets]
  );

  const useHint = useCallback(
    async (stepKey) => {
      const row = saveRef.current;
      if (!row) return 0;
      markActivity();
      const ceiling = project ? hintCap(project, difficultyOf(row)) : 3;
      const level = Math.min(ceiling, hintLevel(row, stepKey) + 1);
      persist({ hints: { ...(row.hints || {}), [stepKey]: level } });
      // The server owns the ceiling: its answer replaces the guess above.
      try {
        const data = await game("hint.reveal", { saveId: row.id, stepKey, ceiling });
        trackEvent("hint_used", { projectId: project?.key, difficulty: difficultyOf(row) });
        const confirmed = Number(data?.level);
        if (Number.isFinite(confirmed) && confirmed !== level) {
          persist({ hints: { ...(row.hints || {}), [stepKey]: confirmed } });
        }
        return confirmed || level;
      } catch {
        return level;
      }
    },
    [markActivity, persist, project]
  );

  const reply = useCallback(
    (messageId, replyId) => {
      const row = saveRef.current;
      if (!row) return;
      markActivity();
      persist({ chat_replies: { ...(row.chat_replies || {}), [messageId]: replyId } });
    },
    [markActivity, persist]
  );

  const reportMistake = useCallback(
    (stepKey) => {
      const row = saveRef.current;
      if (!row || !stepKey) return;
      markActivity();
      const mistakes = { ...(row.mistakes || {}) };
      mistakes[stepKey] = (Number(mistakes[stepKey]) || 0) + 1;
      trackEvent("mistake", { projectId: project?.key, difficulty: difficultyOf(row) });
      persist({ mistakes });
    },
    [markActivity, persist, project]
  );

  const completeStep = useCallback(
    async (stepKey) => {
      const row = saveRef.current;
      if (!row || !project) return;
      markActivity();
      const already = Array.isArray(row.steps_done) ? row.steps_done : [];
      if (already.includes(stepKey)) return;
      const list = activeSteps(project, difficultyOf(row));
      const done = [...already, stepKey];
      const nextIndex = Math.min(list.filter((step) => done.includes(step.key)).length, list.length - 1);
      const scored = projectScore(project, { ...row, steps_done: done, step_index: nextIndex }, missedSlas);
      // A finished step is the moment worth a write of its own.
      persist({ steps_done: done, step_index: nextIndex, score: scored.total }, { immediate: true });

      const closing = tickets.find((ticket) => ticket.step_key === stepKey);
      const opening = tickets.find((ticket) => ticket.step_key === list[nextIndex]?.key);
      const updates = [];
      if (closing) {
        updates.push(
          game("ticket.set", { saveId: row.id, ticketId: closing.id, status: "resolved" }).catch(() => null)
        );
      }
      if (opening && opening.status === "open") {
        updates.push(
          game("ticket.set", { saveId: row.id, ticketId: opening.id, status: "in_progress" }).catch(() => null)
        );
      }
      await Promise.all(updates);

      const next = tickets.map((ticket) => {
        if (closing && ticket.id === closing.id) return { ...ticket, status: "resolved" };
        if (opening && ticket.id === opening.id) return { ...ticket, status: "in_progress" };
        return ticket;
      });
      setTickets(next);
      patchTickets(row.id, row.project_key, next);
    },
    [markActivity, missedSlas, persist, project, tickets]
  );

  /** Terminal activity is the only thing that can finish a terminal step. */
  const recordCommand = useCallback(
    async (command, shellHistory) => {
      const row = saveRef.current;
      const step = project ? projectStep(project, row) : null;
      if (!row || !step?.doneWhen?.length) return;
      markActivity();
      const prior = Array.isArray(shellHistory) && shellHistory.length ? shellHistory : commandsRef.current;
      commandsRef.current = [...prior, String(command || "")];
      const history = commandsRef.current.join("\n");
      if (stepCommandsMet(step, difficultyOf(row), history)) {
        await completeStep(step.key);
      }
    },
    [completeStep, markActivity, project]
  );

  // Scripted rows, everything already saved, and anything still in the outbox.
  // A calm channel mutes the reminder until its quiet window ends.
  const messages = useMemo(() => {
    if (!project || !save) return [];
    const calm = Number(save.manager_calm_until) || 0;
    const idle = now - lastActivityRef.current >= IDLE_REMINDER_MS;
    const scripted = chatMessages(project, save, now, {
      stampFor: (ids) => stampReleased(save.id, ids, now),
      hidePending: true,
    }).filter((message) => message.trigger !== "timer" || (idle && now >= calm));

    const live = chatLog
      .filter((message) => {
        const reveal = Date.parse(message.reveal_at || "");
        return !Number.isFinite(reveal) || reveal <= now;
      })
      .map((message) => ({
        id: message.id,
        author: message.author,
        role: message.author_role || (message.role === "player" ? "You" : "Team"),
        step: message.step_key,
        body: message.body,
        quality: message.quality,
        tip: message.tip,
        intent: message.intent,
        isPlayer: message.role === "player",
        senior: message.senior,
        sentAt: message.sent_at,
      }));

    const pending = outbox.map((job) => ({ ...job.row, status: job.status }));
    return [...scripted, ...live, ...pending];
  }, [chatLog, now, outbox, project, save]);

  /** Puts one write back in the queue, for the Retry button on a failed message. */
  const retryChat = useCallback((key) => {
    const job = outboxRef.current.find((item) => item.key === key);
    if (!job) return;
    setOutbox((prev) => prev.map((item) => (item.key === key ? { ...item, status: "sending" } : item)));
    queueRef.current.push({ rows: job.rows, localIds: [key] }).then((created) => {
      setOutbox((prev) => prev.filter((item) => item.key !== key));
      if (created?.length) setChatLog((prev) => [...prev, ...created]);
    });
  }, []);

  const step = project ? projectStep(project, save) : null;

  /**
   * Free text is understood in the browser: intent, target, checklist score and
   * a scripted reply. The message is on screen before the write is attempted.
   */
  const sendChat = useCallback(
    async (raw) => {
      const row = saveRef.current;
      if (!row || !project) return { ok: false, notice: "The project is still loading. Try again in a moment." };

      const recent = chatLog.filter((entry) => entry.role === "player").map((entry) => entry.body);
      const verdict = validateMessage(raw, recent.slice(-3));
      if (!verdict.ok) return verdict;

      const nowMs = Date.now();
      const stepNow = projectStep(project, row);
      const intent = detectIntent(verdict.text, project);
      const quality = scoreQuality(verdict.text, { project, step: stepNow });
      const target = detectTarget(verdict.text, project, chatMessages(project, row, nowMs));
      const replyText = chooseReply({ intent: intent.id, score: quality.score, target, project, step: stepNow });
      const delay = replyDelaySeconds(intent.id, quality.score);
      markActivity();

      const shared = {
        save_id: row.id,
        project_key: project.key,
        player_normalized_name: row.player_normalized_name || player || "",
        step_key: stepNow?.key || "",
        intent: intent.id,
      };

      // Real ISO timestamps only, through the safe helper.
      const rows = [
        {
          ...shared,
          role: "player",
          author: row.player_name || "You",
          author_role: "You",
          body: verdict.text.slice(0, MAX_CHAT),
          quality: quality.score,
          tip: quality.tip,
          sent_at: toIso(nowMs),
          reveal_at: toIso(nowMs),
          senior: false,
        },
        {
          ...shared,
          role: "team",
          author: replyText.author,
          author_role: replyText.role,
          body: String(replyText.body || "").slice(0, MAX_CHAT),
          quality: 0,
          tip: "",
          sent_at: toIso(nowMs + delay * 1000),
          reveal_at: toIso(nowMs + delay * 1000),
          senior: false,
        },
      ];

      const senior = intent.id === "escalate" && quality.score >= 4 ? seniorReply(project, stepNow) : null;
      if (senior) {
        rows.push({
          ...shared,
          role: "team",
          author: senior.author,
          author_role: senior.role,
          body: String(senior.body || "").slice(0, MAX_CHAT),
          quality: 0,
          tip: "",
          sent_at: toIso(nowMs + (delay + 10) * 1000),
          reveal_at: toIso(nowMs + (delay + 10) * 1000),
          senior: true,
        });
      }

      // Saved in the browser first: the line appears before the network is asked.
      const key = `local-${nowMs}-${Math.random().toString(16).slice(2, 8)}`;
      setOutbox((prev) => [
        ...prev,
        {
          key,
          rows,
          status: "sending",
          row: {
            id: key,
            author: rows[0].author,
            role: "You",
            step: shared.step_key,
            body: rows[0].body,
            quality: quality.score,
            tip: quality.tip,
            intent: intent.id,
            isPlayer: true,
            senior: false,
            sentAt: rows[0].sent_at,
          },
        },
      ]);

      queueRef.current.push({ rows, localIds: [key] }).then((created) => {
        setOutbox((prev) => prev.filter((item) => item.key !== key));
        if (created?.length) setChatLog((prev) => [...prev, ...created]);
      });

      const delta = trustDelta(intent.id, quality.score);
      const fields = {};
      if (delta) {
        fields.team_trust = Math.max(0, Math.min(100, (Number(row.team_trust ?? 100) || 0) + delta));
      }
      // A complete update buys three quiet minutes; the reminder stays off.
      if (intent.id === "status_update" && quality.score >= 4) {
        fields.manager_calm_until = Date.now() + CALM_WINDOW_MS;
      }
      if (Object.keys(fields).length) await persist(fields);

      if (canCompleteStep(stepNow, intent.id, quality.score)) await completeStep(stepNow.key);

      return { ok: true, intent: intent.label, quality: quality.score, tip: quality.tip, replyIn: delay };
    },
    [chatLog, completeStep, markActivity, persist, player, project]
  );

  const lastAuthor = useMemo(
    () => [...messages].reverse().find((message) => !message.isPlayer)?.author || "",
    [messages]
  );

  // Chips follow the step and the level, never the ticking clock.
  const suggestions = useMemo(() => {
    if (!project || !save) return [];
    const level = difficultyOf(save);
    const list = activeSteps(project, level);
    const index = Math.max(0, list.findIndex((item) => item.key === step?.key));
    return suggestionChips({ project, level, step, stepIndex: index, lastAuthor });
  }, [lastAuthor, project, save, step]);

  return {
    loading,
    error,
    save,
    project,
    step,
    stepNumber: project ? stepIndexOf(project, step?.key, difficultyOf(save)) + 1 : 0,
    progress: progressPercent(project, save),
    hintsUsed: hintsUsed(save),
    hintLevelFor: (stepKey) => hintLevel(save || {}, stepKey),
    difficulty: difficultyOf(save),
    hintCeiling: project ? hintCap(project, difficultyOf(save)) : 3,
    score: project && save ? projectScore(project, save, missedSlas) : null,
    missedSlas,
    tickets: tickets.filter((ticket) => !project || ticket.project_key === project.key),
    services,
    resources,
    applyServiceUpdates,
    messages,
    suggestions,
    sendChat,
    retryChat,
    now,
    awayMs,
    useHint,
    chooseReply: reply,
    reportMistake,
    completeStep,
    recordCommand,
    reload: sync,
    openOffline,
    hasLocalCopy,
  };
}