import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { profile as identity } from "@/lib/gameApi";
import { clearStoredPlayer, clearToken, readStoredPlayer, readToken, storePlayer, storeToken } from "@/lib/playerSession";
import { writeActiveSaveId } from "@/lib/activeSave";

const PlayerContext = createContext(null);
const TOUCH_MS = 120000;

/**
 * Holds the active player. Every action the player takes keeps the profile
 * alive: a periodic touch plus one on tab focus, so the 5-day retention always
 * counts from the last thing they did. The session token is what the server
 * trusts — the name is only what we print.
 */
export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(() => readStoredPlayer());
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const playerRef = useRef(player);
  playerRef.current = player;

  const hasSession = useCallback(() => !!readToken(), []);

  const touch = useCallback(async () => {
    if (!readToken()) return;
    await identity("touch").catch(() => null);
  }, []);

  const refresh = useCallback(async () => {
    if (!readToken()) return null;
    const data = await identity("me").catch(() => null);
    if (data?.ok) {
      setProfile(data);
      setDisplayName(data.display_name || playerRef.current || "");
    }
    return data || null;
  }, []);

  useEffect(() => {
    if (!player || !hasSession()) {
      if (!player) {
        setProfile(null);
        setDisplayName("");
      }
      return undefined;
    }
    refresh();
    return undefined;
  }, [player, hasSession, refresh]);

  useEffect(() => {
    if (!player || !hasSession()) return undefined;
    touch();
    const tick = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") touch();
    };
    const id = setInterval(tick, TOUCH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") touch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [player, hasSession, touch]);

  const enter = useCallback((normalized, display, saveId, token) => {
    if (token) storeToken(token);
    storePlayer(normalized);
    if (saveId) writeActiveSaveId(saveId);
    setPlayer(normalized);
    setDisplayName(display || normalized);
  }, []);

  const switchPlayer = useCallback(() => {
    clearStoredPlayer();
    clearToken();
    writeActiveSaveId(null);
    setPlayer(null);
    setProfile(null);
    setDisplayName("");
  }, []);

  const value = useMemo(
    () => ({ player, displayName, profile, enter, switchPlayer, touch, refresh, hasSession }),
    [player, displayName, profile, enter, switchPlayer, touch, refresh, hasSession]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within a PlayerProvider");
  return context;
}