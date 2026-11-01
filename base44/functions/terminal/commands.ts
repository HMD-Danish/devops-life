import { parseArgs, tokenize, splitRedirect } from "./shell.ts";
import {
  HOME, REPO, resolvePath, displayPath, readFile, writeFile, ensureDir,
  removePath, listDir, isDir, baseOf, humanSize,
} from "./filesystem.ts";
import { hashStr, nodeRows } from "./kube.ts";
import { dockerCommand } from "./docker.ts";
import { say, fail, note, expandEnv, fsOf, COMMAND_NAMES, HELP, TONE } from "./helpers.ts";
import {
  cmdKubectl, cmdDescribe, cmdHelm, cmdTerraform, cmdAnsible, cmdAws, cmdGh,
  cmdJenkins, cmdArgocd, cmdSystemctl, cmdJournalctl, cmdOpenssl, cmdNginx,
  cmdTrivy, cmdSonar, cmdCurl, cmdSsh,
} from "./platform.ts";
import { cmdGitleaks, cmdVault } from "./security.ts";
import { cmdHey, cmdMysql } from "./scaling.ts";

// ---------------------------------------------------------------- pipeline helpers

function grepLines(lines: string[], tokens: string[]): string[] {
  const { flags, args } = parseArgs(tokens);
  const pattern = args[0];
  if (!pattern) return lines;
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags["-i"] ? "i" : "");
  } catch {
    return [`grep: invalid pattern: ${pattern}`];
  }
  let hits = lines.filter((l) => (flags["-v"] ? !re.test(l) : re.test(l)));
  if (flags["-c"]) return [String(hits.length)];
  if (flags["-n"]) hits = hits.map((l, i) => `${i + 1}:${l}`);
  return hits;
}

function awkLines(lines: string[], tokens: string[]): string[] {
  const { flags, args } = parseArgs(tokens);
  const sep = String(flags["-F"] || " ");
  const prog = args.join(" ");
  const printMatch = prog.match(/print\s+([^}]+)\}?/);
  const condMatch = prog.match(/\$(\d+)\s*(==|!=|~)\s*\/?([^/}\s]+)/);
  let rows = lines.map((l) => ({ raw: l, fields: sep === " " ? l.trim().split(/\s+/) : l.split(sep) }));
  if (condMatch) {
    const [, idx, op, value] = condMatch;
    rows = rows.filter(({ fields }) => {
      const field = fields[Number(idx) - 1] || "";
      if (op === "==") return field === value;
      if (op === "!=") return field !== value;
      return field.includes(value);
    });
  }
  if (!printMatch) return rows.map((r) => r.raw);
  const spec = printMatch[1].trim();
  return rows.map(({ fields }) =>
    spec
      .split(/[\s,]+/)
      .map((part) => {
        if (part === "$NF") return fields[fields.length - 1] || "";
        if (part.startsWith("$")) return fields[Number(part.slice(1)) - 1] || "";
        return part.replace(/^"|"$/g, "");
      })
      .join(" ")
  );
}

function sedLines(lines: string[], tokens: string[]): string[] {
  const { flags, args } = parseArgs(tokens);
  const prog = args[0] || "";
  const range = prog.match(/^(\d+)p$/);
  if (flags["-n"] && range) {
    const n = Number(range[1]);
    return lines[n - 1] ? [lines[n - 1]] : [];
  }
  const del = prog.match(/^\/(.+)\/d$/);
  if (del) {
    const re = new RegExp(del[1]);
    return lines.filter((l) => !re.test(l));
  }
  const sub = prog.match(/^s\/(.*?)\/(.*?)\/(g?)$/);
  if (sub) {
    const re = new RegExp(sub[1], sub[3] === "g" ? "g" : "");
    return lines.map((l) => l.replace(re, sub[2]));
  }
  return lines;
}

function applyFilter(ctx: any, text: string, lines: string[]): string[] {
  const tokens = tokenize(text);
  const cmd = tokens[0];
  const rest = tokens.slice(1);
  const { args, flags } = parseArgs(rest);
  switch (cmd) {
    case "grep":
      return grepLines(lines, rest);
    case "cat":
      return lines;
    case "head":
      return lines.slice(0, Number(flags["-n"] || args[0] || 10) || 10);
    case "tail":
      return lines.slice(-(Number(flags["-n"] || args[0] || 10) || 10));
    case "sort":
      return [...lines].sort((a, b) => (flags["-r"] ? b.localeCompare(a) : a.localeCompare(b)));
    case "uniq":
      return [...new Set(lines)];
    case "wc":
      return [String(lines.length)];
    case "awk":
      return awkLines(lines, rest);
    case "sed":
      return sedLines(lines, rest);
    default:
      return [`bash: ${cmd}: command not found`];
  }
}

function splitPipes(input: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "|" && input[i + 1] !== "|") {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

// ---------------------------------------------------------------- entry point

export async function executeCommand(ctx: any, rawInput: string) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return;
  ctx.history.push(trimmed);
  if (ctx.history.length > 200) ctx.history.shift();

  const chains = splitChains(trimmed);
  if (chains.length === 1) {
    await runPipeline(ctx, chains[0].cmd);
    return;
  }
  let prevFailed = false;
  for (const segment of chains) {
    if (segment.join === "and" && prevFailed) break;
    ctx.exitCode = 0;
    await runPipeline(ctx, segment.cmd);
    prevFailed = ctx.exitCode !== 0;
  }
}

function splitChains(input: string): Array<{ cmd: string; join: "and" | "always" }> {
  const out: Array<{ cmd: string; join: "and" | "always" }> = [];
  let cur = "";
  let quote: string | null = null;
  let pending: "and" | "always" = "always";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "&" && input[i + 1] === "&") {
      out.push({ cmd: cur.trim(), join: pending });
      pending = "and";
      cur = "";
      i++;
      continue;
    }
    if (ch === ";") {
      out.push({ cmd: cur.trim(), join: pending });
      pending = "always";
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push({ cmd: cur.trim(), join: pending });
  return out.filter((segment) => segment.cmd);
}

async function runPipeline(ctx: any, input: string) {
  const pipes = splitPipes(input);
  if (pipes.length === 1) {
    await runOne(ctx, pipes[0]);
    return;
  }
  const before = ctx.lines.length;
  await runOne(ctx, pipes[0]);
  const captured = ctx.lines.slice(before).map((l: any) => l.text);
  ctx.lines.length = before;
  let filtered = captured;
  pipes.slice(1).forEach((stage) => {
    filtered = applyFilter(ctx, stage, filtered);
  });
  filtered.forEach((text) => say(ctx, text));
}

async function runOne(ctx: any, input: string) {
  const { command, redirect } = splitRedirect(input);
  const before = ctx.lines.length;
  const tokens = tokenize(command);
  if (!tokens.length) return;

  let argv = tokens;
  while (argv[0] === "sudo") argv = argv.slice(1);
  if (!argv.length) return;
  const cmd = argv[0];
  const rest = argv.slice(1);

  dispatch(ctx, cmd, rest);

  if (redirect) {
    const captured = ctx.lines.slice(before).map((l: any) => l.text).join("\n");
    ctx.lines.length = before;
    const path = resolvePath(ctx.session.cwd, redirect.path);
    const prev = readFile(fsOf(ctx), path) || "";
    writeFile(fsOf(ctx), path, redirect.append ? `${prev}${captured}\n` : `${captured}\n`);
    ctx.sessionDirty = true;
    note(ctx, `wrote ${displayPath(path)}`);
  }
}

function dispatch(ctx: any, cmd: string, rest: string[]) {
  const { args, flags } = parseArgs(rest);
  switch (cmd) {
    case "help": return cmdHelp(ctx);
    case "man": return cmdMan(ctx, args[0]);
    case "hint": return cmdHint(ctx);
    case "history": return cmdHistory(ctx);
    case "clear":
      say(ctx, "\u001bCLEAR");
      return;
    case "exit":
    case "logout":
      say(ctx, "logout", TONE.muted);
      note(ctx, "left the shell");
      return;
    case "pwd":
      say(ctx, ctx.session.cwd);
      return;
    case "cd": return cmdCd(ctx, args[0]);
    case "ls": return cmdLs(ctx, rest);
    case "cat":
    case "less":
    case "more": return cmdCat(ctx, rest);
    case "head": return cmdHeadTail(ctx, rest, "head");
    case "tail": return cmdHeadTail(ctx, rest, "tail");
    case "grep": return cmdGrep(ctx, rest);
    case "wc": return cmdWc(ctx, rest);
    case "find": return cmdFind(ctx, rest);
    case "tree": return cmdTree(ctx);
    case "stat": return cmdStat(ctx, args[0]);
    case "mkdir": return cmdMkdir(ctx, args);
    case "touch": return cmdTouch(ctx, args[0]);
    case "rm": return cmdRm(ctx, rest);
    case "cp": return cmdCp(ctx, args);
    case "mv": return cmdMv(ctx, args);
    case "echo": return cmdEcho(ctx, rest);
    case "sed": return cmdSed(ctx, rest);
    case "promtool": return cmdPromtool(ctx, rest);
    case "export": return cmdExport(ctx, rest);
    case "unset":
      if (args[0]) {
        delete ctx.session.env[args[0]];
        ctx.sessionDirty = true;
      }
      return;
    case "env":
    case "printenv": return cmdEnv(ctx, args[0]);
    case "source": return cmdSource(ctx, args[0]);
    case "which": return cmdWhich(ctx, args[0]);
    case "whoami":
      say(ctx, "engineer");
      return;
    case "hostname":
      say(ctx, "bastion");
      return;
    case "date":
      say(ctx, new Date().toUTCString());
      return;
    case "uname":
      say(ctx, "Linux bastion 6.1.0-18-cloud-amd64 #1 SMP x86_64 GNU/Linux");
      return;
    case "uptime":
      say(ctx, ` ${new Date().toTimeString().slice(0, 8)} up 41 days,  3:12,  2 users,  load average: 1.84, 1.42, 1.19`);
      return;
    case "ps": return cmdPs(ctx);
    case "top": return cmdTop(ctx);
    case "df": return cmdDf(ctx);
    case "free": return cmdFree(ctx);
    case "ss": return cmdSs(ctx);
    case "ping": return cmdPing(ctx, args[0]);
    case "dig":
    case "nslookup": return cmdDig(ctx, args[0]);
    case "curl": return cmdCurl(ctx, rest);
    case "ssh": return cmdSsh(ctx, args[0]);
    case "systemctl": return cmdSystemctl(ctx, args);
    case "journalctl": return cmdJournalctl(ctx, rest);
    case "crontab": return cmdCrontab(ctx, args[0]);
    case "openssl": return cmdOpenssl(ctx, rest);
    case "nginx": return cmdNginx(ctx, rest);
    case "trivy": return cmdTrivy(ctx, rest);
    case "gitleaks": return cmdGitleaks(ctx, rest);
    case "vault": return cmdVault(ctx, rest);
    case "hey": return cmdHey(ctx, rest);
    case "mysql":
    case "psql": return cmdMysql(ctx, rest);
    case "sonar-scanner": return cmdSonar(ctx);
    case "git": return cmdGit(ctx, rest);
    case "docker": return cmdDocker(ctx, rest);
    case "kubectl":
    case "k": return cmdKubectl(ctx, rest);
    case "helm": return cmdHelm(ctx, rest);
    case "terraform": return cmdTerraform(ctx, rest);
    case "ansible-playbook":
    case "ansible": return cmdAnsible(ctx, rest);
    case "aws": return cmdAws(ctx, rest);
    case "gh": return cmdGh(ctx, rest);
    case "jenkins": return cmdJenkins(ctx, rest);
    case "argocd": return cmdArgocd(ctx, rest);
    case "vim":
    case "vi":
    case "nano": return cmdEditor(ctx, args[0], cmd);
    case "sleep":
      say(ctx, "", TONE.dim);
      return;
    default:
      void flags;
      ctx.exitCode = 127;
      say(ctx, `bash: ${cmd}: command not found`, TONE.err);
  }
}

// ---------------------------------------------------------------- meta

function cmdHelp(ctx: any) {
  say(ctx, "DevOps Life simulated shell — real enough to break things.", TONE.head);
  say(ctx, "");
  const groups: Array<[string, string]> = [
    ["navigate", "pwd cd ls cat head tail grep wc find tree stat less"],
    ["edit", "vim nano echo export unset env source mkdir touch rm cp mv"],
    ["investigate", "kubectl helm argocd journalctl systemctl top df free ss ps dig curl ssh"],
    ["ship", "git docker terraform ansible-playbook aws gh jenkins nginx trivy sonar-scanner openssl"],
    ["meta", "help man CMD hint history clear exit"],
  ];
  groups.forEach(([name, list]) => say(ctx, `  ${name.padEnd(12)} ${list}`, TONE.muted));
  say(ctx, "");
  say(ctx, "  Pipes and redirects work: kubectl get pods | grep CrashLoop, echo hi > notes.txt", TONE.dim);
  say(ctx, "  `man CMD` opens a page for one command.", TONE.dim);
  say(ctx, "  You are on the jumpbox. Break-glass access is not enabled.", TONE.dim);
  say(ctx, "  Stuck? `hint` shows the next useful step (costs a little team trust).", TONE.dim);
}

function cmdMan(ctx: any, name?: string) {
  if (!name) return fail(ctx, "What manual page do you want?");
  const page = HELP[name];
  if (!page) return fail(ctx, `No manual entry for ${name}`);
  page.forEach((l) => say(ctx, l));
}

function cmdHint(ctx: any) {
  const down = ctx.services.filter((s: any) => s.status === "down");
  const degraded = ctx.services.filter((s: any) => s.status === "degraded");
  const db = ctx.resources.find((r: any) => r.kind === "database");
  const queue = ctx.resources.find((r: any) => r.kind === "queue");
  const ns = ctx.session.namespace || "prod";
  let hint: string;
  if (down.length) {
    hint = `Nothing is serving on ${down[0].name}. Run: kubectl get pods -n ${ns} — then describe a pod that is not Running.`;
  } else if (degraded.length) {
    hint = `${degraded[0].name} is degraded. kubectl describe pod $(kubectl get pods -n ${ns} | grep ${degraded[0].name}) and read the Events before restarting anything.`;
  } else if (Number(db?.utilization) > 90) {
    hint = `${db?.name} is at ${db?.utilization}% of max_connections. kubectl logs a pod and look for "pool" before you touch replicas.`;
  } else if (Number(queue?.utilization) > 70) {
    hint = `${queue?.name} is backing up. Check whether the consumer is alive: kubectl get pods -n ${ns}.`;
  } else {
    hint = `Nothing is on fire. kubectl get deploy -n ${ns}, then read the newest failing run with gh run list.`;
  }
  say(ctx, hint, TONE.muted);
  ctx.reputationDelta -= 1;
  note(ctx, "asked for a hint (team trust -1)");
}

function cmdHistory(ctx: any) {
  const items = (ctx.session.history || []).slice(-40);
  if (!items.length) {
    say(ctx, "    1  history", TONE.muted);
    return;
  }
  items.forEach((h: string, i: number) => say(ctx, `${String(i + 1).padStart(5)}  ${h}`));
}

// ---------------------------------------------------------------- filesystem

function cmdCd(ctx: any, target?: string) {
  if (!target || target === "~") {
    ctx.session.cwd = HOME;
    ctx.sessionDirty = true;
    return;
  }
  const path = resolvePath(ctx.session.cwd, target);
  if (!isDir(fsOf(ctx), path)) return fail(ctx, `bash: cd: ${target}: No such file or directory`);
  ctx.session.cwd = path;
  ctx.sessionDirty = true;
}

const MODES: Record<string, string> = { file: "-rw-r--r--", dir: "drwxr-xr-x" };

function cmdLs(ctx: any, rest: string[]) {
  const { flags, args } = parseArgs(rest);
  const target = args.find((a) => !a.startsWith("-")) || ".";
  const path = resolvePath(ctx.session.cwd, target);
  if (!isDir(fsOf(ctx), path)) {
    if (!fsOf(ctx)[path]) return fail(ctx, `ls: cannot access '${target}': No such file or directory`);
    say(ctx, target);
    return;
  }
  let entries = listDir(fsOf(ctx), path);
  if (!flags["-a"]) entries = entries.filter((e) => !e.name.startsWith("."));
  if (!entries.length) return;
  if (flags["-l"]) {
    entries.forEach((e) => {
      say(ctx, `${MODES[e.type]} 1 engineer engineer ${humanSize(e.size).padStart(6)} Oct 24 09:14 ${e.name}${e.type === "dir" ? "/" : ""}`);
    });
    return;
  }
  say(ctx, entries.map((e) => (e.type === "dir" ? `${e.name}/` : e.name)).join("  "));
}

function cmdCat(ctx: any, rest: string[]) {
  const { flags, args } = parseArgs(rest);
  const files = args.filter((a) => !a.startsWith("-"));
  if (!files.length) return fail(ctx, "cat: missing operand");
  files.forEach((f) => {
    const path = resolvePath(ctx.session.cwd, f);
    const content = readFile(fsOf(ctx), path);
    if (content == null) {
      if (isDir(fsOf(ctx), path)) say(ctx, `cat: ${f}: Is a directory`, TONE.err);
      else say(ctx, `cat: ${f}: No such file or directory`, TONE.err);
      ctx.exitCode = 1;
      return;
    }
    const body = expandEnv(ctx, content);
    if (flags["-n"]) body.split("\n").forEach((l, i) => say(ctx, `${String(i + 1).padStart(4)}  ${l}`));
    else body.split("\n").forEach((l) => say(ctx, l));
  });
}

function cmdHeadTail(ctx: any, rest: string[], mode: "head" | "tail") {
  const { flags, args } = parseArgs(rest);
  const n = Number(flags["-n"] || 20);
  const file = args.find((a) => !a.startsWith("-"));
  if (!file) return fail(ctx, `${mode}: missing operand`);
  const path = resolvePath(ctx.session.cwd, file);
  const content = readFile(fsOf(ctx), path);
  if (content == null) return fail(ctx, `${mode}: cannot open '${file}' for reading: No such file or directory`);
  const rows = content.split("\n").filter((l, i, arr) => !(i === arr.length - 1 && l === ""));
  const slice = mode === "head" ? rows.slice(0, n) : rows.slice(-n);
  slice.forEach((l) => say(ctx, l));
  if (flags["-f"]) say(ctx, `following ${file} — simulated stream, press Ctrl+C to stop`, TONE.dim);
}

function cmdGrep(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const pattern = args[0];
  const files = args.slice(1);
  if (!pattern) return fail(ctx, "usage: grep [OPTIONS] PATTERN FILE...");
  if (!files.length) return fail(ctx, "grep: no input files (try: kubectl get pods | grep NAME)");
  let out: string[] = [];
  files.forEach((f) => {
    const content = readFile(fsOf(ctx), resolvePath(ctx.session.cwd, f));
    if (content == null) {
      say(ctx, `grep: ${f}: No such file or directory`, TONE.err);
      ctx.exitCode = 1;
      return;
    }
    out = out.concat(content.split("\n"));
  });
  const hits = grepLines(out, rest.filter((t) => !files.includes(t)));
  if (!hits.length) {
    ctx.exitCode = 1;
    return;
  }
  hits.forEach((h) => say(ctx, h));
}

function cmdWc(ctx: any, rest: string[]) {
  const file = rest.find((a) => !a.startsWith("-"));
  if (!file) return fail(ctx, "wc: missing operand");
  const content = readFile(fsOf(ctx), resolvePath(ctx.session.cwd, file));
  if (content == null) return fail(ctx, `wc: ${file}: No such file or directory`);
  const lines = content.split("\n").length - 1;
  say(ctx, `${String(lines).padStart(4)} ${String(content.split(/\s+/).filter(Boolean).length).padStart(6)} ${String(content.length).padStart(6)} ${file}`);
}

function cmdFind(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const start = args[0] || ".";
  const nameIdx = rest.indexOf("-name");
  const pattern = nameIdx > -1 ? rest[nameIdx + 1] : null;
  const root = resolvePath(ctx.session.cwd, start);
  const re = pattern ? new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`) : null;
  const hits = Object.keys(fsOf(ctx))
    .filter((p) => p === root || p.startsWith(`${root}/`))
    .filter((p) => (re ? re.test(baseOf(p)) : true))
    .sort();
  hits.forEach((p) => say(ctx, root === "/" ? p : `.${p.slice(root.length)}`));
  if (!hits.length) say(ctx, "(no matches)", TONE.muted);
}

function cmdTree(ctx: any) {
  const root = ctx.session.cwd;
  say(ctx, displayPath(root), TONE.muted);
  Object.keys(fsOf(ctx))
    .filter((p) => p.startsWith(`${root}/`))
    .sort()
    .forEach((p) => {
      const depth = p.slice(root.length + 1).split("/").length;
      if (depth > 3) return;
      const node = fsOf(ctx)[p];
      say(ctx, `${"│  ".repeat(depth - 1)}├─ ${baseOf(p)}${node.type === "dir" ? "/" : ""}`);
    });
}

function cmdStat(ctx: any, file?: string) {
  if (!file) return fail(ctx, "stat: missing operand");
  const path = resolvePath(ctx.session.cwd, file);
  const node = fsOf(ctx)[path];
  if (!node) return fail(ctx, `stat: cannot statx '${file}': No such file or directory`);
  say(ctx, `  File: ${file}`);
  say(ctx, `  Size: ${node.type === "file" ? (node.content || "").length : 4096}\tType: ${node.type === "dir" ? "directory" : "regular file"}`);
  say(ctx, "Modify: 2026-10-24 09:14:02.000000000 +0000");
}

function cmdMkdir(ctx: any, args: string[]) {
  const targets = args.filter((a) => !a.startsWith("-"));
  if (!targets.length) return fail(ctx, "mkdir: missing operand");
  targets.forEach((t) => ensureDir(fsOf(ctx), resolvePath(ctx.session.cwd, t)));
  ctx.sessionDirty = true;
  note(ctx, `created ${targets.map((t) => displayPath(resolvePath(ctx.session.cwd, t))).join(", ")}`);
}

function cmdTouch(ctx: any, file?: string) {
  if (!file) return fail(ctx, "touch: missing file operand");
  const path = resolvePath(ctx.session.cwd, file);
  if (!fsOf(ctx)[path]) writeFile(fsOf(ctx), path, "");
  ctx.sessionDirty = true;
}

function cmdRm(ctx: any, rest: string[]) {
  const { flags, args } = parseArgs(rest);
  const targets = args.filter((a) => !a.startsWith("-"));
  if (!targets.length) return fail(ctx, "rm: missing operand");
  targets.forEach((t) => {
    const path = resolvePath(ctx.session.cwd, t);
    const node = fsOf(ctx)[path];
    if (!node) return fail(ctx, `rm: cannot remove '${t}': No such file or directory`);
    if (node.type === "dir" && !flags["-r"] && !flags["-rf"]) return fail(ctx, `rm: cannot remove '${t}': Is a directory`);
    removePath(fsOf(ctx), path);
    note(ctx, `deleted ${displayPath(path)}`);
  });
  ctx.sessionDirty = true;
  if (flags["-rf"] || flags["-r"]) ctx.risky = true;
}

function cmdCp(ctx: any, args: string[]) {
  if (args.length < 2) return fail(ctx, "cp: missing destination file operand");
  const src = resolvePath(ctx.session.cwd, args[0]);
  const dst = resolvePath(ctx.session.cwd, args[1]);
  const content = readFile(fsOf(ctx), src);
  if (content == null) return fail(ctx, `cp: cannot stat '${args[0]}': No such file or directory`);
  writeFile(fsOf(ctx), isDir(fsOf(ctx), dst) ? `${dst}/${baseOf(src)}` : dst, content);
  ctx.sessionDirty = true;
}

function cmdMv(ctx: any, args: string[]) {
  if (args.length < 2) return fail(ctx, "mv: missing destination file operand");
  const src = resolvePath(ctx.session.cwd, args[0]);
  const dst = resolvePath(ctx.session.cwd, args[1]);
  const node = fsOf(ctx)[src];
  if (!node) return fail(ctx, `mv: cannot stat '${args[0]}': No such file or directory`);
  if (node.type === "file") writeFile(fsOf(ctx), dst, node.content || "");
  removePath(fsOf(ctx), src);
  ctx.sessionDirty = true;
}

function cmdEcho(ctx: any, rest: string[]) {
  const noNewline = rest[0] === "-n";
  say(ctx, expandEnv(ctx, (noNewline ? rest.slice(1) : rest).join(" ")));
}

/** promtool check rules <file> — parses the alert rules the way Prometheus will. */
function cmdPromtool(ctx: any, rest: string[]) {
  const args = rest.filter((token) => !token.startsWith("-"));
  if (args[0] !== "check") {
    ctx.exitCode = 1;
    return say(ctx, "promtool: supported here: promtool check rules <file>", TONE.muted);
  }
  const target = args[args.length - 1] || "prometheus/rules/ride-api.yml";
  const content = readFile(fsOf(ctx), resolvePath(ctx.session.cwd, target));
  if (content == null) {
    ctx.exitCode = 1;
    return say(ctx, `  FAILED: ${target}: no such file or directory`, TONE.err);
  }
  const problems: string[] = [];
  if (!/alert:/.test(content)) problems.push('missing "alert" key');
  if (!/expr:/.test(content)) problems.push('missing "expr" key');
  if (!/for:/.test(content)) problems.push('missing "for" duration');
  if (problems.length) {
    ctx.exitCode = 1;
    say(ctx, `Checking ${target}`, TONE.muted);
    problems.forEach((problem) => say(ctx, `  FAILED: ${target}: ${problem}`, TONE.err));
    return;
  }
  const rules = (content.match(/- alert:/g) || []).length;
  say(ctx, `Checking ${target}`, TONE.muted);
  say(ctx, `  SUCCESS: ${rules} rules found`, TONE.ok);
  note(ctx, "validated the alert rules");
}

/** sed -i "s/old/new/g" file — the in-place edit the pipeline steps ask for. */
function cmdSed(ctx: any, rest: string[]) {
  const inPlace = rest.some((token) => token.startsWith("-i"));
  const args = rest.filter((token) => !token.startsWith("-"));
  const expression = args[0] || "";
  const target = args[1];
  if (!target) {
    ctx.exitCode = 1;
    return say(ctx, "sed: no input files", TONE.err);
  }
  const path = resolvePath(ctx.session.cwd, target);
  const content = readFile(fsOf(ctx), path);
  if (content == null) {
    ctx.exitCode = 1;
    return say(ctx, `sed: can't read ${target}: No such file or directory`, TONE.err);
  }
  const updated = sedLines(content.split("\n"), [expression]).join("\n");
  if (updated === content) {
    note(ctx, `${displayPath(path)} is unchanged`);
    return;
  }
  if (inPlace) {
    writeFile(fsOf(ctx), path, updated);
    ctx.sessionDirty = true;
    note(ctx, `edited ${displayPath(path)}`);
    return;
  }
  updated.split("\n").forEach((row) => say(ctx, row));
}

function cmdExport(ctx: any, rest: string[]) {
  const pairs = rest.filter((t) => t.includes("="));
  if (!pairs.length) {
    Object.entries(ctx.session.env || {}).forEach(([k, v]) => say(ctx, `declare -x ${k}="${v}"`));
    return;
  }
  pairs.forEach((p) => {
    const idx = p.indexOf("=");
    ctx.session.env[p.slice(0, idx)] = p.slice(idx + 1);
  });
  ctx.sessionDirty = true;
  note(ctx, `exported ${pairs.map((p) => p.split("=")[0]).join(", ")}`);
}

function cmdEnv(ctx: any, key?: string) {
  const env = ctx.session.env || {};
  if (key) {
    if (!(key in env)) {
      ctx.exitCode = 1;
      return;
    }
    say(ctx, String(env[key]));
    return;
  }
  Object.entries(env).forEach(([k, v]) => say(ctx, `${k}=${v}`));
}

function cmdSource(ctx: any, file?: string) {
  if (!file) return fail(ctx, "bash: source: filename argument required");
  const content = readFile(fsOf(ctx), resolvePath(ctx.session.cwd, file));
  if (content == null) return fail(ctx, `bash: ${file}: No such file or directory`);
  content.split("\n").forEach((l) => {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) ctx.session.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
  ctx.sessionDirty = true;
  note(ctx, `loaded environment from ${file}`);
}

function cmdWhich(ctx: any, name?: string) {
  if (!name) return;
  if (COMMAND_NAMES.includes(name)) {
    say(ctx, `/usr/local/bin/${name}`);
    return;
  }
  say(ctx, `which: no ${name} in (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)`);
  ctx.exitCode = 1;
}

// ---------------------------------------------------------------- host tools

function cmdPs(ctx: any) {
  say(ctx, "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND", TONE.head);
  const rows = [
    ["root", 1, 0.0, 0.1, 168032, 11244, "/sbin/init"],
    ["root", 412, 1.8, 1.2, 2104384, 194112, "/usr/bin/containerd"],
    ["root", 655, 0.4, 0.6, 812344, 98240, "/usr/bin/kubelet"],
    ["root", 903, 0.2, 0.2, 148220, 31288, "/usr/sbin/chronyd"],
    ["root", 1180, 2.4, 4.1, 3120884, 662144, "/usr/bin/java -jar jenkins-agent.jar"],
    ["engineer", 2211, 0.0, 0.1, 21444, 5120, "-bash"],
  ];
  rows.forEach(([user, pid, cpu, mem, vsz, rss, command], i) => {
    say(ctx, `${String(user).padEnd(10)} ${String(pid).padStart(5)} ${String(cpu).padStart(4)} ${String(mem).padStart(4)} ${String(vsz).padStart(7)} ${String(rss).padStart(6)} ?      Ssl  09:12   0:0${i} ${command}`);
  });
}

function cmdTop(ctx: any) {
  const nodes = nodeRows(ctx.resources);
  const avg = nodes.length ? Math.round(nodes.reduce((n, r) => n + r.cpu, 0) / nodes.length) : 20;
  say(ctx, `top - ${new Date().toTimeString().slice(0, 8)} up 41 days, load average: 1.84, 1.42, 1.19`, TONE.head);
  say(ctx, "Tasks: 118 total, 1 running, 117 sleeping");
  say(ctx, `%Cpu(s): ${Math.min(96, avg + 12).toFixed(1)} us,  3.2 sy,  0.0 ni, ${Math.max(0, 92 - avg).toFixed(1)} id`);
  say(ctx, "MiB Mem :  32168.0 total,   4102.4 free,  18420.8 used,   9644.8 buff/cache");
  say(ctx, "");
  say(ctx, "    PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND", TONE.muted);
  [
    [1180, "jenkins", 3120884, 662144, avg, "java"],
    [655, "root", 812344, 98240, 6, "kubelet"],
    [903, "chrony", 148220, 31288, 2, "chronyd"],
  ].forEach(([pid, user, virt, res, cpu, name]) => {
    say(ctx, `${String(pid).padStart(7)} ${String(user).padEnd(9)} 20   0 ${String(virt).padStart(7)} ${String(res).padStart(6)} ${String(cpu).padStart(5)}   1.4   0:41.12 ${name}`);
  });
}

function cmdDf(ctx: any) {
  say(ctx, "Filesystem      Size  Used Avail Use% Mounted on", TONE.head);
  say(ctx, "overlay         200G  176G   24G  88% /");
  say(ctx, "tmpfs            16G     0   16G   0% /dev/shm");
  say(ctx, "/dev/nvme1n1    500G  118G  382G  24% /var/lib/containerd");
  const diskNode = ctx.resources.find((r: any) => (r.tags || []).includes("disk-pressure")) || ctx.resources.find((r: any) => r.kind === "node");
  if (diskNode) {
    say(ctx, "");
    say(ctx, `# ${diskNode.name}: 88% used, log rotation is behind (see journalctl -u kubelet)`, TONE.warn);
  }
}

function cmdFree(ctx: any) {
  say(ctx, "               total        used        free      shared  buff/cache   available", TONE.head);
  say(ctx, "Mem:           32168       18420        4102         128        9644        8290");
  say(ctx, "Swap:           8192         412        7780");
}

function cmdSs(ctx: any) {
  say(ctx, "Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process", TONE.head);
  [
    ["tcp", "LISTEN", 0, 128, "0.0.0.0:22", "0.0.0.0:*", 'users:(("sshd",pid=903,fd=3))'],
    ["tcp", "LISTEN", 0, 511, "0.0.0.0:6443", "0.0.0.0:*", ""],
    ["tcp", "LISTEN", 0, 511, "127.0.0.1:10250", "0.0.0.0:*", ""],
    ["tcp", "LISTEN", 0, 511, "0.0.0.0:8080", "0.0.0.0:*", 'users:(("nginx",pid=1180,fd=6))'],
    ["tcp", "ESTAB", 0, 0, "10.20.1.11:22", "10.20.0.5:51234", 'users:(("sshd",pid=2211,fd=4))'],
  ].forEach((r) => say(ctx, `${String(r[0]).padEnd(6)} ${String(r[1]).padEnd(6)} ${String(r[2]).padStart(6)} ${String(r[3]).padStart(6)} ${String(r[4]).padEnd(22)} ${String(r[5]).padEnd(22)} ${r[6]}`));
}

function cmdPing(ctx: any, host?: string) {
  if (!host) return fail(ctx, "ping: usage error: Destination address required");
  say(ctx, `PING ${host} (10.20.1.12) 56(84) bytes of data.`);
  [0.42, 0.38, 0.51].forEach((ms, i) => say(ctx, `64 bytes from ${host} (10.20.1.12): icmp_seq=${i + 1} ttl=62 time=${ms} ms`));
  say(ctx, `--- ${host} ping statistics ---`);
  say(ctx, "3 packets transmitted, 3 received, 0% packet loss, time 2003ms");
}

function cmdDig(ctx: any, host?: string) {
  if (!host) return fail(ctx, "dig: usage: dig HOST");
  const primary = ctx.services[0];
  say(ctx, `; <<>> DiG 9.18.24 <<>> ${host}`, TONE.muted);
  say(ctx, ";; ANSWER SECTION:");
  say(ctx, `${host}.\t60\tIN\tCNAME\t${primary ? `${primary.name}.prod.svc.cluster.local.` : "edge-alb.ap-south-1.elb.amazonaws.com."}`);
  say(ctx, `${host}.\t60\tIN\tA\t10.20.101.24`);
}

function cmdCrontab(ctx: any, flag?: string) {
  const path = "/var/spool/cron/engineer";
  if (flag === "-l") {
    const content = readFile(fsOf(ctx), path);
    if (content == null) return fail(ctx, "no crontab for engineer");
    content.split("\n").forEach((l) => say(ctx, l));
    return;
  }
  if (flag === "-e") {
    ctx.editor = { path, content: readFile(fsOf(ctx), path) || "", mode: "crontab" };
    say(ctx, "opened crontab for engineer", TONE.muted);
    return;
  }
  say(ctx, "usage: crontab [-l | -e]", TONE.muted);
}

// ---------------------------------------------------------------- git / docker / editor

function cmdGit(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const sub = args[0] || "";
  const git = (ctx.session.git = ctx.session.git || { branch: "main", ahead: 0, dirty: ["internal/orders/pool.go"] });
  if (!sub) return say(ctx, "usage: git <command> [<args>]", TONE.muted);

  if (sub === "status") {
    say(ctx, `On branch ${git.branch}`);
    if (git.ahead) say(ctx, `Your branch is ahead of 'origin/${git.branch}' by ${git.ahead} commit(s).`);
    else say(ctx, `Your branch is up to date with 'origin/${git.branch}'.`);
    if (git.dirty.length) {
      say(ctx, "");
      say(ctx, "Changes not staged for commit:", TONE.muted);
      say(ctx, '  (use "git add <file>..." to update what will be committed)');
      git.dirty.forEach((f: string) => say(ctx, `\tmodified:   ${f}`, TONE.warn));
    } else {
      say(ctx, "nothing to commit, working tree clean", TONE.muted);
    }
    return;
  }
  if (sub === "log") {
    say(ctx, `${hashStr(git.branch).toString(16).slice(0, 7)} (HEAD -> ${git.branch}) fix: raise pool size and add connect backoff`, TONE.muted);
    say(ctx, "8f2c1da feat: batching for the payments worker");
    say(ctx, "1b90e33 chore: bump base image");
    say(ctx, "77ac102 test: retry coverage");
    return;
  }
  if (sub === "branch") {
    say(ctx, `* ${git.branch}`);
    say(ctx, "  feat/batching");
    say(ctx, "  release/2.14");
    return;
  }
  if (sub === "checkout") {
    if (args[1] === "-b") {
      const name = args[2] || "feature";
      git.branch = name;
      say(ctx, `Switched to a new branch '${name}'`);
      note(ctx, `created branch ${name}`);
      return;
    }
    if (args[1]) {
      git.branch = args[1];
      say(ctx, `Switched to branch '${args[1]}'`);
      note(ctx, `checked out ${args[1]}`);
      return;
    }
    return fail(ctx, "fatal: you must specify a branch");
  }
  if (sub === "diff") {
    say(ctx, "diff --git a/internal/orders/pool.go b/internal/orders/pool.go");
    say(ctx, "--- a/internal/orders/pool.go");
    say(ctx, "+++ b/internal/orders/pool.go");
    say(ctx, "@@ -18,7 +18,7 @@ func newPool(cfg Config) *pgxpool.Pool {");
    say(ctx, "-  maxConns := 40", TONE.err);
    say(ctx, "+  maxConns := 100", TONE.ok);
    say(ctx, "   return mustPool(cfg, maxConns)");
    return;
  }
  if (sub === "add") {
    note(ctx, "staged changes");
    say(ctx, "", TONE.dim);
    return;
  }
  if (sub === "commit") {
    const idx = rest.indexOf("-m");
    const message = idx > -1 ? rest[idx + 1] || "" : "";
    if (!message) return fail(ctx, "Aborting commit due to empty commit message.");
    if (!git.dirty.length) return fail(ctx, `On branch ${git.branch}\nnothing to commit, working tree clean`);
    git.dirty = [];
    git.ahead += 1;
    git.last_commit = message.replace(/"/g, "");
    say(ctx, `[${git.branch} ${hashStr(message).toString(16).slice(0, 7)}] ${message.replace(/"/g, "")}`, TONE.ok);
    say(ctx, " 1 file changed, 12 insertions(+), 3 deletions(-)");
    note(ctx, `committed "${message.replace(/"/g, "")}"`);
    return;
  }
  if (sub === "push") {
    say(ctx, "Enumerating objects: 9, done.");
    say(ctx, "Counting objects: 100% (9/9), done.");
    say(ctx, `To github.com:acme/${ctx.services[0]?.name || "app"}.git`);
    say(ctx, `   ${hashStr(git.branch).toString(16).slice(0, 7)}..9c1a2b3  ${git.branch} -> ${git.branch}`, TONE.ok);
    git.ahead = 0;
    ctx.pipelineRequest = {
      branch: git.branch,
      message: git.last_commit || `push to ${git.branch}`,
      config_source: "jenkins",
    };
    note(ctx, `pushed ${git.branch} — pipeline queued`);
    say(ctx, `pipeline deploy/prod queued for ${git.branch} (sha ${hashStr(git.branch).toString(16).slice(0, 7)})`, TONE.ok);
    return;
  }
  if (sub === "pull") return say(ctx, "Already up to date.", TONE.muted);
  if (sub === "remote") {
    say(ctx, `origin\tgit@github.com:acme/${ctx.services[0]?.name || "app"}.git (fetch)`);
    say(ctx, `origin\tgit@github.com:acme/${ctx.services[0]?.name || "app"}.git (push)`);
    return;
  }
  if (sub === "stash") {
    git.dirty = [];
    say(ctx, `Saved working directory and index state WIP on ${git.branch}`);
    note(ctx, "stashed changes");
    return;
  }
  if (sub === "blame") {
    say(ctx, "9c1a2b3 (Priya Sharma 2026-10-18 11:04:12 +0530 22) maxConns := 100");
    say(ctx, "1b90e33 (Dev Lead     2026-10-02 16:41:55 +0530 23) idleTimeout := 30 * time.Second");
    return;
  }
  if (sub === "revert") {
    say(ctx, `[main ${hashStr(String(Date.now())).toString(16).slice(0, 7)}] Revert "books: 2.4.1"`, TONE.ok);
    say(ctx, " 1 file changed, 1 insertion(+), 1 deletion(-)");
    note(ctx, "reverted the release commit");
    return;
  }
  fail(ctx, `git: '${sub}' is not a git command. See 'git --help'.`);
}

// The container engine lives in docker.ts: it keeps real containers, images,
// networks and volumes on the session so the guided projects can check them.
function cmdDocker(ctx: any, rest: string[]) {
  return dockerCommand(ctx, rest);
}

function cmdEditor(ctx: any, target: string | undefined, mode: string) {
  if (!target) return fail(ctx, `${mode}: missing file operand`);
  const path = resolvePath(ctx.session.cwd, target);
  if (isDir(fsOf(ctx), path)) return fail(ctx, `${mode}: ${target} is a directory`);
  const existing = readFile(fsOf(ctx), path);
  ctx.editor = { path, content: existing ?? "", mode };
  say(ctx, `${existing == null ? "new file" : displayPath(path)} — ${mode === "nano" ? "nano" : "vim"} buffer opened`, TONE.muted);
  note(ctx, `opened ${displayPath(path)} in ${mode}`);
}

// ---------------------------------------------------------------- completion

export function completions(ctx: any, input: string): string[] {
  const endsWithSpace = /\s$/.test(input);
  const tokens = tokenize(input);
  if (!tokens.length) return [];
  const first = tokens[0] || "";
  const last = endsWithSpace ? "" : tokens[tokens.length - 1] || "";
  const prior = endsWithSpace ? tokens : tokens.slice(0, -1);
  const filter = (list: string[]) => {
    const unique = [...new Set(list)].filter(Boolean);
    return last ? unique.filter((c) => c.startsWith(last)) : unique;
  };

  if (tokens.length === 1 && !endsWithSpace) return filter(COMMAND_NAMES);
  if (first === "kubectl" || first === "k") {
    if (prior.length === 1) return filter(["get", "describe", "logs", "exec", "rollout", "set", "scale", "autoscale", "top", "apply", "delete", "edit", "port-forward", "config"]);
    const types = ["pods", "deploy", "svc", "hpa", "nodes", "events", "namespaces", "secrets", "all"];
    if (prior.length === 2 && prior[1] === "get") return filter(types);
    const names = [...ctx.services.map((s: any) => s.name), ...ctx.services.map((s: any) => `deploy/${s.name}`)];
    return filter([...types, ...names, ...ctx.resources.filter((r: any) => r.kind === "node").map((r: any) => r.name)]);
  }
  if (first === "git") return filter(["status", "log", "diff", "add", "commit", "push", "pull", "branch", "checkout", "stash", "remote", "blame"]);
  if (first === "docker") return filter(["build", "images", "ps", "run", "logs", "compose", "push", "tag"]);
  if (first === "terraform") return filter(["init", "plan", "apply", "validate", "fmt", "state", "output", "destroy"]);
  if (first === "helm") return filter(["list", "status", "history", "upgrade", "rollback", "repo"]);
  if (first === "aws") return filter(["sts", "ec2", "eks", "ecr", "s3", "iam", "ce"]);
  if (first === "systemctl") return filter(["status", "restart", "start", "stop", "list-units"]);
  if (first === "crontab") return filter(["-l", "-e"]);
  if (first === "argocd") return filter(["app"]);
  if (first === "gh") return filter(["run", "pr", "workflow"]);

  const dir = ctx.session.cwd;
  const prefix = last.includes("/") ? resolvePath(dir, last.slice(0, last.lastIndexOf("/")) || ".") : dir;
  const namePrefix = last.includes("/") ? last.slice(last.lastIndexOf("/") + 1) : last;
  if (!isDir(fsOf(ctx), prefix)) return [];
  return listDir(fsOf(ctx), prefix)
    .filter((e) => (namePrefix ? e.name.startsWith(namePrefix) : true))
    .map((e) => `${last.includes("/") ? last.slice(0, last.lastIndexOf("/") + 1) : ""}${e.name}${e.type === "dir" ? "/" : ""}`);
}

export { cmdDescribe };