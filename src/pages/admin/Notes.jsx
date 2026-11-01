import { useEffect, useState } from "react";
import { Linkedin, Loader2 } from "lucide-react";
import GlassPanel from "@/components/glass/GlassPanel";
import AdminSkeleton from "@/components/admin/AdminSkeleton";
import AdminError from "@/components/admin/AdminError";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { adminCall } from "@/lib/adminApi";
import { invalidateAdmin, useAdminResource } from "@/lib/adminStore";
import { LINKEDIN_URL } from "@/lib/feedback";

export default function AdminNotes() {
  const { data, loading, error, reload } = useAdminResource("notes.get");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (data && typeof data.notes === "string") setText(data.notes);
  }, [data]);

  const save = async () => {
    setSaving(true);
    setSaveError("");
    setSaved("");
    try {
      await adminCall("notes.save", { notes: text });
      invalidateAdmin("notes.get");
      setSaved("Saved.");
    } catch (err) {
      if (err?.name !== "AdminAuthError") setSaveError(err?.message || "The note was not saved.");
    } finally {
      setSaving(false);
    }
  };

  if (error) return <AdminError message={error} onRetry={reload} />;
  if (loading && !data) return <AdminSkeleton rows={2} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="type-large-title text-[26px] sm:text-[30px]">LinkedIn</h1>
        <p className="type-caption mt-1">A private scratchpad. Nobody but you ever sees this.</p>
      </div>

      <GlassPanel className="p-4">
        <div className="flex items-center gap-2">
          <Linkedin className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="type-overline">People who reached out on LinkedIn</p>
        </div>
        <p className="type-caption mt-1.5">
          One person per line: name, what they asked for, and whether you replied.
        </p>

        <Textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSaved("");
          }}
          maxLength={8000}
          rows={12}
          aria-label="People who reached out on LinkedIn"
          placeholder="Ada — asked about the incident project, replied 12 Nov"
          className="mt-3 min-h-[220px] resize-y text-[13px]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button className="h-11 rounded-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save note
          </Button>
          <Button variant="secondary" className="h-11 rounded-full" asChild>
            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
              <Linkedin className="h-4 w-4" aria-hidden="true" />
              Open LinkedIn
            </a>
          </Button>
          {saved ? (
            <span className="text-[12px] text-success" role="status">
              {saved}
            </span>
          ) : null}
          {saveError ? (
            <span className="text-[12px] text-danger" role="alert">
              {saveError}
            </span>
          ) : null}
        </div>
        <p className="type-caption mt-2 text-[11px]">{text.length}/8000 characters</p>
      </GlassPanel>
    </div>
  );
}