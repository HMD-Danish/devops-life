export default {
  key: "k8s-rollout",
  title: "Roll the payments API onto Kubernetes",
  company: "Northwind Pay",
  summary: "The manifest is written but never applied. Check the cluster, apply it and verify the pods stay up.",
  needsTerminal: true,
  ticketPrefix: "NWP",
  workdir: "~/repo",
  terminal: {
    host: "bastion",
    allowed: ["kubectl", "git", "ls", "cd", "cat", "pwd", "echo"],
  },
  runtime: {
    label: "Pods",
    items: [
      { name: "payments-api-6d9f-2xk4", detail: "Running · 1/1 ready · 4d" },
      { name: "payments-api-6d9f-9p1z", detail: "Running · 1/1 ready · 4d" },
    ],
  },
  build: { number: 451, status: "passing", branch: "main", detail: "image payments-api:2.8.0 pushed" },
  incidents: [
    { id: "NWP-118", title: "payments-worker degraded for eighteen days", severity: "sev3", opened: "Mon 08:10", owner: "Tobias Kern" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["check-context", "apply-manifest"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["check-context", "apply-manifest", "verify-rollout"],
      redHerrings: ["k-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["check-context", "apply-manifest", "verify-rollout", "set-limits"],
      redHerrings: ["k-red-1", "k-red-2"],
    },
  },
  chart: {
    title: "payments-api error rate (per 1k requests)",
    points: [2, 3, 2, 4, 6, 5, 9, 14, 22, 31, 28, 19],
  },
  services: [
    { name: "payments-api", kind: "api", health: "healthy", replicas: 2, version: "2.8.0", last_deploy: "4 days ago" },
    { name: "payments-worker", kind: "worker", health: "degraded", replicas: 1, version: "2.7.4", last_deploy: "18 days ago" },
    { name: "payments-db", kind: "database", health: "healthy", replicas: 1, version: "16.1", last_deploy: "30 days ago" },
  ],
  steps: [
    {
      key: "check-context",
      title: "Check which cluster you are pointed at",
      goal: "Never apply a manifest to a cluster you have not identified.",
      whatHappening:
        "The jumpbox is pointed at a cluster nobody has identified this sprint. Someone applied staging changes to production last month because they never checked.",
      whatNext: "Read the current context and confirm it is the production cluster.",
      ticket: { title: "Confirm kube context before applying payments manifests", priority: "P2", slaMinutes: 1440 },
      variants: {
        easy: { slaMinutes: 2880, subSteps: 1 },
        medium: { slaMinutes: 1440, subSteps: 1 },
        hard: { slaMinutes: 300, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Ask kubectl which context it is using right now — before you apply anything." },
        {
          title: "Concept",
          body: "A kube context is a saved pair of cluster and user. kubectl always works against the current context unless you pass --context, so identifying it is the cheapest guard rail you have.",
        },
        { title: "Steps", items: ["kubectl config current-context", "kubectl get nodes"] },
      ],
      doneWhen: ["kubectl config current-context"],
    },
    {
      key: "apply-manifest",
      title: "Apply the payments manifest",
      goal: "Create the objects the API needs in the prod namespace.",
      whatHappening:
        "The deployment manifest exists in the repo but has never been applied, so the API is still running from a hand-edited deployment.",
      whatNext: "Apply k8s/deployment.yaml with kubectl and watch what the cluster does.",
      ticket: { title: "Apply k8s/deployment.yaml for payments-api", priority: "P1", slaMinutes: 240 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 240, subSteps: 1 },
        hard: { slaMinutes: 120, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The manifest is in the repo under k8s/. Apply the file, don't hand-edit objects." },
        {
          title: "Concept",
          body: "kubectl apply sends the manifest to the API server, which creates or patches the named object. It is idempotent: applying the same file twice is safe, which is why it is preferred over create.",
        },
        { title: "Steps", items: ["cd ~/repo", "cat k8s/deployment.yaml", "kubectl apply -f k8s/deployment.yaml"] },
      ],
      doneWhen: ["kubectl apply"],
    },
    {
      key: "verify-rollout",
      title: "Verify the rollout",
      goal: "Prove the pods are ready and the rollout actually finished.",
      whatHappening:
        "A deployment can be accepted by the cluster and still sit at zero ready replicas — image pull errors and crash loops look identical from the outside.",
      whatNext: "List the pods, then watch the rollout status until it completes.",
      ticket: { title: "Confirm payments-api pods are Ready", priority: "P2", slaMinutes: 720 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 720, subSteps: 1 },
        hard: { slaMinutes: 180, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Pods first, then the deployment's rollout status." },
        {
          title: "Concept",
          body: "READY shows how many containers passed their readiness probe. A pod with 0/1 ready is running but not serving traffic, so the rollout will never complete.",
        },
        { title: "Steps", items: ["kubectl get pods", "kubectl rollout status deployment/payments-api"] },
      ],
      doneWhen: ["kubectl get pods"],
    },
    {
      key: "set-limits",
      title: "Give the pod a resource budget",
      goal: "Stop one container from starving everything else on the same node.",
      whatHappening:
        "payments-api runs without limits, so under load it takes the whole node and the worker beside it starts failing its probes.",
      whatNext: "Set explicit CPU and memory limits on the deployment, then confirm the pods came back with them.",
      ticket: { title: "Set resource limits on payments-api", priority: "P2", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 960, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 120, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The limit belongs to the deployment, not to a single pod. Change it there." },
        {
          title: "Concept",
          body: "Requests decide where a pod can be scheduled; limits decide what it may consume once it runs. Without a limit one noisy container can evict its neighbours and take the worker down with it.",
        },
        {
          title: "Steps",
          items: [
            "kubectl set resources deployment/payments-api --limits=cpu=500m,memory=512Mi",
            "kubectl describe deploy payments-api",
            "kubectl get pods",
          ],
        },
      ],
      doneWhen: ["kubectl set resources"],
    },
  ],
  messages: [
    {
      id: "k1",
      trigger: "project_start",
      step: "check-context",
      author: "Noor Haddad",
      role: "Dev lead",
      body:
        "@{player} the payments manifest has been sitting in the repo for two weeks. Before anything else, tell me which cluster that jumpbox is pointing at.",
      variants: {
        easy: {
          body: "@{player} the payments manifest is already written, it just never got applied. No rush, but do it in order: check which cluster this jumpbox points at, then apply k8s/deployment.yaml and tell me what the pods do.",
        },
        hard: {
          body: "@{player} payments manifest. Repo. Two weeks. Can you just land it and tell me if anything screams?",
        },
      },
      replies: [
        { id: "checking", label: "Checking now", next: "k2" },
        { id: "which-cluster", label: "Which cluster should it be?", next: "k3" },
      ],
    },
    {
      id: "k2",
      trigger: "reply",
      step: "check-context",
      author: "Noor Haddad",
      role: "Dev lead",
      body: "Good. If it says staging, stop and tell me before you touch anything.",
    },
    {
      id: "k3",
      trigger: "reply",
      step: "check-context",
      author: "Noor Haddad",
      role: "Dev lead",
      body: "The production EKS context. If what you see says staging, don't apply — we had that exact accident last month.",
    },
    {
      id: "k4",
      trigger: "step_start",
      step: "check-context",
      author: "Ana Beltrán",
      role: "Security",
      body: "While you're in there: the payments deployment must not run with the default service account. Flagging it now so it lands in the same change.",
    },
    {
      id: "k5",
      trigger: "step_done",
      step: "check-context",
      author: "Noor Haddad",
      role: "Dev lead",
      body: "Context is right. Apply k8s/deployment.yaml — one rollout, and tell me if it stalls.",
    },
    {
      id: "k6",
      trigger: "mistake",
      step: "apply-manifest",
      author: "Noor Haddad",
      role: "Dev lead",
      body: "That failed. Don't kubectl edit your way around it — fix the file, or the next apply will undo you.",
      variants: {
        easy: {
          body:
            "That one didn't apply, and nothing in the cluster changed — apply is safe to retry. Check the file path first: it is k8s/deployment.yaml inside the repo.",
        },
      },
    },
    {
      id: "k7",
      trigger: "step_done",
      step: "apply-manifest",
      author: "Tobias Kern",
      role: "QA",
      body: "I see new pods. Are they ready? A deployment can be green in the API and still serve nothing.",
    },
    {
      id: "k8",
      trigger: "timer",
      atMinute: 60,
      step: "verify-rollout",
      author: "Yusuf Demir",
      role: "Engineering manager",
      body: "Status check only: payments is the highest risk change this sprint. One line is enough.",
      replies: [{ id: "on-track", label: "On track", next: "k9" }],
    },
    {
      id: "k9",
      trigger: "reply",
      step: "verify-rollout",
      author: "Yusuf Demir",
      role: "Engineering manager",
      body: "Thanks. Keep the rollout status in the ticket so support can see it.",
    },
    {
      id: "k10",
      trigger: "step_done",
      step: "verify-rollout",
      author: "Noor Haddad",
      role: "Dev lead",
      body: "Rollout complete and pods are ready. Payments is on the manifest now, not on someone's laptop.",
    },
    {
      id: "k11",
      trigger: "step_start",
      step: "set-limits",
      author: "Yusuf Demir",
      role: "Engineering manager",
      body: "One more thing before you close the sprint: those pods have no limits. When traffic doubled last month the node took out the worker next door. Put a budget on them.",
    },
    {
      id: "k12",
      trigger: "step_done",
      step: "set-limits",
      author: "Tobias Kern",
      role: "SRE",
      body: "Limits are on and the worker stopped flapping. That was the real cause of the eighteen-day degradation — closing NWP-118 too.",
    },
    {
      id: "k-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "verify-rollout",
      author: "Tobias Kern",
      role: "QA",
      body: "payments-worker has been degraded for eighteen days. I'd restart it before you look at pods — that's probably the real problem.",
    },
    {
      id: "k-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "apply-manifest",
      author: "Ana Beltrán",
      role: "Security",
      body: "Staging DNS was flapping an hour ago. If the apply misbehaves, that's the first thing I'd blame.",
    },
  ],
};