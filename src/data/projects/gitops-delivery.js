// Project 8 — BookNest Library Cloud. ArgoCD, Helm, Git, Kubernetes.
// Own company, own cast, own five steps; nothing shared with other projects.
export default {
  key: "gitops-delivery",
  title: "Deliver with GitOps",
  company: "BookNest",
  summary:
    "BookNest's books app was deployed by hand on Wednesday and production no longer matches Git. Register it in ArgoCD, repair the drift, ship a new image through the repository, revert a bad release the same way, and promote staging to prod with a pull request.",
  needsTerminal: true,
  ticketPrefix: "BKN",
  workdir: "~/repo",
  tools: ["ArgoCD", "Helm", "Git", "Kubernetes"],
  terminal: {
    host: "platform-bastion",
    allowed: ["argocd", "kubectl", "helm", "git", "cat", "ls", "cd", "grep", "sed", "echo", "diff"],
  },
  runtime: {
    label: "Applications",
    items: [
      { name: "app-books", detail: "OutOfSync · 5/3 replicas" },
      { name: "app-search", detail: "Synced · Healthy" },
      { name: "argocd-server", detail: "running · 1/1" },
    ],
  },
  incidents: [
    { id: "INC-6031", title: "Manual kubectl edit caused drift and a bad release", severity: "sev2", opened: "Wed 14:20", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["register-app", "repair-drift", "ship-image"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["register-app", "repair-drift", "ship-image", "revert-release"],
      redHerrings: ["git-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["register-app", "repair-drift", "ship-image", "revert-release", "promote-prod"],
      redHerrings: ["git-red-1", "git-red-2"],
    },
  },
  chart: {
    title: "app-books replicas (running vs desired in Git)",
    points: [3, 3, 3, 3, 4, 5, 5, 5, 4, 4, 3, 5],
  },
  services: [
    { name: "argocd-server", kind: "api", health: "healthy", replicas: 1, version: "2.10.3", last_deploy: "40 days ago" },
    { name: "app-books", kind: "api", health: "degraded", replicas: 5, version: "2.4.0", last_deploy: "2 days ago" },
    { name: "app-search", kind: "worker", health: "healthy", replicas: 2, version: "1.9.4", last_deploy: "11 days ago" },
    { name: "helm-charts-repo", kind: "registry", health: "healthy", replicas: 1, version: "charts 0.14.2", last_deploy: "3 days ago" },
  ],
  steps: [
    {
      key: "register-app",
      title: "Register the repo and create the application",
      goal: "Make Git the only thing that can change what runs.",
      whatHappening:
        "The books app is running because someone typed helm install on a laptop last month. Nothing in the cluster is tied to the repository, so there is no way to tell you what should be running.",
      whatNext: "Create the ArgoCD application against the repo path, then sync it once by hand.",
      author: "Imran",
      ticket: { key: "BKN-601", title: "Move the books app to GitOps", priority: "P1", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 2 },
        hard: { slaMinutes: 240, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "An Application is a repo path plus a destination. Create it, then sync it once so it has a baseline." },
        {
          title: "Concept",
          body: "ArgoCD does not deploy code, it reconciles a cluster against a Git path. Until the Application exists there is nothing to compare, which is why drift is invisible before the first sync.",
        },
        {
          title: "Steps",
          items: [
            "cat argocd/app-books.yaml",
            "argocd app create app-books --repo https://github.com/booknest/helm-charts --path apps/books --dest-namespace prod",
            "argocd app sync app-books",
            "argocd app get app-books",
          ],
        },
      ],
      doneWhen: ["argocd app create", "argocd app sync"],
    },
    {
      key: "repair-drift",
      title: "Repair the drift",
      goal: "Find what changed outside Git and put the cluster back under it.",
      whatHappening:
        "The app reports OutOfSync on its first sync. Somebody edited a deployment directly: five replicas are running where Git says three, and the difference has been invisible for two days.",
      whatNext: "Diff the live object against the manifest, then let ArgoCD manage the difference instead of fixing it by hand.",
      author: "Imran",
      ticket: { key: "BKN-602", title: "Prod drifted from Git", priority: "P1", slaMinutes: 240 },
      variants: {
        easy: { slaMinutes: 1200, subSteps: 1 },
        medium: { slaMinutes: 240, subSteps: 2 },
        hard: { slaMinutes: 120, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "kubectl diff shows the live object next to the manifest. Fix it in Git or let ArgoCD overwrite it — never both." },
        {
          title: "Concept",
          body: "Drift is any difference between Git and the cluster, and a manual edit is its usual cause. Self-heal makes ArgoCD the only writer, so the next hand edit gets reverted instead of becoming the new truth.",
        },
        {
          title: "Steps",
          items: [
            "kubectl diff -f apps/books/deployment.yaml",
            "Note the replica count that is not in Git",
            "argocd app set app-books --sync-policy automated --self-heal",
            "argocd app get app-books",
          ],
        },
      ],
      doneWhen: ["kubectl diff", "--self-heal"],
    },
    {
      key: "ship-image",
      title: "Ship the new image through Git",
      goal: "Release without a shell on production.",
      whatHappening:
        "Books 2.4.1 is built, scanned and pushed. The only thing between it and staging is a tag in the values file, which is exactly the point.",
      whatNext: "Change the image tag in Git, push, and watch ArgoCD pick the commit up on its own.",
      author: "Sana",
      ticket: { key: "BKN-603", title: "Release books 2.4.1 to staging", priority: "P2", slaMinutes: 360 },
      variants: {
        easy: { slaMinutes: 1200, subSteps: 1 },
        medium: { slaMinutes: 360, subSteps: 2 },
        hard: { slaMinutes: 180, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "The release is one line in values-staging.yaml. Commit it and push." },
        {
          title: "Concept",
          body: "In GitOps the change is the commit, not the command: ArgoCD polls or is told, compares, and applies. The release note is the commit message, and the rollback is the previous commit.",
        },
        {
          title: "Steps",
          items: [
            'sed -i "s/tag: 2.4.0/tag: 2.4.1/g" helm/apps/values-staging.yaml',
            "git add helm/apps/values-staging.yaml",
            'git commit -m "books: 2.4.1"',
            "git push",
            "argocd app get app-books",
          ],
        },
      ],
      doneWhen: ["values-staging.yaml", "git push"],
    },
    {
      key: "revert-release",
      title: "Revert the bad release",
      goal: "Undo a change with the same mechanism that made it.",
      whatHappening:
        "2.4.1 returns 500s on the book detail page. The fastest safe path back is a revert commit, not a kubectl edit at midnight.",
      whatNext: "Revert the release commit, push, and confirm the running tag went back.",
      author: "Imran",
      ticket: { key: "BKN-604", title: "Roll books back to 2.4.0", priority: "P1", slaMinutes: 180 },
      variants: {
        easy: { slaMinutes: 720, subSteps: 1 },
        medium: { slaMinutes: 180, subSteps: 1 },
        hard: { slaMinutes: 90, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "git revert makes a new commit that undoes the old one. Revert, push, watch ArgoCD agree." },
        {
          title: "Concept",
          body: "Reverting keeps history readable: the reason for the change and the reason for the undo both stay in the log. Force-pushing over the release commit hides the incident from the next person.",
        },
        {
          title: "Steps",
          items: ["git log --oneline -5", "git revert HEAD", "git push", "argocd app get app-books"],
        },
      ],
      doneWhen: ["git revert"],
    },
    {
      key: "promote-prod",
      title: "Promote staging to prod with a pull request",
      goal: "Make promotion a review, not a copy-paste.",
      whatHappening:
        "Prod is still on the previous tag while staging has been stable for a day. Promotion is a values change in the prod file, and the team wants a second pair of eyes on every one of them.",
      whatNext: "Change the prod values in a branch, open a pull request, and confirm both apps track the same commit.",
      author: "Imran",
      ticket: { key: "BKN-605", title: "Promote books 2.4.0 to production", priority: "P1", slaMinutes: 300 },
      variants: {
        easy: { slaMinutes: 900, subSteps: 1 },
        medium: { slaMinutes: 300, subSteps: 2 },
        hard: { slaMinutes: 150, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "Branch, edit values-prod.yaml, commit, then gh pr create. Prod moves when the PR merges." },
        {
          title: "Concept",
          body: "A pull request is the promotion step that GitOps gives you for free: the diff is the release, the reviewer is the gate, and the merged commit is the audit record.",
        },
        {
          title: "Steps",
          items: [
            "git checkout -b promote/books-2.4.1",
            'sed -i "s/tag: 2.3.1/tag: 2.4.1/g" helm/apps/values-prod.yaml',
            'git commit -am "prod: books 2.4.1"',
            "git push -u origin promote/books-2.4.1",
            "gh pr create --base main --head promote/books-2.4.1",
          ],
        },
      ],
      doneWhen: ["gh pr create", "argocd app get"],
    },
  ],
  messages: [
    {
      id: "g1",
      trigger: "project_start",
      step: "register-app",
      author: "Imran",
      role: "Platform lead",
      body:
        "@{player} book-search went out by hand on Wednesday and nobody can tell me what is actually running in prod. Get the books app under ArgoCD so Git is the only thing that can change it.",
      variants: {
        easy: {
          body: "@{player} production stopped matching Git, and I want us back to one source of truth. Start by registering the books app in ArgoCD with its repo path and destination, then sync it once so we have a baseline to compare against.",
        },
        hard: {
          body: "@{player} prod does not match Git and I cannot prove what is running. Register the app in ArgoCD and sync it. Now.",
        },
      },
      replies: [
        { id: "recon", label: "Creating the application now", next: "g2" },
        { id: "drift", label: "What changed in prod?", next: "g3" },
      ],
    },
    {
      id: "g2",
      trigger: "reply",
      step: "register-app",
      author: "Imran",
      role: "Platform lead",
      body: "Good. If it comes up OutOfSync on the first sync, that is not a failure — it is the drift we already suspected.",
    },
    {
      id: "g3",
      trigger: "reply",
      step: "register-app",
      author: "Sana",
      role: "Developer",
      body: "I bumped the replica count on Wednesday with kubectl edit because the pods were slow. It never went back to Git. That is probably what you are about to find.",
    },
    {
      id: "g4",
      trigger: "step_done",
      step: "register-app",
      author: "Imran",
      role: "Platform lead",
      body: "Registered and synced. Now look at what drifted before you touch the release.",
    },
    {
      id: "g5",
      trigger: "step_start",
      step: "repair-drift",
      author: "Sana",
      role: "Developer",
      body: "kubectl diff will show you exactly what I changed. I am sorry in advance — five replicas instead of three.",
    },
    {
      id: "g6",
      trigger: "mistake",
      step: "repair-drift",
      author: "Imran",
      role: "Platform lead",
      body: "Do not kubectl apply your way out of drift. That is how we got here: the cluster and the repo both think they are right.",
      variants: {
        easy: {
          body: "Nothing broke — that command just did not produce a diff. Point it at the manifest in apps/books and try again.",
        },
      },
    },
    {
      id: "g7",
      trigger: "step_start",
      step: "ship-image",
      author: "Sana",
      role: "Developer",
      body: "2.4.1 is tagged and pushed to the registry. Change the image in Git and let ArgoCD do the rest — I want to see it move without me touching the cluster.",
    },
    {
      id: "g8",
      trigger: "step_start",
      step: "revert-release",
      author: "Imran",
      role: "Platform lead",
      body:
        "2.4.1 is throwing 500s on the book detail page. Revert the commit — do not patch the cluster. We are not going back to hand edits the same week we left them.",
      replies: [
        { id: "revert", label: "Reverting the release commit", next: "g9" },
        { id: "edit", label: "Quick kubectl fix, revert later", next: "g10" },
      ],
    },
    {
      id: "g9",
      trigger: "reply",
      step: "revert-release",
      author: "Imran",
      role: "Platform lead",
      body: "That is the right call. Revert, push, and watch ArgoCD take it back for you.",
    },
    {
      id: "g10",
      trigger: "reply",
      step: "revert-release",
      author: "Sana",
      role: "Developer",
      body:
        "Please do not. A kubectl fix is invisible to the next person, and we just spent two days finding one of those. Revert the commit.",
      replies: [{ id: "revert", label: "Reverting the release commit", next: "g9" }],
    },
    {
      id: "g11",
      trigger: "step_done",
      step: "revert-release",
      author: "Sana",
      role: "Developer",
      body: "Back on 2.4.0 and stable. Four minutes, no shell on production, and the log explains both changes.",
    },
    {
      id: "g12",
      trigger: "step_start",
      step: "promote-prod",
      author: "Imran",
      role: "Platform lead",
      body:
        "Staging has been quiet for a day. Promote it the same way: branch, change the prod values, open a pull request, let someone else merge it.",
    },
    {
      id: "g13",
      trigger: "timer",
      atMinute: 75,
      step: "promote-prod",
      author: "Imran",
      role: "Platform lead",
      body: "Status check: is prod on the new tag or the old one? One line is fine.",
      replies: [{ id: "pr", label: "PR open, prod still on the old tag", next: "g14" }],
    },
    {
      id: "g14",
      trigger: "reply",
      step: "promote-prod",
      author: "Imran",
      role: "Platform lead",
      body: "Good — that is the right way round. I will review it in ten minutes.",
    },
    {
      id: "g15",
      trigger: "step_done",
      step: "promote-prod",
      author: "Imran",
      role: "Platform lead",
      body: "Prod and staging now point at the same commit. First time this quarter I can say that sentence.",
    },
    {
      id: "g16",
      trigger: "incident_end",
      step: "promote-prod",
      author: "Sana",
      role: "Developer",
      body:
        "Postmortem note: three kubectl edits in two weeks, none of them written down. ArgoCD would have reverted every one of them by itself.",
    },
    {
      id: "git-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "ship-image",
      author: "Sana",
      role: "Developer",
      body: "The cluster is still on Kubernetes 1.28. I would upgrade it before shipping anything new — that is probably why the pods are slow.",
    },
    {
      id: "git-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "promote-prod",
      author: "Imran",
      role: "Platform lead",
      body: "Simplest path to prod: pin the chart to the old version and skip the review. It is only a tag change.",
    },
  ],
};