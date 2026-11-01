// A project with no terminal at all: needsTerminal is false, so the workspace
// shows chat and the dashboard only.
export default {
  key: "auth-incident",
  title: "Triage the login outage",
  company: "Brightline",
  summary: "Customers cannot sign in. Work the incident through chat: acknowledge, contain, communicate.",
  needsTerminal: false,
  ticketPrefix: "INC",
  workdir: "~",
  terminal: { host: "bastion", allowed: [] },
  runtime: {
    label: "Affected services",
    items: [
      { name: "auth-api", detail: "5xx spike since 09:12" },
      { name: "session-store", detail: "redis · maxclients reached" },
    ],
  },
  build: { number: 88, status: "passing", branch: "main", detail: "auth-api:3.2.1 deployed 09:44" },
  incidents: [
    { id: "INC-4412", title: "Customers cannot sign in", severity: "sev1", opened: "09:12", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["acknowledge", "contain"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["acknowledge", "contain", "communicate"],
      redHerrings: ["i-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["acknowledge", "contain", "communicate", "timeline"],
      redHerrings: ["i-red-1", "i-red-2"],
    },
  },
  chart: {
    title: "auth-api 5xx (per minute)",
    points: [0, 0, 2, 18, 64, 192, 240, 232, 180, 96, 30, 6],
  },
  services: [
    { name: "auth-api", kind: "api", health: "down", replicas: 3, version: "3.2.1", last_deploy: "18 minutes ago" },
    { name: "session-store", kind: "cache", health: "degraded", replicas: 2, version: "7.2", last_deploy: "4 months ago" },
    { name: "identity-db", kind: "database", health: "healthy", replicas: 1, version: "16.1", last_deploy: "12 days ago" },
  ],
  steps: [
    {
      key: "acknowledge",
      title: "Acknowledge the page",
      goal: "Own the incident so the alert stops escalating.",
      whatHappening:
        "The alerting pipeline paged you at 09:12 and has escalated twice. Nobody has acknowledged, so the on-call rotation thinks the incident is unowned.",
      whatNext: "Tell the team you have it, in the incident channel.",
      ticket: { title: "Acknowledge sev1 login outage", priority: "P1", slaMinutes: 60 },
      variants: {
        easy: { slaMinutes: 120, subSteps: 1 },
        medium: { slaMinutes: 60, subSteps: 1 },
        hard: { slaMinutes: 20, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Until someone says they own it, the alert keeps escalating. Reply in the channel." },
        {
          title: "Concept",
          body: "Acknowledgement is a coordination signal, not a fix: it tells the rotation a human is on it, which stops the escalation path and starts the incident clock against you.",
        },
        {
          title: "Steps",
          items: [
            "Open the incident channel in the chat panel.",
            "Reply with the On it quick reply.",
            "Then ask for the last change made to auth-api — that is where the answer usually is.",
          ],
        },
      ],
      doneOnReply: "on-it",
      replies: [
        { id: "on-it", label: "On it", next: "i2" },
        { id: "handover", label: "Who changed auth-api?", next: "i3" },
      ],
    },
    {
      key: "contain",
      title: "Contain the blast radius",
      goal: "Stop the 5xx wave before it takes the session store with it.",
      whatHappening:
        "auth-api is retrying the session store aggressively. The store is at maxclients, so the failures now cascade into every page that needs a session.",
      whatNext: "Decide the smallest change that reduces load, and say what you are doing.",
      ticket: { title: "Contain auth-api cascading failures", priority: "P1", slaMinutes: 45 },
      variants: {
        easy: { slaMinutes: 120, subSteps: 1 },
        medium: { slaMinutes: 45, subSteps: 1 },
        hard: { slaMinutes: 15, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "You cannot fix the root cause yet. Reduce traffic or reduce retries — pick one and announce it." },
        {
          title: "Concept",
          body: "Containment buys time: shedding load or rolling back the last deploy reduces the failure rate while you investigate, and both are reversible. Nothing irreversible should happen before a postmortem.",
        },
        {
          title: "Steps",
          items: [
            "State the hypothesis: the 09:44 deploy of auth-api:3.2.1 changed the connection pool.",
            "Propose a rollback to the previous image as the smallest reversible action.",
            "Confirm who can approve it, and ask for the go-ahead in the channel.",
          ],
        },
      ],
      doneOnReply: "rollback",
      replies: [
        { id: "rollback", label: "Propose a rollback", next: "i4" },
        { id: "scale", label: "Scale out instead", next: "i5" },
      ],
    },
    {
      key: "communicate",
      title: "Communicate the status",
      goal: "Give support something they can tell customers.",
      whatHappening:
        "Support has three hundred open chats and no status update. Your manager needs one line they can forward.",
      whatNext: "Post a short status: what is broken, what you did, when the next update comes.",
      ticket: { title: "Post customer-facing status for login outage", priority: "P2", slaMinutes: 120 },
      variants: {
        easy: { slaMinutes: 240, subSteps: 1 },
        medium: { slaMinutes: 120, subSteps: 1 },
        hard: { slaMinutes: 45, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Support needs impact, action taken and next update time. Nothing else." },
        {
          title: "Concept",
          body: "A status update is three facts in one message: who is affected, what you changed, and when you will speak again. It is written for someone who is not in the incident.",
        },
        {
          title: "Steps",
          items: [
            "Name the impact: sign-in failing for all customers since 09:12.",
            "Name the action: rolled back to auth-api:3.2.0.",
            "Commit to a time for the next update.",
          ],
        },
      ],
      doneOnReply: "status",
      replies: [
        { id: "status", label: "Post the update", next: "i6" },
        { id: "draft", label: "Send me a template", next: "i7" },
      ],
    },
    {
      key: "timeline",
      title: "Post the incident timeline",
      goal: "Leave the next on-call a timeline instead of a four-hundred-message channel.",
      whatHappening:
        "The outage is over and the postmortem is tomorrow morning. Nothing has been written down, so the only record of what happened is the chat scroll.",
      whatNext: "Post the timeline: when it started, what changed, what stopped it, and what prevents a repeat.",
      ticket: { title: "Post the incident timeline for the login outage", priority: "P3", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 960, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 120, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Four facts, in order: start time, the change, the action that worked, the follow-up." },
        {
          title: "Concept",
          body: "A timeline is written for someone who was asleep: timestamps, the change that triggered it, the action that stopped it, and the fix that keeps it from happening again.",
        },
        {
          title: "Steps",
          items: [
            "Start at 09:12, when the 5xx rate left the baseline.",
            "Name the trigger: auth-api:3.2.1 with the larger pool at 09:44.",
            "Name the containment: rollback at 10:02.",
            "Commit to the follow-up: a load test before the next pool change.",
          ],
        },
      ],
      doneOnReply: "timeline",
      replies: [
        { id: "timeline", label: "Post the timeline", next: "i13" },
        { id: "what-belongs", label: "What belongs in it?", next: "i14" },
      ],
    },
  ],
  messages: [
    {
      id: "i1",
      trigger: "incident_start",
      step: "acknowledge",
      author: "Grace Adeyemi",
      role: "Engineering manager",
      body:
        "@{player} auth is down for everyone — sign-in is failing. Pager has escalated twice and nobody has acknowledged. Are you taking this?",
      variants: {
        easy: {
          body:
            "@{player} heads up: sign-in is failing for everyone. The pager has escalated twice. You are on call — acknowledge it here and the team will follow your lead.",
        },
        hard: {
          body: "@{player} auth?? everyone. nobody has picked it up. taking it or not",
        },
      },
      replies: [
        { id: "on-it", label: "On it", next: "i2" },
        { id: "handover", label: "Who changed auth-api?", next: "i3" },
      ],
    },
    {
      id: "i2",
      trigger: "reply",
      step: "acknowledge",
      author: "Grace Adeyemi",
      role: "Engineering manager",
      body: "You own it then. First useful question: what changed. The 09:44 deploy is the only candidate.",
    },
    {
      id: "i3",
      trigger: "reply",
      step: "acknowledge",
      author: "Sam Whitfield",
      role: "QA",
      body: "auth-api:3.2.1 went out at 09:44 — pool size change. It passed staging, we had no load there.",
      replies: [{ id: "on-it", label: "I own this incident", next: "i2" }],
    },
    {
      id: "i4",
      trigger: "step_done",
      step: "contain",
      author: "Grace Adeyemi",
      role: "Engineering manager",
      body: "Rollback approved. Do it, then post a status support can forward — they have three hundred chats open.",
    },
    {
      id: "i5",
      trigger: "reply",
      step: "contain",
      author: "Leo Marchetti",
      role: "Dev lead",
      body: "Scaling out won't help — the pool is the bottleneck and you'll just open more connections. Roll back.",
      replies: [{ id: "rollback", label: "Propose a rollback", next: "i4" }],
    },
    {
      id: "i10",
      trigger: "step_start",
      step: "contain",
      author: "Grace Adeyemi",
      role: "Engineering manager",
      body: "The 09:44 deploy is our only change. What is the smallest reversible thing you can do here, and who approves it?",
      replies: [
        { id: "rollback", label: "Propose a rollback", next: "i4" },
        { id: "scale", label: "Scale out instead", next: "i5" },
      ],
    },
    {
      id: "i6",
      trigger: "step_done",
      step: "communicate",
      author: "Ivy Chen",
      role: "Product owner",
      body: "That is exactly what support needed. Error rate is falling — stay on it until the next check.",
    },
    {
      id: "i7",
      trigger: "reply",
      step: "communicate",
      author: "Ivy Chen",
      role: "Product owner",
      body: "Template: impact, action taken, next update. Sign-in failing since 09:12, rolled back at 10:02, next update in 30 minutes.",
      replies: [{ id: "status", label: "Post the update", next: "i6" }],
    },
    {
      id: "i11",
      trigger: "step_start",
      step: "communicate",
      author: "Ivy Chen",
      role: "Product owner",
      body: "Support has three hundred chats open and nothing to tell customers. Can you post a status they can forward?",
      replies: [
        { id: "status", label: "Post the update", next: "i6" },
        { id: "draft", label: "Send me a template", next: "i7" },
      ],
    },
    {
      id: "i8",
      trigger: "timer",
      atMinute: 25,
      step: "contain",
      author: "Ruth Okonjo",
      role: "Security",
      body: "Before anyone resets anything: we saw no credential leak in the logs, so this is availability, not a breach. Keep it that way.",
    },
    {
      id: "i9",
      trigger: "incident_end",
      step: "communicate",
      author: "Grace Adeyemi",
      role: "Engineering manager",
      body: "Incident closed at 10:31. Thank you. Write nothing tonight — we'll talk about the pool change tomorrow.",
    },
    {
      id: "i12",
      trigger: "step_start",
      step: "timeline",
      author: "Grace Adeyemi",
      role: "Engineering manager",
      body: "Service is stable. Before you log off, post the timeline: start, trigger, containment, follow-up. The postmortem is at nine tomorrow and I would rather not reconstruct it from memory.",
      replies: [
        { id: "timeline", label: "Post the timeline", next: "i13" },
        { id: "what-belongs", label: "What belongs in it?", next: "i14" },
      ],
    },
    {
      id: "i13",
      trigger: "reply",
      step: "timeline",
      author: "Grace Adeyemi",
      role: "Engineering manager",
      body: "That is a timeline I can attach to the postmortem. Go home — the follow-up is a load test, not a rewrite.",
    },
    {
      id: "i14",
      trigger: "reply",
      step: "timeline",
      author: "Sam Whitfield",
      role: "QA",
      body: "Ours reads: 09:12 the 5xx rate starts, 09:44 the pool change ships, 10:02 the rollback, Tuesday a load test. Post that and you are done.",
      replies: [{ id: "timeline", label: "Post the timeline", next: "i13" }],
    },
    {
      id: "i-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "contain",
      author: "Ruth Okonjo",
      role: "Security",
      body: "Password-reset requests are up 400%. That smells like credential stuffing — I'd block the top IPs before anyone rolls anything back.",
    },
    {
      id: "i-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "communicate",
      author: "Sam Whitfield",
      role: "QA",
      body: "identity-db is showing slow queries too. Restart the replica first, then write the update — the numbers will look better.",
    },
  ],
};