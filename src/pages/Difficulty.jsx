import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import PageHeader, { PageContainer } from "@/components/shell/PageHeader";
import GlassPanel from "@/components/glass/GlassPanel";
import Segmented from "@/components/ui/segmented";
import BuilderFooter from "@/components/feedback/BuilderFooter";
import { Button } from "@/components/ui/button";
import { DIFFICULTIES, readDifficulty, writeDifficulty } from "@/data/difficulty";
import { goToNamePage } from "@/lib/namePage";
import { playPath } from "@/lib/testMode";

export default function Difficulty() {
  const navigate = useNavigate();
  const toNamePage = () => goToNamePage(navigate);
  const [level, setLevel] = useState(() => readDifficulty() || "medium");
  const selected = DIFFICULTIES.find((item) => item.id === level) || DIFFICULTIES[1];

  const pick = () => {
    writeDifficulty(level);
    navigate(playPath("/projects"));
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader onLogo={toNamePage} back={{ to: playPath("") }} />

      <PageContainer width={760} className="flex-1 pb-10 pt-8">
        <p className="type-overline">Pick your level</p>
        <h1 className="type-large-title mt-2">How hard should the job be?</h1>
        <p className="type-body mt-3 text-label-secondary">
          The same projects play differently at each level — step count, SLAs, how clearly people talk to you and how
          much the Tech Lead will tell you.
        </p>

        <div className="mt-6" data-tour="levels">
          <Segmented
            label="Difficulty"
            value={level}
            onChange={setLevel}
            options={DIFFICULTIES.map((item) => ({ value: item.id, label: item.label }))}
          />
        </div>

        <GlassPanel className="mt-4 flex flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="type-overline">{selected.tagline}</p>
            <span className="shrink-0 rounded-full bg-primary/12 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
              {selected.label}
            </span>
          </div>

          <p className="type-body mt-2.5 text-label-secondary">{selected.summary}</p>

          <ul className="mt-4 space-y-2.5">
            {selected.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                <span className="type-body text-[14px]">{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button className="h-11 w-full sm:w-auto sm:min-w-[180px]" onClick={pick}>
              Play {selected.label.toLowerCase()}
            </Button>
          </div>
          <p className="type-caption mt-3 text-[11.5px] sm:text-right">
            You can change the level on the project screen until a project has started.
          </p>
        </GlassPanel>

        <BuilderFooter className="mt-8" />
      </PageContainer>
    </div>
  );
}