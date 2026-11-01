// The whole simulation is derived from project data plus a few numbers on the
// save. Nothing here calls a backend or an AI model. Difficulty only ever picks
// between variants that are already written in the project definition.
import { normalizeDifficulty } from "@/data/difficulty";
import { elapsedMs } from "@/lib/realClock";
import { followUpDelayMs } from "@/lib/chatTiming";

export const MAX_HINT_LEVEL = 3;

export function difficultyOf(save) {
  return normalizeDifficulty(save?.difficulty);
}

/** What the chosen level changes for one project, straight from its data. */
export function projectLevels(project, difficulty) {
  const level = normalizeDifficulty(difficulty);
  const config = project?.difficulty?.[level] || {};
  return {
    level,
    steps:
      Array.isArray(config.steps) && config.steps.length
        ? config.steps
        : (project?.steps || []).map((step) => step.key),
    hintCeiling: Math.min(MAX_HINT_LEVEL, Number(config.hintCeiling) || MAX_HINT_LEVEL),
    scoreMultiplier: Number(config.scoreMultiplier) || 1,
    redHerrings: Array.isArray(config.redHerrings) ? config.redHerrings : [],
  };
}

export function activeSteps(project, difficulty) {
  if (!project) return [];
  const { steps } = projectLevels(project, difficulty);
  return steps.map((key) => project.steps.find((step) => step.key === key)).filter(Boolean);
}

/**
 * Real minutes a step gets at each level. Easy is generous and never costs
 * score, Medium is roughly an hour, Hard is a twenty-five minute window.
 */
export const SLA_MINUTES = { easy: 240, medium: 60, hard: 25 };

/** SLA and required sub-steps for this step at this level. */
export function stepVariant(step, difficulty) {
  const level = normalizeDifficulty(difficulty);
  const variant = step?.variants?.[level] || {};
  return {
    slaMinutes: SLA_MINUTES[level] || SLA_MINUTES.medium,
    subSteps: Math.max(1, Number(variant.subSteps) || 1),
  };
}

export function projectStep(project, save) {
  const list = activeSteps(project, difficultyOf(save));
  if (!list.length) return null;
  const index = Math.min(Math.max(Number(save?.step_index) || 0, 0), list.length - 1);
  return list[index];
}

export function stepIndexOf(project, key, difficulty) {
  return activeSteps(project, difficulty).findIndex((step) => step.key === key);
}

export function stepsDone(save) {
  return Array.isArray(save?.steps_done) ? save.steps_done : [];
}

export function isStepDone(save, key) {
  return stepsDone(save).includes(key);
}

export function activeDoneCount(project, save) {
  const done = new Set(stepsDone(save));
  return activeSteps(project, difficultyOf(save)).filter((step) => done.has(step.key)).length;
}

export function progressPercent(project, save) {
  const list = activeSteps(project, difficultyOf(save));
  if (!list.length) return 0;
  return Math.round((activeDoneCount(project, save) / list.length) * 100);
}

export function hintLevel(save, stepKey) {
  return Math.max(0, Math.min(MAX_HINT_LEVEL, Number(save?.hints?.[stepKey]) || 0));
}

export function hintCap(project, difficulty) {
  return projectLevels(project, difficulty).hintCeiling;
}

export function hintsUsed(save) {
  const hints = save?.hints || {};
  return Object.values(hints).reduce((sum, level) => sum + (Number(level) || 0), 0);
}

export function fillPlayer(text, playerName) {
  return String(text || "").replace(/\{player\}/g, playerName || "there");
}

/** The binary a command starts with, ignoring env assignments. */
export function commandName(input) {
  const tokens = String(input || "").trim().split(/\s+/);
  const first = tokens.find((token) => !token.includes("=")) || "";
  return first.split("/").pop();
}

export function commandAllowed(project, input) {
  const allowed = project?.terminal?.allowed || [];
  const name = commandName(input);
  if (!name) return true;
  return allowed.includes(name);
}

/** True when the commands seen so far cover this step's required sub-steps. */
export function stepCommandsMet(step, difficulty, history) {
  const patterns = step?.doneWhen || [];
  if (!patterns.length) return false;
  const needed = Math.min(patterns.length, stepVariant(step, difficulty).subSteps);
  return patterns.slice(0, needed).every((pattern) => history.includes(pattern));
}

function releaseBase(project, save, nowMs) {
  const level = difficultyOf(save);
  const config = projectLevels(project, level);
  const done = new Set(stepsDone(save));
  const currentIndex = stepIndexOf(project, projectStep(project, save)?.key, level);
  const mistakes = save?.mistakes || {};
  // Real seconds the project has actually been played, so time away is skipped.
  const elapsed = elapsedMs(save, nowMs) / 1000;
  const released = new Set();

  project.messages.forEach((message) => {
    if (message.redHerring && !config.redHerrings.includes(message.id)) return;
    const index = stepIndexOf(project, message.step, level);
    switch (message.trigger) {
      case "project_start":
        released.add(message.id);
        break;
      case "step_start":
        if (index > -1 && index <= currentIndex) released.add(message.id);
        break;
      case "step_done":
        if (done.has(message.step)) released.add(message.id);
        break;
      case "incident_start":
        released.add(message.id);
        break;
      case "incident_end":
        if (activeDoneCount(project, save) >= activeSteps(project, level).length) released.add(message.id);
        break;
      case "mistake":
        if ((Number(mistakes[message.step]) || 0) > 0) released.add(message.id);
        break;
      case "timer": {
        // Real seconds in from the start: the nudge waits a beat, never a month.
        const dueSeconds = Math.min(60, Math.max(20, (Number(message.atMinute) || 0) * 2));
        if (elapsed >= dueSeconds) released.add(message.id);
        break;
      }
      default:
        break;
    }
  });

  // A chosen quick reply releases the message it points at.
  const replies = save?.chat_replies || {};
  project.messages.forEach((message) => {
    const chosen = replies[message.id];
    if (!chosen) return;
    const reply = (message.replies || []).find((item) => item.id === chosen);
    if (reply?.next) released.add(reply.next);
  });

  return released;
}

function bodyFor(message, level) {
  return message?.variants?.[level]?.body || message?.body;
}

/**
 * Every scripted row that is available right now.
 * `options.stampFor(ids)` gives the real time each message became available, and
 * `options.hidePending` drops the ones still waiting out their follow-up delay.
 */
export function chatMessages(project, save, nowMs = Date.now(), options = {}) {
  if (!project) return [];
  const { stampFor = null, hidePending = false } = options;
  const level = difficultyOf(save);
  const released = releaseBase(project, save, nowMs);
  const stamps = typeof stampFor === "function" ? stampFor([...released]) || {} : {};
  const replies = save?.chat_replies || {};
  const rows = project.messages
    .filter((message) => released.has(message.id))
    .map((message) => {
      const stamp = Number(stamps[message.id]) || nowMs;
      return {
        ...message,
        body: fillPlayer(bodyFor(message, level), save?.player_name),
        answered: replies[message.id] || null,
        sentAt: new Date(stamp).toISOString(),
        showAt: stamp + (hidePending ? followUpDelayMs(message.trigger) : 0),
      };
    })
    .filter((row) => !hidePending || row.showAt <= nowMs);

  // Only the newest unanswered question offers buttons.
  const pending = [...rows].reverse().find((row) => row.replies?.length && !row.answered);
  return rows.map((row) => ({
    ...row,
    showReplies: !!pending && pending.id === row.id,
  }));
}

export function openIncidentCount(project, save) {
  if (!project) return 0;
  const list = activeSteps(project, difficultyOf(save));
  const finished = activeDoneCount(project, save) >= list.length;
  return finished ? 0 : (project.incidents || []).length;
}

export function currentRuntime(project, save) {
  if (!project) return null;
  const done = stepsDone(save);
  const latest = [...activeSteps(project, difficultyOf(save))]
    .reverse()
    .find((step) => done.includes(step.key) && step.runtime);
  return latest?.runtime || project.runtime || null;
}

export function currentBuild(project, save) {
  if (!project) return null;
  const done = stepsDone(save);
  const latest = [...activeSteps(project, difficultyOf(save))]
    .reverse()
    .find((step) => done.includes(step.key) && step.build);
  return latest?.build || project.build || null;
}

/**
 * Score = closed steps minus what they cost, times the level's multiplier.
 * Penalties come from the project's own difficulty block, so a project can
 * decide how forgiving each level is.
 */
export function projectScore(project, save, missedSlas = 0) {
  const level = difficultyOf(save);
  const config = projectLevels(project, level);
  const done = activeDoneCount(project, save);
  const elapsed = Math.round(elapsedMs(save) / 60000);
  const mistakes = Object.values(save?.mistakes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const hints = hintsUsed(save);
  const fullSteps = Object.values(save?.hints || {}).filter((value) => Number(value) >= 3).length;

  let penalty = mistakes * 20;
  if (level === "easy") penalty = Math.round(penalty / 2);
  if (level === "medium") penalty += fullSteps * 25;
  // Only Hard charges for a deadline it made you miss, and only a little.
  if (level === "hard") penalty += hints * 15 + Math.max(0, Number(missedSlas) || 0) * 10;

  const base = Math.max(0, done * 100 - penalty);
  return {
    total: Math.round(base * config.scoreMultiplier),
    base,
    steps: done,
    stepsTotal: activeSteps(project, level).length,
    mistakes,
    hints,
    elapsed,
    multiplier: config.scoreMultiplier,
    level,
  };
}