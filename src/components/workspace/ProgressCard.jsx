import { useState } from "react";
import GlassPanel from "@/components/glass/GlassPanel";
import { difficultyMeta } from "@/data/difficulty";
import { cn } from "@/lib/utils";

/**
 * Compact progress row. Details (hints, mistakes, trust) reveal on tap,
 * or on hover at desktop widths.
 */
export default function ProgressCard({ step, progress, score, hintsUsed, trust, difficulty }) {
  const [open, setOpen] = useState(false);
  const clampedTrust = Math.max(0, Math.min(100, trust));
  const pct = Math.max(0, Math.min(100, progress));

  return (
    <GlassPanel className="p-4">
      <div className="group">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Progress details"
          className="press flex w-full items-center gap-3 text-left"
        >
          <span className="type-headline min-w-0 flex-1 truncate text-[13.5px]">{step?.title || "No step"}</span>
          <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-fill">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-350 ease-spring"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="terminal-font shrink-0 text-[12.5px] font-semibold tabular-nums">{score?.total ?? 0}</span>
        </button>

        <div className={cn("mt-3 space-y-2", open ? "block" : "hidden min-[1200px]:group-hover:block")}>
          <div className="flex items-center justify-between type-caption text-[11px]">
            <span>
              Score · {difficultyMeta(difficulty).label} ×{score?.multiplier ?? 1}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="flex items-center justify-between type-caption text-[11px]">
            <span>
              {score?.steps ?? 0}/{score?.stepsTotal ?? 0} steps
            </span>
            <span>
              {score?.mistakes ?? 0} mistakes · {hintsUsed} hints
            </span>
          </div>
          <div className="flex items-center justify-between type-caption text-[11px]">
            <span>Team trust</span>
            <span className="terminal-font text-[11.5px] font-semibold tabular-nums text-label">{clampedTrust}/100</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-350 ease-spring",
                clampedTrust >= 70 ? "bg-success" : clampedTrust >= 40 ? "bg-warning" : "bg-danger"
              )}
              style={{ width: `${clampedTrust}%` }}
            />
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}