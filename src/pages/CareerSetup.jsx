import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, SquareTerminal } from "lucide-react";
import DifficultyBadge from "@/components/difficulty/DifficultyBadge";
import PageHeader, { PageContainer } from "@/components/shell/PageHeader";
import GlassPanel from "@/components/glass/GlassPanel";
import BuilderFooter from "@/components/feedback/BuilderFooter";
import { Button } from "@/components/ui/button";
import { game } from "@/lib/gameApi";
import { usePlayer } from "@/lib/PlayerContext";
import { PROJECTS, getProject } from "@/data/projects";
import { createCareer } from "@/lib/createCareer";
import { readActiveSaveId, writeActiveSaveId } from "@/lib/activeSave";
import { readDifficulty } from "@/data/difficulty";
import { activeSteps, progressPercent } from "@/lib/projectEngine";
import { goToNamePage } from "@/lib/namePage";
import { playPath } from "@/lib/testMode";

export default function CareerSetup() {
  const navigate = useNavigate();
  const { player, displayName } = usePlayer();
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const difficulty = readDifficulty();
  const toNamePage = () => goToNamePage(navigate);

  useEffect(() => {
    if (!player) {
      navigate(playPath(""), { replace: true });
      return;
    }
    const id = readActiveSaveId();
    if (!id) return;
    game("save.get", { saveId: id })
      .then((data) => {
        const row = data?.save;
        if (!row?.project_key) return setExisting(null);
        // A finished project is not "in progress", so the level can be changed.
        const done = progressPercent(getProject(row.project_key), row) >= 100;
        setExisting(done ? null : row);
      })
      .catch(() => null);
  }, [player, navigate]);

  // The level is chosen before a project, so a missing one sends you back a step.
  if (!difficulty) return <Navigate to={playPath("/level")} replace />;

  const start = async (project) => {
    setError("");
    setBusy(project.key);
    try {
      const save = await createCareer({
        playerName: displayName || player,
        project,
        difficulty,
      });
      writeActiveSaveId(save.id);
      navigate(playPath("/workspace"));
    } catch (err) {
      setError(err?.message || "The project could not be created.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader onLogo={toNamePage} back={{ to: playPath("/level") }} />

      <PageContainer width={1200} className="flex-1 pb-10 pt-8">
        <p className="type-overline">Pick your work</p>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="type-large-title">Which project are you starting on?</h1>
            <p className="type-body mt-2 text-label-secondary">
              Every project is a few steps long. The terminal only opens for projects that need one.
            </p>
          </div>
          <DifficultyBadge level={difficulty} canChange={!existing} onChange={() => navigate(playPath("/level"))} />
        </div>

        {existing ? (
          <GlassPanel tier="thick" className="mt-6 flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0">
              <p className="type-caption">In progress</p>
              <p className="type-headline truncate text-[15px]">{existing.project_title || existing.name}</p>
            </div>
            <Button className="ml-auto h-11" onClick={() => navigate(playPath("/workspace"))}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </GlassPanel>
        ) : null}

        <div className="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3" data-tour="projects">
          {PROJECTS.map((project) => (
            <GlassPanel
              key={project.key}
              className="press flex h-full flex-col p-4 hover:border-white/80 dark:hover:border-white/25"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-overline text-[10px]">{activeSteps(project, difficulty).length} steps</span>
                {project.needsTerminal ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fill/70 px-2 py-[3px] text-[10px] font-medium text-label">
                    <SquareTerminal className="h-3 w-3 text-primary" /> Terminal
                  </span>
                ) : null}
              </div>

              <p className="type-overline mt-2.5 text-[10px] text-primary">{project.company}</p>
              <p className="type-headline mt-1 text-[15.5px] leading-snug">{project.title}</p>
              <p className="type-body mt-1.5 flex-1 text-[13px] text-label-secondary">{project.summary}</p>

              {project.tools?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5" data-tour="project-tags">
                  {project.tools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full bg-fill/70 px-2 py-1 text-[11px] leading-none text-label-secondary"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              ) : null}

              <Button className="mt-4 h-11 w-full sm:w-auto sm:self-end" disabled={!!busy} onClick={() => start(project)}>
                {busy === project.key ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Start
              </Button>
            </GlassPanel>
          ))}
        </div>

        {error ? <p className="type-caption mt-3 text-danger">{error}</p> : null}

        <BuilderFooter className="mt-8" />
      </PageContainer>
    </div>
  );
}