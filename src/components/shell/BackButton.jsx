import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { runBackLayer } from "@/lib/backLayers";
import { cn } from "@/lib/utils";

/**
 * The app's one Back control. An open sheet, dialog or detail view closes
 * first; otherwise it walks to the previous screen with a real route.
 */
export default function BackButton({ to, onClick, className, insideOverlay = false }) {
  const navigate = useNavigate();

  const go = () => {
    if (!insideOverlay && runBackLayer()) return;
    if (onClick) return onClick();
    if (to) navigate(to, { replace: true });
    return undefined;
  };

  return (
    <button
      type="button"
      onClick={go}
      aria-label="Go back"
      className={cn(
        "press glass-thin inline-flex h-9 min-w-[36px] shrink-0 items-center gap-1 rounded-full pl-1.5 pr-3 font-heading text-[13px] font-medium text-label-secondary hover:text-label",
        className
      )}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  );
}