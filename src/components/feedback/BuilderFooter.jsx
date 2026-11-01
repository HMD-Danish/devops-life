import { LINKEDIN_URL } from "@/lib/feedback";
import { useWhatsNew } from "@/components/whatsnew/WhatsNewProvider";

/** Credit line for the screens a player sees before the workspace opens. */
export default function BuilderFooter({ className = "" }) {
  const { version, unseen, openNotes } = useWhatsNew();

  return (
    <p className={`text-center text-[10.5px] leading-relaxed text-muted-foreground ${className}`}>
      Built by Danish, DevOps engineer.{" "}
      <a
        href={LINKEDIN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-muted-foreground/40 underline-offset-2 transition hover:text-label"
      >
        Connect on LinkedIn
      </a>
      . © DevOps Life. All rights reserved.{" "}
      <button
        type="button"
        onClick={openNotes}
        aria-label={`Release notes, v${version}`}
        className="terminal-font relative underline decoration-muted-foreground/40 underline-offset-2 transition hover:text-label"
      >
        v{version}
        {unseen ? (
          <span
            className="absolute -right-2 -top-0.5 h-1.5 w-1.5 rounded-full bg-danger"
            aria-label="New release notes"
          />
        ) : null}
      </button>
    </p>
  );
}