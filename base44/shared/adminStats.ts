// Numbers for the private dashboard, computed from data that already exists.
//
// Every figure is produced from one pass over a bounded page of career saves
// plus a handful of counts, so an admin screen never fans out into a request
// per row.
import { pageOf } from "./admin.ts";

export const SAVE_SCAN_LIMIT = 500;
const PAGE_SIZE = 250;

const num = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Up to `limit` career saves, newest activity first, in a few pages. */
export async function scanSaves(db: any, limit = SAVE_SCAN_LIMIT) {
  const out: any[] = [];
  let cursor = "";
  while (out.length < limit) {
    const page = await db.entities.CareerSave
      .list({ sort: "-updated_date", limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) })
      .catch(() => null);
    const rows = pageOf(page);
    out.push(...rows);
    const next = page?.next_cursor || "";
    if (!rows.length || !page?.has_more || !next) break;
    cursor = next;
  }
  return out.slice(0, limit);
}

/** One bucket per project: careers, score, hints, mistakes and failures per step. */
export function projectRollup(saves: any[]) {
  const map = new Map<string, any>();
  for (const save of saves) {
    const key = String(save?.project_key || "unknown");
    const row =
      map.get(key) || { projectId: key, careers: 0, scoreSum: 0, scoreCount: 0, hints: 0, mistakes: 0, steps: new Map<string, number>() };
    row.careers += 1;
    const score = num(save?.score);
    if (score > 0) {
      row.scoreSum += score;
      row.scoreCount += 1;
    }
    for (const value of Object.values(save?.hints || {})) row.hints += num(value);
    for (const [step, value] of Object.entries(save?.mistakes || {})) {
      const count = num(value);
      row.mistakes += count;
      row.steps.set(step, (row.steps.get(step) || 0) + count);
    }
    map.set(key, row);
  }
  return map;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function rollupFor(map: Map<string, any>, key: string) {
  const row = map.get(key);
  if (!row) return { careers: 0, avgScore: 0, avgHints: 0, avgMistakes: 0, worstStep: "", worstStepCount: 0 };
  const top = [...row.steps.entries()].sort((a: any, b: any) => b[1] - a[1])[0] || ["", 0];
  return {
    careers: row.careers,
    avgScore: row.scoreCount ? Math.round(row.scoreSum / row.scoreCount) : 0,
    avgHints: row.careers ? round(row.hints / row.careers) : 0,
    avgMistakes: row.careers ? round(row.mistakes / row.careers) : 0,
    worstStep: top[0],
    worstStepCount: top[1],
  };
}

/** Counts from a groupBy aggregate, tolerating whichever key the row carries. */
export function groupCounts(result: any, field: string) {
  const rows: any[] = Array.isArray(result?.rows) ? result.rows : pageOf(result);
  const out = new Map<string, number>();
  for (const row of rows) {
    const key = String(row?.[field] ?? row?._id ?? row?.id ?? row?.key ?? "");
    if (!key) continue;
    out.set(key, (out.get(key) || 0) + num(row?.count));
  }
  return out;
}

const csvCell = (value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function toCsv(header: string[], rows: any[][]) {
  return `\uFEFF${[header, ...rows].map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
}