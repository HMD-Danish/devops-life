import { cn } from "@/lib/utils";

/**
 * Apple segmented control. The selection pill slides between equal segments.
 */
export default function Segmented({ value, options, onChange, className, label = "Choose one", size = "regular" }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const count = Math.max(1, options.length);

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "relative flex w-full rounded-full border border-separator/70 bg-fill/70 p-1",
        size === "small" ? "h-11" : "h-[52px]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.10),0_4px_12px_-6px_rgba(15,23,42,0.28)] transition-transform duration-300 ease-spring dark:bg-white/12"
        style={{ width: `calc((100% - 8px) / ${count})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "press relative z-10 flex-1 rounded-full font-heading text-[13.5px] font-medium",
              "min-h-[44px] px-2",
              active ? "text-label" : "text-label-secondary hover:text-label"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}