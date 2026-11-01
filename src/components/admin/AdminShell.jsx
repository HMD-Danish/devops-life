import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Linkedin,
  LogOut,
  Settings as SettingsIcon,
  Tag,
  Users,
} from "lucide-react";
import Logo from "@/components/glass/Logo";
import ThemeToggle from "@/components/glass/ThemeToggle";
import MaintenanceIcon from "@/components/admin/maintenance/MaintenanceIcon";
import BackButton from "@/components/shell/BackButton";
import ConfirmDialog from "@/components/shell/ConfirmDialog";
import UpdateControl from "@/components/admin/release/UpdateControl";
import { adminLogout } from "@/lib/adminApi";
import { invalidateAdmin } from "@/lib/adminStore";
import { LAYER } from "@/lib/layers";
import { goToNamePage } from "@/lib/namePage";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin/maintenance", label: "Maintenance", icon: MaintenanceIcon },
  { to: "/admin/overview", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/releases", label: "Releases", icon: Tag },
  { to: "/admin/feedback", label: "Feedback", icon: Inbox },
  { to: "/admin/players", label: "Players", icon: Users },
  { to: "/admin/projects", label: "Projects", icon: FolderKanban },
  { to: "/admin/notes", label: "LinkedIn", icon: Linkedin },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

const SECTIONS = {
  "/admin": "Overview",
  "/admin/maintenance": "Maintenance",
  "/admin/overview": "Overview",
  "/admin/releases": "Releases",
  "/admin/feedback": "Feedback",
  "/admin/players": "Players",
  "/admin/projects": "Projects",
  "/admin/notes": "LinkedIn",
  "/admin/settings": "Settings",
};

const itemClass = (isActive) =>
  cn(
    "press flex min-h-[44px] items-center gap-2.5 rounded-inner px-3 text-[13.5px] font-medium",
    isActive ? "bg-primary/12 text-primary" : "text-label-secondary hover:bg-fill/70 hover:text-label"
  );

const tabClass = (isActive) =>
  cn(
    "press flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-inner px-1 text-[10px] font-medium",
    isActive ? "bg-primary/12 text-primary" : "text-label-secondary"
  );

/** Sidebar from 1024px, bottom tabs below it. Same glass as the rest of the app. */
export default function AdminShell() {
  const { signOut } = useOutletContext() || {};
  const navigate = useNavigate();
  const location = useLocation();
  const [askSignOut, setAskSignOut] = useState(false);

  const isOverview = location.pathname === "/admin" || location.pathname === "/admin/overview";
  const section = SECTIONS[location.pathname] || "Overview";

  const handleSignOut = async () => {
    await adminLogout();
    invalidateAdmin();
    signOut?.();
  };

  const signOutToNamePage = async () => {
    setAskSignOut(false);
    await adminLogout();
    invalidateAdmin();
    goToNamePage(navigate);
  };

  const backProps = isOverview ? { onClick: () => setAskSignOut(true) } : { to: "/admin/overview" };

  const toNamePage = (event) => {
    event.preventDefault();
    goToNamePage(navigate);
  };

  return (
    <div className="flex min-h-[100dvh] w-full">
      <aside
        className={cn(
          "sticky top-0 hidden h-[100dvh] w-[240px] shrink-0 flex-col gap-1 border-r border-separator/50 bg-background/60 px-3 py-4 backdrop-blur-xl lg:flex",
          LAYER.sidebar
        )}
      >
        <Link
          to="/play"
          onClick={toNamePage}
          aria-label="DevOps Life — name page"
          className="mb-4 flex items-center gap-2.5 rounded-inner px-2 py-1"
        >
          <Logo size={32} />
          <div className="min-w-0">
            <p className="type-headline text-[14px] leading-tight">Admin</p>
            <p className="type-caption text-[10.5px]">DevOps Life</p>
          </div>
        </Link>

        <nav className="flex flex-col gap-1" aria-label="Admin sections">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => itemClass(isActive)}>
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button type="button" onClick={handleSignOut} className={cn(itemClass(false), "mt-auto w-full")}>
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "safe-top sticky top-0 border-b border-separator/40 bg-background/90 backdrop-blur-xl backdrop-saturate-150",
            LAYER.topBar
          )}
        >
          <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6">
            <BackButton {...backProps} />
            <Link
              to="/play"
              onClick={toNamePage}
              aria-label="DevOps Life — name page"
              className="flex min-w-0 items-center gap-2 rounded-full lg:hidden"
            >
              <Logo size={28} />
              <span className="type-headline text-[15px]">Admin</span>
            </Link>
            <span className="type-overline hidden min-w-0 truncate lg:inline">Admin / {section}</span>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <UpdateControl listen />
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out of admin"
                className="press glass-thin flex h-11 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium text-label-secondary hover:text-label"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <main
          className={cn(
            "relative mx-auto w-full max-w-[1600px] flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10",
            LAYER.content
          )}
        >
          <Outlet />
        </main>
      </div>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-8 gap-1 border-t border-separator/40 bg-background/80 px-1.5 pt-1.5 backdrop-blur-xl lg:hidden"
        aria-label="Admin sections"
      >
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => tabClass(isActive)}>
            <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <ConfirmDialog
        open={askSignOut}
        title="Sign out of Admin?"
        body="You will be returned to the name page."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={signOutToNamePage}
        onCancel={() => setAskSignOut(false)}
      />
    </div>
  );
}