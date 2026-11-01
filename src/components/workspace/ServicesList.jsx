import { useState } from "react";
import WorkspaceSection from "@/components/workspace/WorkspaceSection";
import { cn } from "@/lib/utils";

const HEALTH = {
  healthy: { dot: "bg-success", label: "healthy" },
  degraded: { dot: "bg-warning", label: "degraded" },
  down: { dot: "bg-danger", label: "down" },
};

const PREVIEW = 3;

export default function ServicesList({ services }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? services : services.slice(0, PREVIEW);

  return (
    <WorkspaceSection title="Services" count={services.length}>
      <div className="space-y-3">
        {services.length === 0 ? <p className="type-caption">No services registered for this project.</p> : null}

        {visible.map((service) => {
          const health = HEALTH[service.health] || HEALTH.degraded;
          return (
            <div key={service.id} className="flex items-start gap-2.5">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", health.dot)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="terminal-font truncate text-[12.5px] font-medium">{service.name}</span>
                  <span className="type-caption ml-auto shrink-0 text-[10.5px]">{health.label}</span>
                </div>
                <p className="type-caption mt-0.5 text-[10.5px]">
                  {service.replicas} {Number(service.replicas) === 1 ? "instance" : "replicas"} · v{service.version}
                  {service.last_deploy ? ` · deployed ${service.last_deploy}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {services.length > PREVIEW ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="press mt-2 inline-flex min-h-[36px] items-center text-[12px] font-medium text-primary"
        >
          {showAll ? "Show less" : `View all ${services.length}`}
        </button>
      ) : null}
    </WorkspaceSection>
  );
}