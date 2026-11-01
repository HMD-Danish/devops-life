// Load generation and database tuning for the FlashDeal spike project.
import { parseArgs, columnTable } from "./shell.ts";
import { say, fail, note, TONE } from "./helpers.ts";

type Profile = {
  total: number;
  average: number;
  slowest: number;
  fastest: number;
  status: [number, number][];
  p95: number;
};

const FAST: Profile = {
  total: 30.01,
  average: 0.118,
  slowest: 0.412,
  fastest: 0.031,
  status: [[200, 14980]],
  p95: 0.19,
};

const CHECKOUT_BROKEN: Profile = {
  total: 30.02,
  average: 1.24,
  slowest: 8.114,
  fastest: 0.088,
  status: [[200, 2612], [503, 214], [504, 388]],
  p95: 4.12,
};

const DEALS_UNINDEXED: Profile = {
  total: 30.03,
  average: 2.84,
  slowest: 6.902,
  fastest: 0.41,
  status: [[200, 1024], [504, 87]],
  p95: 3.26,
};

function histogram(profile: Profile) {
  const width = profile.p95;
  const rows: string[][] = [];
  const labels = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  labels.forEach((step) => {
    const at = width * step;
    const share = step === 0.5 ? 0.52 : step < 0.5 ? 0.12 : 0.04;
    const count = Math.max(1, Math.round(profile.status.reduce((sum, [, n]) => sum + n, 0) * share));
    rows.push([at.toFixed(3), `[${count}]`, "|".repeat(Math.max(1, Math.round(share * 40)))]);
  });
  return rows;
}

export function cmdHey(ctx: any, rest: string[]) {
  const { args } = parseArgs(rest);
  const url = args.find((a) => a.includes("://"));
  if (!url) return fail(ctx, "hey: missing url\n\nUsage: hey -z 30s -c 100 https://staging.flashdeal.internal/api/checkout");

  const numbers = args.filter((a) => /^\d+$/.test(a));
  const concurrency = numbers.length ? Number(numbers[0]) : 50;
  const duration = args.find((a) => /^\d+s$/.test(a)) || "30s";
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const indexed = Boolean(ctx.session.env?.DEALS_CITY_END_IDX);

  const profile = path.includes("checkout")
    ? CHECKOUT_BROKEN
    : path.includes("deals")
      ? indexed ? FAST : DEALS_UNINDEXED
      : FAST;

  const requests = profile.status.reduce((sum, [, n]) => sum + n, 0);
  say(ctx, `Running ${duration} test @ ${url}`, TONE.muted);
  say(ctx, `  ${concurrency} requests/sec, ${concurrency} workers`, TONE.muted);
  say(ctx, "");
  say(ctx, "Summary:", TONE.head);
  say(ctx, `  Total:\t${profile.total} secs`);
  say(ctx, `  Slowest:\t${profile.slowest} secs`, profile.slowest > 2 ? TONE.err : undefined);
  say(ctx, `  Fastest:\t${profile.fastest} secs`);
  say(ctx, `  Average:\t${profile.average} secs`);
  say(ctx, `  p95:\t${profile.p95.toFixed(3)} secs`, profile.p95 > 1 ? TONE.err : TONE.ok);
  say(ctx, `  Requests/sec:\t${(requests / profile.total).toFixed(4)}`);
  say(ctx, "");
  say(ctx, "Response time histogram:", TONE.head);
  columnTable(histogram(profile)).forEach((row) => say(ctx, `  ${row}`));
  say(ctx, "");
  say(ctx, "Status code distribution:", TONE.head);
  profile.status.forEach(([code, count]) => {
    const tone = code === 200 ? TONE.ok : TONE.err;
    say(ctx, `  [${code}]\t${count} responses`, tone);
  });
  const errors = profile.status.filter(([code]) => code !== 200).reduce((sum, [, n]) => sum + n, 0);
  if (errors) {
    say(ctx, "");
    say(ctx, "Error distribution:", TONE.head);
    say(ctx, `  [${errors}]\tGet "${url}": context deadline exceeded (Client.Timeout exceeded while awaiting headers)`, TONE.err);
  }
  note(ctx, `load tested ${path || url}: p95 ${(profile.p95 * 1000).toFixed(0)}ms, ${errors} errors`);
}

const SLOW_LOG = [
  ["start_time", "query_time", "rows_examined", "rows_sent", "sql_text"],
  ["2026-10-29 21:38:11", "3.2841", "4120884", "24", "SELECT * FROM deals WHERE city_id = ? AND ends_at > NOW()"],
  ["2026-10-29 21:38:14", "3.1902", "4120884", "18", "SELECT * FROM deals WHERE city_id = ? AND ends_at > NOW()"],
  ["2026-10-29 21:38:19", "2.8874", "4120884", "31", "SELECT * FROM deals WHERE city_id = ? AND ends_at > NOW()"],
  ["2026-10-29 21:39:02", "0.4122", "1402", "12", "SELECT count(*) FROM carts WHERE session_id = ?"],
  ["2026-10-29 21:39:44", "0.0881", "96", "96", "SELECT id, title FROM deals WHERE id = ?"],
];

export function cmdMysql(ctx: any, rest: string[]) {
  const sql = rest.find((token) => /^\s*(select|show|explain|create|update|delete|insert)/i.test(token)) || "";
  if (!sql) {
    return fail(ctx, "mysql: no statement\n\nUsage: mysql -h HOST -u USER -e \"SELECT * FROM mysql.slow_log LIMIT 5;\"");
  }
  const lower = sql.toLowerCase();

  if (lower.includes("slow_log")) {
    say(ctx, `${SLOW_LOG.length - 1} rows in set (0.02 sec)`, TONE.muted);
    columnTable(SLOW_LOG).forEach((row, index) => say(ctx, row, index === 0 ? TONE.head : undefined));
    note(ctx, "read the slow query log: one statement scans 4.1M rows");
    return;
  }

  if (lower.startsWith("explain")) {
    const rows = [
      ["id", "select_type", "table", "type", "rows", "Extra"],
      ["1", "SIMPLE", "deals", "Seq Scan", "4120884", "Filter: (city_id = 42) AND (ends_at > now())"],
    ];
    columnTable(rows).forEach((row, index) => say(ctx, row, index === 0 ? TONE.head : index === 1 ? TONE.warn : undefined));
    say(ctx, "", TONE.dim);
    say(ctx, "The planner reads the whole table twice per request: 4.1M rows, no usable index.", TONE.warn);
    note(ctx, "confirmed a sequential scan on deals");
    return;
  }

  if (lower.includes("create index")) {
    if (!lower.includes("deals")) {
      return fail(ctx, "ERROR 1146 (42S02): Table does not exist");
    }
    ctx.session.env = ctx.session.env || {};
    ctx.session.env.DEALS_CITY_END_IDX = "1";
    ctx.sessionDirty = true;
    say(ctx, "Query OK, 0 rows affected (2.418 sec)", TONE.ok);
    say(ctx, "Records: 0  Duplicates: 0  Warnings: 0", TONE.muted);
    note(ctx, "added the composite index on deals (city_id, ends_at)");
    return;
  }

  if (lower.startsWith("show tables")) {
    const rows = [["Tables_in_deals"], ["carts"], ["deals"], ["orders"], ["sellers"]];
    columnTable(rows).forEach((row, index) => say(ctx, row, index === 0 ? TONE.head : undefined));
    return;
  }

  if (lower.startsWith("select") && lower.includes("from deals")) {
    say(ctx, "ERROR 2013 (HY000): Lost connection to MySQL server during query", TONE.err);
    note(ctx, "the deals query timed out against rds-main");
    return;
  }

  say(ctx, "Query OK, 1 row affected (0.03 sec)", TONE.ok);
}