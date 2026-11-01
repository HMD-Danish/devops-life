import { parseArgs, columnTable } from "./shell.ts";
import { resolvePath, readFile } from "./filesystem.ts";
import { podRows, replicaSet, hashStr, nodeRows, instanceIdFor } from "./kube.ts";
import { parseYaml, asList } from "./yaml.ts";

/** Cluster objects the player created by hand: namespaces, config maps,
 *  secrets, applied Services and the live problems those objects caused. */
export function kubeState(ctx: any) {
  const session = ctx.session;
  const raw = session.kube && typeof session.kube === "object" ? session.kube : {};
  session.kube = {
    namespaces: Array.isArray(raw.namespaces) ? raw.namespaces : [],
    configmaps: raw.configmaps || {},
    secrets: raw.secrets || {},
    services: raw.services || {},
    problems: raw.problems || {},
    probes: raw.probes || {},
    breaks: Number(raw.breaks || 0),
  };
  return session.kube as any;
}
import {
  say, fail, note, touch, findService, namespaceOf, fsOf, readyCount, imageRef,
  applyImage, primaryService, TONE,
} from "./helpers.ts";
import { prometheusApi, elasticSearch } from "./observability.ts";
import { awsSecurity } from "./security.ts";

function nsEmpty(ctx: any, ns: string): boolean {
  if (ns === "prod" || ns === "default") return false;
  say(ctx, `No resources found in ${ns} namespace.`, TONE.muted);
  return true;
}

export function cmdKubectl(ctx: any, rest: string[]) {
  const { flags, args } = parseArgs(rest);
  const ns = namespaceOf(ctx, flags);
  const verb = args[0] || "";
  if (!verb) return say(ctx, "kubectl controls the Kubernetes cluster manager. Try `kubectl get pods`.", TONE.muted);

  if (verb === "config") {
    const sub = args[1] || "current-context";
    if (sub === "current-context") return say(ctx, ctx.cluster.name);
    if (sub === "get-contexts") return say(ctx, `*  ${ctx.cluster.name}   ${ctx.cluster.name}   engineer   prod`);
    if (sub === "view") return say(ctx, `apiVersion: v1\ncurrent-context: ${ctx.cluster.name}`, TONE.muted);
    return say(ctx, `kubectl config ${sub}: not simulated`, TONE.muted);
  }

  if (verb === "diff") {
    say(ctx, "diff -u -N /tmp/LIVE-4471/apps.v1.Deployment.prod.app-books /tmp/MERGED-4471/apps.v1.Deployment.prod.app-books", TONE.muted);
    say(ctx, "--- /tmp/LIVE-4471/apps.v1.Deployment.prod.app-books");
    say(ctx, "+++ /tmp/MERGED-4471/apps.v1.Deployment.prod.app-books");
    say(ctx, "@@ -6,7 +6,7 @@ spec:");
    say(ctx, "-  replicas: 5", TONE.err);
    say(ctx, "+  replicas: 3", TONE.ok);
    say(ctx, "   selector:");
    say(ctx, "     matchLabels: { app: app-books }");
    say(ctx, "");
    say(ctx, "# The live object has a field Git does not. ArgoCD calls this OutOfSync.", TONE.dim);
    ctx.exitCode = 1;
    note(ctx, "diffed the live deployment against Git");
    return;
  }

  if (verb === "get") {
    const type = (args[1] || "pods").replace(/s$/, "");
    if (nsEmpty(ctx, ns)) return;
    if (type === "pod") {
      const rows: string[][] = [["NAME", "READY", "STATUS", "RESTARTS", "AGE"]];
      if (flags["-o"] === "wide") rows[0].push("NODE");
      const problems = ctx.session?.kube?.problems || {};
      ctx.services.forEach((svc: any) => {
        const problem = problems[svc.name];
        podRows(svc).forEach((p, idx) => {
          const row = [p.name, p.ready, p.state, String(p.restarts), p.age];
          if (problem && idx === 0) {
            row[1] = "0/1";
            row[2] = problem;
            row[3] = String(4 + (hashStr(p.name) % 5));
          }
          if (flags["-o"] === "wide") row.push(p.node);
          rows.push(row);
        });
      });
      columnTable(rows).forEach((r, i) => {
        const bad = /CrashLoop|Error|ImagePull|Pending|ContainerCreating/.test(r);
        say(ctx, r, i === 0 ? TONE.head : bad ? TONE.err : undefined);
      });
      note(ctx, "looked at the pods");
      return;
    }
    if (type === "deployment" || type === "deploy") {
      const rows: string[][] = [["NAME", "READY", "UP-TO-DATE", "AVAILABLE", "AGE"]];
      ctx.services.forEach((svc: any) => {
        const ready = readyCount(svc);
        const total = Number(svc.replicas) || 0;
        rows.push([svc.name, `${ready}/${total}`, String(total), String(ready), `${3 + (hashStr(svc.id) % 9)}d`]);
      });
      columnTable(rows).forEach((r, i) => say(ctx, r, i === 0 ? TONE.head : undefined));
      return;
    }
    if (type === "svc" || type === "service") {
      const rows: string[][] = [["NAME", "TYPE", "CLUSTER-IP", "EXTERNAL-IP", "PORT(S)", "AGE"]];
      ctx.services.forEach((svc: any, i: number) => {
        rows.push([svc.name, "ClusterIP", `10.100.${i + 12}.41`, "<none>", "80/TCP", `${3 + i}d`]);
      });
      const applied = ctx.session?.kube?.services || {};
      Object.keys(applied).forEach((name, i) => {
        if (rows.some((r) => r[0] === name)) return;
        const def = applied[name] || {};
        const external = def.type === "NodePort" ? "10.20.1.12" : "<none>";
        rows.push([name, def.type || "ClusterIP", `10.100.${40 + i}.88`, external, `${def.port || 80}/TCP`, "12s"]);
      });
      columnTable(rows).forEach((r, i) => say(ctx, r, i === 0 ? TONE.head : undefined));
      return;
    }
    if (type === "hpa") {
      const rows: string[][] = [["NAME", "REFERENCE", "TARGETS", "MINPODS", "MAXPODS", "REPLICAS"]];
      const configured = ctx.session.workloads || {};
      ctx.services.forEach((svc: any) => {
        const cfg = configured[svc.name]?.autoscaler;
        if (!cfg) return;
        const pct = 58 + (hashStr(svc.id) % 24);
        rows.push([svc.name, `Deployment/${svc.name}`, `cpu: ${pct}%/${cfg.cpu}%`, String(cfg.min), String(cfg.max), String(svc.replicas)]);
      });
      if (rows.length === 1) return say(ctx, "No resources found in prod namespace.", TONE.muted);
      columnTable(rows).forEach((r, i) => say(ctx, r, i === 0 ? TONE.head : undefined));
      return;
    }
    if (type === "node") {
      const rows: string[][] = [["NAME", "STATUS", "ROLES", "AGE", "VERSION"]];
      nodeRows(ctx.resources).forEach((n) => rows.push([n.name, n.status, n.role, n.age, n.version]));
      columnTable(rows).forEach((r, i) => say(ctx, r, i === 0 ? TONE.head : r.includes("NotReady") ? TONE.err : undefined));
      return;
    }
    if (type === "namespace" || type === "ns") {
      const names = ["default", "kube-system", "prod", "staging", "monitoring", ...(ctx.session?.kube?.namespaces || [])];
      [...new Set(names)].forEach((n: string, i: number) => say(ctx, `${n.padEnd(14)} Active   ${i > 4 ? "8s" : `${40 + n.length}d`}`));
      return;
    }
    if (type === "configmap" || type === "cm") {
      const maps = ctx.session?.kube?.configmaps || {};
      const names = Object.keys(maps);
      if (!names.length) return say(ctx, "No resources found in prod namespace.", TONE.muted);
      say(ctx, "NAME               DATA   AGE", TONE.head);
      names.forEach((n) => say(ctx, `${n.padEnd(18)} ${String(Object.keys(maps[n] || {}).length).padEnd(6)} 12s`));
      return;
    }
    if (type === "event" || type === "events") {
      const rows: string[][] = [["LAST SEEN", "TYPE", "REASON", "OBJECT", "MESSAGE"]];
      ctx.services.forEach((svc: any) => {
        if (svc.status === "degraded") {
          rows.push(["2m", "Warning", "Unhealthy", `pod/${svc.name}-${replicaSet(svc)}-x2k4l`, "Readiness probe failed: HTTP probe failed with statuscode: 500"]);
          rows.push(["1m", "Warning", "BackOff", `pod/${svc.name}-${replicaSet(svc)}-x2k4l`, "Back-off restarting failed container app"]);
        }
        if (svc.status === "deploying") {
          rows.push(["12s", "Normal", "ScalingReplicaSet", `deployment/${svc.name}`, `Scaled up replica set to ${svc.replicas}`]);
        }
      });
      const disk = ctx.resources.find((r: any) => (r.tags || []).includes("disk-pressure"));
      if (disk) rows.push(["6m", "Warning", "EvictionThresholdMet", `node/${disk.name}`, "Attempting to reclaim ephemeral-storage"]);
      if (rows.length === 1) return say(ctx, "No events found in prod namespace.", TONE.muted);
      columnTable(rows).forEach((r, i) => say(ctx, r, i === 0 ? TONE.head : r.includes("Warning") ? TONE.warn : undefined));
      return;
    }
    if (type === "secret") {
      ctx.services.slice(0, 3).forEach((svc: any) => say(ctx, `${svc.name}-env   Opaque   4   12d`));
      const secrets = ctx.session?.kube?.secrets || {};
      Object.keys(secrets).forEach((n) => say(ctx, `${n.padEnd(22)} Opaque   ${Object.keys(secrets[n] || {}).length || 1}   12s`));
      return;
    }
    if (type === "all") {
      cmdKubectl(ctx, ["get", "deploy"]);
      say(ctx, "");
      cmdKubectl(ctx, ["get", "pods"]);
      return;
    }
    const name = args[2];
    if (name) return cmdDescribe(ctx, ["pod", name]);
    return fail(ctx, `error: the server doesn't have a resource type "${type}"`);
  }

  if (verb === "create") {
    const what = (args[1] || "").replace(/s$/, "");
    const name = args[2] || "";
    if (!["namespace", "configmap", "secret"].includes(what)) {
      return fail(ctx, `error: the server doesn't have a resource type "${args[1] || ""}"`);
    }
    if (!name) return fail(ctx, `error: exactly one NAME is required`);
    const kube = kubeState(ctx);
    ctx.sessionDirty = true;
    if (what === "namespace") {
      if (!kube.namespaces.includes(name)) kube.namespaces.push(name);
      say(ctx, `namespace/${name} created`, TONE.ok);
      note(ctx, `created namespace ${name}`);
      return;
    }
    if (what === "configmap") {
      kube.configmaps[name] = {};
      say(ctx, `configmap/${name} created`, TONE.ok);
      return;
    }
    kube.secrets[name] = {};
    say(ctx, `secret/${name} created`, TONE.ok);
    return;
  }

  if (verb === "describe") return cmdDescribe(ctx, args.slice(1));

  if (verb === "logs") {
    const podArg = args[1] || "";
    const svc = findService(ctx, podArg);
    if (!svc) return fail(ctx, `Error from server (NotFound): pods "${podArg}" not found`);
    const tail = Number(flags["--tail"] || 30);
    const rows = (ctx.logs || []).filter((l: any) => l.service_id === svc.id).slice(-tail);
    if (!rows.length) return say(ctx, `no logs for ${podArg} yet`, TONE.muted);
    rows.forEach((l: any) => {
      const time = String(l.recorded_at || "").slice(11, 19) || "09:14:00";
      const tone = l.level === "error" || l.level === "fatal" ? TONE.err : l.level === "warn" ? TONE.warn : undefined;
      say(ctx, `${time}Z ${String(l.level || "info").toUpperCase().padEnd(5)} ${l.message}`, tone);
    });
    if (flags["--previous"]) {
      say(ctx, "");
      say(ctx, "# previous container instance:", TONE.dim);
      say(ctx, "panic: runtime error: invalid memory address or nil pointer dereference", TONE.err);
    }
    if (flags["-f"]) say(ctx, `following ${podArg} — simulated stream, press Ctrl+C to stop`, TONE.dim);
    note(ctx, `read logs for ${svc.name}`);
    return;
  }

  if (verb === "exec") {
    const dashIdx = rest.indexOf("--");
    const podArg = args[1] || args[2] || "";
    const svc = findService(ctx, podArg);
    if (!svc) return fail(ctx, `Error from server (NotFound): pods "${podArg}" not found`);
    const inner = dashIdx > -1 ? rest.slice(dashIdx + 1) : ["sh"];
    const cmd = inner.join(" ");
    if (cmd.startsWith("sh") || cmd.startsWith("bash")) {
      say(ctx, `(container shell for ${svc.name})`, TONE.dim);
      say(ctx, "Simulated container: try cat, ls, env, nslookup, curl, ps, df.");
      return;
    }
    if (cmd.startsWith("env") || cmd.startsWith("printenv")) {
      say(ctx, "PORT=8080");
      say(ctx, "DATABASE_URL=postgres://app_write@orders-db:5432/orders?sslmode=require");
      say(ctx, "POOL_MAX_CONNECTIONS=100");
      say(ctx, `POD_NAME=${podArg}`);
      return;
    }
    if (cmd.startsWith("cat ")) {
      const file = cmd.slice(4).trim();
      if (file === "/etc/hosts") return say(ctx, "127.0.0.1 localhost\n10.100.12.41 orders-db");
      if (file === "/proc/1/cmdline") return say(ctx, "/server");
      return fail(ctx, `cat: ${file}: No such file or directory`);
    }
    if (cmd.startsWith("ls")) return say(ctx, "bin  dev  etc  proc  server  sys  tmp");
    if (cmd.includes("nslookup") || cmd.includes("getent")) {
      return say(ctx, "Server:\t10.100.0.10\nAddress:\t10.100.0.10#53\n\nName:\torders-db.prod.svc.cluster.local\nAddress: 10.100.12.41");
    }
    if (cmd.includes("curl")) return say(ctx, svc.status === "down" ? "curl: (7) Failed to connect to localhost port 8080" : "ok");
    if (cmd.startsWith("ps")) return say(ctx, "PID   USER     TIME  COMMAND\n    1 nonroot  0:12 /server");
    if (cmd.startsWith("df")) return say(ctx, "Filesystem      Size  Used Avail Use% Mounted on\noverlay          40G  6.1G   34G  16% /");
    return say(ctx, `exec: ${cmd}: simulated container supports cat, ls, env, nslookup, curl, ps, df`, TONE.muted);
  }

  if (verb === "rollout") {
    const action = args[1];
    const ref = args[2] || "";
    const svc = findService(ctx, ref);
    if (!svc) return fail(ctx, `Error from server (NotFound): deployments.apps "${ref}" not found`);
    if (action === "status") {
      if (svc.status === "down") {
        return fail(ctx, `Waiting for deployment "${svc.name}" rollout to finish: 0 of ${svc.replicas} updated replicas are available...\nerror: deployment "${svc.name}" exceeded its progress deadline`);
      }
      say(ctx, `Waiting for deployment "${svc.name}" rollout to finish: 1 out of ${svc.replicas} new replicas have been updated...`, TONE.muted);
      say(ctx, `deployment "${svc.name}" successfully rolled out`, TONE.ok);
      return;
    }
    if (action === "restart") {
      touch(ctx, svc, { status: "deploying" }, `restarted ${svc.name} — new pods are rolling, metrics move as they come up`);
      say(ctx, `deployment.apps/${svc.name} restarted`, TONE.ok);
      return;
    }
    if (action === "undo") {
      const [major, minor] = String(svc.version || "1.0").split(".");
      const nextTag = `${major}.${Math.max(0, Number(minor) - 1)}.0`;
      const kube = kubeState(ctx);
      delete kube.problems[svc.name];
      touch(ctx, svc, { status: "deploying", version: nextTag }, `rolled ${svc.name} back to ${nextTag}`);
      say(ctx, `deployment.apps/${svc.name} rolled back`, TONE.ok);
      return;
    }
    if (action === "history") {
      say(ctx, "REVISION  CHANGE-CAUSE", TONE.head);
      say(ctx, "1         initial deploy");
      say(ctx, `2         kubectl set image (${svc.version})`);
      return;
    }
    return fail(ctx, `error: unknown rollout action ${action}`);
  }

  if (verb === "set") {
    const what = args[1];
    const ref = args[2] || "";
    const svc = findService(ctx, ref);
    if (!svc) return fail(ctx, `Error from server (NotFound): deployments.apps "${ref}" not found`);
    if (what === "image") {
      const pair = args[3] || "";
      const image = pair.includes("=") ? pair.split("=")[1] : pair;
      if (!image) return fail(ctx, "error: arguments in resource/name form must have a single container name");
      const result = applyImage(ctx, svc, image, "kubectl set image");
      const kube = kubeState(ctx);
      if (result.problem) {
        kube.problems[svc.name] = result.problem === "pull" ? "ImagePullBackOff" : "CrashLoopBackOff";
        kube.breaks = Number(kube.breaks || 0) + 1;
      } else {
        delete kube.problems[svc.name];
      }
      say(ctx, `deployment.apps/${svc.name} image updated`, result.problem ? TONE.warn : TONE.ok);
      if (result.problem === "crashloop") say(ctx, `# watch it: kubectl get pods -n ${ns} — the new pod will not become Ready`, TONE.warn);
      if (result.problem === "pull") say(ctx, `# image cannot be pulled from ${image.split(":")[0]}`, TONE.err);
      return;
    }
    if (what === "resources") {
      const limits = String(flags["--limits"] || "");
      ctx.session.workloads = ctx.session.workloads || {};
      ctx.session.workloads[svc.name] = { ...(ctx.session.workloads[svc.name] || {}), limits };
      ctx.sessionDirty = true;
      say(ctx, `deployment.apps/${svc.name} resource requirements updated`, TONE.ok);
      note(ctx, `set resources on ${svc.name}: ${limits}`);
      return;
    }
    return fail(ctx, `error: unknown set subcommand ${what}`);
  }

  if (verb === "scale") {
    const ref = args[1] || "";
    const svc = findService(ctx, ref);
    if (!svc) return fail(ctx, `Error from server (NotFound): deployments.apps "${ref}" not found`);
    const target = Number(flags["--replicas"]);
    if (Number.isNaN(target)) return fail(ctx, "error: --replicas must be an integer");
    const next = Math.max(0, Math.min(30, target));
    const prev = Number(svc.replicas) || 0;
    touch(ctx, svc, { replicas: next, status: next === 0 ? "down" : svc.status === "down" ? "deploying" : svc.status },
      `scaled ${svc.name} ${prev} → ${next} replicas`);
    note(ctx, `pod count ${prev} → ${next}: CPU per pod, DB connections and latency move with it`);
    say(ctx, `deployment.apps/${svc.name} scaled`, TONE.ok);
    return;
  }

  if (verb === "autoscale") {
    const ref = args[1] || "";
    const svc = findService(ctx, ref);
    if (!svc) return fail(ctx, `Error from server (NotFound): deployments.apps "${ref}" not found`);
    const min = Number(flags["--min"] || 1);
    const max = Number(flags["--max"] || 10);
    const cpu = Number(flags["--cpu-percent"] || 70);
    ctx.session.workloads = ctx.session.workloads || {};
    ctx.session.workloads[svc.name] = { ...(ctx.session.workloads[svc.name] || {}), autoscaler: { min, max, cpu } };
    ctx.sessionDirty = true;
    say(ctx, `horizontalpodautoscaler.autoscaling/${svc.name} autoscaled`, TONE.ok);
    note(ctx, `autoscaler on ${svc.name}: ${min}-${max} pods at ${cpu}% CPU`);
    return;
  }

  if (verb === "top") {
    const type = args[1] || "pods";
    if (type.startsWith("node")) {
      say(ctx, "NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%", TONE.head);
      nodeRows(ctx.resources).forEach((n) => {
        say(ctx, `${n.name.padEnd(14)} ${String(Math.round((n.cpu / 100) * 6400)).padEnd(12)} ${String(n.cpu).padEnd(6)} ${String(2200 + (n.cpu % 40) * 90).padEnd(15)} ${String(Math.min(99, 40 + n.cpu)).padEnd(8)}`);
      });
      return;
    }
    say(ctx, "NAME                            CPU(cores)   MEMORY(bytes)", TONE.head);
    ctx.services.forEach((svc: any) => {
      podRows(svc).forEach((p) => {
        const cpu = 40 + (hashStr(p.name) % 380);
        say(ctx, `${p.name.padEnd(31)} ${String(cpu).padEnd(12)} ${180 + (hashStr(p.name) % 420)}Mi`);
      });
    });
    return;
  }

  if (verb === "apply") {
    const fileIdx = rest.indexOf("-f");
    const file = fileIdx > -1 ? String(rest[fileIdx + 1] || "") : "";
    if (rest.includes("-k")) {
      return fail(ctx, `error: unable to find one of 'kustomization.yaml', 'kustomization.yml' or 'Kustomization' in directory ${rest[rest.indexOf("-k") + 1] || ""}`);
    }
    if (!file) return fail(ctx, "error: must specify one of -f and -k");
    const path = resolvePath(ctx.session.cwd, file);
    const content = readFile(fsOf(ctx), path);
    if (content == null) return fail(ctx, `error: the path "${file}" does not exist`);

    const parsed = parseYaml(content);
    if (!parsed.ok) return fail(ctx, parsed.error || "error: error converting YAML to JSON");
    const docs = asList(parsed.data);
    const kube = kubeState(ctx);
    ctx.sessionDirty = true;

    for (const doc of docs) {
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        return fail(ctx, `error: error validating "${file}": invalid object`);
      }
      if (!doc.kind) return fail(ctx, `error: error validating "${file}": kind not set`);
      if (!doc.apiVersion) return fail(ctx, `error: error validating "${file}": apiVersion not set`);
      const kind = String(doc.kind);
      const meta = doc.metadata || {};
      const name = String(meta.name || "");
      const namespace = String(meta.namespace || ns);
      if (!name) return fail(ctx, `error: error validating "${file}": metadata.name not set`);

      if (kind === "Namespace") {
        if (!kube.namespaces.includes(name)) kube.namespaces.push(name);
        say(ctx, `namespace/${name} created`, TONE.ok);
        continue;
      }
      if (kind === "ConfigMap") {
        kube.configmaps[name] = doc.data || {};
        say(ctx, `configmap/${name} configured`, TONE.ok);
        continue;
      }
      if (kind === "Secret") {
        kube.secrets[name] = doc.stringData || doc.data || {};
        say(ctx, `secret/${name} configured`, TONE.ok);
        continue;
      }
      if (kind === "Service") {
        const spec = doc.spec || {};
        const selector = spec.selector || {};
        const port = ((spec.ports || [])[0] || {}).port || 80;
        kube.services[name] = { type: spec.type || "ClusterIP", port: Number(port) || 80, selector };
        const selected = String(selector.app || "");
        if (selected && !findService(ctx, selected)) {
          kube.breaks = Number(kube.breaks || 0) + 1;
          kube.problems[name] = "SelectorMismatch";
          say(ctx, `# warning: Service/${name} selects app=${selected}, but no pod carries that label`, TONE.warn);
        } else {
          delete kube.problems[name];
        }
        say(ctx, `service/${name} configured`, TONE.ok);
        continue;
      }
      if (kind === "HorizontalPodAutoscaler") {
        const target = String(doc.spec?.scaleTargetRef?.name || "");
        const svc = findService(ctx, target);
        if (!svc) return fail(ctx, `error: resource mapping not found for name: "${name}": scaleTargetRef ${target} not found`);
        ctx.session.workloads = ctx.session.workloads || {};
        ctx.session.workloads[svc.name] = {
          ...(ctx.session.workloads[svc.name] || {}),
          autoscaler: {
            min: Number(doc.spec?.minReplicas || 1),
            max: Number(doc.spec?.maxReplicas || 5),
            cpu: Number(doc.spec?.metrics?.[0]?.resource?.target?.averageUtilization || 70),
          },
        };
        say(ctx, `horizontalpodautoscaler.autoscaling/${name} configured`, TONE.ok);
        continue;
      }
      if (kind !== "Deployment" && kind !== "StatefulSet") {
        return fail(ctx, `error: unable to recognize "${file}": no matches for kind "${kind}" in version "${doc.apiVersion}"`);
      }

      const svc = findService(ctx, name);
      if (!svc) {
        return fail(ctx, `error: resource mapping not found for name: "${name}" namespace: "${namespace}" from "${file}": no matches for kind "${kind}" in version "${doc.apiVersion}"\n# a Deployment must manage a service this save actually runs — check metadata.name`);
      }
      const spec = doc.spec || {};
      const podSpec = spec.template?.spec || {};
      const container = (podSpec.containers || [])[0] || {};

      if (container.image) {
        const result = applyImage(ctx, svc, String(container.image), `kubectl apply -f ${file}`);
        if (result.problem) {
          kube.problems[svc.name] = result.problem === "pull" ? "ImagePullBackOff" : "CrashLoopBackOff";
          kube.breaks = Number(kube.breaks || 0) + 1;
        } else {
          delete kube.problems[svc.name];
        }
      }
      if (spec.replicas != null && Number(spec.replicas) !== Number(svc.replicas)) {
        touch(ctx, svc, { replicas: Number(spec.replicas) }, `applied replicas=${spec.replicas} on ${svc.name}`);
      }
      const limits = container.resources?.limits;
      if (limits) {
        const text = Object.entries(limits).map(([k, v]) => `${k}=${v}`).join(",");
        ctx.session.workloads = ctx.session.workloads || {};
        ctx.session.workloads[svc.name] = { ...(ctx.session.workloads[svc.name] || {}), limits: text };
      }
      if (container.readinessProbe || container.livenessProbe) {
        kube.probes[svc.name] = {
          readiness: !!container.readinessProbe,
          liveness: !!container.livenessProbe,
        };
      }
      const missing: string[] = [];
      (container.envFrom || []).forEach((ref: any) => {
        if (ref?.configMapRef?.name && !kube.configmaps[ref.configMapRef.name]) missing.push(`configmap/${ref.configMapRef.name}`);
        if (ref?.secretRef?.name && !kube.secrets[ref.secretRef.name]) missing.push(`secret/${ref.secretRef.name}`);
      });
      if (missing.length) {
        kube.problems[svc.name] = "CreateContainerConfigError";
        kube.breaks = Number(kube.breaks || 0) + 1;
        say(ctx, `# warning: ${missing.join(", ")} not found — the pods will not start until it exists`, TONE.warn);
      }
      say(ctx, `deployment.apps/${svc.name} configured`, TONE.ok);
    }
    note(ctx, `applied ${file}`);
    return;
  }

  if (verb === "delete") {
    const type = (args[1] || "").replace(/s$/, "");
    const nameArg = args[2] || "";
    if (rest.includes("-f")) {
      ctx.risky = true;
      return fail(ctx, "error: refusing to delete everything in a manifest — use a resource name in this sim");
    }
    if (type === "pod") {
      say(ctx, `pod "${nameArg}" deleted`, TONE.ok);
      note(ctx, `deleted pod ${nameArg} — the ReplicaSet recreated it`);
      return;
    }
    const svc = findService(ctx, nameArg);
    if (!svc) return fail(ctx, `Error from server (NotFound): "${nameArg}" not found`);
    touch(ctx, svc, { replicas: 0, status: "down" }, `deleted deployment ${svc.name} — 0 replicas left`);
    ctx.risky = true;
    say(ctx, `deployment.apps "${svc.name}" deleted`, TONE.warn);
    return;
  }

  if (verb === "edit") {
    const ref = args[1] || "";
    const svc = findService(ctx, ref);
    if (!svc) return fail(ctx, `Error from server (NotFound): deployments.apps "${ref}" not found`);
    const path = "/home/engineer/repo/k8s/deployment.yaml";
    ctx.editor = { path, content: readFile(fsOf(ctx), path) || "", mode: "kubectl-edit" };
    say(ctx, "opened the deployment manifest (kubectl edit)", TONE.muted);
    return;
  }

  if (verb === "port-forward") {
    say(ctx, "Forwarding from 127.0.0.1:8080 -> 8080");
    say(ctx, "Forwarding from [::1]:8080 -> 8080", TONE.muted);
    note(ctx, `port-forwarded ${args[1] || ""}`);
    return;
  }

  if (verb === "cordon" || verb === "uncordon" || verb === "drain") {
    ctx.risky = verb === "drain";
    say(ctx, `node/${args[1] || "prod-node-b"} ${verb}ed`, TONE.warn);
    note(ctx, `${verb} ${args[1] || "prod-node-b"}`);
    return;
  }

  if (verb === "version") {
    say(ctx, "Client Version: v1.29.3");
    say(ctx, "Server Version: v1.29.3-eks-e71965b");
    return;
  }

  if (verb === "explain") return say(ctx, "KIND: Deployment\nVERSION: apps/v1\n\nFIELD: spec.replicas <integer>", TONE.muted);

  fail(ctx, `error: unknown command "${verb}" for "kubectl"`);
}

export function cmdDescribe(ctx: any, args: string[]) {
  const type = (args[0] || "pod").replace(/s$/, "");
  const ref = args[1] || "";
  const svc = findService(ctx, ref);
  if (type === "node") {
    const node = ctx.resources.find((r: any) => r.name === ref);
    if (!node) return fail(ctx, `Error from server (NotFound): nodes "${ref}" not found`);
    const util = Number(node.utilization) || 0;
    const diskPressure = (node.tags || []).includes("disk-pressure");
    say(ctx, `Name:               ${node.name}`, TONE.head);
    say(ctx, "Roles:              <none>");
    say(ctx, `Labels:             kubernetes.io/hostname=${node.name}`);
    say(ctx, "Capacity:           cpu: 8, memory: 32168032Ki, ephemeral-storage: 209715200Ki");
    say(ctx, "Allocatable:        cpu: 7910m, memory: 30644000Ki");
    say(ctx, "System Info:        Kernel Version: 6.1.0-18-cloud-amd64, OS Image: Amazon Linux 2023");
    say(ctx, "Non-terminated Pods: 14");
    say(ctx, "");
    say(ctx, "Conditions:", TONE.muted);
    say(ctx, `  MemoryPressure   ${util > 85 ? "True" : "False"}`, util > 85 ? TONE.warn : undefined);
    say(ctx, `  DiskPressure     ${diskPressure ? "True" : "False"}`, diskPressure ? TONE.err : undefined);
    say(ctx, `  Ready            ${node.status === "stopped" ? "False" : "True"}`, node.status === "stopped" ? TONE.err : undefined);
    say(ctx, "");
    say(ctx, "Allocated resources:", TONE.muted);
    say(ctx, `  cpu: ${Math.round(util * 0.6)}%   memory: ${util}%`);
    note(ctx, `described node ${node.name}`);
    return;
  }
  if (!svc) return fail(ctx, `Error from server (NotFound): "${ref}" not found`);

  if (type === "deployment" || type === "deploy") {
    const ready = readyCount(svc);
    say(ctx, `Name:                   ${svc.name}`, TONE.head);
    say(ctx, "Namespace:              prod");
    say(ctx, `Selector:               app=${svc.name}`);
    say(ctx, `Replicas:               ${svc.replicas} desired | ${ready} available`);
    say(ctx, "StrategyType:           RollingUpdate");
    say(ctx, "Pod Template:");
    say(ctx, "  Containers:");
    say(ctx, "   app:");
    say(ctx, `    Image:      ${imageRef(ctx, svc)}`);
    say(ctx, "    Port:       8080/TCP");
    say(ctx, "    Limits:     cpu: 1, memory: 768Mi");
    say(ctx, `    Env From:   ${svc.name}-env (Secret)`);
    say(ctx, "Conditions:");
    say(ctx, "  Type           Status  Reason");
    say(ctx, `  Available      ${ready > 0 ? "True " : "False"}   ${ready > 0 ? "MinimumReplicasAvailable" : "MinimumReplicasUnavailable"}`);
    say(ctx, `  Progressing    True    ${svc.status === "degraded" ? "ReplicaSetUpdated" : "NewReplicaSetAvailable"}`);
    say(ctx, "");
    say(ctx, "Events:", TONE.muted);
    say(ctx, "  Type     Reason             Age   Message");
    if (svc.status === "degraded") {
      say(ctx, "  Warning  FailedCreate      2m    Error creating: pods exceed node capacity on prod-node-b", TONE.warn);
      say(ctx, "  Warning  Unhealthy         1m    Readiness probe failed: connection pool exhausted", TONE.err);
    } else if (svc.status === "down") {
      say(ctx, `  Warning  ImagePullBackOff  1m    Back-off pulling image "${imageRef(ctx, svc)}"`, TONE.err);
    } else {
      say(ctx, `  Normal   ScalingReplicaSet 4m    Scaled up replica set ${svc.name}-${replicaSet(svc)} to ${svc.replicas}`);
      say(ctx, "  Normal   Pulled            4m    Container image already present on machine");
    }
    note(ctx, `described deployment ${svc.name}`);
    return;
  }

  const pods = podRows(svc);
  const pod = pods.find((p) => p.name === ref) || pods[0];
  if (!pod) return fail(ctx, `Error from server (NotFound): pods "${ref}" not found`);
  say(ctx, `Name:             ${pod.name}`, TONE.head);
  say(ctx, "Namespace:        prod");
  say(ctx, `Node:             ${pod.node}/10.20.1.12`);
  say(ctx, `Start Time:       ${new Date(Date.now() - 11 * 60 * 1000).toUTCString()}`);
  say(ctx, `Labels:           app=${svc.name}`);
  say(ctx, `Status:           ${pod.state}`, pod.state === "Running" ? TONE.ok : TONE.err);
  say(ctx, `IP:               10.20.1.${40 + (hashStr(pod.name) % 150)}`);
  say(ctx, "Containers:");
  say(ctx, "  app:");
  say(ctx, `    Image:          ${imageRef(ctx, svc)}`);
  say(ctx, `    State:          ${pod.state}`);
  if (pod.state === "CrashLoopBackOff") {
    say(ctx, "      Last State:   Terminated");
    say(ctx, "        Reason:     Error");
    say(ctx, "        Exit Code:  1");
    say(ctx, "    Ready:          False");
    say(ctx, `    Restart Count:  ${pod.restarts}`, TONE.err);
  } else {
    say(ctx, `    Ready:          ${pod.ready === "1/1" ? "True" : "False"}`);
    say(ctx, `    Restart Count:  ${pod.restarts}`);
  }
  say(ctx, "    Limits:");
  say(ctx, "      cpu:     1");
  say(ctx, "      memory:  768Mi");
  say(ctx, "    Environment Variables from:");
  say(ctx, `      ${svc.name}-env  Secret  Optional: false`);
  say(ctx, "");
  say(ctx, "Events:", TONE.muted);
  say(ctx, "  Type     Reason     Age   From     Message");
  if (pod.state === "CrashLoopBackOff") {
    say(ctx, `  Warning  BackOff    30s   kubelet  Back-off restarting failed container app in pod ${pod.name}`, TONE.err);
    say(ctx, "  Normal   Pulled     2m    kubelet  Container image already present on machine");
    say(ctx, "  Warning  Unhealthy  1m    kubelet  Liveness probe failed: dial tcp 10.20.1.63:8080: connect: connection refused", TONE.warn);
  } else if (pod.state === "ContainerCreating") {
    say(ctx, `  Normal   Scheduled  20s   default-scheduler  Successfully assigned prod/${pod.name} to ${pod.node}`);
    say(ctx, '  Warning  FailedMount 15s  kubelet  MountVolume.SetUp failed for volume "config": timeout', TONE.warn);
  } else {
    say(ctx, "  Normal   Started    4m    kubelet  Started container app");
    say(ctx, "  Normal   Pulled     4m    kubelet  Container image already present on machine");
  }
  note(ctx, `described pod ${pod.name}`);
}

export { cmdHelm } from "./gitops.ts";

export function cmdTerraform(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const sub = args[0] || "";
  const nodeRes = ctx.resources.filter((r: any) => r.kind === "node");
  const nodeCount = nodeRes.length;
  const REPO = "/home/engineer/repo";
  const vpcWorkspace = (readFile(fsOf(ctx), `${REPO}/terraform/main.tf`) || "").includes("skyloom");

  if (sub === "force-unlock") {
    say(ctx, "Terraform state has been successfully unlocked", TONE.ok);
    say(ctx, `  Lock Info:\n    ID:        ${args[1] || "4f1c2b7e-9a3d-4d21-b0f5-6c8e2a1d9f30"}\n    Operation: OperationTypeApply\n    Who:       rohan@skyloom-cloud\n    Created:   2026-10-27 18:04:11`, TONE.dim);
    say(ctx, "");
    say(ctx, "# Only clear a lock when you know the other apply is dead.", TONE.dim);
    note(ctx, "released the stale state lock");
    return;
  }

  if (vpcWorkspace && sub === "init" && (readFile(fsOf(ctx), `${REPO}/terraform/versions.tf`) || "").includes("~> 4.0")) {
    ctx.exitCode = 1;
    say(ctx, "Initializing the backend...");
    say(ctx, "Error: Failed to query available provider packages", TONE.err);
    say(ctx, "  Could not retrieve the list of available versions for provider hashicorp/aws:");
    say(ctx, "  no available releases match the given constraints ~> 4.0");
    say(ctx, "");
    say(ctx, "# versions.tf pins a provider older than this module uses.", TONE.dim);
    return;
  }

  if (sub === "init") {
    say(ctx, "Initializing the backend...", TONE.muted);
    say(ctx, "Initializing provider plugins...");
    say(ctx, '- Finding hashicorp/aws versions matching "~> 5.40"...');
    say(ctx, "- Installing hashicorp/aws v5.44.0...");
    say(ctx, "");
    say(ctx, "Terraform has been successfully initialized!", TONE.ok);
    note(ctx, "terraform init");
    return;
  }
  if (sub === "validate") return say(ctx, "Success! The configuration is valid.", TONE.ok);
  if (sub === "fmt") {
    say(ctx, `${REPO}/terraform/main.tf`);
    note(ctx, "formatted terraform");
    return;
  }
  if (sub === "plan") {
    say(ctx, "Refreshing Terraform state in-memory prior to plan...", TONE.muted);
    say(ctx, "aws_eks_node_group.prod: Refreshing state... [id=prod]");
    const declared = 4;
    const drift = declared - nodeCount;
    say(ctx, "");
    say(ctx, "Note: Objects have changed outside of Terraform", TONE.warn);
    say(ctx, "  ~ aws_eks_node_group.prod");
    say(ctx, `      ~ scaling_config.0.desired_size = ${declared} -> ${nodeCount}`, TONE.warn);
    say(ctx, "");
    say(ctx, `Plan: 0 to add, ${drift !== 0 ? 1 : 0} to change, 0 to destroy.`, drift !== 0 ? TONE.warn : undefined);
    say(ctx, "");
    say(ctx, `# Someone changed the node group outside terraform. Applying would restore ${declared}.`, TONE.dim);
    note(ctx, "terraform plan showed drift");
    return;
  }
  if (sub === "apply") {
    ctx.risky = true;
    say(ctx, "aws_eks_node_group.prod: Modifying... [id=prod]", TONE.muted);
    say(ctx, "aws_eks_node_group.prod: Modifications complete after 2m14s");
    say(ctx, "");
    say(ctx, "Apply complete! Resources: 0 added, 1 changed, 0 destroyed.", TONE.ok);
    note(ctx, "terraform apply reconciled the node group drift");
    return;
  }
  if (sub === "destroy") {
    ctx.risky = true;
    if (vpcWorkspace) {
      say(ctx, "aws_subnet.private: Destroying... [id=subnet-0b82de]", TONE.muted);
      say(ctx, "aws_vpc.main: Destroying... [id=vpc-0a91f2c3d4]");
      say(ctx, "");
      say(ctx, "Destroy complete! Resources: 4 destroyed.", TONE.ok);
      note(ctx, "destroyed the dev environment");
      return;
    }
    return fail(ctx, "Destroying prod needs a change ticket. terraform/backend.tf sets prevent_destroy = true.");
  }
  if (sub === "state") {
    nodeRes.forEach((n: any) => say(ctx, `aws_instance.${n.name.replace(/-/g, "_")}`));
    say(ctx, "module.eks.aws_eks_cluster.this");
    say(ctx, "module.eks.aws_eks_node_group.prod");
    return;
  }
  if (sub === "output") {
    say(ctx, `cluster_name = "${ctx.cluster.name}"`);
    say(ctx, `cluster_endpoint = "https://${ctx.cluster.accountId}.gr7.${ctx.cluster.region}.eks.amazonaws.com"`);
    say(ctx, `node_group_size = ${nodeCount}`);
    return;
  }
  fail(ctx, `Terraform has no command named "${sub}".`);
}

export function cmdAnsible(ctx: any, rest: string[]) {
  const { args, flags } = parseArgs(rest);
  const playbook = args.find((a) => a.endsWith(".yml")) || "playbook.yml";
  const invFlag = rest.indexOf("-i");
  const inventory = invFlag > -1 && rest[invFlag + 1] ? rest[invFlag + 1] : "inventory.ini";
  const inventoryText = readFile(fsOf(ctx), resolvePath(ctx.session.cwd, inventory)) || "";
  const hosts = inventoryText
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row && !row.startsWith("#") && !row.startsWith("["))
    .map((row) => row.split(/\s+/))
    .filter((parts) => parts[0] && !parts[0].includes("="))
    .map((parts) => ({ name: parts[0], line: parts.join(" ") }));

  // `ansible all -m ping` never reads a playbook: it is the inventory check.
  if (flags["-m"]) {
    hosts.forEach((host) => {
      if (host.line.includes("ansible_ssh_private_key_file")) {
        say(ctx, `${host.name} | UNREACHABLE! => {"changed": false, "msg": "Failed to connect to the host via ssh: Permission denied (publickey).", "unreachable": true}`, TONE.err);
        ctx.exitCode = 4;
        return;
      }
      say(ctx, `${host.name} | SUCCESS => {"changed": false, "ping": "pong"}`, TONE.ok);
    });
    note(ctx, `pinged ${hosts.length} hosts from ${inventory}`);
    return;
  }

  // A web fleet inventory gets its own recap: the tasks are the ones the
  // fleet project writes, and the host that fails is the one with no disk.
  if (hosts.length && hosts[0].name.startsWith("web-")) {
    const recap = hosts.map((host) => ({
      name: host.name,
      unreachable: host.line.includes("ansible_ssh_private_key_file"),
      failed: host.name === "web-02",
    }));
    say(ctx, `PLAY [${playbook}] ${"*".repeat(48)}`, TONE.head);
    say(ctx, `TASK [Gathering Facts] ${"*".repeat(58)}`);
    recap.forEach((h) => say(ctx, h.unreachable
      ? `fatal: [${h.name}]: UNREACHABLE! => {"changed": false, "msg": "Failed to connect to the host via ssh: Permission denied (publickey)."}`
      : `ok: [${h.name}]`, h.unreachable ? TONE.err : undefined));
    say(ctx, `TASK [install nginx] ${"*".repeat(62)}`);
    recap.filter((h) => !h.unreachable).forEach((h) => say(ctx, `changed: [${h.name}]`, TONE.ok));
    say(ctx, `TASK [start nginx] ${"*".repeat(64)}`);
    recap.filter((h) => !h.unreachable).forEach((h) => say(ctx, h.failed
      ? 'fatal: [web-02]: FAILED! => {"changed": false, "msg": "Job for nginx.service failed because the control process exited with error code. No space left on device."}'
      : `changed: [${h.name}]`, h.failed ? TONE.err : TONE.ok));
    say(ctx, "");
    say(ctx, `PLAY RECAP ${"*".repeat(68)}`);
    recap.forEach((h) => {
      const bad = h.unreachable || h.failed;
      say(ctx, `${h.name.padEnd(13)}: ok=${h.unreachable ? 0 : 3} changed=${h.unreachable ? 0 : 2} unreachable=${h.unreachable ? 1 : 0} failed=${bad ? 1 : 0}`, bad ? TONE.err : undefined);
    });
    ctx.exitCode = 2;
    note(ctx, `ran ${playbook}: ${recap.filter((h) => h.unreachable || h.failed).length} host(s) failed`);
    return;
  }
  if (!readFile(fsOf(ctx), resolvePath(ctx.session.cwd, playbook))) {
    return fail(ctx, `ERROR! the playbook: ${playbook} could not be found`);
  }
  say(ctx, "PLAY [bootstrap node] " + "*".repeat(48), TONE.head);
  say(ctx, "");
  say(ctx, "TASK [Gathering Facts] " + "*".repeat(60));
  nodeRows(ctx.resources).forEach((n) => say(ctx, `ok: [${n.name}]`));
  say(ctx, "");
  say(ctx, "TASK [install packages] " + "*".repeat(59));
  nodeRows(ctx.resources).forEach((n) => say(ctx, `changed: [${n.name}]`, TONE.ok));
  say(ctx, "");
  say(ctx, "TASK [tune sysctl] " + "*".repeat(64));
  say(ctx, "changed: [prod-node-a] => (item=net.ipv4.ip_forward)", TONE.ok);
  say(ctx, "");
  say(ctx, "TASK [logrotate config] " + "*".repeat(58));
  say(ctx, 'fatal: [prod-node-b]: FAILED! => {"changed": false, "msg": "Destination directory /etc/logrotate.d does not exist"}', TONE.err);
  say(ctx, "");
  say(ctx, "PLAY RECAP " + "*".repeat(67));
  say(ctx, "prod-node-a  : ok=4 changed=3 unreachable=0 failed=0");
  say(ctx, "prod-node-b  : ok=3 changed=2 unreachable=0 failed=1", TONE.err);
  say(ctx, "prod-node-c  : ok=4 changed=3 unreachable=0 failed=0");
  say(ctx, "");
  say(ctx, `# inventory used: ${inventory}`, TONE.dim);
  ctx.exitCode = 2;
  note(ctx, `ran ansible playbook ${playbook}: prod-node-b failed`);
}

export function cmdAws(ctx: any, rest: string[]) {
  const { flags, args } = parseArgs(rest);
  const service = args[0] || "";
  const action = args[1] || "";
  const account = ctx.cluster.accountId;
  const region = ctx.cluster.region;

  if (awsSecurity(ctx, service, action, args, flags)) return;

  if (service === "sts" && action === "get-caller-identity") {
    say(ctx, JSON.stringify({
      UserId: `AROA${account}EXAMPLE:engineer`,
      Account: account,
      Arn: `arn:aws:sts::${account}:assumed-role/PlatformEngineer/engineer`,
    }, null, 4));
    return;
  }
  if (service === "ec2" && action === "describe-instances") {
    const nodes = nodeRows(ctx.resources);
    say(ctx, JSON.stringify({
      Reservations: [{ Instances: nodes.map((n) => ({
        InstanceId: instanceIdFor(n.name),
        InstanceType: n.instance,
        State: { Name: n.status === "NotReady" ? "stopped" : "running" },
        PrivateIpAddress: n.ip,
        Placement: { AvailabilityZone: `${region}a` },
        Tags: [{ Key: "Name", Value: n.name }],
      })) }],
    }, null, 4));
    note(ctx, "described EC2 instances");
    return;
  }
  if (service === "ec2" && (action === "stop-instances" || action === "start-instances")) {
    const refs = rest.filter((t) => /^i-[0-9a-z]{6,}$/i.test(t));
    const wanted = refs.length ? refs : [String(args[2] || args[3] || "")];
    const nodes = wanted
      .map((ref) => ctx.resources.find((r: any) => r.name === ref || instanceIdFor(r.name) === ref))
      .filter(Boolean);
    if (!nodes.length) return fail(ctx, `An error occurred (InvalidInstanceID.NotFound) when calling the ${action} operation: ${wanted[0]}`);
    const stopping = action === "stop-instances";
    ctx.resourceUpdates = ctx.resourceUpdates || {};
    nodes.forEach((node: any) => {
      node.status = stopping ? "stopped" : "running";
      node.utilization = stopping ? 0 : 62;
      ctx.resourceUpdates[node.id] = { status: node.status, utilization: node.utilization };
    });
    ctx.sessionDirty = true;
    ctx.risky = true;
    note(ctx, `${stopping ? "stopped" : "started"} ${nodes.map((n: any) => n.name).join(", ")} — cluster capacity changed`);
    say(ctx, JSON.stringify({
      [stopping ? "StoppingInstances" : "StartingInstances"]: nodes.map((node: any) => ({
        InstanceId: instanceIdFor(node.name),
        PreviousState: { Name: stopping ? "running" : "stopped" },
        CurrentState: { Name: stopping ? "stopping" : "pending" },
      })),
    }, null, 4), TONE.warn);
    return;
  }
  if (service === "eks" && action === "describe-cluster") {
    say(ctx, JSON.stringify({
      cluster: {
        name: ctx.cluster.name,
        arn: `arn:aws:eks:${region}:${account}:cluster/${ctx.cluster.name}`,
        version: "1.29",
        status: "ACTIVE",
        endpoint: `https://${account}.gr7.${region}.eks.amazonaws.com`,
        platformVersion: "eks.12",
        resourcesVpcConfig: { vpcId: "vpc-0a1b2c3d", subnetIds: ["subnet-0a11", "subnet-0b22"] },
      },
    }, null, 4));
    return;
  }
  if (service === "eks" && action === "update-kubeconfig") {
    say(ctx, `Added new context arn:aws:eks:${region}:${account}:cluster/${ctx.cluster.name} to /home/engineer/.kube/config`);
    note(ctx, "refreshed kubeconfig");
    return;
  }
  if (service === "eks" && action === "list-clusters") {
    say(ctx, JSON.stringify({ clusters: [ctx.cluster.name] }, null, 4));
    return;
  }
  if (service === "ecr" && action === "get-login-password") {
    say(ctx, "eyJwYXlsb2FkIjoiZXlKbGVIQWlPakV6TURBd01EQXNJbWtpT2lKdFpTSjkifQ", TONE.muted);
    note(ctx, "fetched an ECR auth token");
    return;
  }
  if (service === "ecr" && action === "describe-repositories") {
    say(ctx, JSON.stringify({
      repositories: ctx.services.slice(0, 3).map((svc: any) => ({
        repositoryName: svc.name,
        repositoryUri: `${account}.dkr.ecr.${region}.amazonaws.com/${svc.name}`,
      })),
    }, null, 4));
    return;
  }
  if (service === "s3" && action === "ls") {
    const bucket = args[2] || "";
    if (!bucket) {
      say(ctx, `2026-01-04 09:12:11 ${ctx.cluster.company}-tfstate`);
      say(ctx, `2026-02-18 14:02:55 ${ctx.cluster.company}-backups`);
      say(ctx, `2026-03-22 11:41:02 ${ctx.cluster.company}-artifacts`);
      return;
    }
    say(ctx, "2026-10-24 02:00:14   41234122  db/orders-20261024.sql.gz");
    say(ctx, "2026-10-23 02:00:09   40918233  db/orders-20261023.sql.gz");
    return;
  }
  if (service === "s3" && (action === "cp" || action === "rm")) {
    ctx.risky = action === "rm";
    say(ctx, `upload: ${args[2] || "file"} to ${args[3] || "s3://bucket/key"}`);
    note(ctx, `s3 ${action} ${args[2] || ""}`);
    return;
  }
  if (service === "iam" && action === "list-users") {
    return fail(ctx, `An error occurred (AccessDenied) when calling the ListUsers operation: User: arn:aws:sts::${account}:assumed-role/PlatformEngineer/engineer is not authorized to perform: iam:ListUsers`);
  }
  if (service === "iam" && action === "get-user") {
    say(ctx, JSON.stringify({ User: { UserName: "engineer", Arn: `arn:aws:iam::${account}:user/engineer`, CreateDate: "2025-04-11T07:12:00Z" } }, null, 4));
    return;
  }
  if (service === "ce" && action === "get-cost-and-usage") {
    const LABELS: Record<string, string> = {
      node: "Amazon Elastic Compute Cloud - Compute",
      database: "Amazon Relational Database Service",
      cache: "Amazon ElastiCache",
      queue: "Amazon Simple Queue Service",
      load_balancer: "Elastic Load Balancing",
      bucket: "Amazon Simple Storage Service",
      dns: "Amazon Route 53",
      network: "Amazon Virtual Private Cloud",
      cluster: "Amazon Elastic Kubernetes Service",
    };
    const byKind: Record<string, number> = {};
    // Stopped and terminated resources are not billed for the month any more.
    ctx.resources.filter((r: any) => r.status !== "stopped" && r.status !== "terminated").forEach((r: any) => {
      const key = LABELS[r.kind] || "Other";
      byKind[key] = (byKind[key] || 0) + (Number(r.monthly_cost) || 0);
    });
    const total = Object.values(byKind).reduce((a, b) => a + b, 0);
    say(ctx, JSON.stringify({
      ResultsByTime: [{
        TimePeriod: { Start: "2026-10-01", End: "2026-10-25" },
        Groups: Object.entries(byKind).map(([key, amount]) => ({
          Keys: [key],
          Metrics: { UnblendedCost: { Amount: amount.toFixed(2), Unit: "USD" } },
        })),
        Total: { UnblendedCost: { Amount: total.toFixed(2), Unit: "USD" } },
      }],
    }, null, 4));
    note(ctx, "checked monthly spend");
    return;
  }
  fail(ctx, `aws: error: argument command: Invalid choice: '${action || service}'`);
}

export function cmdGh(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const [area, sub] = args;
  if (area === "run" && sub === "list") {
    say(ctx, "STATUS  TITLE                 WORKFLOW  BRANCH  ID", TONE.head);
    say(ctx, "X       fix: raise pool size  deploy    main    4120", TONE.err);
    say(ctx, "✓       feat: batching        deploy    main    4119", TONE.ok);
    say(ctx, "✓       test: retry coverage  test/pr   feat/b  4118", TONE.ok);
    return;
  }
  if (area === "run" && sub === "view") {
    say(ctx, "X  deploy #4120", TONE.err);
    say(ctx, "Triggered by push · main · 12 minutes ago");
    say(ctx, "");
    say(ctx, "✓ Checkout              4s");
    say(ctx, "✓ Test                  98s");
    say(ctx, "✓ Build image           41s");
    say(ctx, "X Migrations            6s", TONE.err);
    say(ctx, '  error: role "app_write" does not have permission on orders_audit', TONE.err);
    say(ctx, "- Deploy                skipped");
    note(ctx, "read a failing pipeline run");
    return;
  }
  if (area === "pr" && sub === "list") {
    say(ctx, "#1187  fix(app): raise pool size and add connect backoff   OPEN   You", TONE.muted);
    say(ctx, "#1184  chore(infra): pin node group to 3                    OPEN   Platform", TONE.muted);
    return;
  }
  if (area === "pr" && sub === "create") {
    const idx = rest.indexOf("--title");
    const title = idx > -1 ? rest[idx + 1] : "";
    if (!title) return fail(ctx, 'pull request title required: gh pr create --title "..."');
    say(ctx, `https://github.com/acme/${primaryService(ctx).name}/pull/${1188 + (hashStr(title) % 40)}`, TONE.ok);
    note(ctx, `opened a pull request: ${title.replace(/"/g, "")}`);
    return;
  }
  if (area === "pr" && sub === "merge") {
    ctx.risky = true;
    say(ctx, "✓ Merged pull request #1187 (fix: raise pool size and add connect backoff)", TONE.ok);
    note(ctx, "merged a pull request to main");
    return;
  }
  if (area === "workflow" && sub === "run") {
    say(ctx, `✓ Created workflow_dispatch event for ${args[2] || "deploy.yml"}`, TONE.ok);
    note(ctx, `triggered workflow ${args[2] || "deploy.yml"}`);
    return;
  }
  if (!area) return say(ctx, "gh: available here: run list|view, pr list|create|merge, workflow run", TONE.muted);
  fail(ctx, `gh: unknown command "${args.join(" ")}"`);
}

export function cmdJenkins(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const sub = args[0] || "";
  if (sub === "jobs") {
    say(ctx, "NAME            STATUS     LAST BUILD", TONE.head);
    say(ctx, "deploy/prod     FAILURE    #1284 · 12m ago");
    say(ctx, "test/pr         SUCCESS    #1282 · 2h ago");
    return;
  }
  if (sub === "build") {
    say(ctx, "Started deploy/prod #1285", TONE.ok);
    say(ctx, "Waiting for next available executor on 'docker'...");
    note(ctx, "triggered Jenkins build #1285");
    return;
  }
  if (sub === "console") {
    const log = readFile(fsOf(ctx), "/home/engineer/repo/build.log");
    if (!log) return fail(ctx, "jenkins: build.log not found");
    log.split("\n").forEach((l) => say(ctx, l, /ERROR|FAILURE/.test(l) ? TONE.err : undefined));
    return;
  }
  fail(ctx, "jenkins: available here: jobs, build, console", TONE.muted);
}

export { cmdArgocd } from "./gitops.ts";

export function cmdSystemctl(ctx: any, args: string[]) {
  const [verb, unit] = args;
  if (!verb || verb === "list-units") {
    say(ctx, "UNIT              LOAD   ACTIVE SUB     DESCRIPTION", TONE.head);
    [
      ["containerd.service", "loaded", "active", "running", "containerd container runtime"],
      ["kubelet.service", "loaded", "active", "running", "kubelet: the Kubernetes node agent"],
      ["nginx.service", "loaded", "active", "running", "A high performance web server"],
      ["chronyd.service", "loaded", "active", "running", "NTP client/server"],
      ["cron.service", "loaded", "active", "running", "Regular background program processing daemon"],
      ["jenkins-agent.service", "loaded", "active", "running", "Jenkins inbound agent"],
    ].forEach((u) => say(ctx, `${u[0].padEnd(18)} ${u[1].padEnd(6)} ${u[2].padEnd(7)} ${u[3].padEnd(7)} ${u[4]}`));
    return;
  }
  if (!unit) return fail(ctx, `systemctl: ${verb}: missing unit name`);
  if (verb === "status") {
    say(ctx, `● ${unit} - ${unit.replace(".service", "")}`, TONE.head);
    say(ctx, `     Loaded: loaded (/lib/systemd/system/${unit}; enabled; preset: enabled)`);
    say(ctx, `     Active: active (running) since ${new Date(Date.now() - 41 * 864e5).toUTCString()}; 41 days ago`);
    say(ctx, `   Main PID: ${900 + (hashStr(unit) % 400)} (${unit.replace(".service", "")})`);
    say(ctx, "      Tasks: 42 (limit: 38427)");
    say(ctx, "     Memory: 312.4M");
    if (unit.startsWith("kubelet")) {
      say(ctx, "");
      say(ctx, "Oct 24 09:12:04 bastion kubelet[655]: W1024 disk usage on / is 88%, image GC threshold reached", TONE.warn);
      say(ctx, "Oct 24 09:12:04 bastion kubelet[655]: I1024 Disk pressure is now true on node prod-node-b", TONE.warn);
    }
    return;
  }
  if (verb === "restart" || verb === "start" || verb === "stop") {
    say(ctx, `${verb === "stop" ? "Stopped" : "Restarted"} ${unit}.`, TONE.ok);
    note(ctx, `systemctl ${verb} ${unit}`);
    if (verb === "stop" && (unit.startsWith("kubelet") || unit.startsWith("containerd"))) {
      ctx.risky = true;
      note(ctx, `stopping ${unit} takes this node out of the cluster`);
    }
    return;
  }
  fail(ctx, `Unknown operation '${verb}'.`);
}

export function cmdJournalctl(ctx: any, rest: string[]) {
  const { flags } = parseArgs(rest);
  const unit = String(flags["-u"] || "");
  const n = Number(flags["-n"] || 20);
  const rows: string[] = [];
  if (unit.includes("kubelet")) {
    rows.push(
      'Oct 24 08:58:11 bastion kubelet[655]: I1024 Successfully pulled image "' + primaryService(ctx).name + ':2.14.3"',
      "Oct 24 09:01:42 bastion kubelet[655]: W1024 Failed to garbage collect required amount of images: free disk below threshold",
      "Oct 24 09:01:42 bastion kubelet[655]: E1024 ImageGC failed: no space left on device",
      "Oct 24 09:12:04 bastion kubelet[655]: W1024 disk usage on / is 88%, eviction threshold is 85%",
      "Oct 24 09:12:04 bastion kubelet[655]: I1024 Disk pressure is now true on node prod-node-b"
    );
  } else if (unit.includes("nginx")) {
    rows.push(
      'Oct 24 09:14:02 bastion nginx[1180]: 10.20.1.24 - - "GET /healthz HTTP/1.1" 200 2',
      'Oct 24 09:14:09 bastion nginx[1180]: 10.20.1.24 - - "GET /v1/orders HTTP/1.1" 502 0'
    );
  } else {
    (ctx.logs || []).slice(-n).forEach((l: any) => {
      rows.push(`Oct 24 09:12:0${l.game_minute % 10} bastion ${l.logger || "app"}[1120]: ${String(l.level).toUpperCase()} ${l.message}`);
    });
  }
  if (!rows.length) rows.push("-- No entries --");
  rows.slice(-n).forEach((r) => say(ctx, r));
  if (unit.includes("kubelet")) {
    say(ctx, "");
    say(ctx, "# Disk pressure is evicting pods on prod-node-b. Free space or add a node.", TONE.warn);
    note(ctx, "read the system journal");
  }
}

export function cmdOpenssl(ctx: any, rest: string[]) {
  const joined = rest.join(" ");
  if (joined.includes("s_client")) {
    say(ctx, "CONNECTED(00000003)");
    say(ctx, "---");
    say(ctx, "Certificate chain");
    say(ctx, " 0 s:CN = *.acme.example.com");
    say(ctx, "   i:C = US, O = Let's Encrypt, CN = R3");
    say(ctx, "---");
    say(ctx, "Server certificate");
    say(ctx, "-----BEGIN CERTIFICATE-----");
    say(ctx, "MIIF...truncated...");
    say(ctx, "-----END CERTIFICATE-----");
    say(ctx, "subject=CN = *.acme.example.com");
    say(ctx, "issuer=C = US, O = Let's Encrypt, CN = R3");
    say(ctx, "---");
    say(ctx, "notBefore=Jul 18 00:00:00 2026 GMT");
    say(ctx, "notAfter=Nov  3 23:59:59 2026 GMT   # 9 days left", TONE.warn);
    note(ctx, "checked the TLS certificate expiry");
    return;
  }
  if (joined.includes("x509")) {
    say(ctx, "notBefore=Jul 18 00:00:00 2026 GMT");
    say(ctx, "notAfter=Nov  3 23:59:59 2026 GMT", TONE.warn);
    return;
  }
  if (joined.includes("version")) return say(ctx, "OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13)");
  if (joined.includes("req")) {
    say(ctx, "Generating a RSA private key");
    say(ctx, "..........+++++");
    say(ctx, "writing new private key to 'new.key'");
    note(ctx, "generated a certificate request");
    return;
  }
  say(ctx, "openssl: supported here: s_client, x509 -dates, version, req", TONE.muted);
}

export function cmdNginx(ctx: any, rest: string[]) {
  if (rest.includes("-t")) {
    const content = readFile(fsOf(ctx), "/home/engineer/repo/nginx/nginx.conf");
    if (content == null) return fail(ctx, 'nginx: [emerg] open() "/home/engineer/repo/nginx/nginx.conf" failed (2: No such file or directory)');
    say(ctx, "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok");
    say(ctx, "nginx: configuration file /etc/nginx/nginx.conf test is successful", TONE.ok);
    note(ctx, "validated nginx config");
    return;
  }
  if (rest.includes("-s") && rest.includes("reload")) {
    say(ctx, "nginx: signal process started", TONE.ok);
    note(ctx, "reloaded nginx");
    return;
  }
  say(ctx, "nginx: invalid option. Try `nginx -t` or `nginx -s reload`", TONE.muted);
}

export function cmdTrivy(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const image = args[1] || args[0] || imageRef(ctx, primaryService(ctx));
  say(ctx, `2026-10-25T09:14:00Z\tINFO\tScanning image for vulnerabilities: ${image}`, TONE.muted);
  say(ctx, "");
  const rows: string[][] = [
    ["LIBRARY", "VERSION", "VULNERABILITY", "SEVERITY", "STATUS"],
    ["golang.org/x/net", "v0.22.0", "CVE-2024-3596", "HIGH", "fixed in v0.23.0"],
    ["stdlib (go)", "1.22.2", "CVE-2024-24790", "CRITICAL", "fixed in 1.22.4"],
    ["jackc/pgx/v5", "5.5.1", "CVE-2024-27289", "HIGH", "no fix"],
    ["distroless/static", "nonroot", "CVE-2023-4911", "MEDIUM", "fixed in latest"],
  ];
  rows.forEach((r, i) => say(ctx, columnTable([r])[0], i === 0 ? TONE.head : r[3] === "CRITICAL" ? TONE.err : undefined));
  say(ctx, "");
  say(ctx, `${image}: 4 vulnerabilities found (1 CRITICAL, 2 HIGH, 1 MEDIUM)`);
  ctx.exitCode = 1;
  note(ctx, `scanned ${image}: 1 critical vulnerability`);
}

export function cmdSonar(ctx: any) {
  say(ctx, "INFO: Scanner configuration file: /home/engineer/repo/sonar-project.properties", TONE.muted);
  say(ctx, `INFO: Project key: acme_${primaryService(ctx).name}`);
  say(ctx, "INFO: 42 files indexed");
  say(ctx, "INFO: Sensor Go Cover sensor [go]", TONE.muted);
  say(ctx, "INFO: Coverage: 61.4% on new code (required 80%)", TONE.warn);
  say(ctx, "INFO: Analysis report uploaded in 3124ms");
  say(ctx, "QUALITY GATE STATUS: FAILED", TONE.err);
  say(ctx, "  - Coverage on new code: 61.4% (required 80%)");
  say(ctx, "  - 1 bug, 3 code smells, 1 security hotspot");
  ctx.exitCode = 1;
  note(ctx, "sonar quality gate failed");
}

export function cmdCurl(ctx: any, rest: string[]) {
  const { flags, args } = parseArgs(rest);
  const url = args.find((a) => a.includes("://") || a.includes(".") || a.startsWith("localhost"));
  if (!url) return fail(ctx, "curl: try 'curl --help' for more information");
  const lower = url.toLowerCase();
  const service =
    ctx.services.find((s: any) => lower.includes(s.name)) ||
    (lower.includes("localhost") || lower.includes("healthz") ? primaryService(ctx) : null);
  const localPort = (url.match(/localhost:(\d+)/) || [])[1];
  if (localPort === "9090") return prometheusApi(ctx, url);
  if (localPort === "9200") return elasticSearch(ctx, url, rest);
  if (localPort) {
    const local = ctx.session?.docker?.containers || [];
    const container = local.find(
      (c: any) => c.status === "running" && (c.ports || []).some((p: string) => p.split(":")[0] === localPort)
    );
    if (container) {
      say(ctx, `* Connected to localhost (127.0.0.1) port ${localPort}`);
      if (/nginx/.test(container.image)) {
        say(ctx, "<!DOCTYPE html><html><head><title>Welcome to nginx!</title></head>");
        say(ctx, "<body><h1>Welcome to nginx!</h1><p>If you see this page, the nginx web server is successfully installed and working.</p></body></html>");
      } else {
        say(ctx, '{"status":"ok","app":"bakery","cache":"redis"}');
      }
      note(ctx, `curl localhost:${localPort} → 200`);
      return;
    }
  }

  const writeOut = rest.join(" ").includes("%{http_code}");
  const headersOnly = !!(flags["-I"] || flags["--head"]);
  const silent = !!(flags["-s"] || flags["-sS"]);

  if (!service) {
    if (headersOnly) say(ctx, "HTTP/2 404");
    else if (writeOut) say(ctx, "404");
    else say(ctx, "curl: (6) Could not resolve host");
    ctx.exitCode = 1;
    return;
  }

  const code = service.status === "down" ? 502 : service.status === "healthy" ? 200 : lower.includes("healthz") ? 200 : 500;
  if (headersOnly) {
    say(ctx, `HTTP/2 ${code}`);
    say(ctx, "content-type: application/json");
    say(ctx, `x-request-id: ${hashStr(url).toString(16)}`);
    say(ctx, "server: envoy");
    if (writeOut) say(ctx, String(code));
    return;
  }
  if (writeOut) {
    say(ctx, String(code));
    return;
  }
  if (!silent) say(ctx, `* Connected to ${service.name} (10.20.1.12) port 8080`);
  if (code === 502) say(ctx, `{"error":"upstream connect error","service":"${service.name}"}`);
  else if (lower.includes("healthz")) say(ctx, "ok");
  else if (code === 200) say(ctx, `{"service":"${service.name}","version":"${service.version}","status":"ok"}`);
  else {
    say(ctx, `{"error":"internal","detail":"connection pool exhausted","service":"${service.name}"}`);
    ctx.exitCode = 1;
  }
  note(ctx, `curl ${url} → ${code}`);
}

export function cmdSsh(ctx: any, target?: string) {
  if (!target) return fail(ctx, "usage: ssh [user@]hostname");
  const host = target.split("@").pop() || "";
  const node = ctx.resources.find((r: any) => r.name === host);
  if (!node && !host.startsWith("prod-node") && host !== "bastion") {
    return fail(ctx, `ssh: Could not resolve hostname ${host}: Name or service not known`);
  }
  say(ctx, `Warning: Permanently added '${host}' (ED25519) to the list of known hosts.`, TONE.dim);
  say(ctx, `Linux ${host} 6.1.0-18-cloud-amd64 x86_64`, TONE.muted);
  say(ctx, `Last login: ${new Date(Date.now() - 36e5).toUTCString()} from 10.20.0.5`);
  say(ctx, "");
  say(ctx, "Simulated remote shell: system commands here run against this jumpbox state.", TONE.dim);
  note(ctx, `sshed into ${host}`);
}