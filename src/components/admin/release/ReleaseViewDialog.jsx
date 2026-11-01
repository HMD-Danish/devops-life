import ModalShell from "@/components/shell/ModalShell";
import { Button } from "@/components/ui/button";
import ReleaseBlock from "@/components/whatsnew/ReleaseBlock";
import { releaseDateLabel } from "@/lib/releases";

/** One release, exactly as a player read it. */
export default function ReleaseViewDialog({ release, onClose }) {
  if (!release) return null;

  return (
    <ModalShell
      titleId="release-view-title"
      overline={release.status === "published" ? "Published" : "Draft"}
      title={`v${release.version}`}
      subtitle={releaseDateLabel(release.publishedAt || release.releaseDate)}
      width="max-w-[480px]"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" className="rounded-full" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <ReleaseBlock
        release={{
          version: release.version,
          title: release.title,
          changes: release.changes,
          details: release.details,
          date: release.publishedAt || release.releaseDate,
        }}
        heading={false}
      />
    </ModalShell>
  );
}