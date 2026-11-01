import { useState } from "react";
import { Loader2 } from "lucide-react";
import ModalShell from "@/components/shell/ModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ChangesEditor from "@/components/admin/release/ChangesEditor";
import { adminCall } from "@/lib/adminApi";

/** Notes are editable for ever; a published version number is not. */
export default function ReleaseEditDialog({ release, onClose, onSaved }) {
  const [title, setTitle] = useState(release?.title || "");
  const [changes, setChanges] = useState(
    (release?.changes || []).map((change, index) => ({
      id: `${release?.id}-${index}`,
      type: change.type,
      text: change.text,
    }))
  );
  const [details, setDetails] = useState(release?.details || "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const save = async () => {
    setBusy(true);
    setProblem("");
    try {
      await adminCall("release.save", {
        id: release.id,
        version: release.version,
        title: title.trim(),
        changes: changes.map((change) => ({ type: change.type, text: change.text.trim() })),
        details: details.trim(),
        releaseDate: release.releaseDate,
        important: release.important,
        notifyPlayers: release.notifyPlayers,
        forceRefresh: release.forceRefresh,
      });
      onSaved?.();
      onClose();
    } catch (error) {
      setProblem(error?.message || "The notes could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const ready = title.trim().length >= 3 && details.length <= 1000 && changes.length > 0;

  const original = release?.changes || [];
  const dirty =
    title.trim() !== (release?.title || "").trim() ||
    details.trim() !== (release?.details || "").trim() ||
    changes.length !== original.length ||
    changes.some(
      (change, index) => change.text !== original[index]?.text || change.type !== original[index]?.type
    );

  return (
    <ModalShell
      titleId="release-edit-title"
      overline="Edit notes"
      title={`v${release.version}`}
      width="max-w-[640px]"
      dirty={dirty}
      discardTitle="Discard these note changes?"
      discardBody="The title, changes and details have not been saved."
      onClose={onClose}
      bodyClassName="space-y-4 p-4 sm:p-5"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={save} disabled={busy || !ready}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save notes
          </Button>
        </div>
      }
    >
      <div>
        <Label htmlFor="edit-title" className="text-[12px]">
          Title
        </Label>
        <Input
          id="edit-title"
          value={title}
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1.5 h-11"
        />
      </div>

      <div>
        <Label className="text-[12px]">Changes</Label>
        <div className="mt-1.5">
          <ChangesEditor rows={changes} onChange={setChanges} />
        </div>
      </div>

      <div>
        <Label htmlFor="edit-details" className="text-[12px]">
          Details
        </Label>
        <textarea
          id="edit-details"
          value={details}
          maxLength={1000}
          rows={3}
          onChange={(event) => setDetails(event.target.value)}
          className="mt-1.5 w-full resize-y rounded-inner border border-input bg-surface/70 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-inner border border-separator/60 p-3 text-[13px]">
        <span className="flex items-center gap-1.5">
          Important
          <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
        </span>
        <Switch
          checked={!!release.important}
          disabled
          aria-label="Important releases keep their flag"
          title="The important flag is set when the release is published."
        />
      </div>

      {problem ? <p className="text-[12px] font-medium text-danger">{problem}</p> : null}
    </ModalShell>
  );
}