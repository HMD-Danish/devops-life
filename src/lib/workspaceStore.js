import { game } from "@/lib/gameApi";

// One load per project. Panels read from here instead of each calling the API,
// and the result is reused for a minute so tab switches cost nothing.
// Every read is scoped by the server to the career save AND the project inside
// it, so tickets or services from another project can never leak in here.
const TTL = 60_000;
const cache = new Map();

function empty() {
  return { tickets: [], services: [], resources: [], at: 0 };
}

function keyFor(saveId, projectKey) {
  return `${saveId}::${projectKey || ""}`;
}

export function peek(saveId, projectKey) {
  const hit = cache.get(keyFor(saveId, projectKey));
  return hit && Date.now() - hit.at < TTL ? hit.data : null;
}

export function invalidate(saveId) {
  if (!saveId) return cache.clear();
  [...cache.keys()].forEach((key) => {
    if (key.startsWith(`${saveId}::`)) cache.delete(key);
  });
}

export async function loadWorkspace(saveId, projectKey, { force = false } = {}) {
  if (!saveId) return empty();
  const cacheKey = keyFor(saveId, projectKey);
  if (!force) {
    const hit = peek(saveId, projectKey);
    if (hit) return hit;
  }
  // A failed read throws: the caller keeps what it already has instead of
  // replacing the panels with empty lists.
  const data = await game("workspace", { saveId });
  const scoped = {
    tickets: (data.tickets || []).filter((ticket) => !projectKey || ticket.project_key === projectKey),
    services: data.services || [],
    resources: data.resources || [],
    at: Date.now(),
  };
  cache.set(cacheKey, { at: Date.now(), data: scoped });
  return scoped;
}

/** Tickets are written by one panel and read by two, so keep the cache honest. */
export function patchTickets(saveId, projectKey, tickets) {
  const cacheKey = keyFor(saveId, projectKey);
  const hit = cache.get(cacheKey);
  if (hit) cache.set(cacheKey, { at: hit.at, data: { ...hit.data, tickets } });
}