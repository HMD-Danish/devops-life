/**
 * Every rule the free-text chat uses. No AI, no network: keyword groups,
 * checklist items and reply pools live here so a project can override them by
 * putting its own `chatIntents` / `chatReplyPools` on its definition.
 */

export const MAX_CHAT_LENGTH = 280;

/** Order matters: earlier intents win ties, so the specific ones come first. */
export const INTENTS = [
  {
    id: "fix_done",
    label: "Fix reported",
    keywords: [
      "fixed",
      "resolved",
      "deployed",
      "restored",
      "rolled back",
      "green now",
      "healthy now",
      "back to normal",
      "is up again",
      "is done",
      "closed it",
      "sorted",
    ],
  },
  {
    id: "escalate",
    label: "Escalation",
    keywords: ["escalat", "sev1", "sev 1", "critical", "page someone", "page the", "on-call", "oncall", "all hands", "need backup", "wake up"],
  },
  {
    id: "ask_access",
    label: "Access or approval",
    keywords: ["access", "permission", "approve", "approval", "unblock", "grant", "credential", "sign off", "sign-off", "role for"],
  },
  {
    id: "status_update",
    label: "Status update",
    keywords: [
      "working on",
      "looking into",
      "investigating",
      "checking",
      "on it",
      "progress",
      "update",
      "status",
      "still",
      "currently",
      "i am on",
      "degraded",
      "isolated",
      "roll back",
      "rolling back",
    ],
  },
  {
    id: "ask_logs",
    label: "Asked for logs",
    keywords: ["log", "logs", "error", "stack trace", "traceback", "output", "journal", "events", "stderr", "stdout", "exact message"],
  },
  {
    id: "ask_cause",
    label: "Asked for cause",
    keywords: ["why", "root cause", "cause", "what happened", "reason", "how did", "what changed", "trigger"],
  },
  {
    id: "give_eta",
    label: "Gave an ETA",
    keywords: ["eta", " in 5", " in 10", " in 15", " in 20", " in 30", " in an hour", "minute", "minutes", "within", "by ", "end of day", "eod", "tomorrow"],
  },
  {
    id: "ask_help",
    label: "Asked for help",
    keywords: ["help", "pair", "assist", "second pair", "can you take", "hand over", "stuck", "anyone free"],
  },
  {
    id: "acknowledge",
    label: "Acknowledged",
    keywords: ["ack", "acknowledged", "got it", "understood", "copy that", "roger", "noted", "will do", "on it"],
  },
];

export const OFF_TOPIC_WORDS = [
  "lunch",
  "coffee",
  "football",
  "cricket",
  "netflix",
  "weekend plans",
  "weather",
  "movie",
  "birthday",
  "salary",
  "holiday plans",
  "pizza",
];

/** Kept deliberately short: a polite block, not a moderation system. */
export const BLOCKED_WORDS = [
  "idiot",
  "stupid",
  "shut up",
  "moron",
  "incompetent",
  "useless",
  "hate you",
  "damn",
  "crap",
];

/** The five checkpoints a good update covers. */
export const QUALITY_CHECKS = [
  {
    id: "problem",
    label: "the problem or service",
    keywords: [
      "service",
      "api",
      "build",
      "container",
      "pod",
      "deploy",
      "ticket",
      "database",
      "db",
      "pipeline",
      "cluster",
      "node",
      "image",
      "config",
      "ingress",
      "secret",
      "checkout",
      "test",
      "staging",
      "prod",
    ],
  },
  {
    id: "impact",
    label: "the impact",
    keywords: [
      "customer",
      "customers",
      "user",
      "users",
      "traffic",
      "impact",
      "downtime",
      "affect",
      "error rate",
      "500",
      "failing",
      "slow",
      "blocked",
      "outage",
      "requests",
      "nobody can",
      "blocking",
    ],
  },
  {
    id: "evidence",
    label: "what you checked or found",
    keywords: [
      "checked",
      "looked",
      "found",
      "tested",
      "ran ",
      "verified",
      "logs show",
      "compared",
      "isolated",
      "ruled out",
      "tried",
      "reproduced",
      "saw ",
      "narrowed",
      "confirmed",
    ],
  },
  {
    id: "next",
    label: "the next action",
    keywords: [
      "will ",
      "going to",
      "next step",
      "planning to",
      "rolling",
      "pushing",
      "adding",
      "restart",
      "fixing",
      "applying",
      "patching",
      "revert",
      "about to",
      "i am doing",
    ],
  },
  {
    id: "eta",
    label: "an ETA",
    keywords: [
      "eta",
      "minutes",
      "mins",
      "within",
      "by ",
      "hour",
      "soon",
      "tomorrow",
      "end of day",
      "eod",
      " in 5",
      " in 10",
      " in 15",
      " in 20",
      " in 30",
      "in an hour",
    ],
  },
];

export const QUALITY_TIPS = {
  problem: "Name the service and the ticket — the team cannot route a message without it.",
  impact: "Add the impact: who is affected and how badly.",
  evidence: "Say what you already checked or found, so nobody repeats it.",
  next: "State your next action, not just the symptom.",
  eta: "Close with an ETA — even 20 minutes stops the pings.",
  length: "Write a full sentence or two. Fragments score low.",
  complete: "That is a complete update: problem, impact, evidence, next step and an ETA.",
};

/** Suggestion chips, per difficulty, filled from the current step. */
export const SUGGESTIONS = {
  easy: [
    "@{lead} I am on {ticket}. I checked the {service} logs and found the failing step. Customers are not affected yet and I will update you in 10 minutes.",
    "Can you share the exact error from staging? I checked our logs and want to compare before I change {service}.",
    "{service} is degraded and customers are affected. I have isolated it to the last change and will roll it back in 15 minutes.",
    "Fixed — {service} is healthy again after the config change. I checked the health endpoint and the error rate, it is green, and I will watch it for 20 minutes before closing {ticket}.",
    "I need access to {service} to check the config. Can you approve it? It is blocking my next step.",
  ],
  medium: [
    "Checking {service} logs now, update in 10",
    "Can you paste the exact error from staging?",
    "{service} degraded, customers affected",
    "Root cause looks like the last change, rolling back",
    "Need access to {service} to continue",
  ],
  hard: ["status", "impact", "ETA", "cause", "logs", "escalate"],
};

export const NEUTRAL_REPLY = "Got it. Can you tell me the impact and your next step?";

/** Reply pools by intent and quality tier. {ticket} and {service} get filled in. */
export const REPLY_POOLS = {
  status_update: {
    high: [
      "Perfect — what is broken, what you checked and when the next update lands. I will hold the channel and stop asking.",
      "That is the update I needed. Logged against {ticket}; ping me only if the plan changes.",
    ],
    mid: ["Thanks. Add an ETA next time and I can keep everyone else off your back."],
    low: ["Which ticket is this about? Give me the service, the impact and your next step."],
  },
  ask_logs: {
    high: [
      "Sending the last 200 lines from staging now — the failure is in the request handler right after the deploy.",
      "Here is the exact error from staging: connection refused to the upstream on port 8080. No useful stack above it.",
    ],
    mid: ["The error is a 502 from the upstream. That is all I can see from my side."],
    low: [
      "There is a lot of noise in staging — give me the service and a time window and I will send the exact lines.",
    ],
  },
  ask_cause: {
    high: [
      "Root cause is Tuesday's config change: the upstream host was renamed and nothing points at the new one.",
      "It is the resource limit on the sidecar, not the app — the container is being throttled at 92%.",
    ],
    mid: ["Best guess is the deploy on Tuesday. Nothing else changed that day."],
    low: ["I do not know yet either. Narrow it: which service, and what changed last?"],
  },
  ask_access: {
    high: ["Approved — you are on the role now. Give it two minutes to propagate and retry."],
    mid: ["Approval is fine, I just need the ticket number on the request."],
    low: ["Access to what, and why? I cannot approve a blank request."],
  },
  escalate: {
    high: [
      "Escalated to the on-call lead and opened the incident channel. They are joining now.",
      "Paging the platform on-call with your summary. You keep the logs, they take the infrastructure side.",
    ],
    mid: ["Okay — is this genuinely sev1, or can it hold until the next check-in?"],
    low: ["Escalate what exactly? I need the service and the customer impact before I page anyone."],
  },
  give_eta: {
    high: ["Ten minutes is fine. I will tell support and check back then."],
    mid: ["Noted. Hold to that number if you can."],
    low: ["Ten minutes for what? An ETA on which ticket?"],
  },
  fix_done: {
    high: [
      "Verified on my side — health check green and the error rate is back to normal. Closing {ticket}.",
      "Confirmed: the service is answering again and the alert cleared. Nice work.",
    ],
    mid: ["Looks better. Confirm the check is green before I close it."],
    low: ["Done tells me nothing. What is fixed, and how do I check it?"],
  },
  ask_help: {
    high: ["I can pair for twenty minutes. Send the failing command and what you already tried."],
    mid: ["What do you need — a second pair of eyes or an approval?"],
    low: ["Happy to help, but I need the actual error first."],
  },
  acknowledge: {
    high: ["Thanks for the quick ack. I will stay quiet unless something changes."],
    mid: ["Good. Next update when you have something concrete."],
    low: ["An ack is fine, but I still need the status when you have it."],
  },
  off_topic: {
    high: ["That is outside this ticket. Let us park it and get back to {ticket} — what is the current state?"],
    mid: ["Let us keep this channel on {ticket}. Where are we?"],
    low: ["Wrong channel for that. {ticket} is what I need an update on."],
  },
  neutral: {
    high: ["Understood. Keep me posted on {ticket}."],
    mid: [NEUTRAL_REPLY],
    low: [NEUTRAL_REPLY],
  },
};

/** A good escalation brings in someone senior from the project's own cast. */
export const SENIOR_ROLE_WORDS = ["architect", "principal", "senior", "lead", "head"];
export const LEAD_ROLE_WORDS = ["lead", "manager", "owner", "architect", "head", "director", "compliance"];