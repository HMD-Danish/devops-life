import { LayoutDashboard, Lightbulb } from "lucide-react";
import { clockLabel } from "@/lib/realClock";

/** One 56px bar: step title on the left, the real device clock and Tech Lead on the right. */
export default function ProjectHeader({
  project,
  step,
  stepNumber,
  now,
  onOpenLead,
  onOpenDashboard,
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3">
      <div className="min-w-0 flex-1" data-tour="step-title">
        <p className="type-overline hidden truncate text-[10px] min-[1000px]:block">{project.title}</p>
        <h1 className="type-title truncate text-[16px] leading-tight sm:text-[18px]">
          Step {stepNumber}: {step?.title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenDashboard}
          aria-label="Open dashboard"
          data-tour="dashboard"
          className="press glass-thin hidden h-10 w-10 items-center justify-center rounded-full text-label-secondary hover:text-label min-[800px]:flex min-[1200px]:hidden"
        >
          <LayoutDashboard className="h-[18px] w-[18px]" />
        </button>

        <span
          data-tour="clock"
          title="Your device time"
          className="terminal-font flex h-10 shrink-0 items-center rounded-full bg-fill/60 px-3 text-[11.5px] tabular-nums text-label-secondary"
        >
          {clockLabel(now)}
        </span>

        <button
          type="button"
          onClick={onOpenLead}
          data-tour="tech-lead"
          className="press hidden h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 font-heading text-[13.5px] font-medium text-primary-foreground hover:brightness-105 min-[800px]:inline-flex"
        >
          <Lightbulb className="h-4 w-4" />
          Tech Lead
        </button>
      </div>
    </header>
  );
}