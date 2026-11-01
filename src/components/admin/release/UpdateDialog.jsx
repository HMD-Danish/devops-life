import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import ModalShell from "@/components/shell/ModalShell";
import ConfirmDialog from "@/components/shell/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import VersionPicker from "@/components/admin/release/VersionPicker";
import ChangesEditor, { makeChange } from "@/components/admin/release/ChangesEditor";
import ReleasePreview from "@/components/admin/release/ReleasePreview";
import { adminCall } from "@/lib/adminApi";
import { compareVersions, isVersion } from "@/lib/releases";

const toLocalInput = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
};

/** The one place a release is written, drafted or published. */
export default function UpdateDialog({ live, versions = [], onClose, onChanged }) {
  const [draftId, setDraftId] = useState("");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [changes, setChanges] = useState(() => [makeChange()]);
  const [details, setDetails] = useState("");
  const [releaseDate, setReleaseDate] = useState(() => toLocalInput(new Date()));
  const [notify, setNotify] = useState(true);
  const [shouldRefresh, setShouldRefresh] = useState(true);
  const [important, setImportant] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [askPublish, setAskPublish] = useState(false);
  const [published, setPublished] = useState("");

  const taken = useMemo(() => new Set(versions), [versions]);

  const versionProblem = useMemo(() => {
    const next = version.trim();
    if (!next) return "";
    if (!isVersion(next)) return "A version is three numbers, like 1.1.1.";
    if (taken.has(next)) return `v${next} already exists. Pick a new number.`;
    if (compareVersions(next, live) <= 0) return `Must be higher than the live v${live}.`;
    return "";
  }, [version, taken, live]);

  const titleProblem = useMemo(() => {
    const text = title.trim();
    if (!text) return "";
    if (text.length < 3) return "At least 3 characters.";
    if (text.length > 80) return "Keep it under 80 characters.";
    return "";
  }, [title]);

  const changesProblem = useMemo(() => {
    if (!changes.length) return "Add at least one change.";
    if (changes.length > 30) return "30 changes at most.";
    if (changes.some((change) => change.text.trim().length < 3)) return "Every change needs at least 3 characters.";
    if (changes.some((change) => change.text.trim().length > 200)) return "Keep each change under 200 characters.";
    return "";
  }, [changes]);

  const ready =
    Boolean(version.trim()) &&
    !versionProblem &&
    title.trim().length >= 3 &&
    title.trim().length <= 80 &&
    !changesProblem &&
    details.length <= 1000;

  const dirty =
    !published &&
    Boolean(
      draftId ||
        version.trim() ||
        title.trim() ||
        details.trim() ||
        important ||
        !notify ||
        !shouldRefresh ||
        changes.length > 1 ||
        changes.some((change) => change.text.trim())
    );

  const payload = () => {
    const when = releaseDate ? new Date(releaseDate) : new Date();
    return {
      ...(draftId ? { id: draftId } : {}),
      version: version.trim(),
      title: title.trim(),
      changes: changes.map((change) => ({ type: change.type, text: change.text.trim() })),
      details: details.trim(),
      releaseDate: Number.isFinite(when.getTime()) ? when.toISOString() : new Date().toISOString(),
      important,
      notifyPlayers: notify,
      forceRefresh: shouldRefresh,
    };
  };

  const saveDraft = async () => {
    setBusy("draft");
    setProblem("");
    setNotice("");
    try {
      const result = await adminCall("release.save", payload());
      setDraftId(result?.release?.id || "");
      setNotice(`Draft v${version.trim()} saved. Players cannot see it yet.`);
      onChanged?.();
    } catch (error) {
      setProblem(error?.message || "The draft could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const publish = async () => {
    setAskPublish(false);
    setBusy("publish");
    setProblem("");
    setNotice("");
    try {
      const result = await adminCall("release.publish", payload());
      setPublished(result?.currentVersion || version.trim());
      onChanged?.();
    } catch (error) {
      setProblem(error?.message || "The update could not be published.");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <ModalShell
        titleId="publish-title"
        overline="Releases"
        title={published ? "The update is live" : "Publish an update"}
        subtitle={
          published ? `Every player sees v${published} on their next visit.` : `Live now: v${live}`
        }
        width="max-w-[640px]"
        dirty={dirty}
        discardTitle="Discard this update?"
        discardBody="The version, title and notes you typed have not been saved."
        onClose={onClose}
        bodyClassName="space-y-4 p-4 sm:p-5"
        footer={
          published ? (
            <div className="flex justify-end">
              <Button className="rounded-full" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button variant="ghost" className="rounded-full sm:mr-auto" onClick={onClose} disabled={!!busy}>
                Cancel
              </Button>
              <Button variant="secondary" className="rounded-full" onClick={saveDraft} disabled={!!busy || !ready}>
                {busy === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save draft
              </Button>
              <Button className="rounded-full" onClick={() => setAskPublish(true)} disabled={!!busy || !ready}>
                {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Publish update
              </Button>
            </div>
          )
        }
      >
        {published ? (
          <div className="flex items-start gap-3 rounded-outer bg-success/10 p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="type-headline text-[15px]">v{published} is published.</p>
              <p className="type-body mt-1 text-[13px] text-label-secondary">
                The live version pill has moved. Players see the notes once, and open sessions get the refresh banner
                within a minute.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <Label className="text-[12px]">Version</Label>
              <div className="mt-1.5">
                <VersionPicker live={live} value={version} versions={versions} onPick={setVersion} />
              </div>
              <div className="mt-2">
                <Label htmlFor="custom-version" className="text-[11.5px] text-label-secondary">
                  Custom version
                </Label>
                <Input
                  id="custom-version"
                  value={version}
                  onChange={(event) => setVersion(event.target.value.trim())}
                  placeholder="2.10.0"
                  inputMode="text"
                  className="terminal-font mt-1 h-10"
                />
              </div>
              {versionProblem ? (
                <p className="mt-1.5 text-[11.5px] font-medium text-danger">{versionProblem}</p>
              ) : (
                <p className="mt-1.5 type-caption text-[11px]">x.y.z only. Anything above v{live}.</p>
              )}
            </div>

            <div>
              <Label htmlFor="release-title" className="text-[12px]">
                Release title
              </Label>
              <Input
                id="release-title"
                value={title}
                maxLength={80}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Real-time clock and feedback popup"
                className="mt-1.5 h-11"
              />
              {titleProblem ? (
                <p className="mt-1.5 text-[11.5px] font-medium text-danger">{titleProblem}</p>
              ) : (
                <p className="mt-1.5 type-caption text-[11px]">3 to 80 characters.</p>
              )}
            </div>

            <div>
              <Label className="text-[12px]">Changes and release notes</Label>
              <div className="mt-1.5">
                <ChangesEditor rows={changes} onChange={setChanges} />
              </div>
              {changesProblem ? (
                <p className="mt-1.5 text-[11.5px] font-medium text-danger">{changesProblem}</p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="release-details" className="text-[12px]">
                Details <span className="text-label-secondary">(optional)</span>
              </Label>
              <textarea
                id="release-details"
                value={details}
                maxLength={1000}
                rows={3}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Anything else worth saying, in plain text."
                className="mt-1.5 w-full resize-y rounded-inner border border-input bg-surface/70 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div>
              <Label htmlFor="release-date" className="text-[12px]">
                Release date
              </Label>
              <Input
                id="release-date"
                type="datetime-local"
                value={releaseDate}
                onChange={(event) => setReleaseDate(event.target.value)}
                className="mt-1.5 h-11"
              />
            </div>

            <div className="space-y-2 rounded-inner border border-separator/60 p-3">
              <label className="flex items-center justify-between gap-3 text-[13px]">
                Show popup to players
                <Switch checked={notify} onCheckedChange={setNotify} aria-label="Show popup to players" />
              </label>
              <label className="flex items-center justify-between gap-3 text-[13px]">
                Ask open sessions to refresh
                <Switch
                  checked={shouldRefresh}
                  onCheckedChange={setShouldRefresh}
                  aria-label="Ask open sessions to refresh"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-1.5">
                  Mark as important
                  <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
                </span>
                <Switch checked={important} onCheckedChange={setImportant} aria-label="Mark as important" />
              </label>
            </div>

            {problem ? <p className="text-[12px] font-medium text-danger">{problem}</p> : null}
            {notice ? <p className="text-[12px] font-medium text-success">{notice}</p> : null}

            <div className="rounded-inner border border-separator/60 p-3">
              <p className="type-overline mb-2 text-[9.5px]">Players see this</p>
              <ReleasePreview
                version={version.trim()}
                title={title.trim()}
                changes={changes}
                details={details.trim()}
                date={releaseDate ? new Date(releaseDate).toISOString() : new Date().toISOString()}
                important={important}
              />
            </div>
          </>
        )}
      </ModalShell>

      <ConfirmDialog
        open={askPublish}
        title={`Publish v${version.trim()} to all players now?`}
        body="The live version moves at once and every player is offered the notes."
        confirmLabel="Publish"
        cancelLabel="Stay"
        onConfirm={publish}
        onCancel={() => setAskPublish(false)}
      />
    </>
  );
}