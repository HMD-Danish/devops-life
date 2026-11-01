import Logo from "@/components/glass/Logo";
import ReleaseBlock from "@/components/whatsnew/ReleaseBlock";

/** What the player will actually read, drawn from the form as it is typed. */
export default function ReleasePreview({ version, title, changes, details, date, important }) {
  const list = (changes || [])
    .map((change) => ({ type: change.type, text: String(change.text || "").trim() }))
    .filter((change) => change.text);

  return (
    <div className="glass-panel p-4">
      <p className="type-overline">Players see</p>
      <p className="type-caption mb-3">This is the popup, live.</p>

      <div className="rounded-outer border border-separator/60 bg-surface/70 p-4">
        <div className="flex items-start gap-3">
          <span className="logo-glass-ring shrink-0 p-1">
            <Logo size={28} decorative />
          </span>
          <div className="min-w-0">
            <p className="type-overline flex items-center gap-1.5">
              What&apos;s new
              {important ? <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> : null}
            </p>
            <p className="type-headline mt-0.5 text-[16px]">What&apos;s new in v{version || "1.1.1"}</p>
          </div>
        </div>

        <div className="mt-3">
          <ReleaseBlock
            release={{
              version: version || "1.1.1",
              title: title || "Your release title",
              changes: list.length ? list : [{ type: "new", text: "Your first change lands here." }],
              details,
              date,
            }}
            heading={false}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <span className="rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground">
            Got it
          </span>
        </div>
      </div>
    </div>
  );
}