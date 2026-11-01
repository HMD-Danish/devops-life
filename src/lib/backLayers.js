import { useEffect, useRef } from "react";

/**
 * Open overlays (sheets, dialogs, detail views) push a close function here.
 * Back looks at the top of the stack first, exactly like Close would.
 */
const stack = [];

export function runBackLayer() {
  const close = stack[stack.length - 1];
  if (typeof close !== "function") return false;
  close();
  return true;
}

/** Registers a close function while `active` is true. */
export function useBackLayer(active, close) {
  const latest = useRef(close);
  latest.current = close;

  useEffect(() => {
    if (!active) return undefined;
    const fn = () => latest.current?.();
    stack.push(fn);
    return () => {
      const index = stack.lastIndexOf(fn);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [active]);
}