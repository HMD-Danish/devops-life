import { FlaskConical, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The stripe across the top of the test copy. Nothing it says is a game message,
 * so it stays out of the glass design language on purpose.
 */
export default function TestBanner({ onExit, busy }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-warning/45 bg-warning/20 px-3 py-2 text-warning backdrop-blur-xl sm:px-4">
      <FlaskConical className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[10.5px] font-semibold uppercase leading-tight tracking-[0.09em] sm:text-[11.5px]">
        Test environment. Nothing here is saved to real data.
      </p>
      <Button variant="outline" className="h-9 shrink-0 rounded-full px-3 text-[12px]" onClick={onExit} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
        Exit test
      </Button>
    </div>
  );
}