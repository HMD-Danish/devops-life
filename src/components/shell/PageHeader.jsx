import AppLogo from "@/components/glass/AppLogo";
import BackButton from "@/components/shell/BackButton";
import HeaderActions from "@/components/shell/HeaderActions";
import { cn } from "@/lib/utils";

/** The app's three container widths: 760 narrow, 1200 lists, 1600 workspace. */
export const WIDTHS = {
  760: "max-w-[760px]",
  1200: "max-w-[1200px]",
  1600: "max-w-[1600px]"
};

/** Centred page container: 16px gutters on mobile, 24px from sm up. */
export function PageContainer({ width = 760, className, children }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6", WIDTHS[width], className)}>{children}</div>;
}

/**
 * One sticky 56px bar that spans the whole window: Back and the logo on the
 * left, one cluster of controls on the right, nothing in between.
 */
export default function PageHeader({ back, onLogo, className, admin = false }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 shrink-0 border-b border-separator/40 bg-background/70 backdrop-blur-xl backdrop-saturate-150",
        className
      )}
    >
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {back ? <BackButton {...back} /> : null}
          <AppLogo onNavigate={onLogo} hideWordmarkOnMobile />
        </div>

        <HeaderActions admin={admin} />
      </div>
    </header>
  );
}