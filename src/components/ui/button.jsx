import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-heading text-[15px] font-medium tracking-[-0.01em] press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.12),0_8px_20px_-10px_rgba(0,102,230,0.55)] hover:brightness-105",
        destructive:
          "bg-danger text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:brightness-105",
        outline:
          "border border-separator bg-surface/60 text-label backdrop-blur-xl hover:bg-surface/85",
        secondary:
          "border border-white/40 bg-fill/80 text-label backdrop-blur-xl hover:bg-fill",
        ghost: "text-label hover:bg-fill/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-11 px-4 text-[13.5px]",
        lg: "h-12 px-6 text-[16px]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }