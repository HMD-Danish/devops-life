import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ title = "This could not load", message, onRetry }) {
  return (
    <div className="glass-panel flex flex-col items-start gap-3 p-5" role="alert">
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <p className="type-headline text-[15px]">{title}</p>
      </div>
      <p className="type-body text-[13px] leading-relaxed text-label-secondary">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="h-11 rounded-full" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}