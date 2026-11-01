import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import { requestsInWindow } from "@/lib/net";

const HEALTHY = 20;

/** What this browser asked the backend for in the last minute, by function. */
export default function RequestMeter() {
  const [rows, setRows] = useState(() => requestsInWindow());

  useEffect(() => {
    const id = setInterval(() => setRows(requestsInWindow()), 1000);
    return () => clearInterval(id);
  }, []);

  const entries = Object.entries(rows.by).sort((a, b) => b[1] - a[1]);
  const under = rows.total <= HEALTHY;

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="type-overline">Requests · last 60 seconds</p>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-heading text-[26px] font-semibold tabular-nums">{rows.total}</p>
        <p className="type-caption">this browser, all functions</p>
      </div>
      <p className="type-caption mt-1 text-[11.5px]">
        {under ? "A normal play session stays under 20 a minute." : "Above the 20 a minute target."}
      </p>

      {entries.length ? (
        <dl className="mt-3 divide-y divide-separator/60">
          {entries.map(([name, count]) => (
            <div key={name} className="flex items-baseline justify-between gap-3 py-2">
              <dt className="terminal-font text-[12.5px] text-label-secondary">{name}</dt>
              <dd className="text-[13px] font-medium tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="type-caption mt-3">Nothing yet.</p>
      )}
    </GlassPanel>
  );
}