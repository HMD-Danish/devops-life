import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { game } from "@/lib/gameApi";
import { submissionsLeft } from "@/lib/feedback";
import { playPath } from "@/lib/testMode";

// The last step closes, then the prompt follows a beat later.
const PROMPT_DELAY_MS = 1000;
const DISMISS_KEY = "devopslife.feedback.dismissed.";

const isDismissed = (saveId) => {
  if (!saveId || typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY + saveId) === "1";
  } catch {
    return false;
  }
};

const markDismissed = (saveId) => {
  if (!saveId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISS_KEY + saveId, "1");
  } catch {
    // Blocked storage only means the prompt may return once more.
  }
};

/**
 * The feedback prompt that belongs to the moment a project is completed.
 *
 * It opens on its own one second after the last step, holds its place in front
 * of the project-complete summary, and appears again after the next completed
 * project. Nothing on the summary screen opens it.
 */
export function useFinishFeedback({
  complete,
  save,
  project,
  difficulty,
  score,
  hintsUsed,
  mistakes,
  beforeOpen,
}) {
  const navigate = useNavigate();
  const { openFeedback } = useFeedback();
  const [settledFor, setSettledFor] = useState("");
  const armed = useRef("");

  const beforeOpenRef = useRef(beforeOpen);
  beforeOpenRef.current = beforeOpen;

  const projectKey = project?.key || save?.project_key || "";
  const title = project?.title || save?.project_title || "";
  const saveId = save?.id || "";
  const answered = projectKey ? (save?.feedback_submitted_projects || {})[projectKey] === true : false;

  const context = {
    variant: "completion",
    projectKey,
    difficulty,
    projectTitle: title,
    score: Math.round(Number(score) || 0),
    hintsUsed: Math.round(Number(hintsUsed) || 0),
    mistakes: Math.round(Number(mistakes) || 0),
    saveId,
  };
  const contextRef = useRef(context);
  contextRef.current = context;

  // Derived, never a timer: the summary waits while this is true.
  const owed = Boolean(
    complete && saveId && !answered && !isDismissed(saveId) && submissionsLeft() > 0
  );
  const pending = owed && settledFor !== saveId;

  /** Once a project has been asked, the career remembers it. */
  const rememberAsked = () => {
    if (!saveId || !projectKey) return;
    const next = { ...(save.feedback_prompted_projects || {}), [projectKey]: true };
    game("save.patch", { saveId, fields: { feedback_prompted_projects: next } }).catch(() => null);
  };

  useEffect(() => {
    if (!pending || !saveId || armed.current === saveId) return undefined;
    armed.current = saveId;
    rememberAsked();

    const timer = window.setTimeout(() => {
      // Anything already on screen steps aside for the prompt.
      beforeOpenRef.current?.();
      openFeedback(contextRef.current, {
        onClose: () => {
          markDismissed(saveId);
          setSettledFor(saveId);
        },
      });
    }, PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pending, saveId, openFeedback]);

  /** "Pick another project": straight to the list, never the prompt. */
  const leave = useCallback(() => navigate(playPath("/projects"), { replace: true }), [navigate]);

  /** The summary's own button: the same dialog, opened by hand. */
  const giveFeedback = useCallback(() => {
    openFeedback({ difficulty, projectTitle: title });
  }, [openFeedback, difficulty, title]);

  return { pending, leave, giveFeedback };
}

export default useFinishFeedback;