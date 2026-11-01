import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { LogoLoader } from "@/components/glass/Logo";
import { Button } from "@/components/ui/button";

/** A loading screen is never allowed to outlast ten seconds without a way out. */
const TIMEOUT_MS = 10000;

/**
 * The workspace opening screen. It only appears when this device holds no copy
 * of the career; after ten seconds it hands the decision to the player instead
 * of spinning forever.
 */
export default function WorkspaceLoading({ hasLocalCopy, onRetry, onOpenOffline }) {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setExpired(true), TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  if (!expired) {
    return (
      <div className="glass-panel mx-auto flex h-64 w-full max-w-3xl flex-col items-center justify-center gap-4">
        <LogoLoader size={64} />
        <p className="type-caption">Opening the workspace</p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="glass-panel mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 py-8 text-center"
    >
      <span className="glass-thin flex h-11 w-11 items-center justify-center rounded-full">
        <WifiOff className="h-5 w-5 text-label-secondary" aria-hidden="true" />
      </span>
      <div>
        <h3 className="type-headline">Could not reach the server</h3>
        <p className="type-caption mt-1">
          {hasLocalCopy
            ? "Open offline? Your progress on this device is kept."
            : "This device has no copy of the project yet, so it needs the server once."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasLocalCopy ? (
          <Button type="button" size="sm" onClick={onOpenOffline}>
            Open offline
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    </div>
  );
}