import { KeyRound, ServerCog } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import AdminError from "@/components/admin/AdminError";
import RequestMeter from "@/components/admin/RequestMeter";
import { useAdminResource } from "@/lib/adminStore";

const when = (iso) => {
  if (!iso) return "Not recorded yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not recorded yet";
  return date.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function AdminSettings() {
  const { data, loading, error, reload } = useAdminResource("settings");

  if (error) return <AdminError message={error} onRetry={reload} />;
  if (loading && !data) return <AdminSkeleton rows={2} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="type-large-title text-[26px] sm:text-[30px]">Settings</h1>
        <p className="type-caption mt-1">Read-only. Nothing here changes the password.</p>
      </div>

      <GlassPanel className="p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="type-overline">Password</p>
        </div>
        <p className="type-body mt-2 text-[13.5px]">Change the password in the app secrets (ADMIN_PASSCODE).</p>
        <p className="type-caption mt-1.5">
          It is read only on the server and never stored in the app's code or database.
        </p>
      </GlassPanel>

      <GlassPanel className="p-4">
        <div className="flex items-center gap-2">
          <ServerCog className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="type-overline">App</p>
        </div>
        <dl className="mt-3 divide-y divide-separator/60">
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[13px] text-label-secondary">App version</dt>
            <dd className="text-[13px] font-medium tabular-nums">{data?.version || "1.0.0"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[13px] text-label-secondary">Last cleanup run</dt>
            <dd className="text-right text-[13px] font-medium">{when(data?.last_cleanup_at)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[13px] text-label-secondary">Feedback tickets stored</dt>
            <dd className="text-[13px] font-medium tabular-nums">{data?.feedback_total ?? 0}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-[13px] text-label-secondary">Admin session</dt>
            <dd className="text-[13px] font-medium">Ends after 2 hours idle</dd>
          </div>
        </dl>
        <p className="type-caption mt-2 text-[11px]">
          The hourly cleanup deletes any player whose five days are up and drops security events older than 30 days.
        </p>
      </GlassPanel>

      <RequestMeter />
    </div>
  );
}