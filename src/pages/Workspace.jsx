import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { LayoutDashboard, Lightbulb, MessagesSquare, SquareTerminal } from "lucide-react";
import ProjectHeader from "@/components/project/ProjectHeader";
import TerminalPanel from "@/components/project/TerminalPanel";
import ChatPanel from "@/components/project/ChatPanel";
import TechLeadPanel from "@/components/project/TechLeadPanel";
import FinishScreen from "@/components/project/FinishScreen";
import DashboardPanel from "@/components/workspace/DashboardPanel";
import ErrorState from "@/components/states/ErrorState";
import Sheet from "@/components/glass/Sheet";
import Drawer from "@/components/glass/Drawer";
import TabBar from "@/components/shell/TabBar";
import WorkspaceLoading from "@/components/workspace/WorkspaceLoading";
import { LogoLoader } from "@/components/glass/Logo";
import useProject from "@/hooks/useProject";
import { useFinishFeedback } from "@/hooks/useFinishFeedback";
import { useBackLayer } from "@/lib/backLayers";
import { playPath } from "@/lib/testMode";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { trackEvent } from "@/lib/gameEvents";
import { cn } from "@/lib/utils";

export default function Workspace() {
  const projectState = useProject();
  const [tab, setTab] = useState("dashboard");
  const [leadOpen, setLeadOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);

  const { loading, error, save, project, step, now } = projectState;
  const needsTerminal = !!project?.needsTerminal;
  const finished = !loading && projectState.progress >= 100;

  // The completion prompt opens by itself one second after the last step, and
  // the finished summary waits its turn behind it.
  const wrongTurns = Object.values(save?.mistakes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const finish = useFinishFeedback({
    complete: finished,
    save,
    project,
    difficulty: projectState.difficulty,
    score: projectState.score?.total,
    hintsUsed: projectState.hintsUsed,
    mistakes: wrongTurns,
    beforeOpen: () => {
      // Tech Lead or the dashboard sheet steps aside for the prompt.
      setLeadOpen(false);
      setDashOpen(false);
    },
  });

  const summary = finished && !finish.pending;

  // The finished summary has nothing to lose, so Back skips the leave question.
  useBackLayer(summary, finish.leave);
  useBackLayer(leadOpen, () => setLeadOpen(false));

  // A ticket sent mid-game carries the level and project it was sent from.
  const { setGameContext } = useFeedback();
  useEffect(() => {
    setGameContext({ difficulty: projectState.difficulty, projectTitle: project?.title });
  }, [setGameContext, projectState.difficulty, project?.title]);

  // One completion event per save, however often this screen re-renders.
  const completedRef = useRef("");
  useEffect(() => {
    if (!save?.id || !project || projectState.progress < 100) return;
    if (completedRef.current === save.id) return;
    completedRef.current = save.id;
    trackEvent("project_completed", { projectId: project.key, difficulty: projectState.difficulty });
  }, [project, projectState.difficulty, projectState.progress, save?.id]);

  if (!loading && (!save || !project)) return <Navigate to={playPath("/projects")} replace />;
  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <ErrorState
          title="This project could not load"
          message={error}
          fix="Reload the workspace. Your progress is stored against this name and is not lost."
          retryLabel="Reload"
          onRetry={projectState.reload}
        />
      </div>
    );
  }
  if (loading || !project) {
    return (
      <WorkspaceLoading
        hasLocalCopy={projectState.hasLocalCopy}
        onRetry={projectState.reload}
        onOpenOffline={projectState.openOffline}
      />
    );
  }

  if (finished && finish.pending) {
    return (
      <div className="glass-panel mx-auto flex h-64 w-full max-w-3xl flex-col items-center justify-center gap-4">
        <LogoLoader size={64} />
        <p className="type-caption">Wrapping up the project</p>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="h-full overflow-y-auto">
        <FinishScreen
          project={project}
          save={save}
          now={now}
          hintsUsed={projectState.hintsUsed}
          leave={finish.leave}
          giveFeedback={finish.giveFeedback}
        />
      </div>
    );
  }

  const reply = (messageId, replyId) => {
    projectState.chooseReply(messageId, replyId);
    const target = project.messages.find((message) => message.id === messageId);
    const targetStep = project.steps.find((item) => item.key === target?.step);
    if (targetStep?.doneOnReply === replyId) projectState.completeStep(targetStep.key);
  };

  const mobileTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(needsTerminal ? [{ id: "terminal", label: "Terminal", icon: SquareTerminal }] : []),
    { id: "chat", label: "Chat", icon: MessagesSquare },
  ];

  const dashboard = (
    <DashboardPanel
      project={project}
      save={save}
      step={step}
      tickets={projectState.tickets}
      services={projectState.services}
      now={now}
      awayMs={projectState.awayMs}
      progress={projectState.progress}
      hintsUsed={projectState.hintsUsed}
      difficulty={projectState.difficulty}
      score={projectState.score}
      trust={save.team_trust ?? 100}
    />
  );

  const lead = (
    <TechLeadPanel
      step={step}
      level={projectState.hintLevelFor(step?.key)}
      maxLevel={projectState.hintCeiling}
      hintsUsed={projectState.hintsUsed}
      onReveal={() => projectState.useHint(step?.key)}
      className="h-full"
    />
  );

  const chat = (
    <ChatPanel
      messages={projectState.messages}
      tickets={projectState.tickets}
      currentStepKey={step?.key}
      onReply={reply}
      onRetry={projectState.retryChat}
      onSend={projectState.sendChat}
      suggestions={projectState.suggestions}
      level={projectState.difficulty}
    />
  );

  // Below 800px one panel shows at a time; from 800px both columns show.
  const centerActive = needsTerminal ? tab === "terminal" : tab === "chat";
  const rightActive = needsTerminal && tab === "chat";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pb-[92px] min-[800px]:pb-0">
      <ProjectHeader
        project={project}
        step={step}
        stepNumber={projectState.stepNumber}
        now={now}
        onOpenLead={() => setLeadOpen(true)}
        onOpenDashboard={() => setDashOpen(true)}
      />

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 min-[800px]:grid-cols-[minmax(0,1fr)_380px] min-[1200px]:grid-cols-[300px_minmax(0,1fr)_400px]">
        <section
          data-tour="dashboard"
          className={cn(
            "min-h-0 min-w-0 overflow-y-auto",
            tab === "dashboard" ? "block" : "hidden",
            "min-[800px]:hidden min-[1200px]:block"
          )}
        >
          {dashboard}
        </section>

        <section
          data-tour={needsTerminal ? "terminal" : "chat"}
          className={cn("min-h-0 min-w-0 flex-col", centerActive ? "flex" : "hidden", "min-[800px]:flex")}
        >
          {needsTerminal ? (
            <TerminalPanel
              project={project}
              save={save}
              services={projectState.services}
              resources={projectState.resources}
              onCommand={(command) => projectState.recordCommand(command)}
              onMistake={() => projectState.reportMistake(step?.key)}
              onServiceUpdates={projectState.applyServiceUpdates}
            />
          ) : (
            chat
          )}
        </section>

        <section
          data-tour={needsTerminal ? "chat" : undefined}
          className={cn("min-h-0 min-w-0 flex-col", rightActive ? "flex" : "hidden", "min-[800px]:flex")}
        >
          {needsTerminal ? chat : lead}
        </section>
      </div>

      <TabBar tabs={mobileTabs} active={tab} onSelect={setTab} />

      <button
        type="button"
        onClick={() => setLeadOpen(true)}
        aria-label="Open Tech Lead"
        data-tour="tech-lead"
        className="press fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_28px_-10px_rgba(0,113,227,0.75)] min-[800px]:hidden"
      >
        <Lightbulb className="h-6 w-6" />
      </button>

      {dashOpen ? (
        <Drawer open onClose={() => setDashOpen(false)} title="Dashboard">
          {dashboard}
        </Drawer>
      ) : null}

      <Sheet open={leadOpen} onClose={() => setLeadOpen(false)} title="Tech Lead">
        <TechLeadPanel
          step={step}
          level={projectState.hintLevelFor(step?.key)}
          maxLevel={projectState.hintCeiling}
          hintsUsed={projectState.hintsUsed}
          onReveal={() => projectState.useHint(step?.key)}
          embedded
        />
      </Sheet>
    </div>
  );
}