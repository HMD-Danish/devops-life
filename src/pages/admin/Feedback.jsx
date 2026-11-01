import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Inbox, Loader2, Search, Trash2 } from "lucide-react";
import Stars from "@/components/admin/Stars";
import AdminEmpty from "@/components/admin/AdminEmpty";
import AdminError from "@/components/admin/AdminError";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminCall } from "@/lib/adminApi";
import { useBackLayer } from "@/lib/backLayers";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS = { bug: "Bug", idea: "Idea", content: "Content", design: "Design" };
const STATUS = [
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];
const STATUS_TONE = {
  new: "bg-primary/12 text-primary",
  read: "bg-fill text-label-secondary",
  in_progress: "bg-warning/12 text-warning",
  done: "bg-success/12 text-success",
};

const selectClass =
  "press h-11 w-full rounded-full border border-separator/80 bg-surface/70 px-3 text-[12.5px] text-label sm:w-auto";

const when = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function AdminFeedback() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState("");
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [noteFor, setNoteFor] = useState("");
  const [note, setNote] = useState("");

  // Back closes an open note editor and keeps the list exactly where it was.
  useBackLayer(!!noteFor, () => setNoteFor(""));

  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const filters = useMemo(() => ({ category, status, rating, search: term }), [category, rating, status, term]);

  const load = useCallback(
    async (nextCursor = "") => {
      setLoading(true);
      setError("");
      try {
        const data = await adminCall("feedback.list", { ...filters, cursor: nextCursor });
        setRows((prev) => (nextCursor ? [...prev, ...(data.rows || [])] : data.rows || []));
        setCursor(data.next_cursor || "");
        setHasMore(!!data.has_more);
        setTotal(data.total || 0);
      } catch (err) {
        if (err?.name !== "AdminAuthError") setError(err?.message || "The inbox could not load.");
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

  const patch = async (row, changes) => {
    setBusy(row.id);
    try {
      const data = await adminCall("feedback.update", { id: row.id, ...changes });
      setRows((prev) => prev.map((item) => (item.id === row.id ? data.row : item)));
    } catch (err) {
      if (err?.name !== "AdminAuthError") setError(err?.message || "That change was not saved.");
    } finally {
      setBusy("");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this feedback for good? This cannot be undone.")) return;
    setBusy(row.id);
    try {
      await adminCall("feedback.delete", { id: row.id });
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setTotal((value) => Math.max(0, value - 1));
    } catch (err) {
      if (err?.name !== "AdminAuthError") setError(err?.message || "That feedback was not deleted.");
    } finally {
      setBusy("");
    }
  };

  const exportCsv = async () => {
    setBusy("export");
    try {
      const data = await adminCall("feedback.export", filters);
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename || "feedback.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err?.name !== "AdminAuthError") setError(err?.message || "The export did not run.");
    } finally {
      setBusy("");
    }
  };

  const saveNote = async (row) => {
    await patch(row, { adminNote: note });
    setNoteFor("");
    setNote("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-large-title text-[26px] sm:text-[30px]">Feedback</h1>
          <p className="type-caption mt-1">{total} ticket{total === 1 ? "" : "s"} match these filters.</p>
        </div>
        <Button variant="secondary" size="sm" className="rounded-full" onClick={exportCsv} disabled={busy === "export"}>
          {busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export CSV
        </Button>
      </div>

      <div className="glass-panel flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-label-secondary" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search message, name, contact or project"
            aria-label="Search feedback"
            className="h-11 pl-10"
          />
        </div>
        <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
          <option value="">Every category</option>
          {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="">Every status</option>
          {STATUS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <select aria-label="Filter by rating" value={rating} onChange={(e) => setRating(e.target.value)} className={selectClass}>
          <option value="">Every rating</option>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>
          ))}
        </select>
      </div>

      {error ? <AdminError message={error} onRetry={() => load("")} /> : null}
      {loading && !rows.length ? <AdminSkeleton rows={3} /> : null}

      {!loading && !rows.length && !error ? (
        <AdminEmpty
          icon={Inbox}
          title="No feedback matches this view"
          body="Clear the filters or wait for a visitor to send a ticket. Every submission from the app lands here."
        />
      ) : null}

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.id} className="glass-thin p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={row.rating} />
              {(row.categories?.length ? row.categories : [CATEGORY_LABELS[row.category] || "Idea"]).map(
                (label) => (
                  <span
                    key={label}
                    className="rounded-full bg-fill/80 px-2 py-0.5 text-[11px] font-medium text-label-secondary"
                  >
                    {label}
                  </span>
                )
              )}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[row.status] || STATUS_TONE.new)}>
                {STATUS.find((item) => item.id === row.status)?.label || "New"}
              </span>
              <span className="type-caption ml-auto text-[11px]">{when(row.at)}</span>
            </div>

            {row.message ? (
              <p className="type-body mt-2.5 whitespace-pre-wrap break-words text-[13.5px]">{row.message}</p>
            ) : (
              <p className="type-caption mt-2.5 text-[12.5px]">Rating only, no message.</p>
            )}

            <div className="type-caption mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
              {row.name ? <span className="text-label-secondary">From {row.name}</span> : null}
              {row.contact ? <span className="break-all text-label-secondary">{row.contact}</span> : null}
              {row.difficulty ? <span className="capitalize">{row.difficulty}</span> : null}
              {row.projectTitle ? <span>{row.projectTitle}</span> : null}
              {row.score ? <span className="tabular-nums">Score {row.score}</span> : null}
              {row.hintsUsed ? <span>{row.hintsUsed} hints</span> : null}
              {row.mistakes ? <span>{row.mistakes} mistakes</span> : null}
              {row.trigger === "auto_after_project" || row.trigger === "auto_after_first_project" ? (
                <span>after a project</span>
              ) : null}
            </div>

            {row.adminNote ? (
              <p className="mt-2 rounded-inner bg-fill/70 px-3 py-2 text-[12px] leading-relaxed text-label">
                <span className="type-overline mr-1.5 text-[9.5px]">Note</span>
                {row.adminNote}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Change status"
                value={row.status}
                disabled={busy === row.id}
                onChange={(event) => patch(row, { status: event.target.value })}
                className={cn(selectClass, "sm:w-auto")}
              >
                {STATUS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>

              <Button
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setNoteFor(noteFor === row.id ? "" : row.id);
                  setNote(row.adminNote || "");
                }}
              >
                {row.adminNote ? "Edit note" : "Add note"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-danger hover:bg-danger/10"
                onClick={() => remove(row)}
                disabled={busy === row.id}
                aria-label={`Delete feedback from ${row.name || "a visitor"}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            </div>

            {noteFor === row.id ? (
              <div className="mt-2.5">
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  rows={2}
                  aria-label="Private admin note"
                  placeholder="What you plan to do about it"
                  className="min-h-[68px] resize-none text-[13px]"
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="rounded-full" onClick={() => saveNote(row)} disabled={busy === row.id}>
                    Save note
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setNoteFor("")}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <Button variant="secondary" className="rounded-full" onClick={() => load(cursor)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load 25 more
          </Button>
        </div>
      ) : null}
    </div>
  );
}