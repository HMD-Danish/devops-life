// GitOps tooling for the BookNest project: ArgoCD Applications and Helm releases.
import { parseArgs } from "./shell.ts";
import { hashStr } from "./kube.ts";
import { say, fail, note, touch, findService, primaryService, imageRef, applyImage, TONE } from "./helpers.ts";

export function cmdHelm(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const sub = args[0] || "";
  const primary = primaryService(ctx);
  if (sub === "list") {
    say(ctx, "NAME              NAMESPACE  REVISION  UPDATED                   STATUS    CHART", TONE.head);
    ctx.services.slice(0, 4).forEach((svc: any, i: number) => {
      say(ctx, `${svc.name.padEnd(17)} prod       ${String(2 + i).padEnd(9)} 2026-10-24 09:0${i} +0000   ${svc.status === "down" ? "failed  " : "deployed"}  ${svc.name}-1.${4 - i}.0`);
    });
    return;
  }
  if (sub === "status" || sub === "history") {
    const svc = findService(ctx, args[1] || "") || primary;
    if (sub === "status") {
      say(ctx, `NAME: ${svc.name}`);
      say(ctx, `LAST DEPLOYED: ${new Date(Date.now() - 36e5).toUTCString()}`);
      say(ctx, "NAMESPACE: prod");
      say(ctx, `STATUS: ${svc.status === "down" ? "failed" : "deployed"}`);
      say(ctx, "REVISION: 3");
      say(ctx, `IMAGE: ${imageRef(ctx, svc)}`);
      return;
    }
    say(ctx, "REVISION  UPDATED                   STATUS      CHART                   APP VERSION", TONE.head);
    say(ctx, `1         2026-10-02 11:04:12 +0000 deployed    ${svc.name}-1.2.0        2.12.3`);
    say(ctx, `2         2026-10-18 16:41:55 +0000 superseded  ${svc.name}-1.3.0        2.13.1`);
    say(ctx, `3         2026-10-24 08:58:11 +0000 deployed    ${svc.name}-1.4.0        ${svc.version}`);
    return;
  }
  if (sub === "upgrade" || sub === "rollback") {
    const svc = findService(ctx, args[1] || "") || primary;
    if (sub === "upgrade") {
      const setIdx = rest.findIndex((t) => t === "--set");
      const imageSet = setIdx > -1 ? String(rest[setIdx + 1] || "") : "";
      const image = imageSet.includes("image=") ? imageSet.split("image=")[1] : "";
      if (image) applyImage(ctx, svc, image, "helm upgrade");
      else touch(ctx, svc, { status: "deploying" }, `helm upgrade ${svc.name} — new revision rolling out`);
      say(ctx, `Release "${svc.name}" has been upgraded.`, TONE.ok);
      return;
    }
    const [major, minor] = String(svc.version || "1.0").split(".");
    const nextTag = `${major}.${Math.max(0, Number(minor) - 1)}.0`;
    touch(ctx, svc, { status: "deploying", version: nextTag }, `helm rollback ${svc.name} to ${nextTag}`);
    say(ctx, "Rollback was a success! Happy Helming!", TONE.ok);
    return;
  }
  if (sub === "repo") {
    say(ctx, "NAME        URL", TONE.head);
    say(ctx, "bitnami     https://charts.bitnami.com/bitnami");
    say(ctx, "ingress-ng  https://kubernetes.github.io/ingress-nginx");
    return;
  }
  fail(ctx, `Error: "helm ${sub}" is not a helm command`);
}

export function cmdArgocd(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const [area, sub, name] = args;
  if (area !== "app") return fail(ctx, "argocd: available here: app list|get|sync");
  if (sub === "list") {
    say(ctx, "NAME                SYNC STATUS   HEALTH     REPO", TONE.head);
    ctx.services.forEach((svc: any) => {
      say(ctx, `${svc.name.padEnd(20)}${(svc.status === "degraded" ? "OutOfSync" : "Synced").padEnd(14)}${(svc.status === "healthy" ? "Healthy" : svc.status === "down" ? "Missing" : "Degraded").padEnd(11)}github.com/booknest/${svc.name}`);
    });
    return;
  }
  if (sub === "create") {
    const target = name || "app-books";
    say(ctx, `application '${target}' created`, TONE.ok);
    note(ctx, `created the ArgoCD application ${target}`);
    return;
  }
  const svc = findService(ctx, name || "");
  if (!svc) return fail(ctx, `rpc error: code = NotFound desc = application '${name || ""}' not found`);
  if (sub === "get") {
    say(ctx, `Name:               ${svc.name}`);
    say(ctx, "Namespace:          prod");
    say(ctx, "Sync Policy:        Automated (Prune=true SelfHeal=true)");
    say(ctx, `Sync Status:        ${svc.status === "degraded" ? "OutOfSync" : "Synced"}`);
    say(ctx, `Health Status:      ${svc.status === "healthy" ? "Healthy" : "Degraded"}`);
    say(ctx, `Revision:           ${hashStr(svc.name).toString(16).slice(0, 7)}`);
    return;
  }
  if (sub === "sync") {
    touch(ctx, svc, { status: "deploying" }, `argocd synced ${svc.name} to the git revision`);
    say(ctx, "TIMESTAMP                  KIND        NAMESPACE  NAME            STATUS   HEALTH", TONE.head);
    say(ctx, `${new Date().toISOString()}   Deployment  prod       ${svc.name.padEnd(15)} Synced   Progressing`, TONE.ok);
    say(ctx, "Sync operation completed successfully", TONE.ok);
    return;
  }
  if (sub === "set") {
    say(ctx, `application '${svc.name}' updated`, TONE.ok);
    note(ctx, "turned on automated sync and self-heal");
    return;
  }
  fail(ctx, "argocd: available here: app list|get|create|sync|set", TONE.muted);
}