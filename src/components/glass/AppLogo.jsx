import { Link } from "react-router-dom";
import Logo from "@/components/glass/Logo";
import { cn } from "@/lib/utils";

/**
 * Header lockup: the 40px mark plus the product name, 12px apart. `onNavigate`
 * takes over the click so the caller can confirm before leaving a screen.
 */
export default function AppLogo({
  className,
  showWordmark = true,
  to = "/",
  onNavigate,
  hideWordmarkOnMobile = false,
}) {
  return (
    <Link
      to={to}
      onClick={
        onNavigate
          ? (event) => {
              event.preventDefault();
              onNavigate();
            }
          : undefined
      }
      aria-label="DevOps Life — home"
      className={cn("inline-flex items-center gap-3 rounded-full", className)}
    >
      <Logo size={40} />
      {showWordmark ? (
        <span
          className={cn(
            "type-headline text-[17px] tracking-[-0.02em]",
            hideWordmarkOnMobile && "hidden sm:inline"
          )}
        >
          DevOps Life
        </span>
      ) : null}
    </Link>
  );
}