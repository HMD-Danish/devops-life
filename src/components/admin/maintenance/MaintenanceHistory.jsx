import { Loader2 } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import { Button } from "@/components/ui/button";

const stamp = (iso) => {
  const at = new Date(iso || "");
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const lasted = (ms) => {
  const minutes = Math.round((Number(ms) || 0) / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

/** Every maintenance window, newest first, 25 at a time. */
export default function MaintenanceHistory({ rows = [], hasMore, loading, onMore }) {
  return (
    <GlassPanel className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="type-overline">History</p>
        <p className="type-caption text-[11px] tabular-nums">{rows.length} shown</p>
      </div>

      {!rows.length ? (
        <p className="type-caption mt-3 text-[12.5px]">No maintenance windows yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-separator/60">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[13px] font-medium tabular-nums">
                  {stamp(row.turnedOnAt)} → {row.turnedOffAt ? stamp(row.turnedOffAt) : "still open"}
                </p>
                <p className="type-caption text-[11px] tabular-nums">
                  {lasted(row.durationMs)} · {row.blockedCount || 0} blocked
                </p>
              </div>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-label-secondary">{row.reason}</p>
              <p className="type-caption mt-0.5 text-[11px]">{row.admin || "Admin"}</p>
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" className="rounded-full" onClick={onMore} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Load more
          </Button>
        </div>
      ) : null}
    </GlassPanel>
  );
}