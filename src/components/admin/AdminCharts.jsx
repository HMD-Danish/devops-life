import { cn } from "@/lib/utils";

/** Horizontal bars, for rankings such as completions per project. */
export function MiniBars({ rows, empty = "Nothing recorded yet." }) {
  if (!rows.length) return <p className="type-caption">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12.5px] text-label">{row.label}</span>
            <span className="shrink-0 tabular-nums text-[12px] text-label-secondary">{row.value}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-fill">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(row.value ? 3 : 0, Math.round((row.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Columns over time, for "projects per day". */
export function DayBars({ days, empty = "No starts in the last two weeks." }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);

  if (!days.length || !total) return <p className="type-caption">{empty}</p>;

  return (
    <div>
      <div className="flex h-24 items-end gap-1" role="img" aria-label={`Project starts per day, ${total} in total`}>
        {days.map((day) => (
          <div key={day.day} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={cn("w-full rounded-t-[3px] bg-primary/70", day.count ? "" : "bg-fill")}
              style={{ height: `${Math.max(day.count ? 6 : 2, Math.round((day.count / max) * 100))}%` }}
              title={`${day.day}: ${day.count}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="type-caption text-[10.5px]">{days[0]?.day}</span>
        <span className="type-caption text-[10.5px]">{days[days.length - 1]?.day}</span>
      </div>
    </div>
  );
}