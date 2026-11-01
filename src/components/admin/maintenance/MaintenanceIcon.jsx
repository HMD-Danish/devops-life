import { Shield, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/** The shield-and-wrench mark the Maintenance section uses in the sidebar. */
export default function MaintenanceIcon({ className }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} aria-hidden="true">
      <Shield className="h-full w-full" />
      <Wrench className="absolute -bottom-0.5 -right-0.5 h-[54%] w-[54%]" />
    </span>
  );
}