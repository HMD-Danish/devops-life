import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/lib/PlayerContext";
import { hasIntroPlayed, markIntroPlayed } from "@/lib/introSession";
import IntroOverlay from "@/components/intro/IntroOverlay";

/**
 * full    — first visit, name screen underneath
 * short   — a saved player goes straight to the workspace
 * reduced — prefers-reduced-motion: static logo and title
 */
function pickMode(hasPlayer) {
  if (typeof window === "undefined") return null;
  if (hasIntroPlayed()) return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return "reduced";
  return hasPlayer ? "short" : "full";
}

export default function IntroGate({ children }) {
  const { player } = usePlayer();
  // The private dashboard never plays the player intro.
  const isAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  const [mode] = useState(() => (isAdmin ? null : pickMode(Boolean(player))));
  const [playing, setPlaying] = useState(() => mode !== null);
  const [revealed, setRevealed] = useState(() => mode === null);

  useEffect(() => {
    if (mode) markIntroPlayed();
  }, [mode]);

  const handleReveal = useCallback(() => setRevealed(true), []);

  const handleDone = useCallback(() => {
    setPlaying(false);
    window.requestAnimationFrame(() => {
      document.getElementById("player-name")?.focus({ preventScroll: true });
    });
  }, []);

  return (
    <>
      <div className={cn("intro-stage", !revealed && "intro-stage-hidden")}>{children}</div>
      {playing ? <IntroOverlay mode={mode} onReveal={handleReveal} onDone={handleDone} /> : null}
    </>
  );
}