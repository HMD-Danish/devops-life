// The simulated jumpbox, in the browser.
//
// The command engine is pure TypeScript with no network and no database, so it
// runs here unchanged: one command now costs nothing — no function call, no
// write. The shell's own state (cwd, files, docker, kube, history) is kept in
// this browser, keyed by the career save and the project, so a refresh returns
// to the same prompt with the same cluster.
import { executeCommand, completions } from "./commands.ts";
import { seedFilesystem, writeFile, resolvePath, displayPath, HOME } from "./filesystem.ts";
import { PROJECT_SEEDS } from "./seeds.ts";
import { line } from "./shell.ts";
import { hashStr } from "./kube.ts";

const DEFAULT_NAMESPACE = "prod";
const STORE_PREFIX = "devopslife.shell.";
const sessions = new Map();
const timers = new Map();

function accountIdFor(saveId) {
  const digits = String(hashStr(saveId) * 7 + 123456789012);
  return digits.slice(0, 12).padEnd(12, "4");
}

function storeKey(save) {
  return `${STORE_PREFIX}${save?.id || "local"}.${save?.project_key || ""}`;
}

function shellUserFor(save) {
  return (
    String(save?.player_name || "engineer")
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "") || "engineer"
  );
}

export function clusterFor(save, services, resources) {
  const clusterRow = (resources || []).find((row) => row.kind === "cluster") || {};
  const region = clusterRow.region || resources?.[0]?.region || "ap-south-1";
  const company = String(save?.company_name || "acme").toLowerCase().replace(/[^a-z0-9]/g, "-");
  const accountId = accountIdFor(save?.id || "");
  return {
    name: clusterRow.name || "prod-eks",
    region,
    company,
    accountId,
    registry: `${accountId}.dkr.ecr.${region}.amazonaws.com`,
  };
}

function readStored(save) {
  try {
    const raw = window.localStorage.getItem(storeKey(save));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistNow(state) {
  try {
    window.localStorage.setItem(
      state.key,
      JSON.stringify({ session: state.session, serviceUpdates: state.serviceUpdates })
    );
  } catch {
    // Storage blocked or full: the shell still works for this visit.
  }
}

function schedulePersist(state) {
  window.clearTimeout(timers.get(state.key));
  timers.set(
    state.key,
    window.setTimeout(() => persistNow(state), 400)
  );
}

/** Writes the shell's own state now; called when the page is left. */
export function flushShell(state) {
  if (!state) return;
  window.clearTimeout(timers.get(state.key));
  persistNow(state);
}

function promptFor(state) {
  return `${state.user}@bastion:${displayPath(state.session.cwd || `${HOME}/repo`)}$`;
}

/** One shell per career save and project, shared by every panel. */
export function openShell({ save, services, resources }) {
  const key = storeKey(save);
  const live = sessions.get(key);
  if (live) return live;

  const cluster = clusterFor(save, services, resources);
  const primary = services?.[0];
  const seeded = {
    ...seedFilesystem({
      company: cluster.company || "acme",
      cluster: cluster.name,
      region: cluster.region,
      database: (resources || []).find((row) => row.kind === "database")?.name || "orders-db",
      accountId: cluster.accountId,
      primaryService: primary?.name || "app",
      primaryImage: primary
        ? `${cluster.registry}/${cluster.company}/${primary.name}:${primary.version || "1.0.0"}`
        : "app:1.0.0",
      replicas: Number(primary?.replicas) || 3,
      services: (services || []).map((service) => service.name),
    }),
    ...(PROJECT_SEEDS[save?.project_key || ""] || {}),
  };

  const fresh = {
    cwd: `${HOME}/repo`,
    namespace: DEFAULT_NAMESPACE,
    env: {
      USER: "engineer",
      HOME,
      SHELL: "/bin/bash",
      KUBECONFIG: `${HOME}/.kube/config`,
      AWS_PROFILE: "prod",
      AWS_REGION: cluster.region,
      ENVIRONMENT: DEFAULT_NAMESPACE,
      IMAGE_TAG: primary?.version || "latest",
    },
    files: seeded,
    git: { branch: "main", ahead: 1, dirty: ["internal/orders/pool.go"] },
    workloads: {},
    docker: {},
    kube: {},
    pushed_images: [],
    pipeline_request: null,
    history: [],
    command_count: 0,
  };

  const stored = readStored(save);
  const session = stored?.session ? { ...fresh, ...stored.session } : fresh;
  // Anything the player wrote after the last seed stays their own work.
  session.files = { ...seeded, ...(stored?.session?.files || {}) };

  const state = {
    key,
    save,
    cluster,
    user: shellUserFor(save),
    session,
    resources: resources || [],
    services: (services || []).map((service) => ({ ...service })),
    serviceUpdates: stored?.serviceUpdates || {},
  };
  state.services = state.services.map((service) =>
    state.serviceUpdates[service.id] ? { ...service, ...state.serviceUpdates[service.id] } : service
  );

  sessions.set(key, state);
  return state;
}

export function shellBoot(state) {
  const save = state.save || {};
  return {
    lines: [
      line(`DevOps Life — ${state.cluster.name} · ${DEFAULT_NAMESPACE} namespace`, "head"),
      line("Type `help` for every command, or `hint` if you are stuck.", "muted"),
      line(
        save.company_name
          ? `Everything you change here is what ${save.company_name} monitors will show.`
          : "Everything you change here is what monitoring will show.",
        "dim"
      ),
    ],
    prompt: promptFor(state),
    cwd: displayPath(state.session.cwd || `${HOME}/repo`),
    namespace: state.session.namespace || DEFAULT_NAMESPACE,
    history: (state.session.history || []).slice(-60),
  };
}

export async function shellRun(state, input) {
  const ctx = {
    save: state.save,
    services: state.services,
    resources: state.resources,
    logs: [],
    session: state.session,
    lines: [],
    exitCode: 0,
    serviceUpdates: {},
    resourceUpdates: {},
    impact: [],
    risky: false,
    reputationDelta: 0,
    sessionDirty: false,
    editor: null,
    history: [...(state.session.history || [])],
    cluster: state.cluster,
  };

  const typed = String(input || "").trim();
  if (typed) await executeCommand(ctx, typed);

  // The run mutated the session in place; fold the copies back into the shell.
  state.session.history = ctx.history.slice(-200);
  state.session.command_count = Number(state.session.command_count || 0) + 1;
  if (ctx.pipelineRequest !== undefined) state.session.pipeline_request = ctx.pipelineRequest;
  state.serviceUpdates = { ...state.serviceUpdates, ...ctx.serviceUpdates };
  schedulePersist(state);

  return {
    lines: ctx.lines,
    exit_code: ctx.exitCode,
    prompt: promptFor(state),
    cwd: displayPath(state.session.cwd || `${HOME}/repo`),
    namespace: state.session.namespace || DEFAULT_NAMESPACE,
    editor: ctx.editor,
    history: state.session.history.slice(-60),
    impact: ctx.impact,
    serviceUpdates: ctx.serviceUpdates,
    state_changed: Object.keys(ctx.serviceUpdates).length > 0 || ctx.sessionDirty,
  };
}

export function shellComplete(state, partial) {
  try {
    return completions(
      { services: state.services, resources: state.resources, session: state.session },
      partial
    ).slice(0, 40);
  } catch {
    return [];
  }
}

export function shellSaveFile(state, path, content) {
  const files = { ...(state.session.files || {}) };
  const full = resolvePath(state.session.cwd || `${HOME}/repo`, String(path || ""));
  if (!full.startsWith(HOME)) return { error: "Path outside the home directory" };
  writeFile(files, full, String(content ?? ""));
  state.session.files = files;
  schedulePersist(state);
  return { saved: true, path: displayPath(full), bytes: String(content ?? "").length };
}

/** A fresh shell, for a project started again. */
export function resetShell(saveId) {
  [...sessions.keys()].forEach((key) => {
    if (saveId && !key.includes(saveId)) return;
    sessions.delete(key);
  });
}