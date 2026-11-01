import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import UpdateDialog from "@/components/admin/release/UpdateDialog";
import { invalidateAdmin, useAdminResource } from "@/lib/adminStore";
import { BASE_VERSION, OPEN_UPDATE_EVENT, RELEASE_EVENT } from "@/lib/releases";
import { cn } from "@/lib/utils";

/**
 * The live version pill and the Update button, side by side. Used in the admin
 * top bar and on the Overview page; both read the same cached answer.
 *
 * `listen` is set on the top bar instance only, so a page empty state can ask
 * for the dialog without a second one opening next to it.
 */
export default function UpdateControl({ className, listen = false }) {
  const { data, reload } = useAdminResource("release.current", {});
  const [open, setOpen] = useState(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const refresh = () => reloadRef.current();
    window.addEventListener(RELEASE_EVENT, refresh);
    return () => window.removeEventListener(RELEASE_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!listen) return undefined;
    const openIt = () => setOpen(true);
    window.addEventListener(OPEN_UPDATE_EVENT, openIt);
    return () => window.removeEventListener(OPEN_UPDATE_EVENT, openIt);
  }, [listen]);

  const live = data?.currentVersion || BASE_VERSION;

  const changed = () => {
    invalidateAdmin("release");
    window.dispatchEvent(new Event(RELEASE_EVENT));
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <span className="hidden whitespace-nowrap rounded-full bg-fill/70 px-2.5 py-1 text-[11.5px] font-medium text-label-secondary sm:inline-block">
        Live: v{live}
      </span>
      <Button size="sm" className="h-10 rounded-full px-3" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Update</span>
      </Button>

      {open ? (
        <UpdateDialog
          live={live}
          versions={data?.versions || []}
          onClose={() => setOpen(false)}
          onChanged={changed}
        />
      ) : null}
    </div>
  );
}