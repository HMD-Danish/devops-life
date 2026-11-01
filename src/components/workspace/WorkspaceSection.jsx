import { useState } from "react";
import { ChevronDown } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import { cn } from "@/lib/utils";

/**
 * A dashboard card whose body collapses, so the left column stays scannable.
 */
export default function WorkspaceSection({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <GlassPanel className="p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="press -m-1 flex min-h-[40px] w-[calc(100%+8px)] items-center gap-2 rounded-inner p-1 text-left"
      >
        <h2 className="type-overline">{title}</h2>
        {typeof count === "number" ? (
          <span className="rounded-full bg-fill/90 px-1.5 text-[10.5px] font-semibold tabular-nums text-label-secondary">
            {count}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-label-secondary transition-transform duration-300 ease-spring",
            open ? "rotate-180" : null
          )}
        />
      </button>

      {open ? <div className="mt-2">{children}</div> : null}
    </GlassPanel>
  );
}