export const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";

export function hashStr(value: string): number {
  let h = 2166136261;
  const s = String(value || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function replicaSet(service: { id?: string; name?: string }): string {
  const h = hashStr(`${service.id || service.name}-rs`).toString(36);
  return `${h}xxxxxxxxx`.slice(0, 9);
}

export type PodRow = {
  name: string;
  ready: string;
  state: string;
  restarts: number;
  age: string;
  node: string;
};

export function podRows(service: { id?: string; name: string; replicas?: number; status?: string }): PodRow[] {
  const count = Math.max(0, Math.min(40, Number(service.replicas) || 0));
  const status = service.status || "healthy";
  const rows: PodRow[] = [];
  for (let i = 0; i < count; i++) {
    const h = hashStr(`${service.id || service.name}-${i}`);
    const suffix = [0, 6, 11, 16, 21]
      .map((shift) => ALPHA[Math.abs(h >>> shift) % 36])
      .join("");
    let state = "Running";
    let ready = "1/1";
    let restarts = h % 7 === 0 ? 2 : 0;
    if (status === "down") {
      state = "Error";
      ready = "0/1";
      restarts = 6 + (h % 4);
    } else if (status === "degraded" && i === 0) {
      state = "CrashLoopBackOff";
      ready = "0/1";
      restarts = 11;
    } else if (status === "deploying" && i === 0) {
      state = "ContainerCreating";
      ready = "0/1";
      restarts = 0;
    }
    rows.push({
      name: `${service.name}-${replicaSet(service)}-${suffix}`,
      ready,
      state,
      restarts,
      age: `${1 + (h % 9)}d${h % 23}h`,
      node: `prod-node-${["a", "b", "c"][i % 3]}`,
    });
  }
  return rows;
}

export function nodeRows(resources: any[]) {
  const nodes = (resources || []).filter((r) => r.kind === "node");
  return nodes.map((node, i) => ({
    name: node.name,
    status: node.status === "stopped" ? "NotReady" : "Ready",
    role: "<none>",
    age: `${12 + i}d`,
    version: "v1.29.3-eks-e71965b",
    ip: `10.20.1.${11 + i}`,
    cpu: Math.round(Number(node.utilization) || 0),
    instance: node.instance_size || "c6i.2xlarge",
  }));
}

export function clusterHost(accountId: string, region: string): string {
  return `https://${accountId}.gr7.${region}.eks.amazonaws.com`;
}

export function instanceIdFor(name: string): string {
  const h = hashStr(name);
  return `i-0${h.toString(16).padStart(15, "0").slice(0, 15)}`;
}