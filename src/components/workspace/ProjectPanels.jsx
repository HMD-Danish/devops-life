import GlassPanel from "@/components/glass/GlassPanel";
import IncidentCountdown from "@/components/workspace/IncidentCountdown";
import { cn } from "@/lib/utils";

function Sparkline({ points }) {
  const max = Math.max(...points, 1);
  return (
    <div className="flex h-14 items-end gap-1" aria-hidden="true">
      {points.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-t-[3px] bg-primary/45 transition-[height] duration-350 ease-spring"
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default function ProjectPanels({ project, build, runtime, incidents, countdown }) {
  return (
    <div className="space-y-3">
      {incidents?.length ? (
        <GlassPanel className="p-4">
          <h2 className="type-overline">Open incidents</h2>
          <div className="mt-2.5 space-y-2">
            {incidents.map((incident, index) => (
              <div key={incident.id} className="rounded-inner border border-danger/20 bg-danger/[0.08] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="terminal-font text-[11px] text-danger">{incident.id}</span>
                  <span className="rounded-full bg-danger/18 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">
                    {incident.severity}
                  </span>
                </div>
                <p className="type-headline mt-1.5 text-[12.5px] leading-snug">{incident.title}</p>
                <p className="type-caption mt-1 text-[10.5px]">opened {incident.opened}</p>
                {index === 0 && countdown ? (
                  <IncidentCountdown
                    ticket={countdown.ticket}
                    now={countdown.now}
                    awayMs={countdown.awayMs}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      {build ? (
        <GlassPanel className="p-4">
          <h2 className="type-overline">Last build</h2>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="terminal-font text-[13px] font-semibold">#{build.number}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                build.status === "passing" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
              )}
            >
              {build.status}
            </span>
            <span className="type-caption ml-auto text-[10.5px]">{build.branch}</span>
          </div>
          <p className="type-caption mt-1.5 text-[11.5px]">{build.detail}</p>
        </GlassPanel>
      ) : null}

      {runtime?.items?.length ? (
        <GlassPanel className="p-4">
          <h2 className="type-overline">{runtime.label}</h2>
          <div className="mt-2.5 space-y-2">
            {runtime.items.map((item) => (
              <div key={item.name} className="flex items-baseline justify-between gap-3">
                <span className="terminal-font text-[11.5px]">{item.name}</span>
                <span className="type-caption truncate text-[10.5px]">{item.detail}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      {project?.chart?.points?.length ? (
        <GlassPanel className="p-4">
          <h2 className="type-overline">{project.chart.title}</h2>
          <div className="mt-3">
            <Sparkline points={project.chart.points} />
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}