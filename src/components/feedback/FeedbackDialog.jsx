import { useEffect, useRef, useState } from "react";
import { Check, Copy, Linkedin, Loader2, Send, Star, X } from "lucide-react";
import BackButton from "@/components/shell/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlayer } from "@/lib/PlayerContext";
import { readToken } from "@/lib/playerSession";
import { invoke } from "@/lib/net";
import { testAuth } from "@/lib/testMode";
import { useBackLayer } from "@/lib/backLayers";
import { trackEvent } from "@/lib/gameEvents";
import {
  CATEGORY_LABELS,
  LINKEDIN_URL,
  buildFeedbackText,
  noteSubmission,
  openLinkedIn,
  submissionsLeft,
  visitorId,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { id: "bug", label: "Bug" },
  { id: "idea", label: "Idea" },
  { id: "content", label: "Content" },
  { id: "design", label: "Design" },
];

// Every popup opens with Content and Design already chosen.
const DEFAULT_CATEGORIES = ["content", "design"];
const MAX_MESSAGE = 500;
const FAILED_COPY = "Could not save. Copy your feedback and send it on LinkedIn instead";

export default function FeedbackDialog({ open, onClose, context }) {
  const { displayName, player } = usePlayer();
  const [rating, setRating] = useState(0);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState("");
  const closeRef = useRef(null);
  const firstStarRef = useRef(null);
  const prefillName = useRef("");
  prefillName.current = displayName || player || "";
  // The prompt that follows a finished project says so, and lands on the stars.
  const isCompletion = context?.variant === "completion";

  // A fresh dialog each time it opens, prefilled with whoever is playing.
  useEffect(() => {
    if (!open) return undefined;
    setRating(0);
    setCategories(DEFAULT_CATEGORIES);
    setMessage("");
    setContact("");
    setName(prefillName.current);
    setError("");
    setSending(false);
    setSent(false);
    setFailed(false);
    setCopied(false);
    setCopyFallback("");
    (isCompletion ? firstStarRef.current : closeRef.current)?.focus();
    return undefined;
  }, [open, isCompletion]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Back closes this dialog, exactly like Close.
  useBackLayer(open, onClose);

  if (!open) return null;

  const clearError = () => {
    if (error) setError("");
    if (failed) setFailed(false);
  };

  const submit = async () => {
    const words = message.trim();
    if (!rating && words.length < 5) {
      return setError("Add a star rating or a few more words so I know what to look at.");
    }
    if (submissionsLeft() === 0) return setFailed(true);

    setError("");
    setSending(true);
    try {
      const res = await invoke("feedback", {
        rating,
        category: categories[0],
        categories: categories.map((id) => CATEGORY_LABELS[id]),
        message: words,
        name: name.trim(),
        contact: contact.trim(),
        difficulty: context?.difficulty || "",
        projectTitle: context?.projectTitle || "",
        score: context?.score || 0,
        hintsUsed: context?.hintsUsed || 0,
        mistakes: context?.mistakes || 0,
        trigger: isCompletion ? "auto_after_project" : "manual",
        projectKey: context?.projectKey || "",
        saveId: context?.saveId || "",
        token: readToken() || "",
        visitorId: visitorId(),
        ...testAuth(),
      });
      if (!res?.data?.ok) throw new Error("rejected");
      noteSubmission();
      trackEvent("feedback_sent", { difficulty: context?.difficulty || "" });
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  const copyAndOpen = async () => {
    const text = buildFeedbackText({
      categories: categories.map((id) => CATEGORY_LABELS[id]),
      rating,
      difficulty: context?.difficulty,
      projectTitle: context?.projectTitle,
      message: message.trim(),
      name: name.trim(),
      contact: contact.trim(),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyFallback("");
    } catch {
      setCopied(false);
      setCopyFallback(text);
    }
    openLinkedIn();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close feedback"
        onClick={onClose}
        className="overlay-in fixed inset-0 h-full w-full bg-black/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="rise-in glass-thick relative my-auto w-full max-w-[520px] p-5 sm:p-6"
      >
        <div className="flex items-start gap-2">
          <BackButton insideOverlay onClick={onClose} />
          <div className="min-w-0 flex-1">
            <p className="type-overline">Feedback</p>
            <h2 id="feedback-title" className="type-title mt-1.5 text-[20px]">
              {isCompletion
                ? `Nice work, you finished ${context?.projectTitle || "the project"}!`
                : "How is DevOps Life?"}
            </h2>
            {isCompletion ? (
              <p className="mt-1 text-[13px] leading-snug text-label-secondary">
                Quick feedback helps me improve the next projects.
              </p>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press -mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill/70 hover:text-label"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="mt-4" role="status">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-3.5 w-3.5" />
              </span>
              <p className="type-body text-[14px]">Thanks. Your ticket is in my backlog.</p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" className="h-11 rounded-full sm:flex-1" asChild>
                <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
                  <Linkedin className="h-4 w-4" /> Connect on LinkedIn
                </a>
              </Button>
              <Button className="h-11 rounded-full sm:flex-1" onClick={onClose}>
                {isCompletion ? "Continue" : "Close"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-1" role="group" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  ref={value === 1 ? firstStarRef : undefined}
                  type="button"
                  onClick={() => {
                    setRating(value);
                    clearError();
                  }}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  aria-pressed={rating === value}
                  className={cn(
                    "press flex h-11 w-11 items-center justify-center rounded-full",
                    rating >= value
                      ? "bg-primary/15 text-primary"
                      : "text-label-secondary hover:bg-fill/70 hover:text-label"
                  )}
                >
                  <Star className={cn("h-5 w-5", rating >= value && "fill-current")} />
                </button>
              ))}
              <span className="ml-1 text-[12px] text-muted-foreground">{rating ? `${rating} of 5` : "Tap to rate"}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Feedback category">
              {CATEGORIES.map((item) => {
                const on = categories.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCategories((prev) => {
                        if (!prev.includes(item.id)) return [...prev, item.id];
                        // At least one category stays on: the last one cannot be turned off.
                        return prev.length === 1 ? prev : prev.filter((id) => id !== item.id);
                      });
                      clearError();
                    }}
                    className={cn(
                      "press flex h-11 items-center rounded-full px-3.5 text-[12.5px] font-medium sm:h-9",
                      on ? "bg-primary text-primary-foreground" : "bg-fill/70 text-label-secondary hover:text-label"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <Label htmlFor="feedback-message" className="text-[12px]">
                Your feedback
              </Label>
              <Textarea
                id="feedback-message"
                value={message}
                maxLength={MAX_MESSAGE}
                rows={3}
                onChange={(event) => {
                  setMessage(event.target.value);
                  clearError();
                }}
                placeholder="What worked, what broke, what should ship next?"
                className="mt-1.5 min-h-[84px] resize-none text-[13.5px]"
              />
              <p className="mt-1 text-right text-[10.5px] text-muted-foreground">
                {message.length}/{MAX_MESSAGE}
              </p>
            </div>

            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="feedback-name" className="text-[12px]">
                  Name (optional)
                </Label>
                <Input
                  id="feedback-name"
                  value={name}
                  maxLength={30}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1.5 h-11"
                />
              </div>
              <div>
                <Label htmlFor="feedback-contact" className="text-[12px]">
                  Contact (optional)
                </Label>
                <Input
                  id="feedback-contact"
                  value={contact}
                  maxLength={80}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="Email or LinkedIn"
                  className="mt-1.5 h-11"
                />
              </div>
            </div>

            {error ? (
              <p className="mt-3 text-[12px] text-danger" role="alert">
                {error}
              </p>
            ) : null}

            {failed ? (
              <div className="mt-3 rounded-inner bg-fill/70 px-3.5 py-3" role="alert">
                <p className="text-[12.5px] leading-relaxed text-label">{FAILED_COPY}</p>
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" className="h-11 rounded-full sm:flex-1" onClick={submit} disabled={sending}>
                    Try again
                  </Button>
                  <Button variant="secondary" className="h-11 rounded-full sm:flex-1" onClick={copyAndOpen}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Copy and open LinkedIn
                  </Button>
                </div>
                {copyFallback ? (
                  <p className="mt-2 select-all whitespace-pre-wrap break-words rounded-inner bg-background/70 p-2 font-mono text-[11px] leading-relaxed text-label-secondary">
                    {copyFallback}
                  </p>
                ) : null}
              </div>
            ) : null}

            {isCompletion ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="secondary" className="h-11 rounded-full" onClick={onClose} disabled={sending}>
                  Maybe later
                </Button>
                <Button className="h-11 rounded-full" onClick={submit} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sending ? "Sending…" : "Send feedback"}
                </Button>
              </div>
            ) : (
              <Button className="mt-4 h-11 w-full rounded-full" onClick={submit} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {sending ? "Sending…" : "Send feedback"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}