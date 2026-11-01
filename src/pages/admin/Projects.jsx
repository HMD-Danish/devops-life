import { useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Terminal } from "lucide-react";
import { useBackLayer } from "@/lib/backLayers";
import { cn } from "@/lib/utils";
import GlassPanel from "@/components/glass/GlassPanel";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import AdminError from "@/components/admin/AdminError";
import { Button } from "@/components/ui/button";
import { useAdminResource } from "@/lib/adminStore";
import { PROJECTS } from "@/data/projects";

const KEYS = PROJECTS.map((project) => project.key);

const empty = { starts: 0, completions: 0, avgScore: 0, avgHints: 0, avgMistakes: 0, worstStep: "", worstStepCount: 0, careers: 0 };

export default function AdminProjects() {
  const payload = useMemo(() => ({ projectKeys: KEYS }), []);
  const { data, loading, error, reload } = useAdminResource("dashboard", payload);
  const [openSteps, setOpenSteps] = useState("");

  // Back collapses an open step list and keeps the page where it was.
  useBackLayer(!!openSteps, () => setOpenSteps(""));

  if (error) return <AdminError message={error} onRetry={reload} />;
  if (loading && !data) return <AdminSkeleton rows={4} />;

  const statsFor = (key) => (data?.projects || []).find((row) => row.projectId === key) || empty;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-large-title text-[26px] sm:text-[30px]">Projects</h1>
          <p className="type-caption mt-1">Read-only. The scripts themselves live in the app's project data.</p>
        </div>
        <Button variant="secondary" size="sm" className="rounded-full" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <ul className="space-y-2.5">
        {PROJECTS.map((project) => {
          const stats = statsFor(project.key);
          const worst = project.steps.find((step) => step.key === stats.worstStep);
          return (
            <li key={project.key}>
              <GlassPanel className="p-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="type-headline text-[15.5px]">{project.title}</h2>
                  <span className="type-caption text-[11px]">{project.steps.length} steps</span>
                  {project.needsTerminal ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-fill/80 px-2 py-0.5 text-[10.5px] text-label-secondary">
                      <Terminal className="h-3 w-3" aria-hidden="true" />
                      Terminal
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {[
                    { label: "Starts", value: stats.starts },
                    { label: "Completed", value: stats.completions },
                    { label: "Avg score", value: stats.avgScore },
                    { label: "Hints", value: stats.avgHints },
                    { label: "Mistakes", value: stats.avgMistakes },
                  ].map((item) => (
                    <div key={item.label} className="glass-subtle px-2.5 py-2">
                      <p className="type-overline text-[9px]">{item.label}</p>
                      <p className="type-headline mt-0.5 tabular-nums text-[15px]">{item.value}</p>
                    </div>
                  ))}
                </div>

                <p className="type-caption mt-2.5 text-[11.5px]">
                  {stats.worstStep
                    ? `Players fail most at: ${worst?.title || stats.worstStep} (${stats.worstStepCount} mistake${stats.worstStepCount === 1 ? "" : "s"})`
                    : "No failed attempts recorded for this project."}
                </p>

                <button
                  type="button"
                  onClick={() => setOpenSteps(openSteps === project.key ? "" : project.key)}
                  aria-expanded={openSteps === project.key}
                  className="press mt-2 flex min-h-[44px] items-center gap-1.5 rounded-full text-[12.5px] font-medium text-primary"
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", openSteps === project.key && "rotate-180")}
                    aria-hidden="true"
                  />
                  Read the {project.steps.length} steps
                </button>
                {openSteps === project.key ? (
                  <ol className="mt-1 space-y-1.5 border-l border-separator/70 pl-3">
                    {project.steps.map((step, index) => (
                      <li key={step.key} className="text-[12.5px] leading-snug">
                        <span className="mr-1.5 font-mono text-[10.5px] text-label-secondary">{index + 1}</span>
                        {step.ticket?.title || step.title}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </GlassPanel>
            </li>
          );
        })}
      </ul>
    </div>
  );
}