import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Settings2 } from "lucide-react";
import ThemeToggle from "@/components/glass/ThemeToggle";
import { Button } from "@/components/ui/button";
import { adminCall } from "@/lib/adminApi";
import { readActiveSaveId, writeActiveSaveId } from "@/lib/activeSave";
import { game } from "@/lib/gameApi";
import { PROJECTS, getProject } from "@/data/projects";
import { activeSteps, difficultyOf } from "@/lib/projectEngine";
import { createCareer } from "@/lib/createCareer";
import { testName, simulateFailNextSave, TEST_BASE } from "@/lib/testMode";
import { cn } from "@/lib/utils";

const goWorkspace = () => window.location.assign(`${TEST_BASE}/workspace`);

/** Small admin toolbox in the corner of the test copy. Writes stay in the test namespace. */
export default function TestToolsDrawer() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [projectKey, setProjectKey] = useState(PROJECTS[0]?.key || "");
  const [stepKey, setStepKey] = useState("");
  const [save, setSave] = useState(null);

  const project = projectKey ? getProject(projectKey) : null;
  const steps = project ? activeSteps(project, save?.project_key === projectKey ? difficultyOf(save) : "medium") : [];

  useEffect(() => {
    if (!open) return;
    game("save.get", {}).then((data) => setSave(data?.save || null)).catch(() => null);
  }, [open]);

  const run = async (label, work) => {
    setBusy(label);
    setNote("");
    try {
      await work();
    } catch (err) {
      setNote(err?.message || "That tool could not run.");
    } finally {
      setBusy("");
    }
  };

  const jump = (key, index) =>
    run("jump", async () => {
      const target = getProject(projectKey);
      if (!target) throw new Error("Pick a project first.");
      let row = readActiveSaveId() ? (await game("save.get", {})).save : null;

      if (!row || row.project_key !== projectKey) {
        row = await createCareer({ playerName: testName() || "Test run", project: target, difficulty: "medium" });
        if (!row?.id) throw new Error("The test career could not be created.");
        writeActiveSaveId(row.id);
      }

      const list = activeSteps(target, difficultyOf(row));
      const stop = Math.max(0, Math.min(index ?? 0, list.length - 1));
      const done = list.slice(0, stop).map((step) => step.key);
      await game("save.patch", { saveId: row.id, fields: { steps_done: done, step_index: stop } });
      goWorkspace();
    });

  const completeStep = () =>
    run("step", async () => {
      const row = (await game("save.get", {})).save;
      const target = row ? getProject(row.project_key) : null;
      if (!row || !target) throw new Error("Start a test career first.");
      const list = activeSteps(target, difficultyOf(row));
      const done = Array.isArray(row.steps_done) ? row.steps_done : [];
      const next = list.find((step) => !done.includes(step.key));
      if (!next) throw new Error("Every step is already complete.");
      const nextDone = [...done, next.key];
      const index = Math.min(list.filter((step) => nextDone.includes(step.key)).length, list.length - 1);
      await game("save.patch", { saveId: row.id, fields: { steps_done: nextDone, step_index: index } });
      goWorkspace();
    });

  const incident = () =>
    run("incident", async () => {
      const row = (await game("save.get", {})).save;
      if (!row) throw new Error("Start a test career first.");
      await game("test.incident", { saveId: row.id });
      goWorkspace();
    });

  const reset = () =>
    run("reset", async () => {
      await adminCall("test.reset");
      writeActiveSaveId(null);
      window.location.assign(TEST_BASE);
    });

  const failSave = () =>
    run("fail", async () => {
      simulateFailNextSave();
      setNote("The next progress save will fail. Play a step to see it.");
    });

  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="glass-thick w-[min(92vw,300px)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="type-overline text-[10px]">Test tools</p>
            <ThemeToggle />
          </div>

          <div className="mt-2.5 space-y-2">
            <label className="block">
              <span className="type-caption text-[10.5px]">Project</span>
              <select
                value={projectKey}
                onChange={(event) => {
                  setProjectKey(event.target.value);
                  setStepKey("");
                }}
                className="mt-1 h-10 w-full rounded-inner border border-separator bg-surface/80 px-2 text-[12.5px]"
              >
                {PROJECTS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="type-caption text-[10.5px]">Step</span>
              <select
                value={stepKey}
                onChange={(event) => setStepKey(event.target.value)}
                className="mt-1 h-10 w-full rounded-inner border border-separator bg-surface/80 px-2 text-[12.5px]"
              >
                <option value="">First step</option>
                {steps.map((step, index) => (
                  <option key={step.key} value={String(index + 1)}>
                    {index + 1}. {step.title}
                  </option>
                ))}
              </select>
            </label>

            <Button
              variant="outline"
              className="h-10 w-full rounded-full text-[12.5px]"
              onClick={() => jump(projectKey, stepKey ? Number(stepKey) : 0)}
              disabled={Boolean(busy)}
            >
              {busy === "jump" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Jump to project and step
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-1.5">
            {[
              { label: "Mark current step complete", key: "step", run: completeStep },
              { label: "Trigger an incident", key: "incident", run: incident },
              { label: "Simulate a failed save", key: "fail", run: failSave },
              { label: "Reset the test career", key: "reset", run: reset },
            ].map((tool) => (
              <Button
                key={tool.key}
                variant="ghost"
                className="h-10 justify-start rounded-full px-3 text-[12.5px]"
                onClick={tool.run}
                disabled={Boolean(busy)}
              >
                {busy === tool.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {tool.label}
              </Button>
            ))}
          </div>

          {note ? <p className="type-caption mt-2 text-[11px] leading-relaxed">{note}</p> : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "press glass-thick flex h-11 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-medium",
          open ? "text-primary" : "text-label-secondary"
        )}
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
        Test tools
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
    </div>
  );
}