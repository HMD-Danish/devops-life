import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { LogoLoader } from "@/components/glass/Logo";
import { useMaintenanceStatus } from "@/lib/maintenanceStatus";
import MaintenanceScreen from "@/components/maintenance/MaintenanceScreen";

/** A status check can never hold the app hostage for longer than this. */
const WAIT_LIMIT_MS = 10000;

/**
 * Replaces every player screen while maintenance is on. The admin dashboard and
 * the admin test environment sit under /admin and are never covered.
 */
export default function MaintenanceGate({ children }) {
  const { ready, maintenanceOn } = useMaintenanceStatus();
  const location = useLocation();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (ready) return undefined;
    const id = setTimeout(() => setWaited(true), WAIT_LIMIT_MS);
    return () => clearTimeout(id);
  }, [ready]);

  if (location.pathname.startsWith("/admin")) return children;
  if (maintenanceOn) return <MaintenanceScreen />;
  if (!ready && !waited) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center">
        <LogoLoader size={56} />
      </div>
    );
  }
  return children;
}