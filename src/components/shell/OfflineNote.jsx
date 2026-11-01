import { WifiOff } from "lucide-react";
import { retryNow, useNetState } from "@/lib/net";

/**
 * The one note for a server that stopped answering. It is small, it never blocks
 * anything, and the game carries on from the copy on this device.
 */
export default function OfflineNote() {
  const { offline, retryInMs } = useNetState();
  if (!offline) return null;

  const waiting = retryInMs > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[99] flex justify-center px-4 min-[800px]:bottom-6"
    >
      <span className="glass-thin pointer-events-auto flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[12.5px] text-label-secondary shadow-lg">
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Offline mode. Your progress is saved on this device.
        <button
          type="button"
          onClick={() => retryNow()}
          disabled={waiting}
          className="press rounded-full px-2 py-1 font-heading text-[12.5px] font-semibold text-primary disabled:opacity-45"
        >
          {waiting ? `Try again in ${Math.ceil(retryInMs / 1000)}s` : "Try again"}
        </button>
      </span>
    </div>
  );
}