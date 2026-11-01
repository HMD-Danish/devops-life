/**
 * The guided tour. Nothing here talks to the server or generates content:
 * every step is a fixed target on a real screen, with fixed copy.
 */
const KEY = "tutorialDone";

export const STEPS = [
  {
    page: "name",
    target: "#player-name",
    title: "Choose your name",
    text: "Your team calls you by this name in chat and the terminal. Enter it again later to resume your progress, which is kept for 5 days.",
  },
  {
    page: "level",
    target: '[data-tour="levels"]',
    title: "Pick your level",
    text: "Easy gives full guidance, Medium costs points for hints, Hard hides the exact steps and adds tight rules. Higher levels earn bigger scores.",
  },
  {
    page: "projects",
    target: '[data-tour="projects"]',
    title: "Choose a project",
    text: "Each project is a real DevOps job with its own company, tools and incident. Start with a Docker or Kubernetes one if you are new.",
  },
  {
    page: "projects",
    target: '[data-tour="project-tags"]',
    title: "Terminal or chat only",
    text: "Most projects use a terminal. Chat-only projects test your incident communication.",
  },
  {
    page: "workspace",
    target: '[data-tour="step-title"]',
    title: "Your current step",
    text: "This shows what you must do right now. Finish steps in order to complete the project.",
  },
  {
    page: "workspace",
    target: '[data-tour="dashboard"]',
    tab: "dashboard",
    title: "Dashboard",
    text: "See your progress, tickets, service health and score. Red services turn green when the problem is fixed.",
  },
  {
    page: "workspace",
    target: '[data-tour="terminal"]',
    tab: "terminal",
    title: "Terminal",
    text: "Type real commands such as docker, kubectl or terraform. Press the up arrow for history. Type help for options.",
    // Chat-only projects have no terminal: the card says so instead.
    fallback: {
      title: "Chat is your main tool",
      text: "This project runs through chat, so there is no terminal. The chat is your main tool here.",
    },
  },
  {
    page: "workspace",
    target: '[data-tour="chat"]',
    tab: "chat",
    title: "Team chat",
    text: "Teammates message you about the task. Write your own update or tap a suggestion. A star rating shows how clear your message was.",
  },
  {
    page: "workspace",
    target: '[data-tour="tech-lead"]',
    title: "Stuck? Ask the Tech Lead",
    text: "Reveal a nudge, then the concept, then the exact steps. Hints reduce your score, and Hard mode disables exact steps.",
  },
  {
    page: "workspace",
    target: '[data-tour="clock"]',
    title: "Game time",
    text: "One real hour equals one month on the job. Pause or speed up time here.",
  },
  {
    page: "workspace",
    target: '[data-tour="feedback"]',
    title: "Tell me what you think",
    text: "After your first project you will be asked for feedback. You can also send it any time from here.",
  },
  {
    page: "workspace",
    target: null,
    title: "You are ready",
    text: "Complete the first step to begin. Good luck on call!",
  },
];

export const TOTAL_STEPS = STEPS.length;

/** Which part of the tour a URL belongs to. */
export function pageOf(pathname) {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  // The admin test copy runs the same screens under /admin/test.
  const tail = path.replace(/^\/admin\/test/, "").replace(/^\/play/, "");
  if (!tail) return "name";
  if (tail === "/level") return "level";
  if (tail === "/projects") return "projects";
  if (tail === "/workspace") return "workspace";
  return null;
}

export function isTutorialDone() {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    window.localStorage.setItem(KEY, "true");
  } catch {
    // Blocked storage only means the tour can appear again next visit.
  }
}

/** The first matching element that is actually on screen. */
export function visibleTarget(selector) {
  if (!selector) return null;
  const nodes = [...document.querySelectorAll(selector)];
  return (
    nodes.find((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    }) || null
  );
}

export function rectOf(el) {
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    right: r.right,
    bottom: r.bottom,
  };
}

/** A dialog other than the tour card is on screen. */
export function hasOpenModal() {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]:not([data-tour-card])'));
}