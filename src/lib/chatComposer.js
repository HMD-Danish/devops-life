/**
 * Rule-based understanding for player chat. Pure functions, no network, no AI:
 * normalise → validate → detect intent and target → score quality → pick a
 * scripted reply from the project's pools.
 */
import { normalizeDifficulty } from "@/data/difficulty";
import {
  BLOCKED_WORDS,
  INTENTS,
  LEAD_ROLE_WORDS,
  MAX_CHAT_LENGTH,
  NEUTRAL_REPLY,
  OFF_TOPIC_WORDS,
  QUALITY_CHECKS,
  QUALITY_TIPS,
  REPLY_POOLS,
  SENIOR_ROLE_WORDS,
  SUGGESTIONS,
} from "@/data/chatRules";

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9@'.:/_ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Empty, spam, gibberish and rude text never reaches the thread. */
export function validateMessage(text, recentTexts = []) {
  const clean = String(text || "").trim();
  const norm = normalizeText(clean);
  if (!norm) {
    return { ok: false, notice: "Write a message first — the team can only answer what you actually say." };
  }
  if (clean.length > MAX_CHAT_LENGTH) {
    return { ok: false, notice: `Keep it under ${MAX_CHAT_LENGTH} characters.` };
  }
  if (/(.)\1{5,}/.test(norm) || /^(.{1,3})\1+$/.test(norm)) {
    return { ok: false, notice: "That does not read as a message. Try a sentence the team can act on." };
  }
  if (norm.replace(/[^a-z]/g, "").length < 3) {
    return { ok: false, notice: "Too short to be useful. Add a few words." };
  }
  if (BLOCKED_WORDS.some((word) => norm.includes(word))) {
    return { ok: false, notice: "That wording will not fly in this channel. Say it plainly and send again." };
  }
  if (recentTexts.map(normalizeText).includes(norm)) {
    return { ok: false, notice: "You already sent that. Add something new the team can act on." };
  }
  return { ok: true, text: clean };
}

/** Reporting a fix, escalating or asking for access outweighs any ETA wording. */
const DECISIVE_INTENTS = ["fix_done", "escalate", "ask_access"];
/** An ETA is only the intent when nothing else fits: "update in 10" is an update. */
const SECONDARY_INTENTS = ["give_eta"];

/** Which intent the text belongs to, by keyword group hits. */
export function detectIntent(text, project) {
  const norm = normalizeText(text);
  const rules = project?.chatIntents || INTENTS;
  const matches = [];

  rules.forEach((intent) => {
    const hits = intent.keywords.filter((keyword) => norm.includes(keyword));
    if (!hits.length) return;
    const longest = Math.max(...hits.map((keyword) => keyword.split(" ").length));
    matches.push({ id: intent.id, label: intent.label, keywords: hits, score: hits.length * 2 + longest });
  });

  const primary = matches.filter((match) => !SECONDARY_INTENTS.includes(match.id));
  const decisive = primary.filter((match) => DECISIVE_INTENTS.includes(match.id));
  const pool = decisive.length ? decisive : primary.length ? primary : matches;
  const best = pool.reduce((winner, match) => (!winner || match.score > winner.score ? match : winner), null);

  if (best) return best;
  if (OFF_TOPIC_WORDS.some((word) => norm.includes(word))) {
    return { id: "off_topic", label: "Off topic", keywords: [], score: 0 };
  }
  return { id: "neutral", label: "Neutral", keywords: [], score: 0 };
}

/** Everybody who speaks in this project, in the order they first appear. */
export function projectCast(project) {
  const seen = new Map();
  (project?.messages || []).forEach((message) => {
    if (!message.author || seen.has(message.author)) return;
    seen.set(message.author, { name: message.author, role: message.role || "Teammate" });
  });
  return [...seen.values()];
}

function firstName(name) {
  return String(name || "").split(" ")[0].toLowerCase();
}

/** @mention wins, then the author of the last message, then the project lead. */
export function detectTarget(text, project, rows = []) {
  const norm = normalizeText(text);
  const cast = projectCast(project);

  const mentioned = cast.find((person) => {
    const full = person.name.toLowerCase();
    return norm.includes(`@${full}`) || norm.includes(`@${firstName(person.name)}`);
  });
  if (mentioned) return mentioned;

  const lastTeam = [...rows].reverse().find((row) => row.author && !row.isPlayer);
  const known = lastTeam && cast.find((person) => person.name === lastTeam.author);
  if (known) return known;

  const lead = cast.find((person) => LEAD_ROLE_WORDS.some((word) => person.role.toLowerCase().includes(word)));
  return lead || cast[0] || { name: "The team", role: "Teammate" };
}

function stepContext(project, step) {
  const words = String(`${step?.ticket?.title || ""} ${step?.title || ""}`)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  const services = (project?.services || []).map((service) => String(service.name || "").toLowerCase());
  return { words, services };
}

/** 0 to 5 over the five checkpoints, with length as a modifier. */
export function scoreQuality(text, { project, step } = {}) {
  const norm = normalizeText(text);
  const words = norm.split(" ").filter(Boolean);
  const context = stepContext(project, step);

  const matched = QUALITY_CHECKS.filter((check) => {
    const dynamic = check.id === "problem" ? [...context.services, ...context.words] : [];
    return [...check.keywords, ...dynamic].some((keyword) => keyword && norm.includes(keyword));
  }).map((check) => check.id);

  let score = matched.length;
  if (words.length < 6) score -= 1;
  if (words.length > 45) score -= 1;
  score = Math.max(0, Math.min(5, score));

  const missing = QUALITY_CHECKS.map((check) => check.id).filter((id) => !matched.includes(id));
  const tip =
    score >= 5
      ? QUALITY_TIPS.complete
      : words.length < 6 && missing.length
        ? QUALITY_TIPS.length
        : QUALITY_TIPS[missing[0] || "problem"];

  return { score, matched, missing, tip, words: words.length };
}

function fill(text, { project, step, target }) {
  const service = project?.services?.[0]?.name || "the service";
  return String(text || "")
    .replace(/\{ticket\}/g, step?.title || "the ticket")
    .replace(/\{service\}/g, service)
    .replace(/\{lead\}/g, target ? firstName(target.name) : "team")
    .replace(/\{player\}/g, "you");
}

function tierFor(score) {
  if (score >= 4) return "high";
  if (score >= 2) return "mid";
  return "low";
}

/** Scripted reply: intent × quality tier, spoken by the detected target. */
export function chooseReply({ intent, score, target, project, step }) {
  const pools = project?.chatReplyPools || REPLY_POOLS;
  const intentPool = pools[intent] || pools.neutral || {};
  const tier = intent === "off_topic" ? "high" : tierFor(score);
  const bodies = intentPool[tier] || intentPool.mid || [];
  const body = bodies.length ? bodies[(score + (step?.key?.length || 0)) % bodies.length] : NEUTRAL_REPLY;

  return {
    author: target?.name || "The team",
    role: target?.role || "Teammate",
    body: fill(body, { project, step, target }),
    tier,
  };
}

/** A good escalation pulls the most senior person in the cast into the thread. */
export function seniorReply(project, step) {
  const cast = projectCast(project);
  const senior = cast.find((person) => SENIOR_ROLE_WORDS.some((word) => person.role.toLowerCase().includes(word)));
  if (!senior) return null;
  return {
    author: senior.name,
    role: senior.role,
    body: fill(
      "I am in. Give me the current state of {ticket} and I will take the database side while you keep the logs open.",
      { project, step, target: senior }
    ),
  };
}

/** Real seconds before the reply lands, so the team answers a beat later. */
export function replyDelaySeconds(intent, score) {
  if (intent === "escalate") return 20;
  if (intent === "fix_done") return 30;
  if (intent === "off_topic") return 60;
  return score >= 4 ? 25 : score >= 2 ? 40 : 60;
}

/** Team trust moves only on the message that was actually sent. */
export function trustDelta(intent, score) {
  if (intent === "off_topic") return -2;
  if (score >= 4) {
    if (intent === "status_update") return 4;
    if (intent === "escalate") return 3;
    if (intent === "fix_done") return 3;
    if (intent === "give_eta") return 2;
    return 2;
  }
  if (score >= 2) return 0;
  // Only a vague update costs trust; a vague question just gets a question back.
  if (["status_update", "fix_done", "give_eta", "escalate"].includes(intent)) return -5;
  return 0;
}

/** A correct fix report can close a communication step. */
export function canCompleteStep(step, intent, score) {
  return !!step?.doneOnReply && intent === "fix_done" && score >= 4;
}

/** Three chips for the current step and level, rotating as the step advances. */
export function suggestionChips({ project, level, step, stepIndex = 0, lastAuthor }) {
  const difficulty = normalizeDifficulty(level);
  const pool = SUGGESTIONS[difficulty] || SUGGESTIONS.medium;
  const cast = projectCast(project);
  const target =
    cast.find((person) => person.name === lastAuthor) ||
    cast.find((person) => LEAD_ROLE_WORDS.some((word) => person.role.toLowerCase().includes(word))) ||
    cast[0] ||
    null;

  const filled = pool.map((template) => fill(template, { project, step, target }));
  const offset = (stepIndex * 3) % filled.length;
  return [0, 1, 2].map((index) => filled[(offset + index) % filled.length]);
}