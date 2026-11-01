// Stateful Docker engine for the terminal. Containers, images, networks and
// volumes really exist here: a container is only "running" if a command put it
// there, ports can collide, a build fails on a real Dockerfile mistake, and the
// guided projects read this state to decide whether a step is finished.
import { say, fail, note, TONE } from "./helpers.ts";
import { resolvePath, readFile, baseOf } from "./filesystem.ts";
import { hashStr } from "./kube.ts";
import { parseYaml, asList } from "./yaml.ts";

const PUBLIC_IMAGE = /^(nginx|redis|hello-world|python|alpine|ubuntu|node|golang|postgres|busybox|debian|openjdk|amazonlinux|php|httpd|mongo|mysql|maven|rust|rabbitmq)(:[\w.\-]+)?$/;

const KEYWORDS = new Set([
  "FROM", "RUN", "CMD", "LABEL", "MAINTAINER", "EXPOSE", "ENV", "ADD", "COPY",
  "ENTRYPOINT", "VOLUME", "USER", "WORKDIR", "ARG", "ONBUILD", "STOPSIGNAL",
  "HEALTHCHECK", "SHELL",
]);

const VALUE_FLAGS = new Set([
  "-p", "--publish", "-v", "--volume", "--name", "--network", "--net", "-e",
  "--env", "-w", "--workdir", "--entrypoint", "--restart", "-m", "--memory",
  "--cpus", "--platform", "-u", "--user", "--mount", "-t",
]);

const BOOL_FLAGS = new Set(["-d", "--detach", "-it", "-i", "--rm", "-q", "--privileged", "--rm=true"]);

export type DockerImage = { repo: string; tag: string; id: string; size_mb: number; created: string };
export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status: "running" | "exited" | "created";
  ports: string[];
  volumes: string[];
  network: string;
  logs: string[];
  exit_code: number;
  detached: boolean;
  created_at: string;
};

export type DockerState = {
  images: DockerImage[];
  containers: DockerContainer[];
  networks: string[];
  volumes: string[];
  builds: { ok: number; failed: number };
  compose_project: string;
};

export function dockerState(ctx: any): DockerState {
  const session = ctx.session;
  const raw = session.docker && typeof session.docker === "object" ? session.docker : {};
  session.docker = {
    images: Array.isArray(raw.images) ? raw.images : [],
    containers: Array.isArray(raw.containers) ? raw.containers : [],
    networks: Array.isArray(raw.networks) ? raw.networks : ["bridge", "host", "none"],
    volumes: Array.isArray(raw.volumes) ? raw.volumes : [],
    builds: raw.builds || { ok: 0, failed: 0 },
    compose_project: String(raw.compose_project || baseOf(session.cwd || "/home/engineer/repo") || "app"),
  };
  return session.docker as DockerState;
}

function touched(ctx: any) {
  ctx.sessionDirty = true;
}

function idOf(seed: string) {
  return hashStr(seed).toString(16).padStart(8, "0").slice(0, 12);
}

function splitImage(ref: string) {
  const clean = String(ref || "").replace(/^docker\.io\//, "");
  const idx = clean.lastIndexOf(":");
  if (idx > -1 && !clean.slice(idx).includes("/")) return { repo: clean.slice(0, idx), tag: clean.slice(idx + 1) || "latest" };
  return { repo: clean, tag: "latest" };
}

function baseSizeMb(base: string) {
  const { repo, tag } = splitImage(base);
  const slim = /slim|alpine|distroless/.test(tag);
  const table: Record<string, number> = {
    python: slim ? 128 : 1010,
    node: slim ? 182 : 1120,
    golang: slim ? 94 : 812,
    nginx: 192,
    redis: 41,
    postgres: 244,
    ubuntu: 78,
    debian: 74,
    alpine: 8,
    busybox: 4,
    "hello-world": 0.02,
  };
  return table[repo] ?? (slim ? 96 : 420);
}

type DockerfileResult = {
  ok: boolean;
  error?: string;
  base?: string;
  instructions?: string[];
  size_mb?: number;
  installs?: boolean;
  copies?: string[];
};

export function checkDockerfile(text: string, files: Record<string, any>, context: string): DockerfileResult {
  const lines = String(text || "")
    .split("\n")
    .map((l, i) => ({ raw: l, n: i + 1 }))
    .filter((l) => l.raw.trim() && !l.raw.trim().startsWith("#"));
  if (!lines.length) return { ok: false, error: "failed to solve: the Dockerfile is empty" };

  const instructions: string[] = [];
  const copies: string[] = [];
  let base = "";
  let installs = false;
  let size = 0;

  for (let i = 0; i < lines.length; i++) {
    const { raw, n } = lines[i];
    if (/^\s+\S/.test(raw) && !/^\s*(&&|\|)/.test(raw)) {
      // a continuation line from the instruction above
      continue;
    }
    const parts = raw.trim().split(/\s+/);
    const keyword = parts[0].toUpperCase();
    if (!KEYWORDS.has(keyword)) {
      return { ok: false, error: `dockerfile parse error on line ${n}: unknown instruction: ${keyword.toLowerCase()}` };
    }
    if (i === 0 && keyword !== "FROM") {
      return { ok: false, error: `dockerfile parse error on line ${n}: FROM is required before ${keyword.toLowerCase()}` };
    }
    instructions.push(keyword);
    const rest = parts.slice(1).join(" ");

    if (keyword === "FROM") {
      const image = rest.replace(/\s+AS\s+\S+$/i, "").trim();
      if (!image) return { ok: false, error: `dockerfile parse error on line ${n}: FROM requires an image` };
      if (!base) {
        if (!PUBLIC_IMAGE.test(image)) {
          return { ok: false, error: `failed to solve: ${image}: pull access denied for ${splitImage(image).repo}, repository does not exist or may require 'docker login'` };
        }
        base = image;
        size += baseSizeMb(image);
      }
    }

    if (keyword === "COPY" || keyword === "ADD") {
      const args = rest.split(/\s+/).filter((a) => !a.startsWith("--"));
      // --from=stage copies out of an earlier build stage, not the build context.
      const fromStage = parts.some((part) => part.startsWith("--from"));
      const sources = fromStage ? [] : args.slice(0, -1);
      copies.push(...sources.filter((src) => src !== "." && src !== "./"));
      const missing = sources.filter((src) => src !== "." && src !== "./" && !files[resolvePath(context, src)]);
      if (missing.length) {
        return {
          ok: false,
          error: `failed to solve: failed to compute cache key: failed to calculate checksum of ref: "/${missing[0]}": not found\nCOPY failed: file not found in build context or excluded by .dockerignore: stat ${missing[0]}: file does not exist`,
        };
      }
    }

    if (keyword === "RUN") {
      if (/pip3?\s+install/.test(rest)) {
        installs = true;
        size += 46;
        if (/requirements\.txt/.test(rest) && !files[resolvePath(context, "requirements.txt")]) {
          return {
            ok: false,
            error: `failed to solve: process "/bin/sh -c ${rest}" did not complete successfully: exit code: 1\nERROR: Could not open requirements file: [Errno 2] No such file or directory: 'requirements.txt'`,
          };
        }
      }
      if (/apt-get|apk add/.test(rest)) size += 62;
      if (/go build|npm (ci|install)|mvn|gradle/.test(rest)) size += 38;
    }

    if (keyword === "CMD" || keyword === "ENTRYPOINT") size += 1;
  }

  return { ok: true, base, instructions, size_mb: Math.round(size * 10) / 10, installs, copies };
}

function appLogs(image: string, port = 5000): string[] {
  const name = splitImage(image).repo.replace(/^.*\//, "");
  if (/redis/.test(name)) return ["1:C 27 Oct 2026 09:12:44.118 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo", "1:M 27 Oct 2026 09:12:44.121 * Ready to accept connections tcp"];
  if (/nginx/.test(name)) return ["/docker-entrypoint.sh: Configuration complete; ready for start up", "2026/10/27 09:12:44 [notice] 1#1: start worker processes"];
  if (/postgres/.test(name)) return ["PostgreSQL init process complete; ready for start up.", "LOG:  database system is ready to accept connections"];
  if (/hello-world/.test(name)) return ["Hello from Docker!", "This message shows that your installation appears to be working correctly."];
  return [
    " * Serving Flask app 'app'",
    ` * Running on http://0.0.0.0:${port}`,
    "INFO:app:connected to redis at redis:6379",
  ];
}

export function dockerCommand(ctx: any, rest: string[]) {
  const state = dockerState(ctx);
  const sub = (rest[0] || "").toLowerCase();

  if (!sub) return say(ctx, "Usage:  docker [OPTIONS] COMMAND\n\nTry: docker --version, docker images, docker ps, docker run, docker build", TONE.muted);
  if (sub === "--version" || sub === "-v") return say(ctx, "Docker version 27.3.1, build ce12230");
  if (sub === "version") {
    say(ctx, "Client: Docker Engine - Community", TONE.head);
    say(ctx, " Version:           27.3.1");
    say(ctx, "Server: Docker Engine - Community");
    say(ctx, " Engine:  Version: 27.3.1");
    note(ctx, "checked the docker client and daemon");
    return;
  }
  if (sub === "info") {
    say(ctx, `Containers: ${state.containers.length}`, TONE.head);
    say(ctx, ` Running: ${state.containers.filter((c) => c.status === "running").length}`);
    say(ctx, `Images: ${state.images.length}`);
    say(ctx, `Storage Driver: overlay2`);
    return;
  }

  if (sub === "images" || (sub === "image" && rest[1] === "ls")) return listImages(ctx, state);
  if (sub === "ps" || (sub === "container" && rest[1] === "ls")) {
    const all = rest.includes("-a") || rest.includes("--all");
    return listContainers(ctx, state, all);
  }
  if (sub === "run" || (sub === "container" && rest[1] === "run")) return runContainer(ctx, state, rest.slice(1));
  if (sub === "build") return buildImage(ctx, state, rest.slice(1));
  if (sub === "logs") return containerLogs(ctx, state, rest.slice(1));
  if (sub === "exec") return containerExec(ctx, state, rest.slice(1));
  if (sub === "stop") return stopContainer(ctx, state, rest.slice(1), "stop");
  if (sub === "start") return stopContainer(ctx, state, rest.slice(1), "start");
  if (sub === "rm") return removeContainer(ctx, state, rest.slice(1));
  if (sub === "rmi") return removeImage(ctx, state, rest.slice(1));
  if (sub === "pull") return pullImage(ctx, state, rest.slice(1));
  if (sub === "tag") return tagImage(ctx, state, rest.slice(1));
  if (sub === "push") return pushImage(ctx, state, rest.slice(1));
  if (sub === "network") return networkCommand(ctx, state, rest.slice(1));
  if (sub === "volume") return volumeCommand(ctx, state, rest.slice(1));
  if (sub === "compose") return composeCommand(ctx, state, rest.slice(1));
  if (sub === "inspect") {
    const name = rest[1] || "";
    const c = findContainer(state, name);
    if (!c) return fail(ctx, `Error: No such object: ${name}`);
    say(ctx, "[");
    say(ctx, "    {");
    say(ctx, `        "Id": "${c.id}",`);
    say(ctx, `        "Name": "/${c.name}",`);
    say(ctx, `        "Image": "${c.image}",`);
    say(ctx, `        "State": { "Status": "${c.status}", "ExitCode": ${c.exit_code} },`);
    say(ctx, `        "NetworkSettings": { "Networks": { "${c.network}": {} } },`);
    say(ctx, `        "Mounts": [${c.volumes.map((v) => `{ "Name": "${v.split(":")[0]}" }`).join(", ")}]`);
    say(ctx, "    }");
    say(ctx, "]");
    return;
  }

  fail(ctx, `docker: '${sub}' is not a docker command.\nSee 'docker --help'`);
}

/* --------------------------------------------------------------- listing */

function listImages(ctx: any, state: DockerState) {
  const primary = splitImage(ctx.services?.[0]?.name || "app").repo;
  say(ctx, "REPOSITORY              TAG        IMAGE ID       CREATED          SIZE", TONE.head);
  if (!state.images.length) {
    say(ctx, `(no images yet — build one with: docker build -t ${primary}:1.0 .)`, TONE.dim);
    return;
  }
  state.images.forEach((img) => {
    say(
      ctx,
      `${img.repo.padEnd(23)} ${img.tag.padEnd(10)} ${img.id.padEnd(14)} ${img.created.padEnd(16)} ${img.size_mb >= 1000 ? `${(img.size_mb / 1000).toFixed(2)}GB` : `${img.size_mb.toFixed(1)}MB`}`,
      img.size_mb > 500 ? TONE.warn : undefined
    );
  });
  note(ctx, "read the local image list");
}

function listContainers(ctx: any, state: DockerState, all: boolean) {
  say(ctx, "CONTAINER ID   IMAGE                 STATUS         PORTS                     NAMES", TONE.head);
  const rows = state.containers.filter((c) => (all ? true : c.status === "running"));
  if (!rows.length) {
    say(ctx, "(none)", TONE.dim);
    if (!all) say(ctx, "Try: docker ps -a", TONE.dim);
    return;
  }
  rows.forEach((c) => {
    const status = c.status === "running" ? "Up 2 minutes" : `Exited (${c.exit_code}) 1 minute ago`;
    const ports = c.ports.length ? c.ports.map((p) => `0.0.0.0:${p.split(":")[0]}->${p.split(":")[1]}/tcp`).join(", ") : "";
    say(ctx, `${c.id.slice(0, 12).padEnd(14)} ${c.image.padEnd(21)} ${status.padEnd(14)} ${ports.padEnd(25)} ${c.name}`, c.status === "running" ? TONE.ok : TONE.muted);
  });
  note(ctx, all ? "listed every container" : "listed running containers");
}

function findContainer(state: DockerState, ref: string) {
  if (!ref) return null;
  const name = String(ref).replace(/^\//, "");
  return (
    state.containers.find((c) => c.name === name) ||
    state.containers.find((c) => c.id.startsWith(name)) ||
    state.containers.find((c) => c.id.slice(0, 12) === name) ||
    null
  );
}

function hasImage(state: DockerState, ref: string) {
  if (!ref) return null;
  const { repo, tag } = splitImage(ref);
  return (
    state.images.find((i) => i.repo === repo && i.tag === tag) ||
    state.images.find((i) => i.id === ref || i.id.startsWith(ref)) ||
    null
  );
}

const NOT_BUILT_HINT =
  "Hint: the image has not been built yet. Run docker build first, or type docker images to check.";

/* ------------------------------------------------------------------ run */

function runContainer(ctx: any, state: DockerState, tokens: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("-") && t !== "-") {
      const eq = t.indexOf("=");
      if (eq > -1) {
        flags[t.slice(0, eq)] = t.slice(eq + 1);
        continue;
      }
      // -p8080:8080 and -eKEY=value carry their value inside the token.
      if (/^-[pve]/.test(t) && t.length > 2) {
        flags[t.slice(0, 2)] = t.slice(2);
        continue;
      }
      if (VALUE_FLAGS.has(t) && tokens[i + 1] && !tokens[i + 1].startsWith("-")) {
        flags[t] = tokens[i + 1];
        i++;
        continue;
      }
      flags[t] = true;
      continue;
    }
    positional.push(t);
  }

  const image = positional[0] || "";
  if (!image) return fail(ctx, '"docker run" requires at least 1 argument.');
  const detached = !!(flags["-d"] || flags["--detach"]);
  const { repo, tag } = splitImage(image);

  if (!hasImage(state, image)) {
    if (PUBLIC_IMAGE.test(image)) {
      state.images.push({ repo, tag, id: idOf(image), size_mb: baseSizeMb(image), created: "Just now" });
      say(ctx, `Unable to find image '${image}' locally`, TONE.muted);
      say(ctx, `${tag}: Pulling from library/${repo}`);
      say(ctx, `Digest: sha256:${idOf(image + "digest")}${idOf(image)}`);
      say(ctx, `Status: Downloaded newer image for ${image}`, TONE.ok);
    } else {
      fail(ctx, `Unable to find image '${image}' locally\ndocker: Error response from daemon: pull access denied for ${repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied.\nSee 'docker run --help'.`);
      // The image this run needs was never built on this machine: say so plainly.
      say(ctx, NOT_BUILT_HINT, TONE.dim);
      return;
    }
  }

  const name = String(flags["--name"] || `${repo.replace(/^.*\//, "")}-${state.containers.length + 1}`);
  if (state.containers.some((c) => c.name === name)) {
    return fail(ctx, `docker: Error response from daemon: Conflict. The container name "/${name}" is already in use.`);
  }

  const publish = String((flags["-p"] || flags["--publish"] || "") as string);
  const ports = publish ? [publish] : [];
  if (publish) {
    const hostPort = publish.split(":")[0];
    const clash = state.containers.find((c) => c.status === "running" && c.ports.some((p) => p.split(":")[0] === hostPort));
    if (clash) {
      return fail(ctx, `docker: Error response from daemon: driver failed programming external connectivity on endpoint ${name} (${idOf(name + hostPort)}): Bind for 0.0.0.0:${hostPort} failed: port is already allocated.\nERRO[0001] failed to start containers: ${name}`);
    }
  }

  const volumeFlag = String((flags["-v"] || flags["--volume"] || "") as string);
  const volumes = volumeFlag ? [volumeFlag] : [];
  if (volumeFlag) {
    const source = volumeFlag.split(":")[0];
    if (source && !source.startsWith("/") && !source.startsWith(".") && !state.volumes.includes(source)) {
      state.volumes.push(source);
      say(ctx, `# created named volume ${source}`, TONE.dim);
    }
  }

  const network = String((flags["--network"] || flags["--net"] || "bridge") as string);
  if (!["bridge", "host", "none"].includes(network) && !state.networks.includes(network)) {
    return fail(ctx, `docker: Error response from daemon: network ${network} not found.`);
  }

  const container: DockerContainer = {
    id: idOf(`${name}-${image}-${state.containers.length}`),
    name,
    image,
    status: "running",
    ports,
    volumes,
    network,
    logs: appLogs(image, Number(String(publish).split(":")[1]) || 8080),
    exit_code: 0,
    detached,
    created_at: "Just now",
  };

  if (/hello-world/.test(image)) {
    container.status = "exited";
    container.exit_code = 0;
    state.containers.push(container);
    touched(ctx);
    say(ctx, "");
    container.logs.forEach((l) => say(ctx, l, TONE.muted));
    say(ctx, "");
    note(ctx, "ran the hello-world container");
    return;
  }

  state.containers.push(container);
  touched(ctx);

  if (!detached) {
    // Foreground run: the process owns the terminal, so it ends when the
    // command returns. This is the classic "why did my container exit?".
    say(ctx, `Unable to find image '${image}'... run in the foreground`, TONE.dim);
    container.logs.slice(0, 4).forEach((l) => say(ctx, l, TONE.muted));
    container.status = "exited";
    say(ctx, "");
    say(ctx, "# the process was attached to your shell, so it stopped when the command returned", TONE.warn);
    say(ctx, "# next time add -d so it keeps running in the background", TONE.warn);
    return;
  }

  say(ctx, container.id);
  note(ctx, `started container ${name} from ${image}`);
}

/* ---------------------------------------------------------------- build */

function findDockerfile(ctx: any, files: Record<string, any>, tokens: string[]): string {
  const flagIdx = tokens.indexOf("-f");
  if (flagIdx > -1 && tokens[flagIdx + 1]) return resolvePath(ctx.session.cwd, tokens[flagIdx + 1]);
  const context = tokens.find((t) => t === "." || t.startsWith("/") || t.startsWith("~"));
  const dir = context && context !== "." ? resolvePath(ctx.session.cwd, context) : ctx.session.cwd;
  return `${dir}/Dockerfile`;
}

function buildImage(ctx: any, state: DockerState, tokens: string[]) {
  const tagIdx = tokens.findIndex((t) => t === "-t" || t === "--tag");
  const tag = tagIdx > -1 && tokens[tagIdx + 1] ? tokens[tagIdx + 1] : `${splitImage(ctx.services[0]?.name || "app").repo}:latest`;
  const dockerfilePath = findDockerfile(ctx, ctx.session.files || {}, tokens);
  const text = readFile(ctx.session.files || {}, dockerfilePath);
  if (text == null) {
    state.builds.failed += 1;
    touched(ctx);
    return fail(ctx, `ERROR: failed to solve: failed to read dockerfile: open "Dockerfile": no such file or directory`);
  }
  const check = checkDockerfile(text, ctx.session.files || {}, dockerfilePath.replace(/\/Dockerfile$/, ""));
  if (!check.ok) {
    state.builds.failed += 1;
    touched(ctx);
    say(ctx, "[+] Building 1.2s (2/2) FINISHED", TONE.muted);
    return fail(ctx, ` => ERROR ${check.error}`);
  }

  const { repo, tag: imageTag } = splitImage(tag);
  const size = check.size_mb || 120;
  state.builds.ok += 1;
  state.images = [...state.images.filter((i) => !(i.repo === repo && i.tag === imageTag)), {
    repo,
    tag: imageTag,
    id: idOf(`${repo}:${imageTag}`),
    size_mb: size,
    created: "Just now",
  }];
  touched(ctx);

  say(ctx, "[+] Building 24.6s (11/11) FINISHED", TONE.muted);
  say(ctx, " => [internal] load build definition from Dockerfile             0.0s");
  (check.instructions || []).forEach((kw, i) => {
    say(ctx, ` => [build ${i + 1}/${(check.instructions || []).length}] ${kw}`, TONE.muted);
  });
  say(ctx, " => exporting to image                                           2.1s");
  say(ctx, ` => => naming to ${tag}`, TONE.ok);
  say(ctx, ` => => writing image sha256:${idOf(tag + "sha")}`, TONE.ok);
  say(ctx, "");
  say(ctx, `image size: ${size >= 1000 ? `${(size / 1000).toFixed(2)}GB` : `${size.toFixed(1)}MB`} (base ${check.base})`, size > 500 ? TONE.warn : TONE.ok);
  if (size > 500) say(ctx, "# that is a heavy image for this app — a slimmer base image would cut most of it", TONE.warn);
  note(ctx, `built image ${tag}`);
}

/* ------------------------------------------------------- logs / exec */

function containerLogs(ctx: any, state: DockerState, tokens: string[]) {
  const ref = tokens.find((t) => !t.startsWith("-")) || "";
  const c = findContainer(state, ref);
  if (!c) return fail(ctx, `Error response from daemon: No such container: ${ref}`);
  c.logs.forEach((l) => say(ctx, l, /error|panic/i.test(l) ? TONE.err : TONE.muted));
  if (tokens.includes("-f")) say(ctx, "# following — simulated stream, press Ctrl+C to stop", TONE.dim);
  note(ctx, `read logs for ${c.name}`);
}

function containerExec(ctx: any, state: DockerState, tokens: string[]) {
  const dash = tokens.indexOf("--");
  const ref = tokens.filter((t) => !t.startsWith("-"))[0] || "";
  const c = findContainer(state, ref);
  if (!c) return fail(ctx, `Error response from daemon: No such container: ${ref}`);
  if (c.status !== "running") return fail(ctx, `Error response from daemon: Container ${c.id} is not running`);
  const inner = dash > -1 ? tokens.slice(dash + 1).join(" ") : tokens.filter((t) => !t.startsWith("-")).slice(1).join(" ");
  const files = ctx.session.files || {};
  const bakery = resolvePath("/home/engineer", "bakery");

  if (!inner || /^(sh|bash|ash)$/.test(inner.trim())) {
    say(ctx, `(container shell for ${c.name})`, TONE.dim);
    say(ctx, "Simulated container: try ls, cat app.py, cat requirements.txt, env, redis-cli -h redis ping, curl localhost:5000");
    note(ctx, `opened a shell inside ${c.name}`);
    return;
  }
  if (/^ls/.test(inner)) {
    say(ctx, "Dockerfile  app.py  requirements.txt  static  templates");
    return;
  }
  if (/^cat\s+/.test(inner)) {
    const target = inner.replace(/^cat\s+/, "").trim();
    const local = readFile(files, resolvePath(bakery, target));
    if (local != null) return local.split("\n").forEach((l) => say(ctx, l));
    if (target === "requirements.txt") return say(ctx, (readFile(files, `${bakery}/requirements.txt`) || "flask\nredis").trim());
    return fail(ctx, `cat: ${target}: No such file or directory`);
  }
  if (/^(env|printenv)/.test(inner)) {
    say(ctx, "PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin");
    say(ctx, "REDIS_HOST=redis");
    say(ctx, "PORT=5000");
    return;
  }
  if (/redis-cli/.test(inner)) {
    if (c.network !== "bridge" && state.containers.some((o) => o.status === "running" && /redis/.test(o.image) && o.network === c.network)) {
      return say(ctx, "PONG", TONE.ok);
    }
    if (state.containers.some((o) => o.status === "running" && /redis/.test(o.image))) {
      return fail(ctx, "Could not connect to Redis at redis:6379: Name or service not known\n# the two containers are not on the same network");
    }
    return fail(ctx, "Could not connect to Redis at redis:6379: Connection refused");
  }
  if (/curl/.test(inner)) return say(ctx, '{"status":"ok","orders_today":42,"cache":"redis"}');
  if (/^(ps|top)/.test(inner)) return say(ctx, "PID   USER      TIME  COMMAND\n    1 root      0:00 python app.py");
  if (/whoami/.test(inner)) return say(ctx, "root");
  say(ctx, `${inner}: not simulated inside the container (try ls, cat app.py, env, redis-cli)`, TONE.muted);
}

/* ----------------------------------------------------- lifecycle / misc */

function stopContainer(ctx: any, state: DockerState, tokens: string[], verb: "stop" | "start") {
  const ref = tokens.find((t) => !t.startsWith("-")) || "";
  const c = findContainer(state, ref);
  if (!c) return fail(ctx, `Error response from daemon: No such container: ${ref}`);
  c.status = verb === "stop" ? "exited" : "running";
  touched(ctx);
  say(ctx, verb === "stop" ? c.name : c.name, TONE.ok);
  note(ctx, `${verb === "stop" ? "stopped" : "started"} ${c.name}`);
}

function removeContainer(ctx: any, state: DockerState, tokens: string[]) {
  const ref = tokens.find((t) => !t.startsWith("-")) || "";
  const c = findContainer(state, ref);
  if (!c) return fail(ctx, `Error response from daemon: No such container: ${ref}`);
  if (c.status === "running" && !tokens.includes("-f")) {
    return fail(ctx, `Error response from daemon: cannot remove container "/${c.name}": container is running: stop the container before removing or force remove`);
  }
  state.containers = state.containers.filter((x) => x.id !== c.id);
  touched(ctx);
  say(ctx, c.name, TONE.ok);
}

function removeImage(ctx: any, state: DockerState, tokens: string[]) {
  const ref = tokens.find((t) => !t.startsWith("-")) || "";
  const img = hasImage(state, ref);
  if (!img) return fail(ctx, `Error response from daemon: No such image: ${ref}`);
  state.images = state.images.filter((i) => i !== img);
  touched(ctx);
  say(ctx, `Untagged: ${img.repo}:${img.tag}`, TONE.ok);
}

function pullImage(ctx: any, state: DockerState, tokens: string[]) {
  const ref = tokens[0] || "";
  if (!ref) return fail(ctx, '"docker pull" requires exactly 1 argument.');
  if (!PUBLIC_IMAGE.test(ref) && !hasImage(state, ref)) {
    return fail(ctx, `Error response from daemon: pull access denied for ${splitImage(ref).repo}, repository does not exist or may require 'docker login'`);
  }
  if (!hasImage(state, ref)) {
    const { repo, tag } = splitImage(ref);
    state.images.push({ repo, tag, id: idOf(ref), size_mb: baseSizeMb(ref), created: "Just now" });
    touched(ctx);
  }
  say(ctx, `Status: Downloaded newer image for ${ref}`, TONE.ok);
}

function tagImage(ctx: any, state: DockerState, tokens: string[]) {
  const [source, target] = tokens.filter((t) => !t.startsWith("-"));
  if (!source || !target) return fail(ctx, '"docker tag" requires exactly 2 arguments.');
  const img = hasImage(state, source);
  if (!img) return fail(ctx, `Error response from daemon: No such image: ${source}`);
  const { repo, tag } = splitImage(target);
  state.images = [...state.images.filter((i) => !(i.repo === repo && i.tag === tag)), { ...img, repo, tag, created: "Just now" }];
  touched(ctx);
  say(ctx, "", TONE.dim);
  note(ctx, `tagged ${source} as ${target}`);
}

function pushImage(ctx: any, state: DockerState, tokens: string[]) {
  const ref = tokens[0] || "";
  if (!ref) return fail(ctx, '"docker push" requires exactly 1 argument.');
  const img = hasImage(state, ref);
  if (!img) return fail(ctx, `An image does not exist locally with the tag: ${splitImage(ref).repo}`);
  const pushed = Array.isArray(ctx.session.pushed_images) ? ctx.session.pushed_images : [];
  ctx.session.pushed_images = [...new Set([...pushed, ref])].slice(-20);
  touched(ctx);
  say(ctx, `The push refers to repository [${img.repo}]`);
  say(ctx, `${img.id}: Pushed`, TONE.ok);
  say(ctx, `${img.tag}: digest: sha256:${idOf(ref + "push")} size: ${img.size_mb.toFixed(1)}MB`, TONE.ok);
  note(ctx, `pushed ${ref} to the registry`);
}

function networkCommand(ctx: any, state: DockerState, tokens: string[]) {
  const verb = tokens[0] || "ls";
  if (verb === "create") {
    const name = tokens[1] || "";
    if (!name) return fail(ctx, '"docker network create" requires exactly 1 argument.');
    if (!state.networks.includes(name)) state.networks.push(name);
    touched(ctx);
    return say(ctx, idOf(name + "net"), TONE.ok);
  }
  if (verb === "ls") {
    say(ctx, "NETWORK ID     NAME      DRIVER    SCOPE", TONE.head);
    state.networks.forEach((n) => say(ctx, `${idOf(n + "net").slice(0, 12).padEnd(14)} ${n.padEnd(9)} bridge    local`));
    return;
  }
  if (verb === "connect" || verb === "disconnect") {
    const net = tokens[1];
    const c = findContainer(state, tokens[2] || "");
    if (!c) return fail(ctx, `Error response from daemon: No such container: ${tokens[2]}`);
    if (!state.networks.includes(net)) return fail(ctx, `Error response from daemon: network ${net} not found`);
    c.network = verb === "connect" ? net : "bridge";
    touched(ctx);
    return say(ctx, "", TONE.dim);
  }
  fail(ctx, `docker network: '${verb}' is not supported here (create, ls, connect)`);
}

function volumeCommand(ctx: any, state: DockerState, tokens: string[]) {
  const verb = tokens[0] || "ls";
  if (verb === "create") {
    const name = tokens[1] || "";
    if (!name) return fail(ctx, '"docker volume create" requires exactly 1 argument.');
    if (!state.volumes.includes(name)) state.volumes.push(name);
    touched(ctx);
    return say(ctx, name, TONE.ok);
  }
  if (verb === "ls") {
    say(ctx, "DRIVER    VOLUME NAME", TONE.head);
    state.volumes.forEach((v) => say(ctx, `local     ${v}`));
    if (!state.volumes.length) say(ctx, "(none)", TONE.dim);
    return;
  }
  fail(ctx, `docker volume: '${verb}' is not supported here (create, ls)`);
}

function composeFile(ctx: any) {
  const files = ctx.session.files || {};
  for (const name of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    const text = readFile(files, `${ctx.session.cwd}/${name}`);
    if (text != null) return { path: `${ctx.session.cwd}/${name}`, text };
    const atRepo = readFile(files, `/home/engineer/bakery/${name}`);
    if (atRepo != null) return { path: `/home/engineer/bakery/${name}`, text: atRepo };
  }
  return null;
}

function composeCommand(ctx: any, state: DockerState, tokens: string[]) {
  const verb = tokens[0] || "";
  const file = composeFile(ctx);
  if (verb === "up") {
    if (!file) return fail(ctx, "no configuration file provided: not found");
    const parsed = parseYaml(file.text);
    if (!parsed.ok) return fail(ctx, parsed.error || "yaml: invalid compose file");
    const services = parsed.data?.services || {};
    const names = Object.keys(services);
    if (!names.length) return fail(ctx, "yaml: services key is required");
    const dir = file.path.replace(/\/[^/]+$/, "");
    const project = baseOf(dir) || "app";
    let created = 0;
    names.forEach((name, i) => {
      const def = services[name] || {};
      const image = def.image || (def.build ? `${project}-${name}:latest` : "");
      if (!image) return;
      if (!hasImage(state, image) && PUBLIC_IMAGE.test(image)) {
        const { repo, tag } = splitImage(image);
        state.images.push({ repo, tag, id: idOf(image), size_mb: baseSizeMb(image), created: "Just now" });
      }
      const existing = state.containers.find((c) => c.name === `${project}-${name}-1`);
      const ports = Array.isArray(def.ports) ? def.ports.map(String) : def.ports ? [String(def.ports)] : [];
      const hostPort = ports[0] ? ports[0].split(":")[0] : "";
      if (hostPort && state.containers.some((c) => c.status === "running" && c.name !== `${project}-${name}-1` && c.ports.some((p) => p.split(":")[0] === hostPort))) {
        return fail(ctx, `Error response from daemon: Bind for 0.0.0.0:${hostPort} failed: port is already allocated`);
      }
      const container: DockerContainer = {
        id: existing?.id || idOf(`${project}-${name}`),
        name: `${project}-${name}-1`,
        image,
        status: "running",
        ports,
        volumes: Array.isArray(def.volumes) ? def.volumes.map(String) : [],
        network: `${project}_default`,
        logs: appLogs(image, Number(hostPort) || 5000),
        exit_code: 0,
        detached: true,
        created_at: "Just now",
      };
      if (!state.networks.includes(container.network)) state.networks.push(container.network);
      state.containers = existing
        ? state.containers.map((c) => (c.id === existing.id ? container : c))
        : [...state.containers, container];
      if (!existing) created += 1;
      state.compose_project = project;
      void i;
    });
    touched(ctx);
    say(ctx, `[+] Running ${names.length}/${names.length}`, TONE.muted);
    say(ctx, ` ✔ Network ${project}_default       Created    0.1s`);
    names.forEach((n) => say(ctx, ` ✔ Container ${project}-${n}-1     Started    1.${Math.floor(Math.random() * 9)}s`));
    note(ctx, `started the compose stack (${created} new container${created === 1 ? "" : "s"})`);
    return;
  }
  if (verb === "ps") {
    say(ctx, "NAME                  IMAGE                 SERVICE    STATUS", TONE.head);
    state.containers
      .filter((c) => c.name.endsWith("-1") && c.network.endsWith("_default"))
      .forEach((c) => say(ctx, `${c.name.padEnd(21)} ${c.image.padEnd(21)} ${c.name.split("-").slice(-2, -1)[0].padEnd(10)} ${c.status === "running" ? "Up 1 minute" : "Exited"}`));
    if (!state.containers.some((c) => c.network.endsWith("_default"))) say(ctx, "(no compose services running)", TONE.dim);
    return;
  }
  if (verb === "logs") {
    const stack = state.containers.filter((c) => c.network.endsWith("_default"));
    if (!stack.length) return fail(ctx, "no containers to show");
    stack.forEach((c) => c.logs.slice(0, 3).forEach((l) => say(ctx, `${c.name.split("-").slice(-2, -1)[0]}-1  | ${l}`, TONE.muted)));
    return;
  }
  if (verb === "down") {
    state.containers = state.containers.filter((c) => !c.network.endsWith("_default"));
    touched(ctx);
    say(ctx, "[+] Running 3/3", TONE.muted);
    return;
  }
  fail(ctx, `compose: '${verb}' is not supported here (up, ps, logs, down)`);
}