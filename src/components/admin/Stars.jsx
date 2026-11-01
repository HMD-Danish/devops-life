import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Stars({ value = 0, className }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={value ? `${value} out of 5 stars` : "No rating given"}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cn("h-3.5 w-3.5", star <= value ? "fill-current text-primary" : "text-label-secondary/30")}
        />
      ))}
    </span>
  );
}