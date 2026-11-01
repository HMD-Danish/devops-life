import { RefreshCw } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import Logo from "@/components/glass/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Error state that always names the cause and the next action, never a bare
 * "something went wrong".
 */
export default function ErrorState({
  title = "That did not load",
  message = "The request did not reach the database.",
  fix = "Check your connection, then try again. If it keeps failing, reload the app.",
  onRetry,
  retryLabel = "Try again",
  className,
}) {
  return (
    <GlassPanel className={cn("p-6", className)} role="alert">
      <div className="flex items-start gap-3">
        <span className="glass-thin flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <Logo size={24} decorative />
        </span>
        <div className="min-w-0">
          <h3 className="type-headline">{title}</h3>
          <p className="type-body mt-1 text-[13.5px] text-label-secondary">{message}</p>
          <p className="type-body mt-2 text-[13px]">
            <span className="font-semibold">How to fix it: </span>
            <span className="text-label-secondary">{fix}</span>
          </p>
          {onRetry ? (
            <Button type="button" size="sm" variant="secondary" className="mt-3.5 gap-1.5" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> {retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </GlassPanel>
  );
}