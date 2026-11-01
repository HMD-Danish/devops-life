import { BookOpen, Ellipsis, HelpCircle, MessageSquare, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { useWhatsNew } from "@/components/whatsnew/WhatsNewProvider";
import { useTheme } from "@/lib/ThemeContext";
import { cn } from "@/lib/utils";

/**
 * Mobile workspace overflow. Under 900px the header keeps only the back control,
 * the logo and the account pill, so appearance and feedback live in here.
 * No admin control is ever part of this menu.
 */
export default function MoreMenu({ className }) {
  const { theme, toggleTheme } = useTheme();
  const { openFeedback } = useFeedback();
  const { start: startTutorial } = useTutorial();
  const { openNotes, unseen } = useWhatsNew();
  const isDark = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More"
        data-tour="feedback"
        className={cn(
          "press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-secondary hover:text-label",
          className
        )}
      >
        <Ellipsis className="h-5 w-5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-thick w-52 border-white/50 p-1.5">
        <DropdownMenuItem className="min-h-[44px] gap-2 rounded-inner" onClick={toggleTheme}>
          {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          {isDark ? "Light appearance" : "Dark appearance"}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-[44px] gap-2 rounded-inner" onClick={() => openFeedback()}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" /> Feedback
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-[44px] gap-2 rounded-inner" onClick={startTutorial}>
          <HelpCircle className="h-4 w-4" aria-hidden="true" /> Replay tutorial
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-[44px] gap-2 rounded-inner" onClick={openNotes}>
          <BookOpen className="h-4 w-4" aria-hidden="true" /> Release notes
          {unseen ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}