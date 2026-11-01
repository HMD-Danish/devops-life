import { readFile } from "./filesystem.ts";
import { say, note, fsOf, TONE } from "./helpers.ts";

/** Prometheus answers its own API on :9090, against whatever its config scrapes. */
export function prometheusApi(ctx: any, url: string) {
  if (url.includes("/-/reload")) {
    say(ctx, "Reloading configuration...", TONE.muted);
    say(ctx, "  configuration reloaded", TONE.ok);
    note(ctx, "reloaded prometheus");
    return;
  }
  const config = readFile(fsOf(ctx), "/home/engineer/repo/prometheus/prometheus.yml") || "";
  const scraped = config.includes("ride-api");
  if (url.includes("/api/v1/targets")) {
    say(ctx, '{"status":"success","data":{"activeTargets":[');
    say(ctx, '{"labels":{"job":"prometheus","instance":"localhost:9090"},"health":"up"},');
    say(ctx, '{"labels":{"job":"grafana","instance":"localhost:3000"},"health":"up"}');
    if (scraped) say(ctx, ',{"labels":{"job":"ride-api","instance":"localhost:8081"},"health":"up"}');
    say(ctx, '],"droppedTargets":[]}}');
    if (!scraped) {
      say(ctx, "");
      say(ctx, "# ride-api is not in this list: no job in prometheus.yml names it.", TONE.warn);
    }
    note(ctx, "checked the scrape targets");
    return;
  }
  if (url.includes("/api/v1/query")) {
    if (!scraped) {
      say(ctx, '{"status":"success","data":{"resultType":"vector","result":[]}}');
      say(ctx, "");
      say(ctx, "# No series for ride-api — nothing is scraping it.", TONE.warn);
      return;
    }
    say(ctx, '{"status":"success","data":{"resultType":"vector","result":[');
    say(ctx, '{"metric":{"route":"/v1/rides/search"},"value":[1761674700,"8.42"]}');
    say(ctx, ']}}');
    say(ctx, "");
    say(ctx, "# p95 search latency is 8.42s over the last hour.", TONE.warn);
    note(ctx, "queried p95 latency");
    return;
  }
  say(ctx, '{"status":"success","data":{}}');
}

/** Elasticsearch search on :9200, filtered by whatever the query names. */
export function elasticSearch(ctx: any, url: string, rest: string[]) {
  const log = readFile(fsOf(ctx), "/home/engineer/repo/logs/ride-api.log") || "";
  const query = decodeURIComponent(`${url} ${rest.join(" ")}`).toLowerCase();
  const errorsOnly = query.includes("level:error") || query.includes("level=error");
  const rows = log.split("\n").filter(Boolean).filter((row) => !errorsOnly || row.includes("level=ERROR"));
  say(ctx, `{"took":11,"timed_out":false,"hits":{"total":{"value":${rows.length}},"hits":[`);
  rows.forEach((row, i) => {
    const comma = i === rows.length - 1 ? "" : ",";
    say(ctx, `  {"_index":"ride-api-2026.10.28","_source":{"message":${JSON.stringify(row)}}}${comma}`);
  });
  say(ctx, "]}}");
  note(ctx, `searched the ride-api logs: ${rows.length} hits`);
}