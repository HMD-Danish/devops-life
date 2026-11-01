import { useEffect } from "react";

const ATTRIBUTION = "\n\nCopied from DevOps Life";
const LIMIT = 300;

/**
 * Appends a short attribution when someone copies a large block of scenario
 * text from chat, the Tech Lead or the terminal. Selection, right-click and
 * ordinary short copies are untouched.
 */
export default function CopyGuard() {
  useEffect(() => {
    const onCopy = (event) => {
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      const text = selection ? selection.toString() : "";
      if (text.length <= LIMIT) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      event.preventDefault();
      clipboard.setData("text/plain", `${text}${ATTRIBUTION}`);
    };

    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, []);

  return null;
}