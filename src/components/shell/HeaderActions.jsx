import AccountMenu from "@/components/shell/AccountMenu";
import AdminButton from "@/components/shell/AdminButton";
import FeedbackButton from "@/components/feedback/FeedbackButton";
import ThemeToggle from "@/components/glass/ThemeToggle";
import MoreMenu from "@/components/shell/MoreMenu";
import TutorialHelpButton from "@/components/tutorial/TutorialHelpButton";

/**
 * The one control cluster on the right of every header, right-aligned against
 * the edge padding with an 8px gap: player pill, Help, Feedback, Theme, and —
 * on the name page only — the quiet Admin item. Under 900px the help control
 * folds into the More menu so the row stays icon-only and never scrolls.
 */
export default function HeaderActions({ account = false, admin = false }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {account ? <AccountMenu /> : null}
      <TutorialHelpButton className="hidden min-[900px]:inline-flex" />
      <FeedbackButton />
      <MoreMenu className="min-[900px]:hidden" />
      <ThemeToggle />
      {admin ? <AdminButton /> : null}
    </div>
  );
}