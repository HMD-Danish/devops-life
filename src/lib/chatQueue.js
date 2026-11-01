/**
 * Chat writes leave the browser one at a time, never faster than once a second,
 * so ten quick messages cannot trip the server's limiter. Retrying is not done
 * here: the network layer owns it (three tries at most, honouring a rate
 * limit's wait). Once those are spent the row is marked failed and waits on
 * screen with its own Retry button, so nothing a player typed is ever lost.
 */
const MIN_GAP_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param send     async (rows) => created rows
 * @param onStatus (localIds, status, error) => void  status: sending|failed|sent
 */
export function createChatQueue({ send, onStatus }) {
  const jobs = [];
  let draining = false;
  let lastWrite = 0;

  async function attempt(job) {
    const wait = Math.max(0, lastWrite + MIN_GAP_MS - Date.now());
    if (wait) await sleep(wait);
    lastWrite = Date.now();

    try {
      const created = await send(job.rows);
      onStatus(job.localIds, "sent");
      return created;
    } catch (err) {
      onStatus(job.localIds, "failed", err);
      return null;
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    while (jobs.length) {
      const job = jobs[0];
      try {
        job.resolve(await attempt(job));
      } catch (err) {
        job.resolve(null);
      }
      jobs.shift();
    }
    draining = false;
  }

  return {
    /** Queues one write and resolves with the created rows, or null if it failed. */
    push({ rows, localIds }) {
      onStatus(localIds, "sending");
      return new Promise((resolve) => {
        jobs.push({ rows, localIds, resolve });
        drain();
      });
    },
    size: () => jobs.length,
  };
}