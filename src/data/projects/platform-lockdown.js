// Project 9 — CareFirst Health. Secrets, IAM, Vault, image scanning, audit evidence.
// Own company, own cast, own five steps; nothing shared with other projects.
export default {
  key: "platform-lockdown",
  title: "Lock down the platform",
  company: "CareFirst Health",
  summary:
    "CareFirst Health holds patient records and the compliance audit opens in forty-eight hours. A live AWS key is sitting in Git, a database password is a plain environment variable, one role can do s3:* on everything, and the audit trail has never been exported. Find the leaks, rotate them, move them into Vault and leave the auditor something they can file.",
  needsTerminal: true,
  ticketPrefix: "CFH",
  workdir: "~/repo",
  tools: ["Vault", "IAM", "gitleaks", "Trivy", "CloudTrail"],
  terminal: {
    host: "carefirst-sec-bastion",
    allowed: ["gitleaks", "vault", "aws", "trivy", "kubectl", "git", "grep", "cat", "ls", "cd", "sed", "echo", "diff"],
  },
  runtime: {
    label: "Controls",
    items: [
      { name: "vault", detail: "unsealed · 3/3" },
      { name: "patient-api", detail: "running · 4/4" },
      { name: "ci-runner", detail: "running · 2/2" },
    ],
  },
  incidents: [
    { id: "SEC-4471", title: "Patient API called from an unknown address", severity: "sev1", opened: "Today 03:12", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["secrets-scan", "rotate-key", "vault-secret"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["secrets-scan", "rotate-key", "vault-secret", "fix-iam"],
      redHerrings: ["sec-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["secrets-scan", "rotate-key", "vault-secret", "fix-iam", "audit-evidence"],
      redHerrings: ["sec-red-1", "sec-red-2"],
    },
  },
  chart: {
    title: "Credentials outside Vault (count, last 12 days)",
    points: [7, 7, 7, 6, 6, 5, 5, 5, 4, 4, 3, 2],
  },
  services: [
    { name: "patient-api", kind: "api", health: "degraded", replicas: 4, version: "3.8.2", last_deploy: "6 hours ago" },
    { name: "vault", kind: "secrets", health: "healthy", replicas: 3, version: "1.15.4", last_deploy: "12 days ago" },
    { name: "ci-runner", kind: "worker", health: "healthy", replicas: 2, version: "runner 16.8.1", last_deploy: "20 days ago" },
    { name: "audit-logs", kind: "worker", health: "healthy", replicas: 2, version: "cloudtrail → s3", last_deploy: "5 days ago" },
  ],
  steps: [
    {
      key: "secrets-scan",
      title: "Find what leaked into Git",
      goal: "Know the size of the problem before you touch anything.",
      whatHappening:
        "A contractor pushed src/config.js on Monday with a live AWS access key in it. The repository is readable by all 240 engineers, and nobody has scanned it since. The auditor will run the same scan on Thursday — she just has not told you which tool.",
      whatNext: "Scan the working tree for committed secrets, then read the file the finding points at.",
      author: "Arun Menon",
      ticket: { key: "CFH-701", title: "Live AWS key committed to the repo", priority: "P1", slaMinutes: 120 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 120, subSteps: 2 },
        hard: { slaMinutes: 60, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "gitleaks detect --source . reads every file in the repo, git history included, and prints one row per finding with the file and line." },
        {
          title: "Concept",
          body: "A secret that reached Git is in every clone, every CI cache and every fork. Deleting the line does nothing — the value has to be treated as public and rotated. Scan first so you know the blast radius before you start revoking.",
        },
        {
          title: "Steps",
          items: [
            "gitleaks detect --source . --report-format json",
            "cat src/config.js",
            "grep -n AKIA src/config.js",
          ],
        },
      ],
      doneWhen: ["gitleaks detect", "config.js"],
    },
    {
      key: "rotate-key",
      title: "Rotate the exposed key",
      goal: "Make the leaked credential worthless before anyone else uses it.",
      whatHappening:
        "The key is still active. CloudTrail shows 41 calls from 185.220.101.44 in the last six hours — that address is not an office, an AWS region or a CI runner. The CI user it belongs to deploys patient-api on every merge.",
      whatNext: "Create a replacement key for the CI user, put it in Vault, then revoke the leaked one and scrub it out of the file.",
      author: "Arun Menon",
      ticket: { key: "CFH-703", title: "Rotate the exposed IAM key", priority: "P1", slaMinutes: 60 },
      variants: {
        easy: { slaMinutes: 900, subSteps: 1 },
        medium: { slaMinutes: 60, subSteps: 2 },
        hard: { slaMinutes: 30, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "Create the new key, store it, and only then delete the old one. aws iam create-access-key, then vault kv put, then aws iam delete-access-key with the old key id." },
        {
          title: "Concept",
          body: "Rotation is create → publish → revoke. Revoke first and the CI runner dies mid-build with an authentication error nobody expects; never revoke and the door stays open while you congratulate yourself on the new key.",
        },
        {
          title: "Steps",
          items: [
            "aws iam create-access-key --user-name ci-deployer",
            "vault kv put secret/ci/deployer access_key=... secret_key=...",
            "aws iam delete-access-key --user-name ci-deployer --access-key-id AKIA4XQ7ZP2LMN6T3R5V",
            "sed -i 's/AKIA[0-9A-Z]\\{16\\}/REDACTED/g' src/config.js",
          ],
        },
      ],
      doneWhen: ["create-access-key", "delete-access-key"],
    },
    {
      key: "vault-secret",
      title: "Move the database password into Vault",
      goal: "Get credentials out of files and into something that can be audited and rotated.",
      whatHappening:
        "patient-api reads its database password from DB_PASSWORD in the deployment. The value is in Git, in the CI logs, and on three laptops. When the auditor asks who read it in the last ninety days, nobody can answer.",
      whatNext: "Write the credential to Vault under the app's own path, read it back to prove it works, and point the config at the Vault path instead of the literal.",
      author: "Dr. Lena Fischer",
      ticket: { key: "CFH-704", title: "Database password is a plain env var", priority: "P2", slaMinutes: 240 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 240, subSteps: 2 },
        hard: { slaMinutes: 120, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "vault kv put secret/patient-api/db username=... password=... writes it; vault kv get secret/patient-api/db reads it back with an audit line." },
        {
          title: "Concept",
          body: "Vault is not a fancier .env file. The value is a lease with an audit record per read and one place to rotate. Moving the secret without changing how the app reads it keeps the same exposure and adds a dependency.",
        },
        {
          title: "Steps",
          items: [
            "vault kv put secret/patient-api/db username=patient_app password=...",
            "vault kv get secret/patient-api/db",
            "sed -i 's|^DB_PASSWORD=.*|DB_PASSWORD=vault:secret/patient-api/db#password|' src/config.js",
            "cat src/config.js",
          ],
        },
      ],
      doneWhen: ["vault kv put", "vault kv get"],
    },
    {
      key: "fix-iam",
      title: "Replace the wildcard IAM policy",
      goal: "Cut a policy down to the actions the job actually performs.",
      whatHappening:
        "The patient-api role has s3:* on Resource *. It was written during a hack week, survived two reviews, and now reaches the encrypted backups bucket in another account's trust policy. Compliance will not sign off on a wildcard.",
      whatNext: "Read the policy, replace the wildcard action and resource with the two things the app really does, then apply it to the role.",
      author: "Arun Menon",
      ticket: { key: "CFH-705", title: "Wildcard policy on the patient-api role", priority: "P1", slaMinutes: 180 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 180, subSteps: 2 },
        hard: { slaMinutes: 90, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "The app only reads its own records bucket and writes one prefix. Edit iam/patient-api-policy.json, then aws iam put-role-policy with that file." },
        {
          title: "Concept",
          body: "Least privilege is derived from behaviour, not imagination: read CloudTrail, list the actions actually used, grant those. A wildcard is a decision to stop thinking, and it is the first thing an auditor greps for.",
        },
        {
          title: "Steps",
          items: [
            "cat iam/patient-api-policy.json",
            "sed -i 's/\"s3:\\*\"/\"s3:GetObject\"/g' iam/patient-api-policy.json",
            "sed -i 's|\"Resource\": \"\\*\"|\"Resource\": \"arn:aws:s3:::carefirst-patient-records/*\"|g' iam/patient-api-policy.json",
            "aws iam put-role-policy --role-name patient-api-role --policy-name patient-api-s3 --policy-document file://iam/patient-api-policy.json",
          ],
        },
      ],
      doneWhen: ["patient-api-policy.json", "put-role-policy"],
    },
    {
      key: "audit-evidence",
      title: "Patch the CVE and export the evidence",
      goal: "Close the scan finding and give compliance a file they can attach.",
      whatHappening:
        "Trivy reports a CRITICAL in the patient-api image: libcrypto in the base layer, fixable by moving one Debian point release. Separately Priya needs the CloudTrail events for CFH-702 before the auditor's first call.",
      whatNext: "Scan the image, bump the base image in the Dockerfile, and export the last day of secret reads from CloudTrail.",
      author: "Priya Raghavan",
      ticket: { key: "CFH-702", title: "Audit evidence for last night's access", priority: "P2", slaMinutes: 300 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 300, subSteps: 2 },
        hard: { slaMinutes: 150, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "trivy image gives you the CVE and the fixed version. For evidence, aws cloudtrail lookup-events filtered on GetSecretValue is what she can file." },
        {
          title: "Concept",
          body: "A vulnerability scan without a patched artefact is paperwork. And audit evidence is only evidence if it names the event, the principal and the timestamp — a screenshot of a dashboard is not a record.",
        },
        {
          title: "Steps",
          items: [
            "trivy image registry.carefirst.internal/patient-api:3.8.2",
            "sed -i 's|FROM debian:12.4-slim|FROM debian:12.7-slim|' Dockerfile",
            "aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=GetSecretValue --start-time 2026-10-28T00:00:00Z",
          ],
        },
      ],
      doneWhen: ["trivy image", "lookup-events"],
    },
  ],
  messages: [
    {
      id: "s1",
      trigger: "project_start",
      author: "Priya Raghavan",
      role: "Compliance lead",
      body:
        "The HITRUST auditor opens the patient-records platform in forty-eight hours. I have one question I cannot answer: how many live credentials are sitting in our repositories right now.",
      variants: {
        easy: {
          body:
            "@{player} the audit opens in two days and I need a number, not a guess: how many live credentials are sitting in our repos right now? Start with a scan of the repository and read what it finds before you change anything.",
        },
        hard: {
          body:
            "@{player} auditor in 48h. I have no idea how many live credentials are in our repos. Find them, and I want the count and the fix, not a summary.",
        },
      },
      replies: [
        { id: "scan", label: "Starting with a repo scan", next: "s2" },
        { id: "scope", label: "What is in scope for the audit?", next: "s3" },
      ],
    },
    {
      id: "s2",
      trigger: "reply",
      author: "Arun Menon",
      role: "Security engineer",
      body: "Good. gitleaks will give us a number in under a minute. Whatever it finds, it is probably live — the contractor committed config.js on Monday.",
    },
    {
      id: "s3",
      trigger: "reply",
      author: "Priya Raghavan",
      role: "Compliance lead",
      body:
        "Secrets, key rotation, IAM policy scope, and evidence of who accessed what. That is the whole audit. Everything else they will take on trust.",
    },
    {
      id: "s4",
      trigger: "step_start",
      step: "secrets-scan",
      author: "Arun Menon",
      role: "Security engineer",
      body:
        "Scan the working tree before you read anything else. src/config.js went in with Monday's contractor commit and I want the finding list from a tool, not from my memory.",
    },
    {
      id: "s5",
      trigger: "step_done",
      step: "secrets-scan",
      author: "Arun Menon",
      role: "Security engineer",
      body: "Two findings, both live. That is the answer to how bad it is — now the answer to how fast we are.",
    },
    {
      id: "s6",
      trigger: "step_start",
      step: "rotate-key",
      author: "Arun Menon",
      role: "Security engineer",
      body:
        "CloudTrail shows 41 calls from 185.220.101.44 since midnight. Create the replacement key, store it, and only then revoke the old one — the CI runner needs to keep deploying while you do this.",
      replies: [
        { id: "rotate", label: "Rotating now, create then revoke", next: "s7" },
        { id: "delete", label: "Deleting the key first, faster", next: "s8" },
      ],
    },
    {
      id: "s7",
      trigger: "reply",
      step: "rotate-key",
      author: "Arun Menon",
      role: "Security engineer",
      body: "Right order. Send me the old key id when it is gone and I will close SEC-4471.",
    },
    {
      id: "s8",
      trigger: "reply",
      step: "rotate-key",
      author: "Arun Menon",
      role: "Security engineer",
      body:
        "Then every merge fails with SignatureDoesNotMatch for the next hour and you will be debugging CI during a security incident. Create first, revoke second.",
      replies: [{ id: "rotate", label: "Rotating now, create then revoke", next: "s7" }],
    },
    {
      id: "s9",
      trigger: "mistake",
      step: "rotate-key",
      author: "Arun Menon",
      role: "Security engineer",
      body: "That command did not change a key. aws iam create-access-key --user-name ci-deployer is the one that makes the new pair.",
      variants: {
        easy: {
          body: "Nothing broke — the command just did not create anything. Start with aws iam create-access-key --user-name ci-deployer.",
        },
      },
    },
    {
      id: "s10",
      trigger: "step_start",
      step: "vault-secret",
      author: "Dr. Lena Fischer",
      role: "Clinical systems lead",
      body:
        "The database password is a plain environment variable in the deployment. Every laptop that ever cloned this repo has it, and I have to explain that to a clinician who is asking whether her patients' records are safe.",
    },
    {
      id: "s11",
      trigger: "step_done",
      step: "vault-secret",
      author: "Dr. Lena Fischer",
      role: "Clinical systems lead",
      body: "Read from Vault, audited on every read, rotatable in one place. That is the sentence I needed to be able to say out loud.",
    },
    {
      id: "s12",
      trigger: "step_start",
      step: "fix-iam",
      author: "Arun Menon",
      role: "Security engineer",
      body:
        "iam/patient-api-policy.json allows s3:* on everything. The app reads one bucket and writes one prefix. Give it those two actions, then apply the policy to the role.",
    },
    {
      id: "s13",
      trigger: "step_done",
      step: "fix-iam",
      author: "Arun Menon",
      role: "Security engineer",
      body: "Wildcard gone, still deploying. Half the audit findings close with one policy file.",
    },
    {
      id: "s14",
      trigger: "step_start",
      step: "audit-evidence",
      author: "Priya Raghavan",
      role: "Compliance lead",
      body:
        "Last thing: the CloudTrail events for last night's secret reads, and the CVE on the patient-api image closed. Those are the only two open lines in my tracker.",
    },
    {
      id: "s15",
      trigger: "timer",
      atMinute: 70,
      step: "rotate-key",
      author: "Priya Raghavan",
      role: "Compliance lead",
      body: "Status check: has anything been rotated yet? The auditor wants a timeline, not a fix date.",
      replies: [
        { id: "rotated", label: "Key rotated, old one revoked", next: "s16" },
        { id: "scanning", label: "Still scanning, nothing rotated", next: "s17" },
      ],
    },
    {
      id: "s16",
      trigger: "reply",
      step: "rotate-key",
      author: "Priya Raghavan",
      role: "Compliance lead",
      body: "Thank you — send me the exact timestamps when you have them and I will put them straight into the report.",
    },
    {
      id: "s17",
      trigger: "reply",
      step: "rotate-key",
      author: "Priya Raghavan",
      role: "Compliance lead",
      body: "Faster, please. Every hour that key is live is an hour I have to disclose.",
    },
    {
      id: "s18",
      trigger: "incident_end",
      step: "audit-evidence",
      author: "Arun Menon",
      role: "Security engineer",
      body:
        "Postmortem line: the key was in Git for eleven days and nothing alerted. A gitleaks job goes into the pipeline tomorrow, and it will fail the build on the next one.",
    },
    {
      id: "sec-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "vault-secret",
      author: "Arun Menon",
      role: "Security engineer",
      body:
        "Simplest path: delete config.js and force-push. The key disappears from the repo and the finding closes itself — no rotation needed.",
    },
    {
      id: "sec-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "fix-iam",
      author: "Priya Raghavan",
      role: "Compliance lead",
      body:
        "Could we just add an explicit Deny for the backups bucket and leave the rest? It is a five-line change and the auditor may take it.",
    },
  ],
};