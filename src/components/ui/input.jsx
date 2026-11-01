import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-inner border border-separator/80 bg-surface/70 px-3.5 py-2 font-body text-[15px] text-label shadow-[inset_0_1px_1px_rgba(15,23,42,0.03)] transition-colors duration-250 ease-spring file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-label placeholder:text-label-secondary/70 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }