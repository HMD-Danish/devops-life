import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { LogoLoader } from "@/components/glass/Logo";
import TestBanner from "@/components/admin/test/TestBanner";
import TestToolsDrawer from "@/components/admin/test/TestToolsDrawer";
import { adminCall } from "@/lib/adminApi";
import { checkStatus, useMaintenanceStatus } from "@/lib/maintenanceStatus";
import { enterTestMode, leaveTestMode, testToken } from "@/lib/testMode";

/**
 * /admin/test — a working copy of the player app.
 *
 * It runs only with a live admin session AND maintenance mode on, and everything
 * it writes goes to the test namespace, which is wiped the moment it is left.
 */
export default function AdminTest() {
  const navigate = useNavigate();
  const { ready, maintenanceOn } = useMaintenanceStatus();
  const [state, setState] = useState("checking");
  const [busy, setBusy] = useState(false);
  const left = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await adminCall("maintenance.status");
        if (!alive) return;
        if (data?.status?.maintenanceOn !== true) {
          setState("ended");
          return;
        }
        if (!testToken()) {
          const started = await adminCall("test.start");
          if (!started?.token) {
            setState("ended");
            return;
          }
          enterTestMode(started.token);
        }
        setState("ready");
        checkStatus();
      } catch {
        if (alive) setState("ended");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Maintenance turned off somewhere else ends the run here too.
  useEffect(() => {
    if (state !== "ready" || !ready) return;
    if (!maintenanceOn) setState("ended");
  }, [maintenanceOn, ready, state]);

  const wipe = useCallback(async () => {
    if (left.current) return;
    left.current = true;
    await adminCall("test.exit").catch(() => null);
    leaveTestMode();
  }, []);

  // Leaving the route at all wipes the test namespace.
  useEffect(() => {
    return () => {
      if (left.current) return;
      left.current = true;
      adminCall("test.exit").catch(() => null);
      leaveTestMode();
    };
  }, []);

  useEffect(() => {
    if (state !== "ended") return undefined;
    const id = setTimeout(async () => {
      await wipe();
      navigate("/admin/maintenance", { replace: true });
    }, 1800);
    return () => clearTimeout(id);
  }, [navigate, state, wipe]);

  if (state === "checking") {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LogoLoader size={52} />
          <p className="type-caption">Opening the test environment</p>
        </div>
      </div>
    );
  }

  if (state === "ended") {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center px-4">
        <div className="glass-panel max-w-[420px] p-5 text-center">
          <p className="type-headline">Maintenance ended. Leaving test environment</p>
          <p className="type-caption mt-1.5">
            The test copy only runs while maintenance mode is on. Your test data is being deleted.
          </p>
        </div>
      </div>
    );
  }

  const exit = async () => {
    setBusy(true);
    await wipe();
    navigate("/admin/maintenance", { replace: true });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="sticky top-0 z-40">
        <TestBanner onExit={exit} busy={busy} />
      </div>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
      <TestToolsDrawer />
    </div>
  );
}