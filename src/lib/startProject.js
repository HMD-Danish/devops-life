import { game } from "@/lib/gameApi";
import { trackEvent } from "@/lib/gameEvents";
import { activeSteps, stepVariant } from "@/lib/projectEngine";

/**
 * Builds the rows a new career needs — tickets for the steps this level plays,
 * the project's services and its starting inventory. Nothing is written here:
 * the payload goes to the server, which owns the save id and the player it
 * belongs to.
 */
export function buildProjectSeed({ project, difficulty, playerName }) {
  const level = difficulty || "medium";

  // The server stamps the real open time and deadline; nothing here computes time.
  const tickets = activeSteps(project, level).map((step, index) => {
    const position = project.steps.findIndex((item) => item.key === step.key);
    const key = step.ticket.key || `${project.ticketPrefix}-${101 + position}`;
    return {
      step_key: step.key,
      key,
      title: step.ticket.title,
      priority: step.ticket.priority || "P3",
      status: index === 0 ? "in_progress" : "open",
      assignee: playerName,
      reporter: step.author || "Team",
    };
  });

  const services = project.services.map((service) => ({
    name: service.name,
    kind: service.kind,
    health: service.health,
    replicas: service.replicas,
    version: service.version,
    last_deploy: service.last_deploy,
  }));

  // A project may bring its own inventory; otherwise it gets the two defaults.
  const resourceSeed = project.resources || [
    {
      name: project.key === "k8s-rollout" ? "prod-eks" : "bastion-sg",
      kind: project.key === "k8s-rollout" ? "cluster" : "load_balancer",
    },
    {
      name: project.services.find((s) => s.kind === "database")?.name || "app-db",
      kind: "database",
      instance_size: "db.r6g.large",
    },
  ];

  const resources = resourceSeed.map((resource) => ({ ...resource }));

  return { tickets, services, resources };
}

/** Moves the save onto a project without touching anything else. */
export async function attachProject(save, project, playerName) {
  const data = await game("career.attach", {
    saveId: save?.id,
    projectKey: project.key,
    projectTitle: project.title,
    playerName,
  });
  if (data?.save) {
    trackEvent("project_started", { projectId: project.key, difficulty: save?.difficulty || "medium" });
  }
  return data?.save || null;
}