// Project 4 — PayLane's release pipeline. Jenkins, Git, SonarQube, Trivy, ECR.
// Every line here is written for this project only: its own cast, its own log
// lines, its own four services and its own five steps.
export default {
  key: "release-pipeline",
  title: "Fix the red release pipeline",
  company: "PayLane",
  summary:
    "PayLane ships on Friday and the pipeline has been red since the last one. The test stage dies on the wrong Node version, the quality gate has nothing to read, and Trivy is holding the image. Get it green, then put a human in front of production.",
  needsTerminal: true,
  ticketPrefix: "PAY",
  workdir: "~/repo",
  tools: ["Jenkins", "Git", "SonarQube", "Trivy", "Amazon ECR"],
  terminal: {
    host: "ci-bastion",
    allowed: ["cat", "ls", "cd", "grep", "tail", "echo", "git", "sed", "docker", "jenkins", "sonar-scanner", "trivy"],
  },
  runtime: {
    label: "Build agents",
    items: [
      { name: "jenkins-agent-01", detail: "idle · 4 executors free" },
      { name: "jenkins-agent-02", detail: "running payments-web #812" },
    ],
  },
  build: { number: 812, status: "failing", branch: "main", detail: "Test stage failed: agent runs Node 16, project needs 18" },
  incidents: [
    { id: "INC-2071", title: "Failed deploy blocked the Friday release", severity: "sev2", opened: "Fri 19:55", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["read-log", "agent-image", "cve-bump"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["read-log", "agent-image", "coverage-gate", "cve-bump"],
      redHerrings: ["rel-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["read-log", "agent-image", "coverage-gate", "cve-bump", "approval-green"],
      redHerrings: ["rel-red-1", "rel-red-2"],
    },
  },
  chart: {
    title: "payments-web build wall clock (minutes)",
    points: [6, 6, 7, 7, 8, 9, 9, 10, 11, 11, 13, 14],
  },
  services: [
    { name: "jenkins-controller", kind: "worker", health: "healthy", replicas: 1, version: "2.452.1", last_deploy: "12 days ago" },
    { name: "sonarqube", kind: "api", health: "degraded", replicas: 1, version: "10.6", last_deploy: "30 days ago" },
    { name: "ecr-registry", kind: "registry", health: "healthy", replicas: 1, version: "ap-south-1", last_deploy: "never" },
    { name: "payments-web", kind: "api", health: "degraded", replicas: 3, version: "4.8.2", last_deploy: "6 days ago" },
  ],
  steps: [
    {
      key: "read-log",
      title: "Read the failed build log",
      goal: "Name the stage that actually failed before changing any configuration.",
      whatHappening:
        "main has been red since Friday's 4.8.2 cut. The release channel is full of guesses because nobody has opened the console output — the log has been sitting on the ci-bastion the whole time.",
      whatNext: "Open build.log and find the one stage that ends the build.",
      author: "Karthik",
      ticket: { key: "PAY-201", title: "Pipeline red on main — identify the failing stage", priority: "P1", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 120, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The console output for build 812 is already on the box as build.log. Read it before you guess at a cause." },
        {
          title: "Concept",
          body: "A Jenkins log is chronological, and the last error before Finished: FAILURE is the cause. Here the test stage exits during install, so no test ever ran — read the version line, not the stack trace.",
        },
        { title: "Steps", items: ["ls", "cat build.log", "Find the npm ERR! line that mentions engines"] },
      ],
      doneWhen: ["cat build.log"],
    },
    {
      key: "agent-image",
      title: "Point the agent at Node 18",
      goal: "Make the pipeline run on the runtime the project asks for.",
      whatHappening:
        "The Jenkinsfile pins the agent image to node:16 while package.json requires 18 or newer. Every build since the last dependency bump has failed inside install, which is why the suite never gets a chance to run.",
      whatNext: "Change the agent image in the Jenkinsfile, commit it and push.",
      author: "Karthik",
      ticket: { key: "PAY-204", title: "Move the Jenkins agent image from node:16 to node:18", priority: "P1", slaMinutes: 240 },
      variants: {
        easy: { slaMinutes: 960, subSteps: 1 },
        medium: { slaMinutes: 240, subSteps: 2 },
        hard: { slaMinutes: 120, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "The image is one line in the Jenkinsfile. Change the file and commit it — do not rebuild the agent by hand." },
        {
          title: "Concept",
          body: "The agent image is the toolchain the build runs in. Keeping it in the Jenkinsfile means the version is reviewed with the code and cannot drift; patching the agent itself silently disappears at the next rebuild.",
        },
        {
          title: "Steps",
          items: [
            "grep image Jenkinsfile",
            'sed -i "s/node:16/node:18/g" Jenkinsfile',
            "git add Jenkinsfile",
            'git commit -m "ci: run payments-web on node 18"',
            "git push",
          ],
        },
      ],
      doneWhen: ["sed -i", "git push"],
    },
    {
      key: "coverage-gate",
      title: "Give the quality gate something to read",
      goal: "Make coverage a real number instead of a missing file.",
      whatHappening:
        "The SonarQube gate fails on coverage of new code, but nothing in the pipeline produces a coverage report. The scanner is not wrong — it is reading an empty slot and failing honestly.",
      whatNext: "Add the missing test command with coverage before the scan, then run the scanner again.",
      author: "Neha",
      ticket: { key: "PAY-205", title: "Produce a coverage report before the SonarQube scan", priority: "P2", slaMinutes: 360 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 360, subSteps: 2 },
        hard: { slaMinutes: 180, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "A gate can only fail on a number that exists. Check what the pipeline produces before the scan runs." },
        {
          title: "Concept",
          body: "SonarQube reads a report file that a test run has to write first, so the test step comes before the scan and has to be asked for coverage. Without it the gate reads 0% and blocks on the wrong thing.",
        },
        {
          title: "Steps",
          items: [
            "cat package.json",
            "Find the test script and the coverage reporter",
            "Run the suite with coverage enabled",
            "sonar-scanner",
          ],
        },
      ],
      doneWhen: ["coverage", "sonar-scanner"],
    },
    {
      key: "cve-bump",
      title: "Clear the Trivy blocker",
      goal: "Get a scanned image past the registry without ignoring the finding.",
      whatHappening:
        "Trivy fails the build on a CRITICAL vulnerability in the base image, and the push to ECR is refused. The finding is in the OS layer that the Dockerfile inherits, so nothing in application code can clear it.",
      whatNext: "Bump the base image, rebuild and rescan until the scanner is quiet.",
      author: "Neha",
      ticket: { key: "PAY-206", title: "Bump the base image past the CRITICAL CVE", priority: "P2", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 2 },
        hard: { slaMinutes: 240, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "The CVE is in the base image, not in your code. The FROM line is the fix." },
        {
          title: "Concept",
          body: "Scanning the image you are about to push is the only scan that counts, because the vulnerable package ships inside it. Raising the base tag pulls a rebuilt OS layer; suppressing the finding leaves the same bytes running in production.",
        },
        {
          title: "Steps",
          items: [
            "cat Dockerfile",
            "trivy image payments-web:local",
            'sed -i "s/node:16-slim/node:18-slim/g" Dockerfile',
            "docker build -t payments-web:local .",
            "trivy image payments-web:local",
          ],
        },
      ],
      doneWhen: ["docker build", "trivy image"],
    },
    {
      key: "approval-green",
      title: "Gate prod and run it green",
      goal: "Nothing reaches customers without a named human pressing go.",
      whatHappening:
        "Tests, coverage and the scan all pass now, but the pipeline still promotes staging to production on its own. Friday's release is the reason the release manager wants that stopped before this build ships.",
      whatNext: "Add an approval stage before the prod deploy and run the pipeline through it.",
      author: "Karthik",
      ticket: { key: "PAY-207", title: "Add a manual approval stage before production", priority: "P1", slaMinutes: 300 },
      variants: {
        easy: { slaMinutes: 600, subSteps: 1 },
        medium: { slaMinutes: 300, subSteps: 1 },
        hard: { slaMinutes: 150, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The gate is a stage in the Jenkinsfile plus a named approver. Then trigger the job and let it wait." },
        {
          title: "Concept",
          body: "input in a declarative pipeline pauses the build until a named person approves. A separate stage keeps the audit trail readable: who approved which commit, and what evidence they saw.",
        },
        {
          title: "Steps",
          items: [
            "Add a stage that waits for input before Deploy",
            "Commit and push the Jenkinsfile",
            "jenkins build deploy/payments-web",
            "Answer Karthik with what the approver will see",
          ],
        },
      ],
      doneWhen: ["jenkins build"],
    },
  ],
  messages: [
    {
      id: "r1",
      trigger: "project_start",
      step: "read-log",
      author: "Karthik",
      role: "Developer",
      body:
        "@{player} main has been red since Friday and 4.8.2 is still sitting on staging. Nobody has opened the console output — everyone is guessing. Can you read it and tell me which stage actually dies?",
      variants: {
        easy: {
          body: "@{player} the deploy pipeline has been red since Friday and I have to explain it upstairs. Nothing clever yet — open build.log and tell me which stage failed and the first error line in it.",
        },
        hard: {
          body: "@{player} red pipeline, release on hold. Open the log and give me the failing stage. Not a theory, the stage.",
        },
      },
      replies: [
        { id: "reading", label: "Reading build.log now", next: "r2" },
        { id: "changed", label: "Did anyone change the agent?", next: "r3" },
      ],
    },
    {
      id: "r2",
      trigger: "reply",
      step: "read-log",
      author: "Karthik",
      role: "Developer",
      body: "Good. Read it bottom up — the last error before Finished: FAILURE is the cause, everything above it is noise.",
    },
    {
      id: "r3",
      trigger: "reply",
      step: "read-log",
      author: "Karthik",
      role: "Developer",
      body: "I bumped package.json to Node 18 last week and left the Jenkinsfile on node:16. That would explain a great deal.",
    },
    {
      id: "r4",
      trigger: "step_start",
      step: "cve-bump",
      author: "Neha",
      role: "Security",
      body:
        "While you are in there: the image scan is the only thing between our code and a customer. I would rather it block your Friday than ship a CRITICAL we knew about.",
    },
    {
      id: "r5",
      trigger: "step_done",
      step: "read-log",
      author: "Karthik",
      role: "Developer",
      body:
        "So the agent is on 16 and the project wants 18. Change the image in the Jenkinsfile, commit it and push — I will watch the build with you.",
    },
    {
      id: "r6",
      trigger: "mistake",
      step: "agent-image",
      author: "Karthik",
      role: "Developer",
      body: "That push did not land. Run git status before you retry — a half-staged Jenkinsfile is worse than an unchanged one.",
      variants: {
        easy: {
          body: "Nothing broke, the push just did not go through. Check you are on main with git status, then push again.",
        },
      },
    },
    {
      id: "r7",
      trigger: "step_start",
      step: "coverage-gate",
      author: "Neha",
      role: "Security",
      body:
        "The gate fails on coverage of new code. The scanner is fine — nothing in the pipeline writes a coverage report for it to read, so it is measuring an empty file.",
    },
    {
      id: "r8",
      trigger: "step_start",
      step: "cve-bump",
      author: "Neha",
      role: "Security",
      body:
        "Trivy is blocking the push on a CRITICAL in the base image. Bump the FROM line, rebuild, rescan. Adding it to an ignore file is not a fix, it is a decision to ship it.",
    },
    {
      id: "r9",
      trigger: "timer",
      atMinute: 60,
      step: "cve-bump",
      author: "Karthik",
      role: "Developer",
      body: "One line please: can we still make the Friday release? Product is asking for a yes or a no.",
      replies: [{ id: "gated", label: "Yes, through the approval gate", next: "r10" }],
    },
    {
      id: "r10",
      trigger: "reply",
      step: "cve-bump",
      author: "Karthik",
      role: "Developer",
      body: "Good. I will tell product it is Friday, gated, and that the build number is the one that ships.",
    },
    {
      id: "r11",
      trigger: "step_done",
      step: "cve-bump",
      author: "Neha",
      role: "Security",
      body: "Image is clean and the scanner agrees with you. One thing left: staging still promotes itself into production.",
    },
    {
      id: "r12",
      trigger: "step_start",
      step: "approval-green",
      author: "Karthik",
      role: "Developer",
      body:
        "Last change: an approval stage between staging and prod with a named approver. Tell me what the approver will see, then we run the release to green.",
      replies: [
        { id: "gate", label: "Named approver, green build, rollback line", next: "r13" },
        { id: "auto", label: "Auto-promote when staging is green", next: "r14" },
      ],
    },
    {
      id: "r13",
      trigger: "reply",
      step: "approval-green",
      author: "Karthik",
      role: "Developer",
      body: "That is the gate I want: I approve, you own the rollback line. Add the stage and trigger the job.",
    },
    {
      id: "r14",
      trigger: "reply",
      step: "approval-green",
      author: "Neha",
      role: "Security",
      body:
        "Auto-promote is exactly how Friday happened. A human clicks, or we do not ship — I am not signing off on the other version.",
      replies: [{ id: "gate", label: "Named approver, green build, rollback line", next: "r13" }],
    },
    {
      id: "r15",
      trigger: "step_done",
      step: "approval-green",
      author: "Karthik",
      role: "Developer",
      body: "Green, gated, and the build number is recorded against the release. Friday is back on the calendar.",
    },
    {
      id: "r16",
      trigger: "incident_end",
      step: "approval-green",
      author: "Neha",
      role: "Security",
      body:
        "Postmortem line: the pipeline was red for six days because nobody opened the log. The fix took ninety minutes once someone did.",
    },
    {
      id: "rel-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "coverage-gate",
      author: "Neha",
      role: "Security",
      body: "SonarQube's own disk is at 81%. I would rebuild that server before trusting its gate — that is probably the real problem here.",
    },
    {
      id: "rel-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "approval-green",
      author: "Karthik",
      role: "Developer",
      body: "Honestly, skip the gate for this one release. We can add it next sprint when things are calmer.",
    },
  ],
};