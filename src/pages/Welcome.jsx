import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import Logo from "@/components/glass/Logo";
import PageHeader from "@/components/shell/PageHeader";
import ReturningCard from "@/components/welcome/ReturningCard";
import AboutBuilderCard from "@/components/feedback/AboutBuilderCard";
import BuilderFooter from "@/components/feedback/BuilderFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/lib/PlayerContext";
import { useBackLayer } from "@/lib/backLayers";
import { goToNamePage } from "@/lib/namePage";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { markTutorialDone } from "@/lib/tutorial";
import { cleanName, normalizeName, pinLockLabel, readToken, storeToken, validateName } from "@/lib/playerSession";
import { playPath, testAuth } from "@/lib/testMode";

const PIN_RULE = /^\d{4}$/;

export default function Welcome() {
  const navigate = useNavigate();
  const { enter, player, displayName } = usePlayer();
  const toNamePage = () => goToNamePage(navigate);
  const [stage, setStage] = useState("name"); // name | pin | returning
  // A player who already entered a name finds it still there.
  const [name, setName] = useState(() => displayName || player || "");
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(null);
  const { active: tourActive, finish: finishTour } = useTutorial();

  // A career that already finished the tour never sees it again.
  useEffect(() => {
    if (!returning?.summary?.tutorial_done) return;
    if (tourActive) finishTour();
    else markTutorialDone();
  }, [returning, tourActive, finishTour]);

  // The session token rides along once one exists; before that the server
  // decides what a name lookup may reveal (which is only "is a PIN needed").
  const call = (action, payload) =>
    base44.functions
      .invoke("playerProfile", { action, token: readToken(), ...testAuth(), ...payload })
      .then((res) => res.data || {})
      .catch((err) => ({
        error: err?.response?.data?.error || err?.message || "Could not reach the server.",
      }));

  const reset = () => {
    setStage("name");
    setPin("");
    setError("");
    setNotice("");
    setReturning(null);
  };

  // Back on the PIN or welcome-back step returns to the name field.
  useBackLayer(stage !== "name", reset);

  const start = async (event) => {
    event?.preventDefault();
    const problem = validateName(name);
    if (problem) return setError(problem);
    if (usePin && !PIN_RULE.test(pin)) return setError("A PIN is exactly 4 digits.");

    setError("");
    setNotice("");
    setBusy(true);
    try {
      const found = await call("lookup", { name });
      if (found.error) return setError(found.error);

      if (found.pin_required || found.locked_until) {
        if (found.locked_until) {
          setNotice(`Too many attempts on this name. Try again after ${pinLockLabel(found.locked_until)}.`);
        }
        setStage("pin");
        return;
      }

      // No PIN on this name: the server opens the career — or creates it — and
      // mints a fresh session either way.
      const opened = await call("open", { name, pin: usePin ? pin : "" });
      if (opened.error) return setError(opened.error);
      if (opened.locked_until) {
        setNotice(`Too many attempts on this name. Try again after ${pinLockLabel(opened.locked_until)}.`);
        setStage("pin");
        return;
      }
      if (opened.token) storeToken(opened.token);

      if (opened.created) {
        enter(normalizeName(name), opened.display_name || cleanName(name), null, opened.token);
        navigate(playPath("/level"));
        return;
      }

      setReturning({ ...opened, display_name: opened.display_name || cleanName(name) });
      setStage("returning");
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (event) => {
    event?.preventDefault();
    if (!PIN_RULE.test(pin)) return setError("A PIN is exactly 4 digits.");
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const opened = await call("open", { name, pin });
      if (opened.error) return setError(opened.error);
      if (opened.locked || opened.locked_until) {
        setNotice("Too many attempts. This name is locked for 15 minutes.");
        return;
      }
      if (opened.wrong_pin) {
        return setError(`Wrong PIN. ${opened.attempts_left} attempt${opened.attempts_left === 1 ? "" : "s"} left.`);
      }
      if (opened.token) storeToken(opened.token);
      setReturning({ ...opened, display_name: opened.display_name || cleanName(name) });
      setStage("returning");
    } finally {
      setBusy(false);
    }
  };

  const continueCareer = () => {
    enter(
      returning.normalized_name || normalizeName(name),
      returning.display_name,
      returning.summary?.save_id || null,
      returning.token
    );
    navigate(returning.summary?.has_career ? playPath("/workspace") : playPath("/projects"), { replace: true });
  };

  const startFresh = async () => {
    setBusy(true);
    try {
      const reset = await call("reset", { name });
      if (reset.token) storeToken(reset.token);
      enter(returning.normalized_name || normalizeName(name), returning.display_name, null, reset.token);
      navigate(playPath("/level"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* The name page is the first screen: no Back, and the logo lands here too.
          Only the name step carries the quiet Admin item. */}
      <PageHeader onLogo={toNamePage} admin={stage === "name"} />

      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <span className="logo-glass-ring mb-6 p-4">
          <Logo size={80} />
        </span>
        {stage === "returning" ? (
          <ReturningCard
            name={returning?.display_name || cleanName(name)}
            summary={returning?.summary}
            retentionDays={returning?.retention_days || 5}
            busy={busy}
            pinRequired={!!returning?.pin_required}
            onSetPin={(nextPin) => call("pin.set", { pin: nextPin })}
            onContinue={continueCareer}
            onStartFresh={startFresh}
          />
        ) : stage === "pin" ? (
          <form onSubmit={unlock} className="glass-panel w-full max-w-[520px] p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <p className="type-overline">Protected name</p>
            </div>
            <h1 className="type-title mt-2">Enter your PIN</h1>
            <p className="type-body mt-2 text-[13.5px] text-label-secondary">
              {cleanName(name)} is protected. Five wrong attempts lock this name for 15 minutes.
            </p>

            <div className="mt-4">
              <Label htmlFor="player-pin" className="text-[12px]">
                4-digit PIN
              </Label>
              <Input
                id="player-pin"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                  if (error) setError("");
                }}
                inputMode="numeric"
                type="password"
                maxLength={4}
                autoComplete="off"
                placeholder="••••"
                className="terminal-font mt-1.5 h-11 w-[132px] text-center text-lg tracking-[0.4em]"
              />
            </div>

            {error ? <p className="mt-3 type-caption text-[12px] text-danger">{error}</p> : null}
            {notice ? <p className="mt-3 type-caption text-[12px] text-warning">{notice}</p> : null}

            <div className="mt-4 flex items-center gap-2">
              <Button type="submit" disabled={busy} className="rounded-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Unlock
              </Button>
              <Button type="button" variant="ghost" className="rounded-full" onClick={reset} disabled={busy}>
                <ArrowLeft className="h-3.5 w-3.5" /> Different name
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={start} className="glass-panel w-full max-w-[520px] p-6">
            <p className="type-overline">DevOps Life</p>
            <h1 className="type-title mt-2">What should we call you?</h1>
            <p className="type-body mt-2 text-[13.5px] text-label-secondary">
              Your team uses this name in chat and the terminal prompt. No account, no password, no email — the name is
              the whole thing.
            </p>

            <div className="mt-5">
              <Label htmlFor="player-name" className="text-[12px]">
                Your name
              </Label>
              <Input
                id="player-name"
                autoFocus
                value={name}
                maxLength={30}
                autoComplete="off"
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Danish"
                className="mt-1.5 h-11"
              />
              <p className="mt-1.5 type-caption text-[11px]">
                2–30 characters. Letters, numbers, spaces and dots.
              </p>
            </div>

            <div className="mt-4 flex items-start justify-between gap-3 rounded-inner bg-fill/70 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">Add a 4-digit PIN to protect this name</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Optional. Without it, anyone typing this name opens your career.
                </p>
              </div>
              <Switch
                checked={usePin}
                onCheckedChange={(next) => {
                  setUsePin(next);
                  if (error) setError("");
                }}
                aria-label="Protect this name with a PIN"
              />
            </div>

            {usePin ? (
              <div className="mt-3">
                <Label htmlFor="new-pin" className="text-[12px]">
                  4-digit PIN
                </Label>
                <Input
                  id="new-pin"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                    if (error) setError("");
                  }}
                  inputMode="numeric"
                  type="password"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="••••"
                  className="terminal-font mt-1.5 h-11 w-[132px] text-center text-lg tracking-[0.4em]"
                />
                <p className="mt-1.5 type-caption text-[11px]">
                  Stored as a hash — the digits themselves are never saved.
                </p>
              </div>
            ) : null}

            {error ? <p className="mt-3 type-caption text-[12px] text-danger">{error}</p> : null}
            {notice ? <p className="mt-3 type-caption text-[12px] text-warning">{notice}</p> : null}

            <div className="mt-5 flex justify-end">
              <Button type="submit" disabled={busy} className="h-11 w-full rounded-full sm:w-auto sm:min-w-[140px]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy ? "Checking…" : "Start"}
              </Button>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Your progress is kept for 5 days after your last visit.
            </p>
          </form>
        )}

        {stage === "name" ? (
          <div className="mt-4 w-full max-w-[520px]">
            <AboutBuilderCard />
          </div>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 pb-4 sm:px-6">
        <BuilderFooter />
      </div>
    </div>
  );
}