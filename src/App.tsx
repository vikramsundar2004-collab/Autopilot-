import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  Link2,
  LockKeyhole,
  MailOpen,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { demoCalendar, demoDate, demoEmails } from "./data";
import {
  buildBehaviorActions,
  buildShareStateUrl,
  getRoleRecommendation,
  roleLabels,
  surfaceFlows,
  surfaceOrder,
  type BehaviorAction,
  type UserRole,
} from "./improvementBehaviors";
import {
  capabilityLabels,
  capabilityOrder,
  themeLabels,
  type ImprovementCapability,
  type ImprovementMode,
  type ImprovementTheme,
} from "./improvements";
import {
  buildDailyPlan,
  deriveActionItems,
  formatDueLabel,
  formatTime,
  summarizePlan,
} from "./intelligence";
import { completeOAuthRedirect, startIntegrationConnection } from "./integrations/auth";
import {
  getConnectionReadiness,
  integrationProviders,
  type IntegrationKey,
  type IntegrationProvider,
} from "./integrations/providers";
import { hasSupabaseConfig } from "./integrations/supabaseClient";
import type { ActionItem, CalendarEvent, EmailPriority, TaskStatus } from "./types";

type TaskFilter = "all" | "urgent" | "waiting" | "done";
type ImprovementFilter = "all" | ImprovementCapability;
type PlanMode = "impact" | "quickWins" | "deepWork";

const filterLabels: Record<TaskFilter, string> = {
  all: "All",
  urgent: "Urgent",
  waiting: "Waiting",
  done: "Done",
};

const planModeLabels: Record<PlanMode, string> = {
  impact: "Impact",
  quickWins: "Quick wins",
  deepWork: "Deep work",
};

const priorityRank: Record<EmailPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const calendarGridStartHour = 9;
const calendarGridEndHour = 18;
const calendarHourHeight = 56;
const calendarGridHeight = (calendarGridEndHour - calendarGridStartHour) * calendarHourHeight;

interface AppliedBehavior {
  id: string;
  label: string;
  detail: string;
  theme: ImprovementTheme;
  capability: ImprovementCapability;
  synced: boolean;
  createdAt: string;
}

interface SavedPreset {
  id: string;
  name: string;
  theme: ImprovementTheme;
  mode: ImprovementMode;
  role: UserRole;
  instruction: string;
}

function App() {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [manualTasks, setManualTasks] = useState<ActionItem[]>([]);
  const [planMode, setPlanMode] = useState<PlanMode>("impact");
  const [captureText, setCaptureText] = useState("");
  const [captureMinutes, setCaptureMinutes] = useState(15);
  const [capturePriority, setCapturePriority] = useState<EmailPriority>("medium");
  const [activeSprintId, setActiveSprintId] = useState("");
  const [productivityNotice, setProductivityNotice] = useState("Ready to plan the next hour.");
  const [connectionNotice, setConnectionNotice] = useState(
    "Add Supabase env vars when you are ready to test live OAuth.",
  );

  const baseTasks = useMemo(() => deriveActionItems(demoEmails, demoDate), []);
  const tasks = useMemo(
    () =>
      [...baseTasks, ...manualTasks].map((task) =>
        completedTasks.has(task.id)
          ? {
              ...task,
              status: "done" as TaskStatus,
            }
          : task,
      ),
    [baseTasks, completedTasks, manualTasks],
  );
  const plan = useMemo(() => buildDailyPlan(tasks, demoCalendar, demoDate), [tasks]);
  const summary = useMemo(() => summarizePlan(plan), [plan]);
  const orderedTasks = useMemo(
    () => prioritizeTasksForMode(plan.rankedTasks, planMode),
    [plan.rankedTasks, planMode],
  );
  const nextSprintTask = orderedTasks.find((task) => task.status === "open");
  const activeSprintTask =
    orderedTasks.find((task) => task.id === activeSprintId && task.status === "open") ??
    null;
  const quickWins = orderedTasks
    .filter((task) => task.status === "open" && task.effort <= 15)
    .slice(0, 3);
  const deepWork = orderedTasks
    .filter((task) => task.status === "open" && task.effort >= 25)
    .slice(0, 3);

  const filteredTasks = orderedTasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "urgent") return task.priority === "urgent" && task.status === "open";
    return task.status === filter;
  });

  const filterCounts: Record<TaskFilter, number> = {
    all: orderedTasks.length,
    urgent: orderedTasks.filter(
      (task) => task.priority === "urgent" && task.status === "open",
    ).length,
    waiting: orderedTasks.filter((task) => task.status === "waiting").length,
    done: orderedTasks.filter((task) => task.status === "done").length,
  };

  useEffect(() => {
    completeOAuthRedirect().then((result) => {
      if (result) {
        setConnectionNotice(result.message);
      }
    });
  }, []);

  useEffect(() => {
    if (!window.location.hash) return;
    const targetId = window.location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTask(taskId: string) {
    setCompletedTasks((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function addManualTask() {
    const title = captureText.trim();
    if (!title) {
      setProductivityNotice("Add a task before saving quick capture.");
      return;
    }

    const createdAt = new Date().toISOString();
    const effort = Math.max(5, Math.min(180, captureMinutes));
    const impact = capturePriority === "urgent" ? 8 : capturePriority === "high" ? 7 : 5;
    const manualTask: ActionItem = {
      id: `task-capture-${Date.now()}`,
      sourceEmailId: `capture-${Date.now()}`,
      title,
      detail: "Captured manually during planning.",
      source: "Quick capture",
      sourceRole: "Manual",
      sourceAvatar:
        "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=160&q=80",
      sourceSubject: "Manual capture",
      receivedAt: createdAt,
      dueAt: `${demoDate}T17:00:00-07:00`,
      priority: capturePriority,
      category: "follow-up",
      status: "open",
      confidence: 100,
      effort,
      impact,
      risk: "Captured by the user so it stays visible in today's plan.",
      labels: ["manual", "capture"],
      rankScore: priorityRank[capturePriority] * 18 + impact * 4 - effort * 0.2,
    };

    setManualTasks((current) => [manualTask, ...current]);
    setCaptureText("");
    setProductivityNotice(`${title} added to today's plan.`);
  }

  function startFocusSprint() {
    if (!nextSprintTask) {
      setProductivityNotice("No open task is available for a focus sprint.");
      return;
    }
    setActiveSprintId(nextSprintTask.id);
    setProductivityNotice(`Focus sprint started: ${nextSprintTask.title}.`);
  }

  function finishFocusSprint() {
    if (!activeSprintTask) {
      setProductivityNotice("Start a focus sprint before finishing one.");
      return;
    }
    setCompletedTasks((current) => new Set(current).add(activeSprintTask.id));
    setProductivityNotice(`${activeSprintTask.title} marked done from the focus sprint.`);
    setActiveSprintId("");
  }

  async function connectProvider(key: IntegrationKey) {
    const result = await startIntegrationConnection(key);
    setConnectionNotice(result.message);
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace" aria-labelledby="page-title">
        <Header summary={summary} />
        <section className="command-band" aria-label="Daily command summary">
          <div>
            <span className="eyebrow">Today&apos;s call</span>
            <h2>Do the customer reply, renewal approval, and launch edit before 4 PM.</h2>
          </div>
          <button className="primary-action" type="button">
            Start next task
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </section>

        <ProductivityPanel
          activeSprintTask={activeSprintTask}
          captureMinutes={captureMinutes}
          capturePriority={capturePriority}
          captureText={captureText}
          deepWork={deepWork}
          nextSprintTask={nextSprintTask}
          notice={productivityNotice}
          planMode={planMode}
          quickWins={quickWins}
          onAddManualTask={addManualTask}
          onCaptureMinutesChange={setCaptureMinutes}
          onCapturePriorityChange={setCapturePriority}
          onCaptureTextChange={setCaptureText}
          onFinishFocusSprint={finishFocusSprint}
          onPlanModeChange={(mode) => {
            setPlanMode(mode);
            setProductivityNotice(`Action list is sorted for ${planModeLabels[mode].toLowerCase()}.`);
          }}
          onStartFocusSprint={startFocusSprint}
        />

        <section className="integration-panel" aria-labelledby="integration-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Integrations</span>
              <h2 id="integration-title">Connect the work sources</h2>
            </div>
            <div className={hasSupabaseConfig ? "status-pill ready" : "status-pill"}>
              <LockKeyhole size={15} aria-hidden="true" />
              {hasSupabaseConfig ? "Supabase env ready" : "Supabase env needed"}
            </div>
          </div>
          <p className="section-note">{connectionNotice}</p>
          <div className="integration-grid">
            {integrationProviders.map((provider) => (
              <IntegrationCard
                key={provider.key}
                provider={provider}
                onConnect={connectProvider}
              />
            ))}
          </div>
        </section>

        <ImprovementStudio />

        <section className="task-section" aria-labelledby="tasks-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Action list</span>
              <h2 id="tasks-title">What has to be done</h2>
            </div>
            <div className="filter-row" aria-label="Task filters">
              {(Object.keys(filterLabels) as TaskFilter[]).map((key) => (
                <button
                  className={filter === key ? "filter-button active" : "filter-button"}
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                >
                  {filterLabels[key]}
                  <span>{filterCounts[key]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="task-list">
            {filteredTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                todayISO={demoDate}
                index={index}
                onToggle={toggleTask}
              />
            ))}
          </div>
        </section>
      </main>
      <aside className="insight-rail" aria-label="Calendar and insights">
        <CalendarPanel events={demoCalendar} date={demoDate} />
        <FocusPanel
          tasks={plan.rankedTasks}
          windows={plan.focusWindows}
          rescuePlan={plan.rescuePlan}
        />
        <SafeguardsPanel />
      </aside>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="brand-block">
        <div className="brand-mark">A</div>
        <div>
          <p>Autopilot-AI</p>
          <span>Command</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Workspace navigation">
        <a href="#tasks-title" className="nav-link active">
          <Inbox size={18} aria-hidden="true" />
          Daily plan
        </a>
        <a href="#integration-title" className="nav-link">
          <Link2 size={18} aria-hidden="true" />
          Sources
        </a>
        <a href="#improvements-title" className="nav-link">
          <SlidersHorizontal size={18} aria-hidden="true" />
          Actions
        </a>
        <a href="#calendar-title" className="nav-link">
          <CalendarDays size={18} aria-hidden="true" />
          Calendar
        </a>
        <a href="#safeguards-title" className="nav-link">
          <ShieldCheck size={18} aria-hidden="true" />
          Privacy
        </a>
      </nav>
      <div className="operator">
        <img
          src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&q=80"
          alt="Demo user avatar"
        />
        <div>
          <strong>Mock workspace</strong>
          <span>No live inbox data yet</span>
        </div>
      </div>
    </aside>
  );
}

function ProductivityPanel({
  activeSprintTask,
  captureMinutes,
  capturePriority,
  captureText,
  deepWork,
  nextSprintTask,
  notice,
  planMode,
  quickWins,
  onAddManualTask,
  onCaptureMinutesChange,
  onCapturePriorityChange,
  onCaptureTextChange,
  onFinishFocusSprint,
  onPlanModeChange,
  onStartFocusSprint,
}: {
  activeSprintTask: ActionItem | null;
  captureMinutes: number;
  capturePriority: EmailPriority;
  captureText: string;
  deepWork: ActionItem[];
  nextSprintTask: ActionItem | undefined;
  notice: string;
  planMode: PlanMode;
  quickWins: ActionItem[];
  onAddManualTask: () => void;
  onCaptureMinutesChange: (minutes: number) => void;
  onCapturePriorityChange: (priority: EmailPriority) => void;
  onCaptureTextChange: (text: string) => void;
  onFinishFocusSprint: () => void;
  onPlanModeChange: (mode: PlanMode) => void;
  onStartFocusSprint: () => void;
}) {
  const sprintTask = activeSprintTask ?? nextSprintTask;

  return (
    <section className="productivity-panel" aria-labelledby="productivity-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Productivity</span>
          <h2 id="productivity-title">Plan the next hour</h2>
        </div>
        <div className="status-pill ready" aria-live="polite">
          <CheckCircle2 size={15} aria-hidden="true" />
          {notice}
        </div>
      </div>

      <div className="productivity-grid">
        <article className="productivity-card">
          <span className="productivity-label">Focus sprint</span>
          <h3>{sprintTask ? sprintTask.title : "No open task"}</h3>
          <p>
            {sprintTask
              ? `${sprintTask.effort} minutes, impact ${sprintTask.impact}/10. Open the source thread, finish the task, then mark it done.`
              : "Everything open is either finished or waiting on someone else."}
          </p>
          <div className="button-row">
            <button
              className="primary-action"
              type="button"
              onClick={onStartFocusSprint}
              disabled={!nextSprintTask}
            >
              Start focus sprint
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={onFinishFocusSprint}
              disabled={!activeSprintTask}
            >
              Finish sprint
            </button>
          </div>
        </article>

        <form
          className="productivity-card quick-capture"
          onSubmit={(event) => {
            event.preventDefault();
            onAddManualTask();
          }}
        >
          <span className="productivity-label">Quick capture</span>
          <label className="field-label">
            Task
            <input
              aria-label="Quick capture task"
              value={captureText}
              onChange={(event) => onCaptureTextChange(event.target.value)}
              placeholder="Add a task before it disappears"
            />
          </label>
          <div className="capture-row">
            <label className="field-label">
              Minutes
              <input
                aria-label="Estimated minutes"
                min={5}
                max={180}
                step={5}
                type="number"
                value={captureMinutes}
                onChange={(event) => onCaptureMinutesChange(Number(event.target.value))}
              />
            </label>
            <label className="field-label">
              Priority
              <select
                aria-label="Captured task priority"
                value={capturePriority}
                onChange={(event) => onCapturePriorityChange(event.target.value as EmailPriority)}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <button className="secondary-action" type="submit">
            Add captured task
          </button>
        </form>

        <article className="productivity-card">
          <span className="productivity-label">Planning mode</span>
          <div className="segmented-row" aria-label="Planning mode">
            {(Object.keys(planModeLabels) as PlanMode[]).map((mode) => (
              <button
                className={planMode === mode ? "mini-filter active" : "mini-filter"}
                key={mode}
                type="button"
                onClick={() => onPlanModeChange(mode)}
                aria-pressed={planMode === mode}
              >
                {planModeLabels[mode]}
              </button>
            ))}
          </div>
          <div className="planning-lists">
            <MiniTaskStack title="Quick wins" tasks={quickWins} />
            <MiniTaskStack title="Deep work" tasks={deepWork} />
          </div>
        </article>
      </div>
    </section>
  );
}

function MiniTaskStack({ title, tasks }: { title: string; tasks: ActionItem[] }) {
  return (
    <div className="mini-task-stack">
      <strong>{title}</strong>
      {tasks.length === 0 ? <span>No open tasks</span> : null}
      {tasks.map((task) => (
        <span key={task.id}>
          {task.title} - {task.effort}m
        </span>
      ))}
    </div>
  );
}

function ImprovementStudio() {
  const [activeSurface, setActiveSurface] = useState<ImprovementTheme>("templates");
  const [mode, setMode] = useState<ImprovementMode>("personalized");
  const [role, setRole] = useState<UserRole>("operator");
  const [activeFilter, setActiveFilter] = useState<ImprovementFilter>("all");
  const [offlineMode, setOfflineMode] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const [appliedBehaviors, setAppliedBehaviors] = useState<AppliedBehavior[]>([]);
  const [syncQueue, setSyncQueue] = useState<AppliedBehavior[]>([]);
  const [lastBatch, setLastBatch] = useState<AppliedBehavior[]>([]);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [snoozedUntil, setSnoozedUntil] = useState("");
  const [showGuidance, setShowGuidance] = useState(true);
  const [draftInstruction, setDraftInstruction] = useState(surfaceFlows.templates.guidedStep);
  const [confirmedInstruction, setConfirmedInstruction] = useState(surfaceFlows.templates.guidedStep);
  const [pendingInstruction, setPendingInstruction] = useState("");
  const [liveMessage, setLiveMessage] = useState("Autopilot action lab is ready.");

  const flow = surfaceFlows[activeSurface];
  const behaviorActions = useMemo(
    () => buildBehaviorActions(activeSurface, mode, role),
    [activeSurface, mode, role],
  );
  const visibleActions = useMemo(
    () =>
      activeFilter === "all"
        ? behaviorActions
        : behaviorActions.filter((action) => action.capability === activeFilter),
    [activeFilter, behaviorActions],
  );
  const recommendationAction =
    behaviorActions.find((action) => action.capability === "recommendation") ?? behaviorActions[0];

  useEffect(() => {
    setDraftInstruction(surfaceFlows[activeSurface].guidedStep);
    setConfirmedInstruction(surfaceFlows[activeSurface].guidedStep);
    setPendingInstruction("");
    setSelectedActionIds(new Set());
  }, [activeSurface]);

  function createAppliedBehavior(action: BehaviorAction): AppliedBehavior {
    return {
      id: `${Date.now()}-${action.id}`,
      label: action.label,
      detail: action.detail,
      theme: activeSurface,
      capability: action.capability,
      synced: !offlineMode && action.capability !== "cross-device",
      createdAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };
  }

  function applyAction(action: BehaviorAction) {
    const next = createAppliedBehavior(action);
    setAppliedBehaviors((current) => [next, ...current]);
    setLastBatch([next]);
    if (!next.synced) {
      setSyncQueue((current) => [next, ...current]);
    }
    setLiveMessage(`${action.label} applied to ${themeLabels[activeSurface]}.`);
  }

  function toggleSelectedAction(actionId: string) {
    setSelectedActionIds((current) => {
      const next = new Set(current);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  }

  function applySelectedActions() {
    const selected = behaviorActions.filter((action) => selectedActionIds.has(action.id));
    if (selected.length === 0) {
      setLiveMessage("Select one or more actions before applying a batch.");
      return;
    }
    const applied = selected.map(createAppliedBehavior);
    setAppliedBehaviors((current) => [...applied, ...current]);
    setSyncQueue((current) => [
      ...applied.filter((action) => !action.synced),
      ...current,
    ]);
    setLastBatch(applied);
    setSelectedActionIds(new Set());
    setLiveMessage(`${applied.length} actions applied with undo available.`);
  }

  function undoLastBatch() {
    if (lastBatch.length === 0) {
      setLiveMessage("No batch is available to undo.");
      return;
    }
    const ids = new Set(lastBatch.map((action) => action.id));
    setAppliedBehaviors((current) => current.filter((action) => !ids.has(action.id)));
    setSyncQueue((current) => current.filter((action) => !ids.has(action.id)));
    setLiveMessage(`${lastBatch.length} actions undone.`);
    setLastBatch([]);
  }

  function snoozeReminder() {
    const until = new Date(Date.now() + 30 * 60 * 1000).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    setSnoozedUntil(until);
    setLiveMessage(`${themeLabels[activeSurface]} reminder snoozed until ${until}.`);
  }

  function createShareLink() {
    const url = buildShareStateUrl(window.location.href.split("#")[0], {
      theme: activeSurface,
      mode,
      role,
      presetName: flow.presetName,
      appliedCount: appliedBehaviors.length,
    });
    setShareUrl(url);
    setLiveMessage(`${themeLabels[activeSurface]} state link created.`);
  }

  function reviewInlineEdit() {
    setPendingInstruction(draftInstruction);
    setLiveMessage("Inline edit is staged for confirmation.");
  }

  function confirmInlineEdit() {
    if (!pendingInstruction) {
      setLiveMessage("Review an inline edit before confirming it.");
      return;
    }
    setConfirmedInstruction(pendingInstruction);
    setPendingInstruction("");
    setLiveMessage("Inline edit confirmed with safeguard review.");
  }

  function savePreset() {
    const preset: SavedPreset = {
      id: `${Date.now()}-${activeSurface}-${mode}-${role}`,
      name: flow.presetName,
      theme: activeSurface,
      mode,
      role,
      instruction: confirmedInstruction,
    };
    setSavedPresets((current) => [preset, ...current.filter((item) => item.name !== preset.name)]);
    setLiveMessage(`${preset.name} saved for quick restore.`);
  }

  function restorePreset(preset: SavedPreset) {
    setActiveSurface(preset.theme);
    setMode(preset.mode);
    setRole(preset.role);
    setDraftInstruction(preset.instruction);
    setConfirmedInstruction(preset.instruction);
    setLiveMessage(`${preset.name} restored.`);
  }

  function flushSyncQueue() {
    setAppliedBehaviors((current) =>
      current.map((action) => ({ ...action, synced: true })),
    );
    setSyncQueue([]);
    setOfflineMode(false);
    setLiveMessage("Queued actions synced across devices.");
  }

  return (
    <section className="improvement-section action-lab" aria-labelledby="improvements-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Autopilot-AI</span>
          <h2 id="improvements-title">Action lab</h2>
        </div>
        <div className="status-pill ready" aria-live="polite">
          <CheckCircle2 size={15} aria-hidden="true" />
          {surfaceOrder.length} workflows ready
        </div>
      </div>

      <div className="improvement-overview" aria-label="Action lab metrics">
        <Metric label="Surfaces" value={String(surfaceOrder.length)} />
        <Metric label="Capabilities" value={String(capabilityOrder.length)} />
        <Metric label="Applied" value={String(appliedBehaviors.length)} />
        <Metric label="Sync queue" value={String(syncQueue.length)} />
      </div>

      <div className="surface-tabs" aria-label="Work surfaces">
        {surfaceOrder.map((surface) => (
          <button
            className={activeSurface === surface ? "surface-tab active" : "surface-tab"}
            key={surface}
            type="button"
            onClick={() => setActiveSurface(surface)}
            aria-pressed={activeSurface === surface}
          >
            {themeLabels[surface]}
          </button>
        ))}
      </div>

      <div className="action-lab-layout">
        <div className="lab-column">
          <article className="lab-panel">
            <div className="idea-kicker">
              <span>{mode}</span>
              <span>{roleLabels[role]}</span>
              <span>{flow.source}</span>
            </div>
            <h3>{themeLabels[activeSurface]} recommendation</h3>
            <p>{getRoleRecommendation(activeSurface, role)}</p>
            <div className="segmented-row" aria-label="Mode">
              {(["personalized", "guided"] as ImprovementMode[]).map((option) => (
                <button
                  className={mode === option ? "mini-filter active" : "mini-filter"}
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  aria-pressed={mode === option}
                >
                  {option}
                </button>
              ))}
            </div>
            <label className="field-label">
              Role-aware defaults
              <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                {(Object.keys(roleLabels) as UserRole[]).map((option) => (
                  <option key={option} value={option}>
                    {roleLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-action full-width" type="button" onClick={() => applyAction(recommendationAction)}>
              Apply recommendation
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </article>

          <article className="lab-panel">
            <h3>Inline editing safeguard</h3>
            <textarea
              value={draftInstruction}
              onChange={(event) => setDraftInstruction(event.target.value)}
              aria-label="Inline instruction editor"
            />
            {pendingInstruction ? (
              <p className="pending-edit">Pending review: {pendingInstruction}</p>
            ) : null}
            <div className="button-row">
              <button className="secondary-action" type="button" onClick={reviewInlineEdit}>
                Review edit
              </button>
              <button className="secondary-action" type="button" onClick={confirmInlineEdit}>
                Confirm update
              </button>
            </div>
            <p className="confirmed-copy">Live instruction: {confirmedInstruction}</p>
          </article>

          <article className="lab-panel">
            <h3>Cross-device continuity</h3>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={offlineMode}
                onChange={(event) => setOfflineMode(event.target.checked)}
              />
              Work offline and queue changes
            </label>
            <p>{offlineMode ? "New actions will wait in the sync queue." : "New actions sync immediately unless they are continuity actions."}</p>
            <button className="secondary-action" type="button" onClick={flushSyncQueue}>
              Sync queued actions
            </button>
          </article>
        </div>

        <div className="lab-column wide">
          <article className="lab-panel">
            <div className="matrix-toolbar">
              <strong>Actions</strong>
              <div className="matrix-filters" aria-label="Behavior filters">
                {(["all", ...capabilityOrder] as ImprovementFilter[]).map((filterOption) => (
                  <button
                    className={activeFilter === filterOption ? "mini-filter active" : "mini-filter"}
                    key={filterOption}
                    type="button"
                    onClick={() => setActiveFilter(filterOption)}
                    aria-pressed={activeFilter === filterOption}
                  >
                    {filterOption === "all" ? "All" : capabilityLabels[filterOption]}
                  </button>
                ))}
              </div>
            </div>
            <div className="behavior-grid" aria-label="Action cards">
              {visibleActions.map((action) => (
                <article className="behavior-card" key={action.id}>
                  <label className="select-line">
                    <input
                      type="checkbox"
                      checked={selectedActionIds.has(action.id)}
                      onChange={() => toggleSelectedAction(action.id)}
                    />
                    <span>{action.label}</span>
                  </label>
                  <p>{action.detail}</p>
                  <button className="secondary-action" type="button" onClick={() => applyAction(action)}>
                    Use this
                  </button>
                </article>
              ))}
            </div>
            <div className="button-row">
              <button className="primary-action" type="button" onClick={applySelectedActions}>
                Apply selected
              </button>
              <button className="secondary-action" type="button" onClick={undoLastBatch}>
                Undo last batch
              </button>
            </div>
          </article>

          <div className="lab-split">
            <article className="lab-panel">
              <h3>Event trigger and snooze</h3>
              <p>{flow.reminder}</p>
              <button className="secondary-action" type="button" onClick={snoozeReminder}>
                Snooze 30 minutes
              </button>
              {snoozedUntil ? <p className="confirmed-copy">Next reminder: {snoozedUntil}</p> : null}
            </article>

            <article className="lab-panel">
              <h3>Shareable state</h3>
              <p>Preserve the current surface, mode, role, preset, and applied count.</p>
              <button className="secondary-action" type="button" onClick={createShareLink}>
                Create state link
              </button>
              {shareUrl ? <input className="share-output" readOnly value={shareUrl} aria-label="Shareable state link" /> : null}
            </article>
          </div>

          <div className="lab-split">
            <article className="lab-panel">
              <h3>Saved presets</h3>
              <button className="secondary-action" type="button" onClick={savePreset}>
                Save current preset
              </button>
              <div className="preset-list">
                {savedPresets.length === 0 ? <p>No saved presets yet.</p> : null}
                {savedPresets.map((preset) => (
                  <button
                    className="preset-row"
                    key={preset.id}
                    type="button"
                    onClick={() => restorePreset(preset)}
                  >
                    <strong>{preset.name}</strong>
                    <span>{roleLabels[preset.role]} - {preset.mode}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="lab-panel">
              <h3>Contextual guidance and accessibility</h3>
              <button className="secondary-action" type="button" onClick={() => setShowGuidance((current) => !current)}>
                {showGuidance ? "Hide guidance" : "Show guidance"}
              </button>
              {showGuidance ? (
                <p>{flow.guidedStep} Keyboard users can tab through every control and rely on the live status below.</p>
              ) : null}
              <p className="sr-status" aria-live="polite">{liveMessage}</p>
            </article>
          </div>

          <article className="lab-panel">
            <h3>Applied actions</h3>
            <div className="applied-list">
              {appliedBehaviors.length === 0 ? <p>No actions applied yet.</p> : null}
              {appliedBehaviors.slice(0, 6).map((action) => (
                <div className="applied-row" key={action.id}>
                  <strong>{action.label}</strong>
                  <span>{action.createdAt} - {action.synced ? "synced" : "queued"}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Header({
  summary,
}: {
  summary: ReturnType<typeof summarizePlan>;
}) {
  return (
    <header className="top-header">
      <div>
        <span className="eyebrow">Thursday, April 16</span>
        <h1 id="page-title">
          {summary.openCount} things need action, {summary.urgentCount} are urgent.
        </h1>
        <p>
          Email and calendar signals are ranked into a practical day plan. Live
          integrations stay gated until credentials and scopes are configured.
        </p>
      </div>
      <div className="metric-strip" aria-label="Daily metrics">
        <Metric label="Focus time" value={`${summary.focusMinutes}m`} />
        <Metric label="Waiting" value={String(summary.waitingCount)} />
        <Metric label="Sources" value="5" />
      </div>
    </header>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IntegrationCard({
  provider,
  onConnect,
}: {
  provider: IntegrationProvider;
  onConnect: (key: IntegrationKey) => void;
}) {
  const readiness = getConnectionReadiness(provider, hasSupabaseConfig);
  const canConnect = readiness === "ready";
  const actionLabel =
    readiness === "ready"
      ? `Connect ${provider.shortName}`
      : readiness === "needs-supabase"
        ? "Add Supabase env"
        : "Backend needed";

  return (
    <article className={`integration-card ${provider.accent}`}>
      <div className="integration-topline">
        <span>{provider.shortName}</span>
        <span>{provider.authKind}</span>
      </div>
      <h3>{provider.name}</h3>
      <p>{provider.summary}</p>
      <div className="tag-row">
        {provider.usefulFor.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <button
        type="button"
        className="secondary-action"
        disabled={!canConnect}
        onClick={() => onConnect(provider.key)}
      >
        {actionLabel}
      </button>
    </article>
  );
}

function TaskCard({
  task,
  todayISO,
  index,
  onToggle,
}: {
  task: ActionItem;
  todayISO: string;
  index: number;
  onToggle: (taskId: string) => void;
}) {
  const isDone = task.status === "done";
  const isWaiting = task.status === "waiting";

  return (
    <article className={isDone ? "task-card done" : "task-card"}>
      <div className="task-rank">{String(index + 1).padStart(2, "0")}</div>
      <div className="task-body">
        <div className="task-title-row">
          <div>
            <span className={`priority ${task.priority}`}>{task.priority}</span>
            <h3>{task.title}</h3>
          </div>
          <button
            type="button"
            className="check-button"
            onClick={() => onToggle(task.id)}
            disabled={isWaiting}
            aria-label={isDone ? `Reopen ${task.title}` : `Mark ${task.title} done`}
          >
            <CheckCircle2 size={20} aria-hidden="true" />
          </button>
        </div>
        <p>{task.detail}</p>
        <div className="task-meta-grid">
          <span>
            <Clock3 size={15} aria-hidden="true" />
            {formatDueLabel(task.dueAt, todayISO)}
          </span>
          <span>
            <SlidersHorizontal size={15} aria-hidden="true" />
            {task.effort}m, impact {task.impact}/10
          </span>
          <span>
            <ShieldCheck size={15} aria-hidden="true" />
            {task.confidence}% confidence
          </span>
        </div>
        <div className="source-row">
          <img src={task.sourceAvatar} alt={`${task.source} avatar`} />
          <div>
            <strong>{task.source}</strong>
            <span>{task.sourceSubject}</span>
          </div>
        </div>
        <div className="risk-note">
          <AlertTriangle size={16} aria-hidden="true" />
          {task.risk}
        </div>
      </div>
    </article>
  );
}

function CalendarPanel({ events, date }: { events: CalendarEvent[]; date: string }) {
  const weekDays = buildWeekDays(date);

  return (
    <section className="rail-section calendar-shell" aria-labelledby="calendar-title">
      <div className="calendar-appbar">
        <button type="button">Today</button>
        <div>
          <h2 id="calendar-title">Calendar</h2>
          <span>{formatCalendarHeader(date)}</span>
        </div>
        <CalendarDays size={18} aria-hidden="true" />
      </div>

      <div className="calendar-week-strip" aria-label="Week overview">
        {weekDays.map((day) => (
          <div className={day.isToday ? "calendar-day active" : "calendar-day"} key={day.key}>
            <span>{day.weekday}</span>
            <strong>{day.day}</strong>
          </div>
        ))}
      </div>

      <div className="calendar-day-grid" aria-label="Daily calendar">
        {Array.from({ length: calendarGridEndHour - calendarGridStartHour }).map((_, index) => {
          const hour = calendarGridStartHour + index;
          return (
            <div className="calendar-time-row" key={hour}>
              <span>{formatHourLabel(hour)}</span>
              <div />
            </div>
          );
        })}
        <div className="calendar-events-layer">
          {events.map((event) => (
            <article
              className={`calendar-event-block ${event.type}`}
              key={event.id}
              style={{
                top: `${getCalendarEventTop(event)}px`,
                height: `${getCalendarEventHeight(event)}px`,
              }}
            >
              <strong>{event.title}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="event-list compact-agenda" aria-label="Calendar agenda">
        {events.map((event) => (
          <article className={`event-row ${event.type}`} key={event.id}>
            <span>
              {formatTime(event.start)} - {formatTime(event.end)}
            </span>
            <strong>{event.title}</strong>
            {event.attendees ? <small>{event.attendees.join(", ")}</small> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function FocusPanel({
  tasks,
  windows,
  rescuePlan,
}: {
  tasks: ActionItem[];
  windows: { id: string; start: string; end: string; minutes: number; assignedTaskIds: string[] }[];
  rescuePlan: ActionItem[];
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <section className="rail-section">
      <div className="rail-heading">
        <MailOpen size={18} aria-hidden="true" />
        <h2>Focus windows</h2>
      </div>
      <div className="focus-list">
        {windows.slice(0, 3).map((window) => (
          <article key={window.id} className="focus-window">
            <span>
              {formatTime(window.start)} - {formatTime(window.end)} - {window.minutes}m
            </span>
            {window.assignedTaskIds.length > 0 ? (
              <strong>
                {window.assignedTaskIds
                  .map((taskId) => taskById.get(taskId)?.title)
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(" + ")}
              </strong>
            ) : (
              <strong>Hold for overflow</strong>
            )}
          </article>
        ))}
      </div>
      <div className="rescue-plan">
        <span className="eyebrow">If the day slips</span>
        {rescuePlan.length > 0 ? (
          <p>Move {rescuePlan.map((task) => task.source).join(", ")} to tomorrow morning.</p>
        ) : (
          <p>No rescue work needed after the current plan.</p>
        )}
      </div>
    </section>
  );
}

function SafeguardsPanel() {
  return (
    <section className="rail-section" aria-labelledby="safeguards-title">
      <div className="rail-heading">
        <LockKeyhole size={18} aria-hidden="true" />
        <h2 id="safeguards-title">Data guardrails</h2>
      </div>
      <ul className="guardrail-list">
        <li>OAuth tokens stay out of the browser for WhatsApp and message ingestion.</li>
        <li>Google starts read-only. Sending email needs a separate explicit scope.</li>
        <li>Every task keeps a source thread so users can verify the recommendation.</li>
        <li>Provider scopes are visible before the connection starts.</li>
      </ul>
    </section>
  );
}

function prioritizeTasksForMode(tasks: ActionItem[], mode: PlanMode): ActionItem[] {
  const ordered = [...tasks];
  if (mode === "impact") return ordered;

  return ordered.sort((a, b) => {
    const statusDelta = taskStatusWeight(a.status) - taskStatusWeight(b.status);
    if (statusDelta !== 0) return statusDelta;

    if (mode === "quickWins") {
      const effortDelta = a.effort - b.effort;
      if (effortDelta !== 0) return effortDelta;
      if (b.impact !== a.impact) return b.impact - a.impact;
      return b.rankScore - a.rankScore;
    }

    const impactDelta = b.impact - a.impact;
    if (impactDelta !== 0) return impactDelta;
    const effortDelta = b.effort - a.effort;
    if (effortDelta !== 0) return effortDelta;
    return b.rankScore - a.rankScore;
  });
}

function taskStatusWeight(status: TaskStatus): number {
  if (status === "open") return 0;
  if (status === "waiting") return 1;
  return 2;
}

function buildWeekDays(dateISO: string) {
  const current = new Date(`${dateISO}T12:00:00`);
  const start = new Date(current);
  start.setDate(current.getDate() - current.getDay());

  return Array.from({ length: 7 }).map((_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      key: day.toISOString(),
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day),
      day: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(day),
      isToday: day.toDateString() === current.toDateString(),
    };
  });
}

function formatCalendarHeader(dateISO: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dateISO}T12:00:00`));
}

function formatHourLabel(hour: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
  }).format(new Date(2026, 0, 1, hour));
}

function getCalendarEventTop(event: CalendarEvent): number {
  const start = new Date(event.start);
  const minutesFromStart =
    (start.getHours() - calendarGridStartHour) * 60 + start.getMinutes();
  return Math.max(0, (minutesFromStart / 60) * calendarHourHeight);
}

function getCalendarEventHeight(event: CalendarEvent): number {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const durationMinutes = Math.max(20, (end.getTime() - start.getTime()) / 60_000);
  const naturalHeight = Math.max(30, (durationMinutes / 60) * calendarHourHeight);
  const availableHeight = Math.max(22, calendarGridHeight - getCalendarEventTop(event) - 4);
  return Math.min(naturalHeight, availableHeight);
}

export default App;
