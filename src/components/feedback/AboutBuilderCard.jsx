import { Linkedin } from "lucide-react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { LINKEDIN_URL } from "@/lib/feedback";
import { Button } from "@/components/ui/button";

export default function AboutBuilderCard({ className = "" }) {
  const { openFeedback } = useFeedback();

  return (
    <section className={`glass-panel p-5 sm:p-6 ${className}`} aria-labelledby="about-builder">
      <p className="type-overline" id="about-builder">
        About the builder
      </p>
      <p className="type-body mt-2 text-[13.5px] text-label-secondary">
        Hi, I am Danish, a DevOps engineer. I built DevOps Life as a safe staging environment for on-call life: ship
        builds through CI/CD, debug a failing rollout, roll back a bad deploy and write the incident update, with zero
        pager fatigue. Break things here, learn the runbook, deploy with confidence.
      </p>
      <p className="type-body mt-2.5 text-[13.5px] text-label-secondary">
        Found a bug or have a feature for the backlog? Raise a ticket with me.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button className="h-11 rounded-full sm:flex-1" onClick={() => openFeedback()}>
          Give feedback
        </Button>
        <Button variant="secondary" className="h-11 rounded-full sm:flex-1" asChild>
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            <Linkedin className="h-4 w-4" /> Connect on LinkedIn
          </a>
        </Button>
      </div>
    </section>
  );
}