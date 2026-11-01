import { cn } from "@/lib/utils";

/**
 * Mobile bottom tab bar: fixed to the bottom edge, safe-area padded,
 * three equal-width tabs.
 */
export default function TabBar({ tabs, active, onSelect }) {
  return (
    <nav
      aria-label="Workspace sections"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-separator/50 bg-background/85 pt-1.5 backdrop-blur-xl backdrop-saturate-150 min-[800px]:hidden"
    >
      <div className="mx-auto flex w-full max-w-[560px] items-stretch gap-1 px-2">
        {tabs.map((tab) => {
          const current = active === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              data-tour-tab={tab.id}
              aria-current={current ? "page" : undefined}
              className={cn(
                "press flex min-h-[48px] flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-inner px-1",
                current ? "bg-primary/12 text-primary" : "text-label-secondary hover:text-label"
              )}
            >
              {Icon ? <Icon className="h-[18px] w-[18px]" /> : null}
              <span className="text-[10.5px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}