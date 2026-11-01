import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HelpCircle, LogOut, Rocket, User } from "lucide-react";
import { usePlayer } from "@/lib/PlayerContext";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { playPath } from "@/lib/testMode";

export default function AccountMenu() {
  const { displayName, player, switchPlayer } = usePlayer();
  const { start: startTutorial } = useTutorial();
  const navigate = useNavigate();
  const name = displayName || player || "Player";
  const initials = name.charAt(0).toUpperCase() || "P";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Player menu"
        className="press glass-thin flex h-9 w-9 items-center justify-center rounded-full font-heading text-[13px] font-semibold text-label-secondary hover:text-label"
      >
        {initials || <User className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-thick w-60 border-white/50 p-1.5">
        <div className="px-3 py-2">
          <p className="type-headline truncate text-[14px]">{name}</p>
          <p className="type-caption truncate text-[11px]">Kept 5 days after your last visit</p>
        </div>
        <DropdownMenuSeparator className="bg-separator/70" />
        <DropdownMenuItem className="min-h-[44px] gap-2 rounded-inner" onClick={() => navigate(playPath("/projects"))}>
          <Rocket className="h-4 w-4" /> Change project
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-[44px] gap-2 rounded-inner" onClick={startTutorial}>
          <HelpCircle className="h-4 w-4" /> Replay tutorial
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-separator/70" />
        <DropdownMenuItem
          className="min-h-[44px] gap-2 rounded-inner"
          onClick={() => {
            switchPlayer();
            navigate(playPath(""), { replace: true });
          }}
        >
          <LogOut className="h-4 w-4" /> Switch player
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}