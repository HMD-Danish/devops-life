import { line } from "./shell.ts";

export const TONE = { muted: "muted", ok: "ok", warn: "warn", err: "err", head: "head", dim: "dim" };

export const COMMAND_NAMES = [
  "help", "man", "hint", "clear", "history", "pwd", "cd", "ls", "cat", "head", "tail",
  "less", "grep", "wc", "find", "tree", "stat", "mkdir", "touch", "rm", "cp", "mv",
  "echo", "export", "unset", "env", "printenv", "source", "which", "whoami", "hostname",
  "date", "uname", "uptime", "ps", "top", "df", "free", "ss", "dig", "nslookup", "ping",
  "curl", "ssh", "systemctl", "journalctl", "crontab", "openssl", "nginx", "trivy",
  "sonar-scanner", "gitleaks", "vault", "hey", "mysql", "git", "docker", "kubectl", "helm",
  "terraform", "ansible-playbook",
  "ansible", "aws", "gh", "jenkins", "argocd", "vim", "vi", "nano", "sudo", "sleep", "exit",
];

export const HELP: Record<string, string[]> = {
  kubectl: [
    "kubectl — control the Kubernetes cluster",
    "",
    "  kubectl get pods|deploy|svc|hpa|nodes|events|ns [-n NS] [-o wide]",
    "  kubectl describe pod|deploy|node NAME",
    "  kubectl logs POD [-f] [--tail=N] [--previous]",
    "  kubectl exec -it POD -- CMD",
    "  kubectl rollout status|restart|undo deploy/NAME",
    "  kubectl set image deploy/NAME app=IMAGE",
    "  kubectl scale deploy/NAME --replicas=N",
    "  kubectl autoscale deploy/NAME --min=2 --max=8 --cpu-percent=70",
    "  kubectl apply -f FILE   |   kubectl delete pod|deploy NAME",
    "",
    "  A tag that does not exist, or another team's repo, breaks the workload",
    "  for real: pods stop becoming Ready and the dashboards move.",
  ],
  git: [
    "git — version control",
    "",
    "  git status | log --oneline | diff | branch | remote -v",
    "  git add . | git commit -m \"msg\" | git push | git pull",
    "  git checkout -b BRANCH | git stash",
  ],
  docker: [
    "docker — build and run containers",
    "",
    "  docker build -t IMAGE . | docker images | docker ps",
    "  docker run -d IMAGE | docker logs CONTAINER",
    "  docker compose up -d | docker compose ps | docker compose logs",
    "  docker push IMAGE",
  ],
  terraform: [
    "terraform — infrastructure as code",
    "",
    "  terraform init | validate | fmt | plan | apply | destroy",
    "  terraform state list | terraform output",
    "",
    "  plan compares terraform/*.tf with the live infrastructure, so it shows",
    "  the drift somebody introduced by hand.",
  ],
  aws: [
    "aws — AWS CLI",
    "",
    "  aws sts get-caller-identity",
    "  aws ec2 describe-instances | stop-instances --instance-ids ID",
    "  aws eks describe-cluster --name NAME | update-kubeconfig --name NAME",
    "  aws ecr get-login-password | describe-repositories",
    "  aws s3 ls [s3://bucket] | aws s3 cp FILE s3://bucket/key",
    "  aws iam list-users | aws ce get-cost-and-usage",
  ],
  helm: [
    "helm — package manager for the cluster",
    "",
    "  helm list | helm status RELEASE | helm history RELEASE",
    "  helm upgrade --install RELEASE CHART | helm rollback RELEASE REVISION",
  ],
  hint: [
    "hint — ask the sim what a senior engineer would try next",
    "",
    "  Costs a little team trust: it shows you needed pointing at the obvious",
    "  next step. Reputation goes down by 1 each time.",
  ],
  man: ["man — short manual page", "", "  man CMD  (git, kubectl, docker, terraform, aws, helm, trivy, curl, systemctl, journalctl, grep, awk, sed, vim, crontab, argocd, gh, nginx, openssl, hint)"],
  trivy: ["trivy — vulnerability scanner", "", "  trivy image IMAGE [--severity HIGH,CRITICAL]"],
  gitleaks: [
    "gitleaks — scan a repo for committed secrets",
    "",
    "  gitleaks detect --source . [--report-format json]",
  ],
  vault: [
    "vault — secret storage with an audit line per read",
    "",
    "  vault kv put secret/PATH key=value [key=value ...]",
    "  vault kv get secret/PATH   |   vault kv list secret/   |   vault status",
  ],
  hey: [
    "hey — HTTP load generator",
    "",
    "  hey -z 30s -c 100 https://staging.example.internal/api/checkout",
    "",
    "  Reads p95 and the status-code split, which is what a customer feels.",
  ],
  mysql: [
    "mysql — query the managed database",
    "",
    "  mysql -h HOST -u USER -e \"SELECT * FROM mysql.slow_log LIMIT 5;\"",
    "  mysql -h HOST -u USER DB -e \"EXPLAIN SELECT ...\"",
  ],
  argocd: ["argocd — GitOps controller", "", "  argocd app list | argocd app get NAME | argocd app sync NAME"],
  journalctl: ["journalctl — read the system journal", "", "  journalctl -u UNIT [-n LINES] [--since TIME] | journalctl -xe"],
  systemctl: ["systemctl — control systemd units", "", "  systemctl status UNIT | restart UNIT | list-units"],
  crontab: ["crontab — scheduled jobs for this user", "", "  crontab -l | crontab -e"],
  openssl: ["openssl — TLS and certificates", "", "  openssl s_client -connect HOST:443", "  openssl x509 -noout -dates -in FILE"],
  nginx: ["nginx — web server", "", "  nginx -t   (validate the config)", "  nginx -s reload"],
  grep: ["grep — search text", "", "  grep [-i] [-n] [-c] [-v] PATTERN FILE...  (also works after a pipe)"],
  awk: ["awk — field processing", "", "  awk '{print $1}' | awk -F, '{print $2}'"],
  sed: ["sed — stream editor", "", "  sed -n '3p' FILE | sed 's/a/b/g' FILE | sed '/pattern/d' FILE"],
  vim: ["vim — text editor", "", "  vim FILE   (:wq saves — the sim editor opens in place)"],
  curl: ["curl — make an HTTP request", "", "  curl -s http://service.prod.svc/healthz", "  curl -I -s -o /dev/null -w '%{http_code}' URL"],
  gh: ["gh — GitHub CLI", "", "  gh run list | gh run view ID | gh pr list | gh pr create --title T"],
};

export function say(ctx: any, text = "", tone?: string) {
  ctx.lines.push(tone ? line(text, tone) : line(text));
}

export function fail(ctx: any, text: string, tone = TONE.err) {
  ctx.lines.push(line(text, tone));
  ctx.exitCode = 1;
}

export function note(ctx: any, text: string) {
  ctx.impact.push(text);
}

export function touch(ctx: any, service: any, patch: Record<string, unknown>, impact?: string) {
  Object.assign(service, patch);
  ctx.serviceUpdates[service.id] = { ...(ctx.serviceUpdates[service.id] || {}), ...patch };
  if (impact) note(ctx, impact);
}

export function expandEnv(ctx: any, text: string): string {
  return String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, a, b) => {
    const key = a || b;
    return ctx.session.env?.[key] ?? "";
  });
}

export function findService(ctx: any, ref: string) {
  if (!ref) return null;
  const raw = String(ref).replace(/^(deploy|deployment|deployments|svc|service|statefulset|pod|pods)\//, "");
  return (
    ctx.services.find((s: any) => s.name === raw) ||
    ctx.services.find((s: any) => raw.startsWith(`${s.name}-`)) ||
    ctx.services.find((s: any) => s.name.includes(raw)) ||
    null
  );
}

export function namespaceOf(ctx: any, flags: Record<string, string | true>): string {
  return String(flags["-n"] || flags["--namespace"] || ctx.session.namespace || "prod");
}

export function fsOf(ctx: any): Record<string, any> {
  return ctx.session.files || {};
}

export function readyCount(service: any): number {
  const replicas = Math.max(0, Number(service?.replicas) || 0);
  if (service?.status === "down") return 0;
  if (service?.status === "degraded" || service?.status === "deploying") return Math.max(0, replicas - 1);
  return replicas;
}

export function imageRef(ctx: any, service: any, tag?: string): string {
  return `${ctx.cluster.registry}/${ctx.cluster.company}/${service.name}:${tag || service.version || "latest"}`;
}

const BAD_TAG = /^(bad|broken|debug|doesnotexist|missing|nonexistent|scratch|tmp)(\b|[-_.]|$)|^v0(\b|\.0)/i;

/** null when the image would run, otherwise how it breaks the workload. */
export function imageProblem(image: string, service: any): "crashloop" | "pull" | null {
  const [repo, tagRaw] = String(image).split(":");
  const tag = tagRaw || "latest";
  const repoName = repo.split("/").pop() || "";
  if (BAD_TAG.test(tag)) return "crashloop";
  if (!repo.includes("/")) return "pull";
  if (repoName && repoName !== service.name && !repoName.startsWith(service.name)) return "pull";
  return null;
}

export function applyImage(ctx: any, service: any, image: string, source: string) {
  const tag = String(image).split(":")[1] || "latest";
  const problem = imageProblem(image, service);
  if (problem === "pull") {
    touch(ctx, service, { status: "down", version: tag },
      `${source}: ${image} cannot be pulled — ${service.name} has 0 ready replicas`);
    return { problem, tag };
  }
  if (problem === "crashloop") {
    touch(ctx, service, { status: "degraded", version: tag },
      `${source}: tag ${tag} crash-loops — ${service.name} degraded (CrashLoopBackOff)`);
    return { problem, tag };
  }
  touch(ctx, service, { status: "deploying", version: tag },
    `${source}: rolled ${service.name} to tag ${tag}`);
  return { problem: null, tag };
}

export function primaryService(ctx: any) {
  return ctx.services[0] || { name: "app", version: "1.0.0", replicas: 3, status: "healthy" };
}