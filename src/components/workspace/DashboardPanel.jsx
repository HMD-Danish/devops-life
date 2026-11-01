import ProgressCard from "@/components/workspace/ProgressCard";
import TicketList from "@/components/workspace/TicketList";
import ServicesList from "@/components/workspace/ServicesList";
import ProjectPanels from "@/components/workspace/ProjectPanels";
import { currentBuild, currentRuntime, openIncidentCount } from "@/lib/projectEngine";

export default function DashboardPanel({
  project,
  save,
  step,
  tickets,
  services,
  now,
  awayMs = 0,
  progress,
  hintsUsed,
  difficulty,
  score,
  trust = 100,
}) {
  // Only the ticket on the step being worked can show a countdown.
  const live = tickets.find(
    (ticket) => ticket.step_key === step?.key && ticket.status !== "resolved" && ticket.status !== "closed"
  );

  return (
    <div className="space-y-4">
      <ProgressCard
        step={step}
        progress={progress}
        score={score}
        hintsUsed={hintsUsed}
        trust={trust}
        difficulty={difficulty}
      />
      <TicketList tickets={tickets} now={now} currentStepKey={step?.key} />
      <ServicesList services={services} />
      <ProjectPanels
        project={project}
        build={currentBuild(project, save)}
        runtime={currentRuntime(project, save)}
        incidents={openIncidentCount(project, save) ? project.incidents : []}
        countdown={live ? { ticket: live, now, awayMs } : null}
      />
    </div>
  );
}