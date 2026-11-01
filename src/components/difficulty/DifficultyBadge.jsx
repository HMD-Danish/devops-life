import { Lock } from "lucide-react";
import { difficultyMeta } from "@/data/difficulty";
import { cn } from "@/lib/utils";

const TONE = {
  easy: "bg-success/14 text-success",
  medium: "bg-warning/16 text-warning",
  hard: "bg-danger/14 text-danger",
};

export default function DifficultyBadge({ level, canChange, onChange }) {
  const meta = difficultyMeta(level);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span
        className={cn(
          "rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]",
          TONE[meta.id]
        )}
      >
        {meta.label} · {meta.tagline}
      </span>
      {canChange ? (
        <button
          type="button"
          onClick={onChange}
          className="press inline-flex min-h-[44px] items-center rounded-full px-2 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Change level
        </button>
      ) : (
        <span className="type-caption flex items-center gap-1 text-[11px]">
          <Lock className="h-3 w-3" /> Locked while a project is running
        </span>
      )}
    </div>
  );
}