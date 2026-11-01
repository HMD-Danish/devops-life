/**
 * Difficulty is a choice the player makes before a project starts. Everything a
 * level changes lives in the project definitions; this file only names the
 * levels, their copy, and remembers the pick in the browser until a career is
 * created.
 */
const KEY = "devopslife.difficulty";

export const DEFAULT_DIFFICULTY = "medium";

export const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    tagline: "Guided",
    summary: "A supervised first week. Someone is always a message away.",
    points: [
      "Fewer steps and long SLAs",
      "Chat is clear about what is wrong",
      "All three Tech Lead hint levels",
      "Mistakes are forgiven with a friendly nudge",
    ],
  },
  {
    id: "medium",
    label: "Medium",
    tagline: "Realistic",
    summary: "A normal sprint. The information you need exists, somewhere.",
    points: [
      "The full step count",
      "Normal SLAs",
      "Some messages are vague",
      "One red herring per project",
      "Tech Lead level 3 costs score",
    ],
  },
  {
    id: "hard",
    label: "Hard",
    tagline: "On-call reality",
    summary: "Paged at 09:12 with no context and everyone watching the channel.",
    points: [
      "Most steps, tight SLAs",
      "Messy or incomplete messages",
      "Two or more red herrings",
      "Cascading problems — the first symptom is not the root cause",
      "Tech Lead stops at level 2, every hint costs score",
    ],
  },
];

export function normalizeDifficulty(value) {
  return DIFFICULTIES.some((item) => item.id === value) ? value : DEFAULT_DIFFICULTY;
}

export function difficultyMeta(value) {
  const level = normalizeDifficulty(value);
  return DIFFICULTIES.find((item) => item.id === level);
}

export function readDifficulty() {
  if (typeof window === "undefined") return DEFAULT_DIFFICULTY;
  return normalizeDifficulty(window.localStorage.getItem(KEY));
}

export function writeDifficulty(level) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, normalizeDifficulty(level));
}