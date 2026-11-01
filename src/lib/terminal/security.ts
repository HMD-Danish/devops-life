// Security tooling for the CareFirst lockdown project: secret scanning, Vault,
// IAM policy work and CloudTrail evidence.
import { parseArgs, columnTable } from "./shell.ts";
import { say, fail, note, fsOf, TONE } from "./helpers.ts";

const LEAKED_KEY = "AKIA4XQ7ZP2LMN6T3R5V";

const RULES = [
  { id: "aws-access-token", severity: "CRITICAL", re: /AKIA[0-9A-Z]{16}/g },
  { id: "stripe-access-token", severity: "CRITICAL", re: /sk_live_[0-9a-zA-Z]{10,}/g },
  { id: "private-key", severity: "CRITICAL", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: "generic-api-key", severity: "HIGH", re: /(?:password|passwd|secret|token)\s*[:=]\s*["']?[A-Za-z0-9!@#$%^&*._-]{8,}/gi },
];

function mask(value: string) {
  const text = value.trim();
  if (text.length <= 8) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 8)}${"*".repeat(Math.min(16, text.length - 8))}${text.slice(-4)}`;
}

function scanFiles(files: Record<string, any>) {
  const findings: any[] = [];
  Object.entries(files || {}).forEach(([path, entry]) => {
    if (!entry || entry.type === "dir" || typeof entry.content !== "string") return;
    const content = entry.content;
    content.split("\n").forEach((text, index) => {
      RULES.forEach((rule) => {
        rule.re.lastIndex = 0;
        const match = rule.re.exec(text);
        if (!match) return;
        if (findings.some((f) => f.path === path && f.line === index + 1 && f.rule === rule.id)) return;
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          path,
          line: index + 1,
          secret: match[0],
        });
      });
    });
  });
  return findings;
}

export function cmdGitleaks(ctx: any, rest: string[]) {
  const { flags } = parseArgs(rest);
  const findings = scanFiles(fsOf(ctx));
  const asJson = rest.includes("json");

  if (asJson) {
    say(ctx, JSON.stringify(findings.map((f) => ({
      RuleID: f.rule,
      File: f.path,
      StartLine: f.line,
      Secret: mask(f.secret),
      Severity: f.severity,
    })), null, 4));
  } else {
    say(ctx, "    ○", TONE.muted);
    say(ctx, "    │╲", TONE.muted);
    say(ctx, "    │ ○", TONE.muted);
    say(ctx, "    ○ ░", TONE.muted);
    say(ctx, "    ░    gitleaks", TONE.head);
    say(ctx, "");
    findings.forEach((f) => {
      say(ctx, `Finding:     ${mask(f.secret)}`, f.severity === "CRITICAL" ? TONE.err : TONE.warn);
      say(ctx, `Secret:      ${mask(f.secret)}`);
      say(ctx, `RuleID:      ${f.rule}`);
      say(ctx, `Entropy:     ${(3.4 + f.line / 40).toFixed(2)}`);
      say(ctx, `File:        ${f.path}`);
      say(ctx, `Line:        ${f.line}`);
      say(ctx, "Commit:      9c1f0ab");
      say(ctx, "Date:        2026-10-26 08:41:12");
      say(ctx, "");
    });
  }

  if (!findings.length) {
    say(ctx, "no leaks found", TONE.ok);
    note(ctx, "scanned the repo for secrets: no findings");
    return;
  }
  say(ctx, `leaks found: ${findings.length}`, TONE.err);
  ctx.exitCode = 1;
  note(ctx, `scanned the repo for secrets: ${findings.length} live findings`);
}

function vaultStore(ctx: any): Record<string, any> {
  const store: Record<string, any> = {};
  Object.entries(ctx.session.env || {}).forEach(([key, value]) => {
    if (!key.startsWith("VAULT::")) return;
    try {
      store[key.slice(7)] = JSON.parse(String(value));
    } catch {
      store[key.slice(7)] = {};
    }
  });
  return store;
}

function vaultPut(ctx: any, path: string, pairs: string[]) {
  ctx.session.env = ctx.session.env || {};
  const data: Record<string, string> = {};
  pairs.forEach((pair) => {
    const at = pair.indexOf("=");
    if (at < 1) return;
    data[pair.slice(0, at)] = pair.slice(at + 1);
  });
  ctx.session.env[`VAULT::${path}`] = JSON.stringify(data);
  ctx.sessionDirty = true;
  say(ctx, `Success! Data written to: ${path}`, TONE.ok);
  note(ctx, `wrote credential to Vault at ${path}`);
}

export function cmdVault(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const sub = args[0] || "";
  const verb = args[1] || "";
  const path = args[2] || "";
  const store = vaultStore(ctx);

  if (sub === "status") {
    say(ctx, "Key             Value", TONE.head);
    say(ctx, "---             -----");
    say(ctx, "Seal Type       shamir");
    say(ctx, "Initialized     true");
    say(ctx, "Sealed          false", TONE.ok);
    say(ctx, "Version         1.15.4");
    say(ctx, "Storage Type    raft");
    say(ctx, "HA Enabled      true");
    return;
  }

  if (sub === "kv" && verb === "put") {
    if (!path) return fail(ctx, "Usage: vault kv put secret/PATH key=value [key=value ...]");
    return vaultPut(ctx, path, args.slice(3));
  }

  if (sub === "kv" && (verb === "get" || verb === "read")) {
    const data = store[path];
    if (!data) {
      return fail(ctx, `No value found at ${path}\n\nThis secret is not in Vault yet — the app is still reading it from the deployment.`);
    }
    say(ctx, "====== Secret Path ======", TONE.head);
    say(ctx, path);
    say(ctx, "");
    say(ctx, "======= Metadata =======", TONE.muted);
    say(ctx, "Key                Value");
    say(ctx, "---                -----");
    say(ctx, "created_time       2026-10-29T03:18:44.112Z");
    say(ctx, "version            1");
    say(ctx, "");
    say(ctx, "====== Data ======", TONE.head);
    const rows = [["Key", "Value"]];
    Object.entries(data).forEach(([key, value]) => rows.push([key, String(value).length > 6 ? mask(String(value)) : String(value)]));
    columnTable(rows).forEach((row, index) => say(ctx, row, index === 0 ? TONE.head : undefined));
    note(ctx, `read ${path} from Vault — the read is audited`);
    return;
  }

  if (sub === "kv" && verb === "list") {
    const prefix = path;
    const keys = Object.keys(store).filter((key) => key.startsWith(prefix));
    if (!keys.length) return fail(ctx, `No value found at ${prefix}`);
    keys.forEach((key) => say(ctx, key.slice(prefix.length + 1) || key));
    return;
  }

  if (sub === "kv" && (verb === "delete" || verb === "destroy")) {
    if (!store[path]) return fail(ctx, `No value found at ${path}`);
    delete ctx.session.env[`VAULT::${path}`];
    ctx.sessionDirty = true;
    say(ctx, `Success! Data deleted (if it existed) at: ${path}`, TONE.ok);
    return;
  }

  fail(ctx, `vault: unknown command "${[sub, verb].filter(Boolean).join(" ")}"\n\nTry: vault kv put secret/PATH k=v · vault kv get secret/PATH · vault status`);
}

const PRICES: Record<string, number> = {
  "db.r6g.large": 172,
  "db.r6g.xlarge": 345,
  "db.r6g.2xlarge": 690,
  "db.r6g.4xlarge": 1180,
  "db.r6g.8xlarge": 2360,
};

function databaseOf(ctx: any) {
  return (ctx.resources || []).find((r: any) => r.kind === "database") || null;
}

/** IAM, CloudTrail and RDS calls a lockdown project needs; false means "not mine". */
export function awsSecurity(
  ctx: any,
  service: string,
  action: string,
  args: string[],
  flags: Record<string, string | true>,
): boolean {
  const region = ctx.cluster.region;
  const account = ctx.cluster.accountId;

  if (service === "iam" && action === "list-access-keys") {
    const user = String(flags["--user-name"] || args[2] || "ci-deployer");
    say(ctx, JSON.stringify({
      AccessKeyMetadata: [
        { UserName: user, AccessKeyId: LEAKED_KEY, Status: "Active", CreateDate: "2026-10-26T08:41:12Z" },
        { UserName: user, AccessKeyId: "AKIA2LQ9XW7B4M8TN6HP", Status: "Active", CreateDate: "2025-11-02T11:04:55Z" },
      ],
    }, null, 4));
    note(ctx, `listed access keys for ${user}`);
    return true;
  }

  if (service === "iam" && action === "create-access-key") {
    const user = String(flags["--user-name"] || args[2] || "ci-deployer");
    const key = "AKIA7WQ2NZ5R8TK4M1VP";
    ctx.session.env = ctx.session.env || {};
    ctx.session.env.NEW_ACCESS_KEY_ID = key;
    ctx.sessionDirty = true;
    say(ctx, JSON.stringify({
      AccessKey: {
        UserName: user,
        AccessKeyId: key,
        Status: "Active",
        SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        CreateDate: "2026-10-29T03:41:07Z",
      },
    }, null, 4), TONE.ok);
    note(ctx, `created a replacement key for ${user} — store it, then revoke the old one`);
    return true;
  }

  if (service === "iam" && action === "delete-access-key") {
    const key = String(flags["--access-key-id"] || args.find((a) => a.startsWith("AKIA")) || "");
    if (!key) return fail(ctx, "An error occurred (ValidationError): --access-key-id is required"), true;
    const created = String(ctx.session.env?.NEW_ACCESS_KEY_ID || "");
    if (created && key === created) {
      fail(ctx, `An error occurred (DeleteConflict): cannot delete the key you just created — deploy the new one first, then revoke ${LEAKED_KEY}.`);
      return true;
    }
    say(ctx, "", TONE.muted);
    if (key === LEAKED_KEY) {
      say(ctx, `Deleted access key ${key} for user ci-deployer`, TONE.ok);
      note(ctx, "revoked the leaked key — it is worthless from this second");
    } else {
      say(ctx, `Deleted access key ${key} for user ci-deployer`, TONE.ok);
      note(ctx, `revoked access key ${key}`);
    }
    ctx.session.env = ctx.session.env || {};
    ctx.session.env.REVOKED_KEY = key;
    ctx.sessionDirty = true;
    return true;
  }

  if (service === "iam" && action === "put-role-policy") {
    const role = String(flags["--role-name"] || args[2] || "patient-api-role");
    const doc = String(flags["--policy-document"] || args.find((a) => a.startsWith("file://")) || "");
    const path = doc.replace(/^file:\/\//, "");
    if (!path) return fail(ctx, "An error occurred (ValidationError): --policy-document file://PATH is required"), true;
    const files = fsOf(ctx);
    const entry = Object.entries(files).find(([full]) => full.endsWith(`/${path}`) || full.endsWith(path));
    if (!entry || typeof entry[1]?.content !== "string") {
      return fail(ctx, `An error occurred (ValidationError): unable to read ${path}`), true;
    }
    const body = entry[1].content;
    if (/"(s3|\*):\*"/.test(body) || /"Resource"\s*:\s*"\*"/.test(body)) {
      fail(ctx, "An error occurred (MalformedPolicyDocument): the compliance baseline rejects this document — it still grants a wildcard action or Resource *.");
      return true;
    }
    say(ctx, JSON.stringify({
      PolicyDocument: JSON.parse(body),
      RoleName: role,
      ResponseMetadata: { RequestId: "b7f2c1a4-6d3f-4b2e-9a11-2c5f7e8d9014" },
    }, null, 4), TONE.ok);
    note(ctx, `applied the least-privilege policy to ${role}`);
    return true;
  }

  if (service === "cloudtrail" && action === "lookup-events") {
    const events = [
      { EventTime: "2026-10-29T03:12:44Z", EventName: "GetSecretValue", Username: "ci-deployer", SourceIPAddress: "185.220.101.44", awsRegion: region },
      { EventTime: "2026-10-29T03:14:02Z", EventName: "GetSecretValue", Username: "ci-deployer", SourceIPAddress: "185.220.101.44", awsRegion: region },
      { EventTime: "2026-10-29T03:41:19Z", EventName: "GetSecretValue", Username: "patient-api", SourceIPAddress: "10.20.4.19", awsRegion: region },
      { EventTime: "2026-10-29T04:02:51Z", EventName: "DescribeInstances", Username: "engineer", SourceIPAddress: "103.21.58.7", awsRegion: region },
    ];
    say(ctx, JSON.stringify({
      Events: events.map((event) => ({
        EventTime: event.EventTime,
        EventName: event.EventName,
        Username: event.Username,
        Resources: [{ ResourceType: "AWS::IAM::Role", ResourceName: "patient-api-role" }],
        CloudTrailEvent: JSON.stringify({
          sourceIPAddress: event.SourceIPAddress,
          userAgent: event.Username === "ci-deployer" ? "aws-cli/2.15.30" : "patient-api/3.8.2",
          awsRegion: event.awsRegion,
          eventName: event.EventName,
        }),
      })),
      ResponseMetadata: { RequestId: `acct-${account}-cloudtrail` },
    }, null, 4));
    note(ctx, "exported the access events for compliance");
    return true;
  }

  if (service === "rds" && action === "describe-db-instances") {
    const db = databaseOf(ctx);
    if (!db) return fail(ctx, "An error occurred (DBInstanceNotFound): no database in this account"), true;
    const identifier = args.find((a) => a === db.name) || db.name;
    say(ctx, JSON.stringify({
      DBInstances: [{
        DBInstanceIdentifier: identifier,
        DBInstanceClass: db.instance_size || "db.r6g.4xlarge",
        Engine: "postgres",
        EngineVersion: "15.6",
        DBInstanceStatus: db.status === "stopped" ? "stopped" : "available",
        AllocatedStorage: 200,
        MultiAZ: false,
        MaxAllocatedStorage: 1000,
        Endpoint: { Address: `${identifier}.flashdeal.internal`, Port: 5432 },
        AvailabilityZone: `${region}a`,
      }],
    }, null, 4));
    note(ctx, `described ${identifier}`);
    return true;
  }

  if (service === "rds" && action === "modify-db-instance") {
    const db = databaseOf(ctx);
    if (!db) return fail(ctx, "An error occurred (DBInstanceNotFound): no database in this account"), true;
    const identifier = args.find((a) => a === db.name) || db.name;
    const target = args.find((a) => a.startsWith("db.")) || "";
    if (!target) {
      fail(ctx, "An error occurred (InvalidParameterValue): --db-instance-class is required");
      return true;
    }
    const price = PRICES[target];
    if (!price) {
      fail(ctx, `An error occurred (InvalidParameterValue): Invalid DBInstanceClass: ${target}`);
      return true;
    }
    const before = Number(db.monthly_cost) || 0;
    db.instance_size = target;
    db.monthly_cost = price;
    ctx.resourceUpdates = ctx.resourceUpdates || {};
    ctx.resourceUpdates[db.id] = { instance_size: target, monthly_cost: price };
    ctx.sessionDirty = true;
    ctx.risky = true;
    say(ctx, JSON.stringify({
      DBInstance: {
        DBInstanceIdentifier: identifier,
        DBInstanceClass: target,
        DBInstanceStatus: "modifying",
        PendingModifiedValues: { DBInstanceClass: target },
        PreferredMaintenanceWindow: "sun:18:00-sun:18:30",
      },
    }, null, 4), price < before ? TONE.ok : TONE.warn);
    if (price < before) {
      note(ctx, `right-sized ${identifier} from ${before.toFixed(0)} to ${price} USD per month`);
    } else {
      say(ctx, "note: this class costs the same or more per month — no saving here", TONE.warn);
      note(ctx, `resized ${identifier} to ${target} without a saving`);
    }
    return true;
  }

  return false;
}