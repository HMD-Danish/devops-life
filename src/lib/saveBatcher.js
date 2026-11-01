// Career saves leave the browser in batches.
//
// A step completion, a chat reply, a hint and a heartbeat all touch the same
// row, so they are merged and written once. Nothing is written more than once
// every half minute, and a forced flush (step complete, leaving the page) goes
// out immediately. A failed write is put back and retried on the next flush.
const MIN_GAP_MS = 30000;

export function createSaveBatcher({ write, minGapMs = MIN_GAP_MS }) {
  let pending = {};
  let timer = 0;
  let lastWrite = 0;

  const send = async () => {
    timer = 0;
    const fields = pending;
    pending = {};
    if (!Object.keys(fields).length) return;
    lastWrite = Date.now();
    try {
      await write(fields);
    } catch {
      pending = { ...fields, ...pending };
    }
  };

  const schedule = (delay) => {
    if (timer) return;
    timer = window.setTimeout(send, Math.max(0, delay));
  };

  /** Merges fields in and hands them over on the next slot. */
  const queue = (fields) => {
    if (!fields || !Object.keys(fields).length) return;
    pending = { ...pending, ...fields };
    schedule(minGapMs - (Date.now() - lastWrite));
  };

  /** Writes whatever is waiting right now. */
  const flush = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    if (!Object.keys(pending).length) return Promise.resolve();
    return send();
  };

  const hasPending = () => Object.keys(pending).length > 0;

  return { queue, flush, hasPending };
}