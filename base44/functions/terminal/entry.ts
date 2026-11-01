import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { executeCommand, completions } from "./commands.ts";
import { seedFilesystem, writeFile, resolvePath, displayPath, HOME } from "./filesystem.ts";
import { PROJECT_SEEDS } from "./seeds.ts";
import { line } from "./shell.ts";
import { hashStr } from "./kube.ts";
import { touchByName } from "../../shared/playerProfile.ts";
import {
  invalidSession,
  isLockedUntil,
  ownedSave,
  profileForToken,
  tooManyRequests,
} from "../../shared/session.ts";
import { clientIp, isThrottled, logSecurityEvent, take } from "../../shared/abuse.ts";
import { maintenanceGuard, testProfile } from "../../shared/maintenance.ts";

const DEFAULT_NAMESPACE = "prod";

function accountIdFor(saveId: string): string {
  const digits = String(hashStr(saveId) * 7 + 123456789012);
  return digits.slice(0, 12).padEnd(12, "4");
}

function commandLogOutput(lines: any[]): string {
  const text = lines.map((l) => l.text).join("\n");
  return text.length > 3800 ? `${text.slice(0, 3800)}\n...[truncated]` : text;
}

export default async function (req: Request) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const ip = clientIp(req);
    const db = createClientFromRequest(req).asServiceRole;

    const action = String(body.action || "run");

    // Maintenance first: a terminal command is a write like any other.
    const gate = await maintenanceGuard(db, body, ip);
    if (gate.blocked) return gate.blocked;

    // Every command runs against the caller's own career. The session token
    // decides which save — never a name, and never an id from the body alone.
    const profile = gate.test ? testProfile() : await profileForToken(db, body.token);
    if (!profile) return invalidSession();

    if (isLockedUntil(profile.session_locked_until)) {
      return tooManyRequests(900, "This session is paused for a few minutes. Try again shortly.");
    }
    const sessionHit = take(`terminal:${profile.id}`, 60, 60_000);
    if (!sessionHit.ok) return tooManyRequests(sessionHit.retryAfter);

    const save = await ownedSave(db, profile, body.save_id);
    // Terminal activity keeps the player's 5-day retention window open.
    if (save?.player_normalized_name) touchByName(db, save.player_normalized_name);
    if (!save) {
      return Response.json({
        lines: [line("No career save yet — start one from the workspace and the terminal will open a session.", "warn")],
        prompt: null,
        cwd: null,
      });
    }

    // Every read is scoped to this save and this project: a session opened for
    // the Terraform project must never inherit the Kubernetes one's state.
    const scope: any = { save_id: save.id, project_key: save.project_key || "" };

    const [servicesRes, resourcesRes, logsRes, sessionRes] = await Promise.allSettled([
      db.entities.Service.filter(scope),
      db.entities.InfraResource.filter(scope),
      Promise.resolve([]),
      db.entities.TerminalSession.filter({ ...scope, status: "open" }),
    ]);

    const services = servicesRes.status === "fulfilled" ? servicesRes.value || [] : [];
    const resources = resourcesRes.status === "fulfilled" ? resourcesRes.value || [] : [];
    const logsPage = logsRes.status === "fulfilled" ? logsRes.value : [];
    const logs = Array.isArray(logsPage) ? logsPage : logsPage?.items || [];
    const sessionList = sessionRes.status === "fulfilled" ? sessionRes.value || [] : [];

    const clusterRes = resources.find((r: any) => r.kind === "cluster") || {};
    const region = clusterRes.region || resources[0]?.region || "ap-south-1";
    const clusterName = clusterRes.name || "prod-eks";
    const company = String(save.company_name || "acme").toLowerCase().replace(/[^a-z0-9]/g, "-");
    const accountId = accountIdFor(save.id);
    const cluster = {
      name: clusterName,
      region,
      accountId,
      company,
      registry: `${accountId}.dkr.ecr.${region}.amazonaws.com`,
    };

    const primary = services[0];
    const primaryName = primary?.name || "app";

    let session = sessionList[0];
    if (!session) {
      session = await db.entities.TerminalSession.create({
        save_id: save.id,
        project_key: save.project_key || "",
        player_normalized_name: save.player_normalized_name || "",
        environment_id: save.current_environment_id || "",
        name: "bastion",
        host: "bastion",
        context: clusterName,
        status: "open",
        is_break_glass: false,
        started_at: new Date().toISOString(),
        command_count: 0,
        cwd: `${HOME}/repo`,
        namespace: DEFAULT_NAMESPACE,
        env: {
          USER: "engineer",
          HOME,
          SHELL: "/bin/bash",
          KUBECONFIG: `${HOME}/.kube/config`,
          AWS_PROFILE: "prod",
          AWS_REGION: region,
          ENVIRONMENT: DEFAULT_NAMESPACE,
          IMAGE_TAG: primary?.version || "latest",
        },
        history: [],
        git: { branch: "main", ahead: 1, dirty: ["internal/orders/pool.go"] },
        workloads: {},
      });
    }

    // The repo on the jumpbox mirrors whichever services the save actually runs.
    const filesMissing = !session.files || Object.keys(session.files || {}).length === 0;
    if (filesMissing || session.seeded_for !== primaryName) {
      const files = seedFilesystem({
        company: company || "acme",
        cluster: clusterName,
        region,
        database: resources.find((r: any) => r.kind === "database")?.name || "orders-db",
        accountId,
        primaryService: primaryName,
        primaryImage: primary
          ? `${cluster.registry}/${company}/${primary.name}:${primary.version || "1.0.0"}`
          : `app:1.0.0`,
        replicas: Number(primary?.replicas) || 3,
        services: services.map((s: any) => s.name),
      });
      // Files that only make sense for this project, then anything the player
      // already wrote, so a re-seed never overwrites their own work.
      const projectFiles = PROJECT_SEEDS[save.project_key || ""] || {};
      const merged = { ...files, ...projectFiles, ...(session.files || {}) };
      session.files = merged;
      session.seeded_for = primaryName;
      await db.entities.TerminalSession.update(session.id, { files: merged, seeded_for: primaryName });
    }

    const shellUser =
      String(save?.player_name || "engineer")
        .trim()
        .split(/\s+/)[0]
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "") || "engineer";
    const promptFor = (cwd: string) => `${shellUser}@bastion:${displayPath(cwd)}$`;

    if (action === "boot") {
      const bootLines = [
        line(`DevOps Life — ${clusterName} · ${DEFAULT_NAMESPACE} namespace`, "head"),
        line("Type `help` for every command, or `hint` if you are stuck.", "muted"),
        line(
          save.company_name
            ? `Everything you change here is what ${save.company_name} monitors will show.`
            : "Everything you change here is what monitoring will show.",
          "dim"
        ),
      ];
      return Response.json({
        lines: bootLines,
        prompt: promptFor(session.cwd || `${HOME}/repo`),
        cwd: displayPath(session.cwd || `${HOME}/repo`),
        namespace: session.namespace || DEFAULT_NAMESPACE,
        history: (session.history || []).slice(-60),
        session_id: session.id,
        exit_code: 0,
      });
    }

    if (action === "complete") {
      const partial = String(body.input || "");
      const candidates = completions(
        { services, resources, session },
        partial
      );
      return Response.json({ candidates: candidates.slice(0, 40) });
    }

    if (action === "save_file") {
      const files = { ...(session.files || {}) };
      const path = resolvePath(session.cwd || `${HOME}/repo`, String(body.path || ""));
      if (!path.startsWith(HOME)) return Response.json({ error: "Path outside the home directory" }, { status: 400 });
      writeFile(files, path, String(body.content ?? ""));
      await db.entities.TerminalSession.update(session.id, { files });
      return Response.json({ saved: true, path: displayPath(path), bytes: String(body.content ?? "").length });
    }

    const ctx: any = {
      save,
      services,
      resources,
      logs,
      session,
      lines: [],
      exitCode: 0,
      serviceUpdates: {},
      impact: [],
      risky: false,
      reputationDelta: 0,
      sessionDirty: false,
      editor: null,
      history: [...(session.history || [])],
      cluster,
    };

    const input = String(body.input || "");
    if (!input.trim()) {
      return Response.json({
        lines: [],
        prompt: promptFor(session.cwd || `${HOME}/repo`),
        cwd: displayPath(session.cwd || `${HOME}/repo`),
        namespace: session.namespace || DEFAULT_NAMESPACE,
        history: (session.history || []).slice(-60),
        session_id: session.id,
        exit_code: 0,
      });
    }

    await executeCommand(ctx, input);

    // A burst of failing commands is a probe, not a player.
    if (ctx.exitCode !== 0) {
      const failures = take(`failcmd:${profile.id}`, 10, 60_000);
      if (!failures.ok) {
        await logSecurityEvent(db, {
          type: "rate_limited",
          ip,
          detail: "terminal_failures",
          profileId: profile.id,
        });
        return tooManyRequests(
          failures.retryAfter,
          "Too many failing commands in a row. Give it a moment and try again."
        );
      }
    }

    const updates = Object.entries(ctx.serviceUpdates).map(([id, patch]) =>
      db.entities.Service.update(id, patch).catch(() => null)
    );
    if (updates.length) await Promise.all(updates);

    const resourcePatches = Object.entries(ctx.resourceUpdates || {}).map(([id, patch]) =>
      db.entities.InfraResource.update(id, patch as any).catch(() => null)
    );
    if (resourcePatches.length) await Promise.all(resourcePatches);

    const sessionPatch: Record<string, unknown> = {
      cwd: ctx.session.cwd || `${HOME}/repo`,
      files: ctx.session.files || {},
      env: ctx.session.env || {},
      namespace: ctx.session.namespace || DEFAULT_NAMESPACE,
      git: ctx.session.git || {},
      workloads: ctx.session.workloads || {},
      docker: ctx.session.docker || {},
      kube: ctx.session.kube || {},
      pipeline_request: ctx.pipelineRequest || session.pipeline_request || null,
      pushed_images: ctx.session.pushed_images || session.pushed_images || [],
      history: ctx.history.slice(-200),
      command_count: Number(session.command_count || 0) + 1,
      last_command_at: new Date().toISOString(),
    };
    await db.entities.TerminalSession.update(session.id, sessionPatch);

    if (ctx.reputationDelta !== 0) {
      const reputation = Math.max(0, Math.min(100, Number(save.reputation ?? 50) + ctx.reputationDelta));
      await db.entities.CareerSave.update(save.id, { reputation }).catch(() => null);
    }

    await db.entities.CommandLog.create({
      save_id: save.id,
      session_id: session.id,
      command: input,
      output: commandLogOutput(ctx.lines),
      exit_code: ctx.exitCode,
      executed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      is_risky: ctx.risky,
      impact_note: ctx.impact.join(" · ").slice(0, 900),
    }).catch(() => null);

    return Response.json({
      lines: ctx.lines,
      exit_code: ctx.exitCode,
      prompt: promptFor(sessionPatch.cwd as string),
      cwd: displayPath(sessionPatch.cwd as string),
      namespace: sessionPatch.namespace,
      editor: ctx.editor,
      history: ctx.history.slice(-60),
      state_changed: Object.keys(ctx.serviceUpdates).length > 0 || ctx.sessionDirty,
      impact: ctx.impact,
      reputation: (save.reputation ?? 50) + ctx.reputationDelta,
      session_id: session.id,
    });
  } catch (error: any) {
    if (isThrottled(error)) {
      return Response.json(
        {
          error: "That is a lot of commands at once. Wait a moment and try again.",
          lines: [line("shell: too many requests, wait a moment and try again", "err")],
        },
        { status: 429 }
      );
    }
    return Response.json({ error: String(error?.message || error), lines: [line(`shell: ${error?.message || "internal error"}`, "err")] }, { status: 500 });
  }
}