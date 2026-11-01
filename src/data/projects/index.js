import docker from "./docker";
import kubernetes from "./kubernetes";
import incident from "./incident";
import release from "./release";
import terraform from "./terraform";
import ansible from "./ansible";
import monitoring from "./monitoring";
import gitopsDelivery from "./gitops-delivery";
import platformLockdown from "./platform-lockdown";
import scaleSpike from "./scale-spike";

export const PROJECTS = [
  docker,
  kubernetes,
  incident,
  release,
  terraform,
  ansible,
  monitoring,
  gitopsDelivery,
  platformLockdown,
  scaleSpike,
];

export function getProject(key) {
  return PROJECTS.find((project) => project.key === key) || null;
}

export function projectTitle(key) {
  return getProject(key)?.title || "No project";
}