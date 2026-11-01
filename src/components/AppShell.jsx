import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import AppLogo from "@/components/glass/AppLogo";
import BackButton from "@/components/shell/BackButton";
import ConfirmDialog from "@/components/shell/ConfirmDialog";
import HeaderActions from "@/components/shell/HeaderActions";
import { goToNamePage } from "@/lib/namePage";
import { playPath } from "@/lib/testMode";

/**
 * The workspace fills the window: one 1600px strip, no page scroll.
 * Every panel inside scrolls on its own. Leaving the project asks first
 * because a save is still worth keeping.
 */
export default function AppShell() {
  const navigate = useNavigate();
  const [leaveTo, setLeaveTo] = useState("");

  const confirmLeave = () => {
    const destination = leaveTo;
    setLeaveTo("");
    if (destination === "name") return goToNamePage(navigate);
    return navigate(destination, { replace: true });
  };

  const backProps = { onClick: () => setLeaveTo(playPath("/projects")) };

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
      <header className="z-30 shrink-0 border-b border-separator/40 bg-background/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BackButton {...backProps} />
            <AppLogo onNavigate={() => setLeaveTo("name")} hideWordmarkOnMobile />
          </div>

          <HeaderActions account />
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-4 py-4 sm:px-6">
        <Outlet />
      </main>

      <ConfirmDialog
        open={!!leaveTo}
        title="Leave this project?"
        body="Your progress is saved for 5 days."
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={confirmLeave}
        onCancel={() => setLeaveTo("")}
      />
    </div>
  );
}