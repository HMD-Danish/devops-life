import GlassPanel from "@/components/glass/GlassPanel";
import Logo from "@/components/glass/Logo";
import { cn } from "@/lib/utils";

const LEVELS = [1, 2, 3].map((level) => ({
  level,
  label: ["Nudge", "Concept", "Steps"][level - 1],
}));

function TechLeadBody({ step, level, onReveal, hintsUsed, maxLevel }) {
  const hint = step?.hints?.[level - 1];
  const ceiling = Math.min(3, Math.max(1, Number(maxLevel) || 3));

  return (
    <>
      <div className="flex items-center gap-2">
        <Logo size={16} decorative />
        <h2 className="type-overline">Tech lead</h2>
        <span className="ml-auto type-caption">{hintsUsed} hints used</span>
      </div>

      <p className="type-headline mt-3 text-[16px]">{step?.title || "No step yet"}</p>

      <div className="mt-3 space-y-2.5">
        <div className="rounded-inner bg-fill/70 p-3.5">
          <p className="type-overline text-[10.5px]">What is happening</p>
          <p className="type-body mt-1.5 text-[13.5px]">{step?.whatHappening}</p>
        </div>
        <div className="rounded-inner border border-primary/20 bg-primary/[0.07] p-3.5">
          <p className="type-overline text-[10.5px] text-primary">What to do next</p>
          <p className="type-body mt-1.5 text-[13.5px]">{step?.whatNext}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5" role="group" aria-label="Reveal a hint">
        {LEVELS.map((item) => {
          const unlocked = item.level <= Math.min(level + 1, ceiling);
          return (
            <button
              key={item.level}
              type="button"
              disabled={!unlocked}
              onClick={() => onReveal()}
              className={cn(
                "press min-h-[44px] flex-1 rounded-inner border px-2 text-[12.5px] font-medium",
                item.level <= level
                  ? "border-primary/30 bg-primary/12 text-primary"
                  : "border-separator/80 text-label-secondary hover:bg-fill/70",
                !unlocked && "opacity-40"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {ceiling < 3 ? (
        <p className="type-caption mt-2 text-[11.5px]">
          At this level the Tech Lead stops at level {ceiling}, and each hint costs score.
        </p>
      ) : null}

      {level >= 1 && hint ? (
        <div className="mt-3 overflow-y-auto rounded-inner bg-fill/70 p-3.5">
          <p className="type-overline text-[10.5px]">
            Level {level} · {hint.title}
          </p>
          {hint.body ? <p className="type-body mt-1.5 text-[13.5px]">{hint.body}</p> : null}
          {hint.items?.length ? (
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              {hint.items.map((item) => (
                <li key={item} className="terminal-font text-[12px] leading-relaxed">
                  {item}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default function TechLeadPanel({ step, level, onReveal, hintsUsed, className, maxLevel = 3, embedded = false }) {
  if (embedded) {
    return (
      <div className={cn("pb-2", className)}>
        <TechLeadBody step={step} level={level} onReveal={onReveal} hintsUsed={hintsUsed} maxLevel={maxLevel} />
      </div>
    );
  }

  return (
    <GlassPanel className={cn("flex flex-col overflow-y-auto p-4", className)}>
      <TechLeadBody step={step} level={level} onReveal={onReveal} hintsUsed={hintsUsed} maxLevel={maxLevel} />
    </GlassPanel>
  );
}