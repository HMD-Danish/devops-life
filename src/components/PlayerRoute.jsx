import { Navigate, Outlet } from "react-router-dom";
import { usePlayer } from "@/lib/PlayerContext";
import { readStoredPlayer } from "@/lib/playerSession";
import { isTestMode, playPath } from "@/lib/testMode";

/** Nothing to sign in to — but a page still needs a player name to belong to. */
export default function PlayerRoute() {
  const { player } = usePlayer();
  if (!isTestMode() && !player && !readStoredPlayer()) return <Navigate to={playPath("")} replace />;
  return <Outlet />;
}