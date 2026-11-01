import { useCallback, useContext, createContext, useMemo, useRef, useState } from "react";
import FeedbackDialog from "@/components/feedback/FeedbackDialog";

const FeedbackContext = createContext(null);

/**
 * One feedback modal for the whole app: the header chip, the About card, the
 * project-complete prompt and the workspace all open this instance. The
 * workspace registers which project and level are open, so a ticket sent
 * mid-game carries them along without an extra query.
 *
 * The prompt after a finished project is the very same dialog, only with its
 * completion heading and the project's numbers attached to the ticket.
 */
export function FeedbackProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(null);
  const gameRef = useRef(null);
  const doneRef = useRef(null);

  const openFeedback = useCallback((context, options) => {
    setPreset(context || null);
    doneRef.current = options?.onClose || null;
    setOpen(true);
  }, []);

  const closeFeedback = useCallback(() => {
    setOpen(false);
    const done = doneRef.current;
    doneRef.current = null;
    if (done) done();
  }, []);

  const setGameContext = useCallback((context) => {
    gameRef.current = context || null;
  }, []);

  const value = useMemo(
    () => ({ openFeedback, closeFeedback, setGameContext }),
    [openFeedback, closeFeedback, setGameContext]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackDialog open={open} onClose={closeFeedback} context={preset || gameRef.current} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback must be used within a FeedbackProvider");
  return context;
}