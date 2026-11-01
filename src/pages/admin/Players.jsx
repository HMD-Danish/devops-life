import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Loader2, Search, Trash2, Users, X } from "lucide-react";
import AdminEmpty from "@/components/admin/AdminEmpty";
import AdminError from "@/components/admin/AdminError";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import BackButton from "@/components/shell/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminCall } from "@/lib/adminApi";
import { useBackLayer } from "@/lib/backLayers";
import { activeSteps } from "@/lib/projectEngine";
import { getProject } from "@/data/projects";

const when = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const levelLabel = (level) => (level ? level[0].toUpperCase() + level.slice(1) : "No level");

export default function AdminPlayers() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [opened, setOpened] = useState(null);
  const [progress, setProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);

  // Back closes the progress panel and leaves the list and its filters as they were.
  useBackLayer(!!opened, () => setOpened(null));

  useEffect(() => {
    if (!opened) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpened(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opened]);

  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const filters = useMemo(() => ({ search: term }), [term]);

  const load = useCallback(
    async (nextCursor = "") => {
      setLoading(true);
      setError("");
      try {
        const data = await adminCall("players.list", { ...filters, cursor: nextCursor });
        setRows((prev) => (nextCursor ? [...prev, ...(data.rows || [])] : data.rows || []));
        setCursor(data.next_cursor || "");
        setHasMore(!!data.has_more);
        setTotal(data.total || 0);
      } catch (err) {
        if (err?.name !== "AdminAuthError") setError(err?.message || "The player list could not load.");
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(""), 30000);
    return () => clearInterval(id);
  }, [load]);

  const extend = async (row) => {
    setBusy(row.normalized_name);
    try {
      const data = await adminCall("players.extend", { normalized: row.normalized_name });
      setRows((prev) =>
        prev.map((item) =>
          item.normalized_name === row.normalized_name
            ? { ...item, expires_at: data.expires_at, days_left: item.days_left + 5 }
            : item
        )
      );
      setNotice(`${row.display_name || "That player"} now keeps their data for five more days.`);
    } catch (err) {
      if (err?.name !== "AdminAuthError") setError(err?.message || "The expiry was not extended.");
    } finally {
      setBusy("");
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete all saved data for ${row.display_name || "this player"}? This cannot be undone.`)) return;
    setBusy(row.normalized_name);
    try {
      await adminCall("players.delete", { normalized: row.normalized_name });
      setRows((prev) => prev.filter((item) => item.normalized_name !== row.normalized_name));
      setTotal((value) => Math.max(0, value - 1));
      setNotice(`${row.display_name || "That player"}'s data is gone.`);
    } catch (err) {
      if (err?.name !== "AdminAuthError") setError(err?.message || "That data was not deleted.");
    } finally {
      setBusy("");
    }
  };

  const purge = async () => {
    if (!window.confirm("Delete every player whose five days are already up? This cannot be undone.")) return;
    setBusy("purge");
    try {
      const data = await adminCall("players.purge");
      const count = Number(data.purged) || 0;
      setNotice(count ? `${count} expired player${count === 1 ? "" : "s"} deleted.` : "Nothing had expired, so nothing was deleted.");
      await load("");
    } catch (err) {
      if (err?.name !== "AdminAuthError") setError(err?.message || "The cleanup did not run.");
    } finally {
      setBusy("");
    }
  };

  const openProgress = async (row) => {
    setOpened(row);
    setProgress(null);
    setProgressLoading(true);
    try {
      const data = await adminCall("players.progress", { normalized: row.normalized_name });
      setProgress(data);
    } catch (err) {
      if (err?.name !== "AdminAuthError") setError(err?.message || "That progress could not be read.");
      setOpened(null);
    } finally {
      setProgressLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-large-title text-[26px] sm:text-[30px]">Players</h1>
          <p className="type-caption mt-1">
            {total} active profile{total === 1 ? "" : "s"}, each kept for five days after their last action.
          </p>
        </div>
        <Button variant="secondary" size="sm" className="rounded-full" onClick={purge} disabled={busy === "purge"}>
          {busy === "purge" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete all expired data now
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-label-secondary" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search a player by name"
          aria-label="Search players"
          className="h-11 pl-10"
        />
      </div>

      {notice ? (
        <p className="rounded-inner bg-success/10 px-3.5 py-2.5 text-[12.5px] text-success" role="status">
          {notice}
        </p>
      ) : null}
      {error ? <AdminError message={error} onRetry={() => load("")} /> : null}
      {loading && !rows.length ? <AdminSkeleton rows={3} /> : null}

      {!loading && !rows.length && !error ? (
        <AdminEmpty
          icon={Users}
          title="No player matches this view"
          body="Players appear here as soon as they enter a name on the welcome screen. Clear the search to see everyone."
        />
      ) : null}

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.id} className="glass-thin p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="type-headline text-[15px]">{row.display_name || "Unnamed player"}</p>
              <span className="type-caption text-[11.5px]">
                {row.project_title || "No project yet"}
                {row.step_number ? ` · step ${row.step_number}` : ""}
                {row.difficulty ? ` · ${levelLabel(row.difficulty)}` : ""}
              </span>
              <span className="type-caption ml-auto text-[11px]">
                {row.days_left} day{row.days_left === 1 ? "" : "s"} left
              </span>
            </div>

            <p className="type-caption mt-1 text-[11.5px]">Last active {when(row.last_active_at)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => openProgress(row)}>
                View progress
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => extend(row)}
                disabled={busy === row.normalized_name}
              >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Extend 5 days
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-danger hover:bg-danger/10"
                onClick={() => remove(row)}
                disabled={busy === row.normalized_name}
                aria-label={`Delete all data for ${row.display_name || "this player"}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete data
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="secondary" className="rounded-full" onClick={() => load(cursor)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load 25 more
          </Button>
        </div>
      ) : null}

      {opened ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close progress"
            onClick={() => setOpened(null)}
            className="overlay-in fixed inset-0 h-full w-full bg-black/25 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-progress-title"
            className="rise-in glass-thick relative my-auto w-full max-w-[560px] p-5"
          >
            <div className="mb-3">
              <BackButton insideOverlay onClick={() => setOpened(null)} />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="type-overline">Progress</p>
                <h2 id="player-progress-title" className="type-title mt-1 text-[19px]">
                  {opened.display_name || "Player"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpened(null)}
                aria-label="Close"
                className="press -mr-1 -mt-1 flex h-11 w-11 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {progressLoading ? <AdminSkeleton rows={2} className="mt-4" /> : null}

            {progress ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="glass-subtle px-3 py-2">
                    <p className="type-overline text-[9.5px]">Tickets closed</p>
                    <p className="type-headline mt-1 tabular-nums">{progress.tickets?.resolved ?? 0}</p>
                  </div>
                  <div className="glass-subtle px-3 py-2">
                    <p className="type-overline text-[9.5px]">Tickets open</p>
                    <p className="type-headline mt-1 tabular-nums">{progress.tickets?.open ?? 0}</p>
                  </div>
                  <div className="glass-subtle px-3 py-2">
                    <p className="type-overline text-[9.5px]">Expires</p>
                    <p className="mt-1 text-[12px] font-medium">{when(progress.profile?.expires_at)}</p>
                  </div>
                </div>

                {progress.saves?.length ? (
                  progress.saves.map((save) => {
                    const project = getProject(save.project_key);
                    const totalSteps = project ? activeSteps(project, save.difficulty || "medium").length : 0;
                    const hints = Object.values(save.hints || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
                    const mistakes = Object.values(save.mistakes || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
                    return (
                      <div key={save.id} className="rounded-inner bg-fill/60 p-3.5">
                        <p className="text-[13.5px] font-medium">{save.project_title || project?.title || "Unknown project"}</p>
                        <p className="type-caption mt-1 text-[11.5px]">
                          {levelLabel(save.difficulty)} · step {Math.min(save.step_index + 1, totalSteps || save.step_index + 1)}
                          {totalSteps ? ` of ${totalSteps}` : ""} · score {save.score}
                        </p>
                        <p className="type-caption mt-1 text-[11.5px]">
                          {save.steps_done?.length || 0} steps closed · {hints} hints · {mistakes} mistakes
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="type-caption">This player has not opened a project yet.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}