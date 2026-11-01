import { BookOpen, HelpCircle, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { useWhatsNew } from "@/components/whatsnew/WhatsNewProvider";
import { cn } from "@/lib/utils";

/** The help menu: replay the tour, and read every release note. */
export default function TutorialHelpButton({ className }) {
  const { start, active } = useTutorial();
  const { openNotes, unseen } = useWhatsNew();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Help"
        title="Help"
        className={cn(
          "press glass-thin relative flex h-9 w-9 items-center justify-center rounded-full text-label-secondary hover:text-label",
          className
        )}
      >
        <HelpCircle className="h-[18px] w-[18px]" aria-hidden="true" />
        {unseen ? (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger"
            aria-label="New release notes"
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-thick w-52 border-white/50 p-1.5">
        <DropdownMenuItem
          className="min-h-[44px] gap-2 rounded-inner"
          disabled={active}
          onClick={start}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Replay tutorial
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-[44px] gap-2 rounded-inner" onClick={openNotes}>
          <BookOpen className="h-4 w-4" aria-hidden="true" /> Release notes
          {unseen ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}