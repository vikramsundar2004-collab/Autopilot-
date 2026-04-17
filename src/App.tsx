import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
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
  Settings2,
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
import {
  completeOAuthRedirect,
  signOut,
  startEmailLogin,
  startGoogleLogin,
  startIntegrationConnection,
} from "./integrations/auth";
import { runDailyPlanner } from "./integrations/plannerApi";
import {
  getGoogleWorkspaceConnectionStatus,
  syncGoogleWorkspace,
} from "./integrations/workspaceSyncApi";
import {
  getConnectionReadiness,
  integrationProviders,
  type IntegrationKey,
  type IntegrationProvider,
} from "./integrations/providers";
import { hasSupabaseConfig, supabase } from "./integrations/supabaseClient";
import {
  defaultCustomizationSettings,
  loadCustomizationSettings,
  loadTutorialState,
  saveCustomizationSettings,
  saveTutorialState,
  sanitizeCustomizationSettings,
  type CalendarPreferences,
  type CustomizationSettings,
  type Density,
  type EventBlockSize,
  type PlanMode,
  type SidebarStyle,
  type TutorialState,
  type VisualTheme,
  type WorkspacePageKey,
} from "./preferences";
import type { ActionItem, CalendarEvent, EmailPriority, TaskStatus } from "./types";

type TaskFilter = "all" | "urgent" | "waiting" | "done";
type ImprovementFilter = "all" | ImprovementCapability;
const appPages = [
  "daily",
  "productivity",
  "sources",
  "actions",
  "customize",
  "calendar",
  "privacy",
  "premium",
] as const;
type AppPage = (typeof appPages)[number];

const pageLabels: Record<AppPage, string> = {
  daily: "Daily plan",
  productivity: "Productivity",
  sources: "Sources",
  actions: "Actions",
  customize: "Customize",
  calendar: "Calendar",
  privacy: "Privacy",
  premium: "$200 plan",
};

const premiumFeatures = [
  {
    title: "Executive command brief",
    outcome: "Daily CEO-level summary of what must be done, what is blocked, and which relationships need attention.",
    surface: "Daily plan",
  },
  {
    title: "Cross-platform work graph",
    outcome: "One source map for Gmail, Calendar, Slack, WhatsApp, Microsoft, Notion, and future tools.",
    surface: "Sources",
  },
  {
    title: "AI action engine with citations",
    outcome: "Every task keeps the source thread, confidence, risk, and the reason it was recommended.",
    surface: "Actions",
  },
  {
    title: "Protected focus scheduling",
    outcome: "Calendar-aware focus windows and rescue plans that protect expensive deep work.",
    surface: "Productivity",
  },
  {
    title: "Delegation and owner tracking",
    outcome: "Track who owns each follow-up, who is waiting, and where the next reminder belongs.",
    surface: "Productivity",
  },
  {
    title: "Approval-gated automation",
    outcome: "Draft replies, task changes, snoozes, and syncs are previewed before anything touches live accounts.",
    surface: "Actions",
  },
  {
    title: "Calendar operations view",
    outcome: "Google Calendar-style daily grid with agenda context, adjustable hours, and event sizing.",
    surface: "Calendar",
  },
  {
    title: "Enterprise privacy controls",
    outcome: "Read-only defaults, explicit provider scopes, source verification, and token boundaries.",
    surface: "Privacy",
  },
  {
    title: "Workspace personalization",
    outcome: "Per-user themes, density, visible work surfaces, planning defaults, and calendar preferences.",
    surface: "Customize",
  },
  {
    title: "Operator ROI dashboard",
    outcome: "Quantify time saved, decisions unblocked, meetings protected, and urgent work resolved.",
    surface: "$200 plan",
  },
] as const;

function getInitialPage(): AppPage {
  const rawHash = window.location.hash.replace(/^#\/?/, "");
  return appPages.includes(rawHash as AppPage) ? (rawHash as AppPage) : "daily";
}

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

const eventSizeHourHeight: Record<EventBlockSize, number> = {
  compact: 58,
  comfortable: 72,
  large: 88,
};

const tutorialSteps = [
  {
    title: "Start with the daily summary",
    body: "The top of Autopilot-AI tells you how much work needs action and what deserves attention first.",
  },
  {
    title: "Plan the next hour",
    body: "Use focus sprints, quick capture, and planning modes to turn the day into the next useful move.",
  },
  {
    title: "Connect your sources when ready",
    body: "The integration cards explain which tools can connect now and which need backend support later.",
  },
  {
    title: "Try the action lab",
    body: "The action lab lets you test apply, undo, snooze, share, and preset flows before live data is connected.",
  },
  {
    title: "Open the full calendar",
    body: "The larger calendar section shows your day in a Google Calendar-style grid with events and agenda context.",
  },
  {
    title: "Work from the action list",
    body: "The task list keeps priorities, due times, source threads, confidence, and risk visible while you work.",
  },
  {
    title: "Customize the workspace",
    body: "Change themes, density, visible sections, productivity defaults, and calendar hours from the Customize panel.",
  },
] as const;

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
  const authRequired = hasSupabaseConfig && import.meta.env.MODE !== "test";
  const [initialState] = useState(() => ({
    settings: loadCustomizationSettings(),
    tutorial: loadTutorialState(),
  }));
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(!authRequired);
  const [authNotice, setAuthNotice] = useState(
    hasSupabaseConfig
      ? "Use Google once to connect Gmail and Calendar."
      : "Add Supabase env vars before testing login.",
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [settings, setSettings] = useState<CustomizationSettings>(initialState.settings);
  const [tutorialState, setTutorialState] = useState<TutorialState>(initialState.tutorial);
  const [isTutorialOpen, setIsTutorialOpen] = useState(
    () => !initialState.tutorial.completed && !initialState.tutorial.skipped,
  );
  const [activePage, setActivePage] = useState<AppPage>(getInitialPage);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [manualTasks, setManualTasks] = useState<ActionItem[]>([]);
  const [planMode, setPlanMode] = useState<PlanMode>(
    initialState.settings.productivity.defaultPlanMode,
  );
  const [captureText, setCaptureText] = useState("");
  const [captureMinutes, setCaptureMinutes] = useState(
    initialState.settings.productivity.quickCaptureMinutes,
  );
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

  async function refreshGoogleConnectionStatus() {
    const status = await getGoogleWorkspaceConnectionStatus();
    setIsGoogleConnected(status.connected);
  }

  useEffect(() => {
    if (!authRequired || !supabase) return undefined;

    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setAuthSession(data.session);
      setIsAuthReady(true);
      if (data.session) {
        refreshGoogleConnectionStatus();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      setIsAuthReady(true);
      if (!session) {
        setIsGoogleConnected(false);
        return;
      }
      window.setTimeout(() => {
        refreshGoogleConnectionStatus();
      }, 0);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [authRequired]);

  useEffect(() => {
    let isMounted = true;
    let removeNativeListener: (() => void) | undefined;
    const handleConnectionResult = (result: Awaited<ReturnType<typeof completeOAuthRedirect>>) => {
      if (!isMounted) return;
      if (result) {
        if (result.googleConnected) {
          setIsGoogleConnected(true);
        }
        setConnectionNotice(result.message);
        setAuthNotice(result.message);
      }
    };

    completeOAuthRedirect().then(handleConnectionResult);
    import("@capacitor/app")
      .then(({ App: NativeApp }) =>
        NativeApp.addListener("appUrlOpen", ({ url }) => {
          completeOAuthRedirect(url).then(handleConnectionResult);
        }),
      )
      .then((listener) => {
        removeNativeListener = () => {
          void listener.remove();
        };
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      removeNativeListener?.();
    };
  }, []);

  useEffect(() => {
    function handleHashChange() {
      setActivePage(getInitialPage());
    }

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  function applySettings(nextSettings: CustomizationSettings) {
    const next = sanitizeCustomizationSettings(nextSettings);
    const previous = settings;
    setSettings(next);
    saveCustomizationSettings(next);

    if (previous.productivity.defaultPlanMode !== next.productivity.defaultPlanMode) {
      setPlanMode(next.productivity.defaultPlanMode);
      setProductivityNotice(
        `Default planning mode set to ${planModeLabels[next.productivity.defaultPlanMode].toLowerCase()}.`,
      );
    }

    if (previous.productivity.quickCaptureMinutes !== next.productivity.quickCaptureMinutes) {
      setCaptureMinutes(next.productivity.quickCaptureMinutes);
      setProductivityNotice(
        `Quick capture default set to ${next.productivity.quickCaptureMinutes} minutes.`,
      );
    }
  }

  function resetSettings() {
    applySettings(defaultCustomizationSettings);
    setProductivityNotice("Customization reset to clean defaults.");
  }

  function updateTutorialState(next: TutorialState) {
    setTutorialState(next);
    saveTutorialState(next);
  }

  function skipTutorial(stepIndex: number) {
    updateTutorialState({ completed: false, skipped: true, lastStep: stepIndex });
    setIsTutorialOpen(false);
  }

  function completeTutorial() {
    updateTutorialState({ completed: true, skipped: false, lastStep: tutorialSteps.length - 1 });
    setIsTutorialOpen(false);
  }

  function replayTutorial() {
    updateTutorialState({ completed: false, skipped: false, lastStep: 0 });
    setIsTutorialOpen(true);
  }

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
    setAuthNotice(result.message);
    if (result.googleConnected) {
      setIsGoogleConnected(true);
    }
  }

  async function syncGoogleWorkspaceData() {
    if (!isGoogleConnected) {
      setConnectionNotice("Connect Google once before syncing Gmail and Calendar.");
      return;
    }
    setConnectionNotice("Syncing Google Workspace data...");
    const result = await syncGoogleWorkspace({
      date: demoDate,
      maxEmails: 25,
      maxEvents: 50,
    });
    setConnectionNotice(
      result.ok
        ? `${result.message} ${result.emailCount ?? 0} emails and ${result.calendarEventCount ?? 0} calendar events stored.`
        : `Google sync failed: ${result.message}`,
    );
    if (result.ok) {
      setIsGoogleConnected(true);
    }
  }

  async function loginWithGoogle() {
    setAuthNotice("Opening Google sign-in...");
    const result = await startGoogleLogin();
    setAuthNotice(result.message);
  }

  async function loginWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthNotice("Sending login link...");
    const result = await startEmailLogin(loginEmail);
    setAuthNotice(result.message);
  }

  async function logout() {
    const result = await signOut();
    setAuthNotice(result.message);
    if (result.ok) {
      setAuthSession(null);
      setIsGoogleConnected(false);
    }
  }

  async function runApiPlanner() {
    setProductivityNotice("Running the AI planning API...");
    const result = await runDailyPlanner({
      date: demoDate,
      timezone: "America/Los_Angeles",
      planningMode: planMode,
    });
    setProductivityNotice(
      result.ok
        ? `${result.message} ${result.actionCount ?? 0} actions, ${result.scheduleBlockCount ?? 0} schedule blocks, ${result.approvalCount ?? 0} approvals.`
        : `AI planning API failed: ${result.message}`,
    );
  }

  function navigate(page: AppPage) {
    setActivePage(page);
    window.history.pushState({}, "", `#${page}`);
    if (!window.navigator.userAgent.includes("jsdom")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function renderProductivityPanel() {
    return (
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
        onRunApiPlanner={runApiPlanner}
        onStartFocusSprint={startFocusSprint}
      />
    );
  }

  function renderTaskSection() {
    return (
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
    );
  }

  function renderCurrentPage() {
    switch (activePage) {
      case "daily":
        return (
          <>
            <Header summary={summary} />
            <section className="command-band" aria-label="Daily command summary">
              <div>
                <span className="eyebrow">Today&apos;s call</span>
                <h2>Do the customer reply, renewal approval, and launch edit before 4 PM.</h2>
              </div>
              <button className="primary-action" type="button" onClick={() => navigate("productivity")}>
                Start next task
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </section>
            {renderTaskSection()}
          </>
        );
      case "productivity":
        return (
          <>
            <PageHeader
              eyebrow="Productivity"
              title="Plan the next block of work"
              body="Capture loose work, switch planning modes, and protect the next focus sprint without mixing it into the task list."
            />
            {renderProductivityPanel()}
            {settings.sections.focusWindows ? (
              <FocusPanel
                tasks={plan.rankedTasks}
                windows={plan.focusWindows}
                rescuePlan={plan.rescuePlan}
              />
            ) : (
              <HiddenSectionNotice
                title="Focus windows are hidden"
                body="Turn them back on in Customize when you want calendar-aware focus planning."
                onCustomize={() => navigate("customize")}
              />
            )}
          </>
        );
      case "sources":
        return (
          <>
            <PageHeader
              eyebrow="Sources"
              title="Connect the platforms that create work"
              body="Start with read-only Google Workspace through Supabase, then add server-backed Slack, WhatsApp, Microsoft, and Notion ingestion."
            />
            {settings.sections.integrations ? (
              <IntegrationPanel
                connectionNotice={connectionNotice}
                googleConnected={isGoogleConnected}
                onConnect={connectProvider}
                onSyncGoogle={syncGoogleWorkspaceData}
              />
            ) : (
              <HiddenSectionNotice
                title="Sources are hidden"
                body="The integration page is disabled by your workspace visibility settings."
                onCustomize={() => navigate("customize")}
              />
            )}
            <SupabaseSetupPanel />
          </>
        );
      case "actions":
        return (
          <>
            <PageHeader
              eyebrow="Actions"
              title="Turn recommendations into controlled changes"
              body="Apply, undo, queue, snooze, share, and save AI action presets before connecting live inbox data."
            />
            {settings.sections.actionLab ? (
              <ImprovementStudio />
            ) : (
              <HiddenSectionNotice
                title="Action lab is hidden"
                body="Turn it back on in Customize when you want to test automations and approval flows."
                onCustomize={() => navigate("customize")}
              />
            )}
          </>
        );
      case "customize":
        return (
          <>
            <PageHeader
              eyebrow="Customize"
              title="Control how Autopilot-AI works"
              body="Adjust theme, density, visible pages, productivity defaults, and calendar behavior. Changes apply immediately and persist locally."
            />
            <CustomizationPanel
              settings={settings}
              onChange={applySettings}
              onReplayTutorial={replayTutorial}
              onReset={resetSettings}
            />
          </>
        );
      case "calendar":
        return (
          <>
            <PageHeader
              eyebrow="Calendar"
              title="Work from a larger daily calendar"
              body="A Google Calendar-style view keeps the time grid, event colors, agenda, and adjustable work hours in one focused page."
            />
            <FullCalendarSection
              date={demoDate}
              events={demoCalendar}
              preferences={settings.calendar}
            />
          </>
        );
      case "privacy":
        return (
          <>
            <PageHeader
              eyebrow="Privacy"
              title="Keep live data behind explicit controls"
              body="Autopilot-AI starts read-only, keeps tokens out of browser-only config, and marks every AI task with a source trail."
            />
            {settings.sections.safeguards ? (
              <SafeguardsPanel />
            ) : (
              <HiddenSectionNotice
                title="Data guardrails are hidden"
                body="Turn them back on in Customize before testing live provider data."
                onCustomize={() => navigate("customize")}
              />
            )}
            <SecurityReadinessPanel />
          </>
        );
      case "premium":
        return (
          <PremiumValuePage
            onOpenActions={() => navigate("actions")}
            onOpenCalendar={() => navigate("calendar")}
            onOpenSources={() => navigate("sources")}
          />
        );
      default:
        return null;
    }
  }

  if (authRequired && !isAuthReady) {
    return <AuthLoadingScreen />;
  }

  if (authRequired && !authSession) {
    return (
      <LoginPage
        email={loginEmail}
        notice={authNotice}
        onEmailChange={setLoginEmail}
        onEmailSubmit={loginWithEmail}
        onGoogleLogin={loginWithGoogle}
      />
    );
  }

  return (
    <div
      className={`app-shell theme-${settings.visualTheme} density-${settings.density} sidebar-${settings.layout.sidebarStyle}`}
      data-theme={settings.visualTheme}
      data-density={settings.density}
    >
      <Sidebar
        activePage={activePage}
        googleConnected={isGoogleConnected}
        layout={settings.layout}
        session={authSession}
        onNavigate={navigate}
        onSignOut={authRequired ? logout : undefined}
      />
      <main className="workspace page-workspace" aria-labelledby="page-title">
        {renderCurrentPage()}
      </main>
      <TutorialModal
        isOpen={isTutorialOpen}
        initialStep={tutorialState.lastStep}
        onComplete={completeTutorial}
        onSkip={skipTutorial}
      />
    </div>
  );
}

function AuthLoadingScreen() {
  return (
    <main className="auth-shell" aria-label="Loading Autopilot-AI">
      <section className="auth-panel">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <p>Autopilot-AI</p>
            <span>Loading workspace</span>
          </div>
        </div>
        <p className="auth-note">Checking your session.</p>
      </section>
    </main>
  );
}

function LoginPage({
  email,
  notice,
  onEmailChange,
  onEmailSubmit,
  onGoogleLogin,
}: {
  email: string;
  notice: string;
  onEmailChange: (email: string) => void;
  onEmailSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleLogin: () => void;
}) {
  return (
    <main className="auth-shell" aria-labelledby="login-title">
      <section className="auth-panel">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <p>Autopilot-AI</p>
            <span>Command</span>
          </div>
        </div>
        <span className="eyebrow">Sign in</span>
        <h1 id="login-title">Connect the inbox once. Work from the plan every day.</h1>
        <p className="auth-copy">
          Google sign-in connects Gmail and Calendar with read-only access. Email sign-in keeps your account available
          when you want to connect Google later.
        </p>
        <button className="google-login-button" type="button" onClick={onGoogleLogin}>
          <span aria-hidden="true">G</span>
          Continue with Google
        </button>
        <div className="auth-divider">or</div>
        <form className="email-login-form" onSubmit={onEmailSubmit}>
          <label className="field-label">
            Email
            <input
              aria-label="Email address"
              autoComplete="email"
              inputMode="email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </label>
          <button className="secondary-action" type="submit">
            Send login link
          </button>
        </form>
        <p className="auth-note" aria-live="polite">
          {notice}
        </p>
      </section>
    </main>
  );
}

function Sidebar({
  activePage,
  googleConnected,
  layout,
  session,
  onNavigate,
  onSignOut,
}: {
  activePage: AppPage;
  googleConnected: boolean;
  layout: CustomizationSettings["layout"];
  session: Session | null;
  onNavigate: (page: AppPage) => void;
  onSignOut?: () => void;
}) {
  const navIcons: Record<AppPage, ReactNode> = {
    daily: <Inbox size={18} aria-hidden="true" />,
    productivity: <MailOpen size={18} aria-hidden="true" />,
    sources: <Link2 size={18} aria-hidden="true" />,
    actions: <SlidersHorizontal size={18} aria-hidden="true" />,
    customize: <Settings2 size={18} aria-hidden="true" />,
    calendar: <CalendarDays size={18} aria-hidden="true" />,
    privacy: <ShieldCheck size={18} aria-hidden="true" />,
    premium: <CheckCircle2 size={18} aria-hidden="true" />,
  };
  const orderedPages = [
    ...layout.pageOrder.filter((page) => layout.pinnedPages.includes(page)),
    ...layout.pageOrder.filter((page) => !layout.pinnedPages.includes(page)),
  ].filter((page): page is AppPage => appPages.includes(page as AppPage));

  return (
    <aside className={`sidebar sidebar-style-${layout.sidebarStyle}`} aria-label="Primary">
      <div className="brand-block">
        <div className="brand-mark">A</div>
        <div>
          <p>Autopilot-AI</p>
          <span>Command</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Workspace navigation">
        {orderedPages.map((page) => (
          <button
            aria-current={activePage === page ? "page" : undefined}
            className={activePage === page ? "nav-link active" : "nav-link"}
            key={page}
            onClick={() => onNavigate(page)}
            type="button"
            title={pageLabels[page]}
          >
            {navIcons[page]}
            <span>{pageLabels[page]}</span>
            {layout.pinnedPages.includes(page) ? <small>pinned</small> : null}
          </button>
        ))}
      </nav>
      <button className="sidebar-quick-action" type="button" onClick={() => onNavigate("customize")}>
        Quick customization
      </button>
      <div className="operator">
        <img
          src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&q=80"
          alt=""
        />
        <div>
          <strong>{session?.user.email ?? "Mock workspace"}</strong>
          <span>{googleConnected ? "Google connected" : "Google not connected"}</span>
        </div>
      </div>
      {onSignOut ? (
        <button className="sidebar-signout" type="button" onClick={onSignOut}>
          Sign out
        </button>
      ) : null}
    </aside>
  );
}

function PageHeader({
  body,
  eyebrow,
  title,
}: {
  body: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 id="page-title">{title}</h1>
        <p>{body}</p>
      </div>
    </header>
  );
}

function HiddenSectionNotice({
  body,
  onCustomize,
  title,
}: {
  body: string;
  onCustomize: () => void;
  title: string;
}) {
  return (
    <section className="hidden-section-notice" aria-label={title}>
      <div>
        <span className="eyebrow">Hidden by customization</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <button className="secondary-action" type="button" onClick={onCustomize}>
        Open Customize
      </button>
    </section>
  );
}

function IntegrationPanel({
  connectionNotice,
  googleConnected,
  onConnect,
  onSyncGoogle,
}: {
  connectionNotice: string;
  googleConnected: boolean;
  onConnect: (key: IntegrationKey) => void;
  onSyncGoogle: () => void;
}) {
  return (
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
      <div className="button-row source-actions">
        <button
          className="primary-action"
          type="button"
          onClick={onSyncGoogle}
          disabled={!hasSupabaseConfig || !googleConnected}
        >
          Sync Google data
        </button>
        <span className="inline-help">
          {googleConnected
            ? "Google is saved. Sync stores recent Gmail and today's Calendar events."
            : "Connect Google once to enable Gmail and Calendar sync."}
        </span>
      </div>
      <div className="integration-grid">
        {integrationProviders.map((provider) => (
          <IntegrationCard
            googleConnected={googleConnected}
            key={provider.key}
            provider={provider}
            onConnect={onConnect}
          />
        ))}
      </div>
    </section>
  );
}

function SupabaseSetupPanel() {
  const callbackUrl = "https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback";

  return (
    <section className="setup-panel" aria-labelledby="supabase-setup-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Supabase setup</span>
          <h2 id="supabase-setup-title">What to configure before live testing</h2>
        </div>
        <div className={hasSupabaseConfig ? "status-pill ready" : "status-pill"}>
          {hasSupabaseConfig ? "Local env detected" : ".env still needed"}
        </div>
      </div>
      <div className="setup-grid">
        <article>
          <strong>1. Create the project</strong>
          <p>Create a Supabase project, then copy `.env.example` to `.env`.</p>
        </article>
        <article>
          <strong>2. Add browser-safe keys</strong>
          <p>Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL=http://127.0.0.1:5173`.</p>
        </article>
        <article>
          <strong>3. Enable Google Auth</strong>
          <p>In Supabase Auth, enable Google and paste the Google OAuth client ID and secret.</p>
        </article>
        <article>
          <strong>4. Match redirect URLs</strong>
          <p>Add `{callbackUrl}` in Google Cloud and Supabase provider settings, then restart Vite.</p>
        </article>
        <article>
          <strong>5. Deploy API functions</strong>
          <p>Deploy `store-google-connection`, `sync-google-workspace`, and `plan-day`, then set Google, encryption, and OpenAI secrets.</p>
        </article>
      </div>
    </section>
  );
}

function SecurityReadinessPanel() {
  return (
    <section className="setup-panel" aria-labelledby="security-readiness-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CSO checks</span>
          <h2 id="security-readiness-title">Security posture for the first connected build</h2>
        </div>
      </div>
      <div className="setup-grid compact">
        <article>
          <strong>Browser keys only</strong>
          <p>Only the Supabase anon key is allowed in `VITE_` variables.</p>
        </article>
        <article>
          <strong>Read-only Google scopes</strong>
          <p>Gmail and Calendar start read-only until send actions have explicit approval gates.</p>
        </article>
        <article>
          <strong>Server-only provider tokens</strong>
          <p>WhatsApp, Microsoft, and Notion tokens stay behind backend routes and row-level security.</p>
        </article>
        <article>
          <strong>Source-backed AI</strong>
          <p>Every AI recommendation keeps source context, confidence, and risk visible.</p>
        </article>
      </div>
    </section>
  );
}

function PremiumValuePage({
  onOpenActions,
  onOpenCalendar,
  onOpenSources,
}: {
  onOpenActions: () => void;
  onOpenCalendar: () => void;
  onOpenSources: () => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="$200/month value"
        title="Make Autopilot-AI feel like an operator, not a task list"
        body="The premium version needs to save executive time, reduce missed follow-ups, and make every platform feel like one command center."
      />
      <section className="premium-panel" aria-labelledby="premium-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Built into this version</span>
            <h2 id="premium-title">Premium capabilities to justify the price</h2>
          </div>
          <div className="status-pill ready">10 value drivers</div>
        </div>
        <div className="premium-grid">
          {premiumFeatures.map((feature) => (
            <article className="premium-card" key={feature.title}>
              <span>{feature.surface}</span>
              <h3>{feature.title}</h3>
              <p>{feature.outcome}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="premium-actions" aria-label="Premium workflows">
        <button className="primary-action" type="button" onClick={onOpenSources}>
          Configure sources
        </button>
        <button className="secondary-action" type="button" onClick={onOpenActions}>
          Test action engine
        </button>
        <button className="secondary-action" type="button" onClick={onOpenCalendar}>
          Open calendar operations
        </button>
      </section>
    </>
  );
}

function CustomizationPanel({
  settings,
  onChange,
  onReplayTutorial,
  onReset,
}: {
  settings: CustomizationSettings;
  onChange: (settings: CustomizationSettings) => void;
  onReplayTutorial: () => void;
  onReset: () => void;
}) {
  function update(next: Partial<CustomizationSettings>) {
    onChange({ ...settings, ...next });
  }

  function updateSections(next: Partial<CustomizationSettings["sections"]>) {
    onChange({ ...settings, sections: { ...settings.sections, ...next } });
  }

  function updateProductivity(next: Partial<CustomizationSettings["productivity"]>) {
    onChange({ ...settings, productivity: { ...settings.productivity, ...next } });
  }

  function updateCalendar(next: Partial<CalendarPreferences>) {
    onChange({ ...settings, calendar: { ...settings.calendar, ...next } });
  }

  function updateLayout(next: Partial<CustomizationSettings["layout"]>) {
    onChange({ ...settings, layout: { ...settings.layout, ...next } });
  }

  function movePage(page: WorkspacePageKey, direction: -1 | 1) {
    const currentIndex = settings.layout.pageOrder.indexOf(page);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= settings.layout.pageOrder.length) return;
    const nextOrder = [...settings.layout.pageOrder];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
    updateLayout({ pageOrder: nextOrder });
  }

  function togglePinnedPage(page: WorkspacePageKey) {
    const isPinned = settings.layout.pinnedPages.includes(page);
    const pinnedPages = isPinned
      ? settings.layout.pinnedPages.filter((item) => item !== page)
      : [...settings.layout.pinnedPages, page].slice(0, 4);
    updateLayout({ pinnedPages });
  }

  return (
    <section className="customize-panel" aria-labelledby="customize-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Customize</span>
          <h2 id="customize-title">Make the workspace yours</h2>
        </div>
        <div className="button-row compact-actions">
          <button className="secondary-action" type="button" onClick={onReplayTutorial}>
            Replay tutorial
          </button>
          <button className="secondary-action" type="button" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      <div className="customize-grid">
        <article className="customize-card">
          <h3>Look and feel</h3>
          <label className="field-label">
            Visual theme
            <select
              aria-label="Visual theme"
              value={settings.visualTheme}
              onChange={(event) => update({ visualTheme: event.target.value as VisualTheme })}
            >
              <option value="clean">Clean light</option>
              <option value="contrast">High contrast</option>
              <option value="green">Soft green accent</option>
              <option value="blue">Blue calendar accent</option>
            </select>
          </label>
          <label className="field-label">
            Density
            <select
              aria-label="Workspace density"
              value={settings.density}
              onChange={(event) => update({ density: event.target.value as Density })}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
              <option value="spacious">Spacious</option>
            </select>
          </label>
        </article>

        <article className="customize-card">
          <h3>Workspace sections</h3>
          <ToggleField
            checked={settings.sections.integrations}
            label="Show integrations"
            onChange={(checked) => updateSections({ integrations: checked })}
          />
          <ToggleField
            checked={settings.sections.actionLab}
            label="Show action lab"
            onChange={(checked) => updateSections({ actionLab: checked })}
          />
          <ToggleField
            checked={settings.sections.focusWindows}
            label="Show focus windows"
            onChange={(checked) => updateSections({ focusWindows: checked })}
          />
          <ToggleField
            checked={settings.sections.safeguards}
            label="Show data guardrails"
            onChange={(checked) => updateSections({ safeguards: checked })}
          />
        </article>

        <article className="customize-card workspace-layout-card">
          <h3>Workspace layout</h3>
          <label className="field-label">
            Sidebar style
            <select
              aria-label="Sidebar style"
              value={settings.layout.sidebarStyle}
              onChange={(event) => updateLayout({ sidebarStyle: event.target.value as SidebarStyle })}
            >
              <option value="full">Full labels</option>
              <option value="compact">Compact rail</option>
              <option value="minimal">Minimal icons</option>
            </select>
          </label>
          <div className="workspace-order-list" aria-label="Sidebar page order">
            {settings.layout.pageOrder.map((page, index) => (
              <div className="workspace-order-row" key={page}>
                <button
                  className={settings.layout.pinnedPages.includes(page) ? "pin-button active" : "pin-button"}
                  type="button"
                  onClick={() => togglePinnedPage(page)}
                  aria-pressed={settings.layout.pinnedPages.includes(page)}
                >
                  Pin
                </button>
                <span>{pageLabels[page]}</span>
                <button
                  className="mini-filter"
                  type="button"
                  onClick={() => movePage(page, -1)}
                  disabled={index === 0}
                >
                  Up
                </button>
                <button
                  className="mini-filter"
                  type="button"
                  onClick={() => movePage(page, 1)}
                  disabled={index === settings.layout.pageOrder.length - 1}
                >
                  Down
                </button>
              </div>
            ))}
          </div>
          <p className="inline-help">Pinned pages stay at the top of the sidebar. Move rows to match how you work.</p>
        </article>

        <article className="customize-card">
          <h3>Productivity defaults</h3>
          <label className="field-label">
            Default planning mode
            <select
              aria-label="Default planning mode"
              value={settings.productivity.defaultPlanMode}
              onChange={(event) =>
                updateProductivity({ defaultPlanMode: event.target.value as PlanMode })
              }
            >
              <option value="impact">Impact</option>
              <option value="quickWins">Quick wins</option>
              <option value="deepWork">Deep work</option>
            </select>
          </label>
          <label className="field-label">
            Quick capture minutes
            <input
              aria-label="Default quick capture minutes"
              min={5}
              max={180}
              step={5}
              type="number"
              value={settings.productivity.quickCaptureMinutes}
              onChange={(event) =>
                updateProductivity({ quickCaptureMinutes: Number(event.target.value) })
              }
            />
          </label>
        </article>

        <article className="customize-card">
          <h3>Calendar</h3>
          <div className="capture-row">
            <label className="field-label">
              Start hour
              <input
                aria-label="Calendar start hour"
                min={5}
                max={22}
                type="number"
                value={settings.calendar.startHour}
                onChange={(event) => updateCalendar({ startHour: Number(event.target.value) })}
              />
            </label>
            <label className="field-label">
              End hour
              <input
                aria-label="Calendar end hour"
                min={6}
                max={23}
                type="number"
                value={settings.calendar.endHour}
                onChange={(event) => updateCalendar({ endHour: Number(event.target.value) })}
              />
            </label>
          </div>
          <label className="field-label">
            Event block size
            <select
              aria-label="Event block size"
              value={settings.calendar.eventSize}
              onChange={(event) => updateCalendar({ eventSize: event.target.value as EventBlockSize })}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="large">Large</option>
            </select>
          </label>
          <ToggleField
            checked={settings.calendar.showAgenda}
            label="Show full calendar agenda"
            onChange={(checked) => updateCalendar({ showAgenda: checked })}
          />
        </article>
      </div>
    </section>
  );
}

function ToggleField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
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
  onRunApiPlanner,
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
  onRunApiPlanner: () => void;
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
            <button className="secondary-action" type="button" onClick={onRunApiPlanner}>
              Run AI planning API
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
  const [enabledActionIds, setEnabledActionIds] = useState<Set<string>>(new Set());
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
    setEnabledActionIds((current) => new Set(current).add(action.id));
    setAppliedBehaviors((current) => [next, ...current]);
    setLastBatch([next]);
    if (!next.synced) {
      setSyncQueue((current) => [next, ...current]);
    }
    setLiveMessage(`${action.label} is now enabled for ${themeLabels[activeSurface]}.`);
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
    setEnabledActionIds((current) => {
      const next = new Set(current);
      selected.forEach((action) => next.add(action.id));
      return next;
    });
    setAppliedBehaviors((current) => [...applied, ...current]);
    setSyncQueue((current) => [
      ...applied.filter((action) => !action.synced),
      ...current,
    ]);
    setLastBatch(applied);
    setSelectedActionIds(new Set());
    setLiveMessage(`${applied.length} features enabled with undo available.`);
  }

  function undoLastBatch() {
    if (lastBatch.length === 0) {
      setLiveMessage("No batch is available to undo.");
      return;
    }
    const ids = new Set(lastBatch.map((action) => action.id));
    const labels = new Set(lastBatch.map((action) => action.label));
    setEnabledActionIds((current) => {
      const next = new Set(current);
      behaviorActions.forEach((action) => {
        if (labels.has(action.label)) next.delete(action.id);
      });
      return next;
    });
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
        <Metric label="Enabled" value={String(enabledActionIds.size)} />
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
                <article
                  className={enabledActionIds.has(action.id) ? "behavior-card enabled" : "behavior-card"}
                  key={action.id}
                >
                  <label className="select-line">
                    <input
                      type="checkbox"
                      checked={selectedActionIds.has(action.id)}
                      onChange={() => toggleSelectedAction(action.id)}
                    />
                    <span>{action.label}</span>
                  </label>
                  <p>{action.detail}</p>
                  {enabledActionIds.has(action.id) ? <span className="enabled-pill">Feature enabled</span> : null}
                  <button className="secondary-action" type="button" onClick={() => applyAction(action)}>
                    {enabledActionIds.has(action.id) ? "Use again" : "Use this"}
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
  googleConnected,
  provider,
  onConnect,
}: {
  googleConnected: boolean;
  provider: IntegrationProvider;
  onConnect: (key: IntegrationKey) => void;
}) {
  const readiness = getConnectionReadiness(provider, hasSupabaseConfig);
  const isConnected = provider.key === "google" && googleConnected;
  const canConnect = readiness === "ready" && !isConnected;
  const actionLabel =
    isConnected
      ? "Connected"
      : readiness === "ready"
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

function FullCalendarSection({
  date,
  events,
  preferences,
}: {
  date: string;
  events: CalendarEvent[];
  preferences: CalendarPreferences;
}) {
  const weekDays = buildWeekDays(date);
  const hourHeight = eventSizeHourHeight[preferences.eventSize];
  const hours = buildCalendarHours(preferences.startHour, preferences.endHour);
  const gridHeight = hours.length * hourHeight;

  return (
    <section className="full-calendar-section" aria-labelledby="full-calendar-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Calendar</span>
          <h2 id="full-calendar-title">Full calendar</h2>
        </div>
        <div className="status-pill ready">
          <CalendarDays size={15} aria-hidden="true" />
          {formatCalendarHeader(date)}
        </div>
      </div>

      <div className="full-calendar-layout">
        <div className="full-calendar-main">
          <div className="calendar-toolbar">
            <button type="button">Today</button>
            <span>
              {preferences.startHour}:00 - {preferences.endHour}:00
            </span>
          </div>

          <div className="calendar-week-strip large" aria-label="Week overview">
            {weekDays.map((day) => (
              <div className={day.isToday ? "calendar-day active" : "calendar-day"} key={day.key}>
                <span>{day.weekday}</span>
                <strong>{day.day}</strong>
              </div>
            ))}
          </div>

          <div
            className={`calendar-day-grid full size-${preferences.eventSize}`}
            aria-label="Daily calendar"
            style={{ height: `${gridHeight}px` }}
          >
            {hours.map((hour) => (
              <div
                className="calendar-time-row"
                key={hour}
                style={{ height: `${hourHeight}px` }}
              >
                <span>{formatHourLabel(hour)}</span>
                <div />
              </div>
            ))}
            <div className="calendar-events-layer">
              {events.map((event) => (
                <article
                  className={`calendar-event-block ${event.type}`}
                  key={event.id}
                  style={{
                    top: `${getCalendarEventTop(event, preferences.startHour, hourHeight)}px`,
                    height: `${getCalendarEventHeight(
                      event,
                      preferences.startHour,
                      preferences.endHour,
                      hourHeight,
                    )}px`,
                  }}
                >
                  <strong>{event.title}</strong>
                  <span>
                    {formatTime(event.start)} - {formatTime(event.end)}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </div>

        {preferences.showAgenda ? (
          <aside className="full-calendar-agenda" aria-label="Calendar agenda">
            <h3>Agenda</h3>
            {events.map((event) => (
              <article className={`event-row ${event.type}`} key={event.id}>
                <span>
                  {formatTime(event.start)} - {formatTime(event.end)}
                </span>
                <strong>{event.title}</strong>
                {event.attendees ? <small>{event.attendees.join(", ")}</small> : null}
              </article>
            ))}
          </aside>
        ) : null}
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

function TutorialModal({
  initialStep,
  isOpen,
  onComplete,
  onSkip,
}: {
  initialStep: number;
  isOpen: boolean;
  onComplete: () => void;
  onSkip: (stepIndex: number) => void;
}) {
  const [stepIndex, setStepIndex] = useState(initialStep);
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = tutorialSteps[stepIndex] ?? tutorialSteps[0];
  const isFinalStep = stepIndex === tutorialSteps.length - 1;

  useEffect(() => {
    if (isOpen) {
      setStepIndex(initialStep);
    }
  }, [initialStep, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    const focusable = Array.from(
      dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter((element) => !element.hasAttribute("disabled"));
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip(stepIndex);
        return;
      }

      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onSkip, stepIndex]);

  if (!isOpen) return null;

  return (
    <div className="tutorial-backdrop" role="presentation">
      <div
        aria-describedby="tutorial-body"
        aria-labelledby="tutorial-title"
        aria-modal="true"
        className="tutorial-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <div className="tutorial-step-count">
          Step {stepIndex + 1} of {tutorialSteps.length}
        </div>
        <h2 id="tutorial-title">{step.title}</h2>
        <p id="tutorial-body">{step.body}</p>
        <div className="tutorial-progress" aria-hidden="true">
          {tutorialSteps.map((item, index) => (
            <span
              className={index === stepIndex ? "active" : ""}
              key={item.title}
            />
          ))}
        </div>
        <div className="tutorial-actions">
          <button
            className="secondary-action"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            type="button"
          >
            Back
          </button>
          <button
            className="secondary-action"
            onClick={() => onSkip(stepIndex)}
            type="button"
          >
            Skip tutorial
          </button>
          {isFinalStep ? (
            <button className="primary-action" onClick={onComplete} type="button">
              Start using Autopilot-AI
            </button>
          ) : (
            <button
              className="primary-action"
              onClick={() =>
                setStepIndex((current) => Math.min(tutorialSteps.length - 1, current + 1))
              }
              type="button"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
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

function buildCalendarHours(startHour: number, endHour: number): number[] {
  return Array.from({ length: Math.max(1, endHour - startHour) }).map(
    (_, index) => startHour + index,
  );
}

function getCalendarEventTop(
  event: CalendarEvent,
  startHour: number,
  hourHeight: number,
): number {
  const start = new Date(event.start);
  const minutesFromStart = (start.getHours() - startHour) * 60 + start.getMinutes();
  return Math.max(0, (minutesFromStart / 60) * hourHeight);
}

function getCalendarEventHeight(
  event: CalendarEvent,
  startHour: number,
  endHour: number,
  hourHeight: number,
): number {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const top = getCalendarEventTop(event, startHour, hourHeight);
  const gridHeight = Math.max(1, endHour - startHour) * hourHeight;
  const durationMinutes = Math.max(20, (end.getTime() - start.getTime()) / 60_000);
  const naturalHeight = Math.max(30, (durationMinutes / 60) * hourHeight);
  const availableHeight = Math.max(22, gridHeight - top - 4);
  return Math.min(naturalHeight, availableHeight);
}

export default App;
