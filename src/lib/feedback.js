/**
 * Feedback helpers shared by the modal: the profile link, the plain-text version
 * that goes to the clipboard when saving fails, and the visitor's hourly quota.
 * The quota is a courtesy counter in this browser — the server holds the real one.
 */
export const LINKEDIN_URL = "https://www.linkedin.com/in/hakeem-mohammad-danish-631188324";

const QUOTA_KEY = "devopslife.feedback.sent";
const PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

export const CATEGORY_LABELS = { bug: "Bug", idea: "Idea", content: "Content", design: "Design" };

const recent = () => {
  if (typeof window === "undefined") return [];
  try {
    const stamps = JSON.parse(window.localStorage.getItem(QUOTA_KEY) || "[]");
    return Array.isArray(stamps) ? stamps.filter((at) => Date.now() - at < HOUR_MS) : [];
  } catch {
    return [];
  }
};

export const submissionsLeft = () => Math.max(0, PER_HOUR - recent().length);

/** One stable id per browser, so the server can hold the hourly quota. */
export function visitorId() {
  const key = "devopslife.feedback.visitor";
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      window.localStorage.setItem(key, id);
    } catch {
      // Blocked storage still gets a working id for this session.
    }
  }
  return id;
}

export const noteSubmission = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUOTA_KEY, JSON.stringify([...recent(), Date.now()]));
  } catch {
    // Storage full or blocked: the server limit still applies.
  }
};

export const openLinkedIn = () => {
  window.open(LINKEDIN_URL, "_blank", "noopener,noreferrer");
};

/** The same thing the visitor would say on LinkedIn, as one copyable block. */
export function buildFeedbackText({ categories, category, rating, difficulty, projectTitle, message, name, contact }) {
  const stars = rating ? `${"★".repeat(rating)}${"☆".repeat(Math.max(0, 5 - rating))}` : "no rating";
  const picked = Array.isArray(categories) && categories.length
    ? categories
    : [CATEGORY_LABELS[category] || "Idea"];
  const head = `DevOps Life feedback (${picked.join(", ")}) ${stars}`;
  const where = [difficulty ? difficulty[0].toUpperCase() + difficulty.slice(1) : "level not chosen", projectTitle || "no project open"];
  const lines = [`${head} | ${where.join(" | ")}`, message || "(no message)"];
  if (name) lines.push(`From: ${name}`);
  if (contact) lines.push(`Contact: ${contact}`);
  return lines.join("\n");
}