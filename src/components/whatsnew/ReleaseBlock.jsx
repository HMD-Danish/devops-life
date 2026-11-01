import { releaseDateLabel } from "@/lib/releases";

/**
 * A release's notes, exactly as the player reads them. Every string is rendered
 * as text — never as markup — so a note can only ever be words on the screen.
 */
const TONE = {
  new: "bg-success/12 text-success",
  improved: "bg-primary/12 text-primary",
  fixed: "bg-warning/12 text-warning",
  removed: "bg-danger/12 text-danger",
};

const LABEL = { new: "New", improved: "Improved", fixed: "Fixed", removed: "Removed" };

export function ChangeChip({ type }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
        TONE[type] || TONE.new
      }`}
    >
      {LABEL[type] || "New"}
    </span>
  );
}

export function ChangeList({ changes }) {
  if (!Array.isArray(changes) || !changes.length) return null;
  return (
    <ul className="space-y-1.5">
      {changes.map((change, index) => (
        <li key={`${change.type}-${index}`} className="flex items-start gap-2">
          <ChangeChip type={change.type} />
          <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-label">{change.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ReleaseBlock({ release, heading = true }) {
  return (
    <div className="space-y-2">
      {heading ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="type-headline text-[15px]">v{release.version}</p>
          <p className="type-caption text-[11px]">{releaseDateLabel(release.date)}</p>
        </div>
      ) : null}
      {release.title ? <p className="text-[14px] font-medium leading-snug text-label">{release.title}</p> : null}
      <ChangeList changes={release.changes} />
      {release.details ? (
        <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-label-secondary">{release.details}</p>
      ) : null}
    </div>
  );
}