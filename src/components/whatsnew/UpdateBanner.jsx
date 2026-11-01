import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A small bar for a player already inside the app when an update landed.
 * An important release asks to be refreshed, so it cannot be pushed aside.
 */
export default function UpdateBanner({ version, sticky, onSee, onRefresh }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-2">
      <div className="glass-thick pointer-events-auto flex w-full max-w-[600px] items-center gap-2.5 rounded-full py-1.5 pl-3.5 pr-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-label">
          A new version is available (v{version})
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 rounded-full px-3 text-[12.5px]"
          onClick={onSee}
        >
          See what&apos;s new
        </Button>
        <Button size="sm" className="h-8 shrink-0 rounded-full px-3 text-[12.5px]" onClick={onRefresh}>
          {sticky ? "Refresh now" : "Refresh"}
        </Button>
      </div>
    </div>
  );
}