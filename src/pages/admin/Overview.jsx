import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import StatCard from "@/components/admin/StatCard";
import { DayBars, MiniBars } from "@/components/admin/AdminCharts";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import AdminError from "@/components/admin/AdminError";
import UpdateControl from "@/components/admin/release/UpdateControl";
import { Button } from "@/components/ui/button";
import { useAdminResource } from "@/lib/adminStore";
import { PROJECTS, projectTitle } from "@/data/projects";

const KEYS = PROJECTS.map((project) => project.key);

export default function AdminOverview() {
  const payload = useMemo(() => ({ projectKeys: KEYS }), []);
  const { data, loading, error, reload } = useAdminResource("dashboard", payload);

  if (error) return <AdminError message={error} onRetry={reload} />;
  if (loading && !data) return <AdminSkeleton rows={4} />;

  const overview = data?.overview || {};
  const difficulty = overview.difficulty || { easy: 0, medium: 0, hard: 0 };
  const completed = (overview.completionsByProject || [])
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((row) => ({ label: projectTitle(row.projectId), value: row.count }));

  const cards = [
    { label: "Players today", value: overview.playersToday ?? 0, hint: "New profiles since midnight UTC" },
    { label: "Players, 7 days", value: overview.playersWeek ?? 0, hint: "New profiles this week" },
    { label: "Active careers", value: overview.activeCareers ?? 0, hint: "Touched in the last 5 days" },
    { label: "Projects started", value: overview.projectsStarted ?? 0, hint: "Every start ever recorded" },
    { label: "Projects completed", value: overview.projectsCompleted ?? 0, hint: "Every finish ever recorded" },
    { label: "Completion rate", value: `${overview.completionRate ?? 0}%`, hint: "Completed for every start" },
    { label: "Average score", value: overview.avgScore ?? 0, hint: `Across ${overview.careersScanned ?? 0} careers` },
    {
      label: "Most popular project",
      value: overview.mostPopular?.projectId ? projectTitle(overview.mostPopular.projectId) : "None yet",
      hint: overview.mostPopular?.count ? `${overview.mostPopular.count} starts` : "No starts recorded",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-large-title text-[26px] sm:text-[30px]">Overview</h1>
          <p className="type-caption mt-1">Refreshes on its own at most every 30 seconds.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="rounded-full" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
          <UpdateControl />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GlassPanel className="p-4">
          <p className="type-overline">Projects per day</p>
          <p className="type-caption mb-3">Starts over the last 14 days</p>
          <DayBars days={overview.daily || []} />
        </GlassPanel>

        <GlassPanel className="p-4">
          <p className="type-overline">Completions per project</p>
          <p className="type-caption mb-3">Finishes recorded for each project</p>
          <MiniBars rows={completed} empty="No project has been finished yet." />
        </GlassPanel>

        <GlassPanel className="p-4">
          <p className="type-overline">Difficulty split</p>
          <p className="type-caption mb-3">Careers by chosen level</p>
          <MiniBars
            rows={[
              { label: "Easy", value: difficulty.easy || 0 },
              { label: "Medium", value: difficulty.medium || 0 },
              { label: "Hard", value: difficulty.hard || 0 },
            ]}
            empty="No career has been started yet."
          />
        </GlassPanel>

        <GlassPanel className="p-4">
          <p className="type-overline">Per project</p>
          <p className="type-caption mb-3">Average per career</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-subtle px-3 py-2.5">
              <p className="type-overline text-[9.5px]">Hints</p>
              <p className="type-headline mt-1 tabular-nums">{overview.avgHints ?? 0}</p>
            </div>
            <div className="glass-subtle px-3 py-2.5">
              <p className="type-overline text-[9.5px]">Mistakes</p>
              <p className="type-headline mt-1 tabular-nums">{overview.avgMistakes ?? 0}</p>
            </div>
          </div>
          <p className="type-caption mt-3 text-[11px] leading-relaxed">
            Computed from the {overview.careersScanned ?? 0} most recent career saves.
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}