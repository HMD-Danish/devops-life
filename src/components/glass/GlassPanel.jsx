import { cn } from "@/lib/utils";

/**
 * Frosted translucent panel.
 * tier: "thin" (chips, bubbles) · "regular" (cards, panels) · "thick" (sheets, bars)
 */
export default function GlassPanel({ as: Tag = "div", tier = "regular", className, children, ...props }) {
  const tone = tier === "thin" ? "glass-thin" : tier === "thick" ? "glass-thick" : "glass-panel";

  return (
    <Tag className={cn(tone, className)} {...props}>
      {children}
    </Tag>
  );
}