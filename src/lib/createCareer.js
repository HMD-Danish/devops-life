import { buildProjectSeed } from "@/lib/startProject";
import { game } from "@/lib/gameApi";
import { trackEvent } from "@/lib/gameEvents";

/**
 * A career is the player's own save plus the project they are working on.
 * The server creates the save and its tickets, services and inventory in one
 * call, attached to the session — the browser never picks a save id, and the
 * real start time and deadlines are stamped server-side.
 */
export async function createCareer({ playerName, project, difficulty }) {
  const seed = buildProjectSeed({
    project,
    difficulty: difficulty || "medium",
    playerName,
  });

  const data = await game("career.create", {
    projectKey: project.key,
    projectTitle: project.title,
    difficulty: difficulty || "medium",
    ...seed,
  });

  const save = data?.save || null;
  if (save) {
    const level = difficulty || "medium";
    trackEvent("career_started", { projectId: project.key, difficulty: level });
    trackEvent("project_started", { projectId: project.key, difficulty: level });
  }
  return save;
}