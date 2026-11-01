/**
 * Copyright and terms line. Scenario content is the whole product, so the terms
 * say plainly that scraping or copying it is not allowed — a deterrent, not a
 * technical control.
 */
export default function Copyright({ className = "" }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 text-center ${className}`}>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">© DevOps Life. All rights reserved.</p>
      <p className="text-[10px] leading-relaxed text-muted-foreground/80">
        Terms: scraping, bulk copying or redistributing the content of this game is not permitted.
      </p>
    </div>
  );
}