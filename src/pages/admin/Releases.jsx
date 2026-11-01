import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, MoreHorizontal, PencilLine, RefreshCw, RotateCcw, Trash2, Undo2 } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import ConfirmDialog from "@/components/shell/ConfirmDialog";
import ReleaseViewDialog from "@/components/admin/release/ReleaseViewDialog";
import ReleaseEditDialog from "@/components/admin/release/ReleaseEditDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminCall } from "@/lib/adminApi";
import { invalidateAdmin, useAdminResource } from "@/lib/adminStore";
import { BASE_VERSION, RELEASE_EVENT, openUpdateModal, releaseDateLabel } from "@/lib/releases";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  published: "bg-success/12 text-success",
  draft: "bg-fill/80 text-label-secondary",
};

/** Every release ever written, newest first, 25 at a time. */
export default function AdminReleases() {
  const live = useAdminResource("release.current", {});
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef(null);

  const loadRows = useCallback(async (next = "") => {
    setLoading(true);
    try {
      const result = await adminCall("release.list", next ? { cursor: next } : {});
      setRows((prev) => (next ? [...prev, ...(result.rows || [])] : result.rows || []));
      setCursor(result.next_cursor || "");
      setHasMore(!!result.has_more);
      setProblem("");
    } catch (error) {
      if (!next) setRows([]);
      setProblem(error?.message || "The releases could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Publishing happens in the top bar's Update dialog, so this page listens for
  // it and reloads itself the moment a release goes live.
  useEffect(() => {
    const onChanged = () => {
      loadRows();
      liveRef.current?.();
    };
    window.addEventListener(RELEASE_EVENT, onChanged);
    return () => window.removeEventListener(RELEASE_EVENT, onChanged);
  }, [loadRows]);

  // The listener above does the reloading, so one event means one fetch.
  const refresh = useCallback(() => {
    invalidateAdmin("release");
    window.dispatchEvent(new Event(RELEASE_EVENT));
  }, []);

  const run = async (action, row) => {
    setBusy(true);
    setProblem("");
    try {
      await adminCall(action, { id: row.id });
      await refresh();
    } catch (error) {
      setProblem(error?.message || "That could not be completed.");
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  liveRef.current = live.reload;
  const liveVersion = live.data?.currentVersion || BASE_VERSION;

  const asked = ask?.kind === "unpublish"
    ? {
        title: `Unpublish v${ask.row.version}?`,
        body: "The live version falls back to the highest release still published.",
        confirm: "Unpublish",
        tone: "danger",
        run: () => run("release.unpublish", ask.row),
      }
    : ask?.kind === "delete"
      ? {
          title: `Delete the draft v${ask.row.version}?`,
          body: "A draft was never shown to anyone. This cannot be undone.",
          confirm: "Delete",
          tone: "danger",
          run: () => run("release.delete", ask.row),
        }
      : ask?.kind === "reset"
        ? {
            title: `Show v${ask.row.version} again to everyone?`,
            body: "Every player sees the popup once more, and the seen count restarts.",
            confirm: "Show again",
            tone: "default",
            run: () => run("release.resetSeen", ask.row),
          }
        : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="type-large-title text-[26px] sm:text-[30px]">Releases</h1>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 rounded-full"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
        </div>
        <p className="type-caption mt-1">
          Live version v{liveVersion}. The highest published release is always the live one.
        </p>
      </div>

      {problem ? <p className="text-[12.5px] font-medium text-danger">{problem}</p> : null}
      {loading && !rows.length ? <AdminSkeleton rows={4} /> : null}

      {!loading && !rows.length && !problem ? (
        <GlassPanel className="p-6 text-center">
          <p className="type-headline text-[15px]">No releases yet.</p>
          <p className="type-caption mt-1">Use Update in the top bar to publish the first one.</p>
          <div className="mt-4 flex justify-center">
            <Button className="rounded-full" onClick={openUpdateModal}>
              Publish first update
            </Button>
          </div>
        </GlassPanel>
      ) : null}

      {rows.length ? (
        <GlassPanel className="overflow-hidden">
          <div className="hidden grid-cols-[96px_1fr_120px_92px_70px_44px] items-center gap-2 border-b border-separator/60 px-4 py-2 lg:grid">
            <span className="type-overline text-[9.5px]">Version</span>
            <span className="type-overline text-[9.5px]">Title</span>
            <span className="type-overline text-[9.5px]">Date</span>
            <span className="type-overline text-[9.5px]">Status</span>
            <span className="type-overline text-right text-[9.5px]">Seen</span>
            <span className="sr-only">Actions</span>
          </div>

          <ul className="divide-y divide-separator/50">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3 lg:grid lg:grid-cols-[96px_1fr_120px_92px_70px_44px] lg:items-center lg:gap-2">
                <div className="flex items-center justify-between gap-2 lg:block">
                  <span className="terminal-font text-[13px] font-medium">v{row.version}</span>
                  <span className="flex items-center gap-2 lg:hidden">
                    <StatusBadge status={row.status} />
                    <ActionsMenu row={row} busy={busy} onView={setViewing} onEdit={setEditing} onAsk={setAsk} />
                  </span>
                </div>
                <p className="mt-1 truncate text-[13.5px] text-label lg:mt-0">{row.title}</p>
                <p className="type-caption text-[11.5px] lg:hidden">{releaseDateLabel(row.publishedAt || row.releaseDate)}</p>
                <p className="type-caption hidden text-[11.5px] lg:block">
                  {releaseDateLabel(row.publishedAt || row.releaseDate)}
                </p>
                <span className="hidden lg:block">
                  <StatusBadge status={row.status} />
                </span>
                <p className="type-caption hidden text-right text-[11.5px] tabular-nums lg:block">{row.seenCount}</p>
                <span className="hidden lg:flex lg:justify-end">
                  <ActionsMenu row={row} busy={busy} onView={setViewing} onEdit={setEditing} onAsk={setAsk} />
                </span>
              </li>
            ))}
          </ul>
        </GlassPanel>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="secondary" className="rounded-full" onClick={() => loadRows(cursor)} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

      {viewing ? <ReleaseViewDialog release={viewing} onClose={() => setViewing(null)} /> : null}
      {editing ? (
        <ReleaseEditDialog release={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      ) : null}

      <ConfirmDialog
        open={!!asked}
        title={asked?.title || ""}
        body={asked?.body || ""}
        confirmLabel={asked?.confirm || "Continue"}
        cancelLabel="Stay"
        tone={asked?.tone || "default"}
        onConfirm={() => asked?.run()}
        onCancel={() => setAsk(null)}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em]", STATUS_TONE[status])}>
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}

function ActionsMenu({ row, busy, onView, onEdit, onAsk }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for v${row.version}`}
          className="press flex h-9 w-9 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-thick w-52 border-white/50 p-1.5">
        <DropdownMenuItem className="min-h-[40px] gap-2 rounded-inner text-[13px]" onClick={() => onView(row)}>
          <Eye className="h-4 w-4" aria-hidden="true" /> View
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-[40px] gap-2 rounded-inner text-[13px]" onClick={() => onEdit(row)}>
          <PencilLine className="h-4 w-4" aria-hidden="true" /> Edit notes
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[40px] gap-2 rounded-inner text-[13px]"
          disabled={busy}
          onClick={() => onAsk({ kind: "reset", row })}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Show again to all players
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-separator/70" />
        {row.status === "published" ? (
          <DropdownMenuItem
            className="min-h-[40px] gap-2 rounded-inner text-[13px] text-danger"
            disabled={busy}
            onClick={() => onAsk({ kind: "unpublish", row })}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" /> Unpublish
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="min-h-[40px] gap-2 rounded-inner text-[13px] text-danger"
            disabled={busy}
            onClick={() => onAsk({ kind: "delete", row })}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete draft
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}