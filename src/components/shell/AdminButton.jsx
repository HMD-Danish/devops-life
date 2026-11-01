import { Shield } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAdminGate } from "@/components/admin/AdminGateProvider";
import { cn } from "@/lib/utils";

/**
 * The quiet way into the restricted area: a small ghost item at the end of the
 * header cluster, 12px muted grey with a tiny shield and no fill or glow.
 * It is mounted by the name page only — every other screen renders nothing.
 */
export default function AdminButton({ className }) {
  const { openGate } = useAdminGate();
  const { pathname } = useLocation();

  if (pathname.startsWith("/admin")) return null;

  return (
    <button
      type="button"
      onClick={openGate}
      aria-label="Admin sign in"
      className={cn(
        "press flex h-9 w-9 items-center justify-center gap-1.5 rounded-full",
        "font-heading text-[12px] font-medium leading-none text-label-secondary/70",
        "hover:text-label-secondary focus-visible:text-label-secondary",
        "min-[900px]:w-auto min-[900px]:px-2",
        className
      )}
    >
      <Shield className="h-[13px] w-[13px]" aria-hidden="true" />
      <span className="hidden min-[900px]:inline">Admin</span>
    </button>
  );
}