import { ArrowRight, Check, Sparkles } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import { Button } from "@/components/ui/button";
import { activeSteps, difficultyOf, projectScore } from "@/lib/projectEngine";
import { elapsedMs, formatSpan } from "@/lib/realClock";
import { difficultyMeta } from "@/data/difficulty";

export default function FinishScreen({ project, save, now, hintsUsed, missedSlas = 0, leave, giveFeedback }) {
  // Real time actually played, with the breaks taken out.
  const elapsed = elapsedMs(save, now);
  const wrongTurns = Object.values(save?.mistakes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

  const score = projectScore(project, save, missedSlas);
  const meta = difficultyMeta(difficultyOf(save));

  const stats = [
    { label: "Score", value: `${score.total} ×${score.multiplier}` },
    { label: "Tickets closed", value: score.stepsTotal },
    { label: "Time on shift", value: formatSpan(elapsed) },
    { label: "Hints taken", value: hintsUsed },
  ];

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 pb-6">
      <GlassPanel className="rise-in p-6 sm:p-7">
        <div className="type-overline flex items-center gap-2 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Project complete · {meta.label}
        </div>
        <h1 className="type-large-title mt-2 text-[28px] sm:text-[34px]">{project.title}</h1>
        <p className="type-body mt-2 max-w-lg text-label-secondary">
          Every ticket is closed and nothing is paging. {save?.player_name || "You"} handled it with{" "}
          {wrongTurns === 0 ? "no wrong turns" : `${wrongTurns} wrong turn${wrongTurns === 1 ? "" : "s"}`}.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-subtle px-3 py-2.5">
              <p className="type-overline text-[9.5px]">{stat.label}</p>
              <p className="type-headline mt-1 tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button className="rounded-full" onClick={leave}>
            Choose another project <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="secondary" className="rounded-full" onClick={giveFeedback}>
            Give feedback
          </Button>
        </div>
      </GlassPanel>

      <GlassPanel className="p-5">
        <p className="type-overline">What you closed</p>
        <ul className="mt-3 space-y-2">
          {activeSteps(project, difficultyOf(save)).map((step) => (
            <li key={step.key} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="h-2.5 w-2.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug">
                  <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                    {project.ticketPrefix}-{101 + project.steps.findIndex((item) => item.key === step.key)}
                  </span>
                  {step.ticket?.title || step.title}
                </p>
                {step.ticket?.title && step.ticket.title !== step.title ? (
                  <p className="text-[11.5px] text-muted-foreground">{step.title}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}