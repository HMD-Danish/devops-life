import { MessageSquare } from "lucide-react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cn } from "@/lib/utils";

/** Header chip: available on every screen, next to the theme toggle. */
export default function FeedbackButton({ className }) {
  const { openFeedback } = useFeedback();

  return (
    <button
      type="button"
      onClick={() => openFeedback()}
      aria-label="Give feedback"
      data-tour="feedback"
      className={cn(
        "press glass-thin flex h-9 w-9 items-center justify-center gap-2 rounded-full px-0 text-[13px] font-medium text-label-secondary hover:text-label",
        "min-[900px]:w-auto min-[900px]:px-3.5",
        className
      )}
    >
      <MessageSquare className="h-4 w-4 shrink-0" />
      <span className="hidden min-[900px]:inline">Feedback</span>
    </button>
  );
}