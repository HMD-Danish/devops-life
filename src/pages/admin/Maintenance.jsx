import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminError from "@/components/admin/AdminError";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import ConfirmDialog from "@/components/shell/ConfirmDialog";
import MaintenanceConfirmDialog from "@/components/admin/maintenance/MaintenanceConfirmDialog";
import MaintenanceHistory from "@/components/admin/maintenance/MaintenanceHistory";
import MaintenanceStatusCard from "@/components/admin/maintenance/MaintenanceStatusCard";
import { adminCall } from "@/lib/adminApi";
import { invalidateAdmin, useAdminResource } from "@/lib/adminStore";
import { enterTestMode } from "@/lib/testMode";

/** Maintenance mode, its history, and the door into the test environment. */
export default function AdminMaintenance() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAdminResource("maintenance.status");
  const [askOn, setAskOn] = useState(false);
  const [askOff, setAskOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async (next = "") => {
    setHistoryLoading(true);
    try {
      const result = await adminCall("maintenance.history", next ? { cursor: next } : {});
      setRows((prev) => (next ? [...prev, ...(result.rows || [])] : result.rows || []));
      setCursor(result.next_cursor || "");
      setHasMore(!!result.has_more);
    } catch {
      if (!next) setRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const status = data?.status || null;

  const settle = async () => {
    invalidateAdmin("maintenance");
    await reload();
    await loadHistory();
  };

  const turnOn = async (form) => {
    setBusy(true);
    setProblem("");
    try {
      await adminCall("maintenance.on", form);
      setAskOn(false);
      await settle();
    } catch (err) {
      setProblem(err?.message || "Maintenance could not be turned on.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await adminCall("maintenance.off");
      setAskOff(false);
      await settle();
    } finally {
      setBusy(false);
    }
  };

  const openTest = async () => {
    setBusy(true);
    setProblem("");
    try {
      const result = await adminCall("test.start");
      enterTestMode(result.token);
      navigate("/admin/test");
    } catch (err) {
      setProblem(err?.message || "The test environment could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <AdminError message={error} onRetry={reload} />;
  if (loading && !data) return <AdminSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="type-large-title text-[26px] sm:text-[30px]">Maintenance</h1>
        <p className="type-caption mt-1">One switch closes the app for players. Nothing is lost while it is on.</p>
      </div>

      <MaintenanceStatusCard
        status={status}
        busy={busy}
        onToggle={() => (status?.maintenanceOn ? setAskOff(true) : setAskOn(true))}
        onTest={openTest}
      />

      {problem ? <p className="type-caption text-[12px] text-danger">{problem}</p> : null}

      <MaintenanceHistory
        rows={rows}
        hasMore={hasMore}
        loading={historyLoading}
        onMore={() => loadHistory(cursor)}
      />

      <MaintenanceConfirmDialog
        open={askOn}
        busy={busy}
        error={problem}
        onCancel={() => {
          setAskOn(false);
          setProblem("");
        }}
        onConfirm={turnOn}
      />

      <ConfirmDialog
        open={askOff}
        title="Open the app to players again?"
        body="Maintenance ends now. The message players saw is cleared, their 5-day retention is pushed out by the length of the window, and test data is deleted."
        confirmLabel="Turn off"
        cancelLabel="Cancel"
        onConfirm={turnOff}
        onCancel={() => setAskOff(false)}
      />
    </div>
  );
}