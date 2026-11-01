import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import Logo from "@/components/glass/Logo";
import { Button } from "@/components/ui/button";
import { checkStatus, useMaintenanceStatus } from "@/lib/maintenanceStatus";

const COOLDOWN_MS = 30000;

const localTime = (iso) => {
  const at = new Date(iso || "");
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** The one screen a player sees while the app is closed. No game content at all. */
export default function MaintenanceScreen() {
  const { reason, expectedBackAt, startedAt } = useMaintenanceStatus();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setInterval(() => setWait((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(id);
  }, [wait]);

  const again = async () => {
    if (busy || wait > 0) return;
    setBusy(true);
    await checkStatus();
    setBusy(false);
    setWait(COOLDOWN_MS / 1000);
  };

  const started = localTime(startedAt);
  const back = localTime(expectedBackAt);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center px-4 py-10">
        <span className="logo-glass-ring mb-6 p-4">
          <Logo size={72} />
        </span>

        <p className="type-overline text-center">Maintenance</p>
        <h1 className="type-large-title mt-2 text-center text-[28px] sm:text-[34px]">We will be right back</h1>

        <div className="glass-panel mt-6 w-full max-w-[520px] p-5">
          <p className="type-body whitespace-pre-line text-[14px]">
            {reason || "The app is being updated for a few minutes."}
          </p>

          <dl className="mt-4 space-y-1.5">
            {started ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="type-caption">Started</dt>
                <dd className="text-[12.5px] font-medium tabular-nums">{started}</dd>
              </div>
            ) : null}
            {back ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="type-caption">Expected back</dt>
                <dd className="text-[12.5px] font-medium tabular-nums">{back}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button className="h-11 rounded-full sm:min-w-[150px]" onClick={again} disabled={busy || wait > 0}>
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              {wait > 0 ? `Check again in ${wait}s` : "Check again"}
            </Button>
            <p className="type-caption text-[11px]">
              Your progress is saved. Nothing is lost while the app is closed.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}