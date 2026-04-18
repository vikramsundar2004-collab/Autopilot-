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
import { loadManualCalendarEvents, saveManualCalendarEvents } from "./calendarStore";
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
  buildLocalDayRange,
  getLocalDateISO,
  loadWorkspaceData,
  localDateFromIso,
  type WorkspaceDataSource,
} from "./integrations/workspaceData";
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
import type {
  ActionItem,
  CalendarEvent,
  CalendarEventType,
  EmailMessage,
  EmailPriority,
  TaskCategory,
  TaskStatus,
} from "./types";

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

interface PlaybookTaskBlueprint {
  title: string;
  detail: string;
  effort: number;
  priority: EmailPriority;
  category: TaskCategory;
  impact: number;
  labels: string[];
}

interface RescuePlaybook {
  id: string;
  title: string;
  summary: string;
  trigger: string;
  duration: number;
  mode: PlanMode;
  outcome: string;
  tasks: PlaybookTaskBlueprint[];
}

interface ActivatedPlaybook {
  id: string;
  playbookId: string;
  title: string;
  activatedAt: string;
  outcome: string;
  createdTaskIds: string[];
}

type MomentumKind = "playbook" | "win" | "handoff";
type HandoffChannel = "email" | "slack" | "link";

interface MomentumEvent {
  id: string;
  kind: MomentumKind;
  title: string;
  detail: string;
  createdAt: string;
}

interface TeamHandoff {
  id: string;
  taskId: string;
  taskTitle: string;
  owner: string;
  note: string;
  channel: HandoffChannel;
  sharedAt: string;
  shareUrl: string;
}

interface MilestoneProgress {
  id: string;
  title: string;
  detail: string;
  target: number;
  current: number;
  complete: boolean;
}

const rescuePlaybooks: RescuePlaybook[] = [
  {
    id: "inbox-reset",
    title: "Inbox reset",
    summary: "Shrink overload into the next three moves and one protected follow-up window.",
    trigger: "Best when urgent mail is stacking up and context-switching is getting expensive.",
    duration: 25,
    mode: "quickWins",
    outcome: "Urgent inbox work is compressed into a tighter response block.",
    tasks: [
      {
        title: "Reply to the top urgent thread",
        detail: "Send the shortest useful answer so the highest-risk conversation moves again.",
        effort: 15,
        priority: "urgent",
        category: "reply",
        impact: 8,
        labels: ["playbook", "inbox"],
      },
      {
        title: "Convert loose asks into follow-ups",
        detail: "Pull the next commitments out of the inbox before they get buried again.",
        effort: 10,
        priority: "high",
        category: "follow-up",
        impact: 7,
        labels: ["playbook", "triage"],
      },
    ],
  },
  {
    id: "meeting-defense",
    title: "Meeting defense",
    summary: "Get ahead of the next meeting so it stops fragmenting the rest of the day.",
    trigger: "Best when the calendar is full and prep debt is creating stress.",
    duration: 20,
    mode: "impact",
    outcome: "Upcoming meetings become decision-ready instead of stealing more time later.",
    tasks: [
      {
        title: "Write the next meeting brief",
        detail: "Capture goals, decisions needed, and what must happen before the call starts.",
        effort: 15,
        priority: "high",
        category: "review",
        impact: 8,
        labels: ["playbook", "meeting"],
      },
      {
        title: "Draft post-meeting follow-up bullets",
        detail: "Prepare the send-now notes so the meeting does not create hidden cleanup work.",
        effort: 10,
        priority: "medium",
        category: "send",
        impact: 6,
        labels: ["playbook", "meeting"],
      },
    ],
  },
  {
    id: "deep-work-recovery",
    title: "Deep work recovery",
    summary: "Protect one real block of concentration and push noise out of the way.",
    trigger: "Best when the day feels reactive and nothing important is getting finished.",
    duration: 45,
    mode: "deepWork",
    outcome: "The day regains one meaningful block for higher-leverage work.",
    tasks: [
      {
        title: "Protect one uninterrupted block",
        detail: "Reserve the next available focus window for the highest-leverage unfinished work.",
        effort: 30,
        priority: "high",
        category: "schedule",
        impact: 9,
        labels: ["playbook", "focus"],
      },
      {
        title: "Send delay note on low-impact replies",
        detail: "Move non-critical conversations out of the current hour with a short expectation-setting note.",
        effort: 10,
        priority: "medium",
        category: "send",
        impact: 6,
        labels: ["playbook", "focus"],
      },
    ],
  },
  {
    id: "delegation-sweep",
    title: "Delegation sweep",
    summary: "Move blocked work to the right owner before it keeps occupying headspace.",
    trigger: "Best when the plan is clogged by tasks that should be waiting on someone else.",
    duration: 15,
    mode: "quickWins",
    outcome: "Blocked tasks become explicit handoffs with an owner and next check-in.",
    tasks: [
      {
        title: "Draft the next owner handoff",
        detail: "Turn one blocked task into a clean owner brief with deadline and context.",
        effort: 10,
        priority: "high",
        category: "follow-up",
        impact: 7,
        labels: ["playbook", "handoff"],
      },
      {
        title: "Set the return checkpoint",
        detail: "Pick the exact moment to check whether the delegated work has moved.",
        effort: 5,
        priority: "medium",
        category: "schedule",
        impact: 6,
        labels: ["playbook", "handoff"],
      },
    ],
  },
];

const milestoneBlueprints = [
  {
    id: "first-relief",
    title: "First relief",
    detail: "Activate one rescue playbook to stop the day from staying reactive.",
    target: 1,
  },
  {
    id: "real-progress",
    title: "Real progress",
    detail: "Close two meaningful tasks instead of letting them hover.",
    target: 2,
  },
  {
    id: "load-shifted",
    title: "Load shifted",
    detail: "Hand off one task so your own queue gets lighter, not just busier.",
    target: 1,
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

interface CalendarDraft {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  type: CalendarEventType;
}

interface WorkflowTemplate {
  id: string;
  title: string;
  detail: string;
  mode: PlanMode;
  category: TaskCategory;
  priority: EmailPriority;
  labels: string[];
  defaultMinutes: number;
  blockType: CalendarEventType;
}

const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "exec-brief",
    title: "Executive brief follow-up",
    detail: "Turn a leadership thread into one approval, one reply, and one checkpoint so nothing urgent floats.",
    mode: "impact",
    category: "follow-up",
    priority: "high",
    labels: ["template", "executive"],
    defaultMinutes: 20,
    blockType: "meeting",
  },
  {
    id: "customer-save",
    title: "Customer escalation response",
    detail: "Create a response block, a handoff-ready note, and a same-day checkpoint for the account.",
    mode: "quickWins",
    category: "reply",
    priority: "urgent",
    labels: ["template", "customer"],
    defaultMinutes: 30,
    blockType: "focus",
  },
  {
    id: "meeting-prep",
    title: "Meeting prep sprint",
    detail: "Reserve prep time, capture the decision needed, and make the next meeting less expensive.",
    mode: "deepWork",
    category: "review",
    priority: "high",
    labels: ["template", "meeting"],
    defaultMinutes: 25,
    blockType: "focus",
  },
  {
    id: "hiring-loop",
    title: "Hiring loop coordination",
    detail: "Bundle availability review, interview scheduling, and candidate follow-up into one reusable pattern.",
    mode: "quickWins",
    category: "schedule",
    priority: "medium",
    labels: ["template", "hiring"],
    defaultMinutes: 20,
    blockType: "meeting",
  },
];

function App() {
  const authRequired = hasSupabaseConfig && import.meta.env.MODE !== "test";
  const previewMode = !authRequired;
  const [planningDate, setPlanningDate] = useState(() =>
    previewMode ? demoDate : getLocalDateISO(),
  );
  const [initialState] = useState(() => ({
    settings: loadCustomizationSettings(),
    tutorial: loadTutorialState(),
  }));
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(!authRequired);
  const [authNotice, setAuthNotice] = useState(
    hasSupabaseConfig
      ? "Sign in first. Then connect Gmail and Calendar from Sources."
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
  const [activatedPlaybooks, setActivatedPlaybooks] = useState<ActivatedPlaybook[]>([]);
  const [momentumEvents, setMomentumEvents] = useState<MomentumEvent[]>([]);
  const [delegatedTaskIds, setDelegatedTaskIds] = useState<Set<string>>(new Set());
  const [teamHandoffs, setTeamHandoffs] = useState<TeamHandoff[]>([]);
  const [handoffTaskId, setHandoffTaskId] = useState("");
  const [handoffOwner, setHandoffOwner] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [handoffChannel, setHandoffChannel] = useState<HandoffChannel>("email");
  const [rescueNotice, setRescueNotice] = useState(
    "Use a rescue playbook to turn a crowded day into the next few useful moves.",
  );
  const [handoffNotice, setHandoffNotice] = useState(
    "Create a handoff when a task should stop living in your head.",
  );
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
  const [calendarNotice, setCalendarNotice] = useState(
    "Tap the grid to add a block you control, or open one of your own items to move it.",
  );
  const [connectionNotice, setConnectionNotice] = useState(
    "Add Supabase env vars when you are ready to test live OAuth.",
  );
  const [workspaceSource, setWorkspaceSource] = useState<WorkspaceDataSource>(
    previewMode ? "demo" : "empty",
  );
  const [workspaceNotice, setWorkspaceNotice] = useState(
    previewMode
      ? "Preview mode is using demo inbox and calendar data."
      : "Sign in, then connect Gmail and Calendar from Sources before syncing live data.",
  );
  const [workspaceEmails, setWorkspaceEmails] = useState<EmailMessage[]>(
    previewMode ? demoEmails : [],
  );
  const [workspaceCalendarEvents, setWorkspaceCalendarEvents] = useState<CalendarEvent[]>(
    previewMode ? demoCalendar : [],
  );
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [manualCalendarEvents, setManualCalendarEvents] = useState<CalendarEvent[]>(() =>
    loadManualCalendarEvents(),
  );
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft | null>(null);

  const visibleManualCalendarEvents = useMemo(
    () => manualCalendarEvents.filter((event) => localDateFromIso(event.start) === planningDate),
    [manualCalendarEvents, planningDate],
  );
  const calendarEvents = useMemo(
    () =>
      [...workspaceCalendarEvents, ...visibleManualCalendarEvents].sort(
        (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
      ),
    [visibleManualCalendarEvents, workspaceCalendarEvents],
  );
  const baseTasks = useMemo(
    () => deriveActionItems(workspaceEmails, planningDate),
    [planningDate, workspaceEmails],
  );
  const tasks = useMemo(
    () =>
      [...baseTasks, ...manualTasks].map((task) =>
        completedTasks.has(task.id)
          ? {
              ...task,
              status: "done" as TaskStatus,
            }
          : delegatedTaskIds.has(task.id)
            ? {
                ...task,
                status: "waiting" as TaskStatus,
              }
          : task,
      ),
    [baseTasks, completedTasks, delegatedTaskIds, manualTasks],
  );
  const plan = useMemo(
    () => buildDailyPlan(tasks, calendarEvents, planningDate),
    [calendarEvents, planningDate, tasks],
  );
  const summary = useMemo(() => summarizePlan(plan), [plan]);
  const orderedTasks = useMemo(
    () => prioritizeTasksForMode(plan.rankedTasks, planMode),
    [plan.rankedTasks, planMode],
  );
  const sourceCount = useMemo(
    () => new Set(orderedTasks.map((task) => task.source)).size,
    [orderedTasks],
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
  const openHandoffTasks = useMemo(
    () => orderedTasks.filter((task) => task.status === "open"),
    [orderedTasks],
  );
  const activatedPlaybookIds = useMemo(
    () => new Set(activatedPlaybooks.map((playbook) => playbook.playbookId)),
    [activatedPlaybooks],
  );
  const completedCount = orderedTasks.filter((task) => task.status === "done").length;
  const milestones = useMemo(
    () =>
      buildMilestones({
        playbookCount: activatedPlaybooks.length,
        completedCount,
        handoffCount: teamHandoffs.length,
      }),
    [activatedPlaybooks.length, completedCount, teamHandoffs.length],
  );
  const recommendedPlaybookId = useMemo(
    () => selectRecommendedPlaybook(summary, plan.conflicts.length, orderedTasks),
    [orderedTasks, plan.conflicts.length, summary],
  );

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
    saveManualCalendarEvents(manualCalendarEvents);
  }, [manualCalendarEvents]);

  async function refreshGoogleConnectionStatus() {
    const status = await getGoogleWorkspaceConnectionStatus();
    setIsGoogleConnected(status.connected);
  }

  async function refreshWorkspaceData() {
    if (!authSession && !previewMode) {
      setWorkspaceSource("empty");
      setWorkspaceEmails([]);
      setWorkspaceCalendarEvents([]);
      setWorkspaceNotice("Sign in and sync a source before building the daily plan.");
      return;
    }

    setIsWorkspaceLoading(true);
    const result = await loadWorkspaceData({
      allowDemoFallback: previewMode,
      date: planningDate,
    });
    setWorkspaceSource(result.source);
    setWorkspaceNotice(result.notice);
    setWorkspaceEmails(result.emails);
    setWorkspaceCalendarEvents(result.calendarEvents);
    setIsWorkspaceLoading(false);
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
    void refreshWorkspaceData();
  }, [authSession, planningDate, previewMode]);

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

  useEffect(() => {
    if (openHandoffTasks.some((task) => task.id === handoffTaskId)) return;
    setHandoffTaskId(openHandoffTasks[0]?.id ?? "");
  }, [handoffTaskId, openHandoffTasks]);

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
    const task = tasks.find((item) => item.id === taskId);
    const shouldComplete = !completedTasks.has(taskId);
    setCompletedTasks((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
    if (task && shouldComplete) {
      recordMomentum("win", task.title, `Closed ${task.effort} minute task from ${task.source}.`);
    }
  }

  function createActionTask({
    title,
    detail,
    source,
    sourceRole,
    sourceSubject,
    priority,
    category,
    effort,
    impact,
    labels,
    risk,
  }: {
    title: string;
    detail: string;
    source: string;
    sourceRole: string;
    sourceSubject: string;
    priority: EmailPriority;
    category: TaskCategory;
    effort: number;
    impact: number;
    labels: string[];
    risk: string;
  }): ActionItem {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
    const dueHour = priority === "urgent" ? 15 : priority === "high" ? 16 : 17;
    return {
      id: `task-${suffix}`,
      sourceEmailId: `generated-${suffix}`,
      title,
      detail,
      source,
      sourceRole,
      sourceAvatar:
        "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=160&q=80",
      sourceSubject,
      receivedAt: new Date().toISOString(),
      dueAt: `${planningDate}T${String(dueHour).padStart(2, "0")}:00:00`,
      priority,
      category,
      status: "open",
      confidence: 100,
      effort,
      impact,
      risk,
      labels,
      rankScore: priorityRank[priority] * 18 + impact * 4 - effort * 0.2,
    };
  }

  function recordMomentum(kind: MomentumKind, title: string, detail: string) {
    const event: MomentumEvent = {
      id: `${Date.now()}-${kind}-${Math.round(Math.random() * 1_000)}`,
      kind,
      title,
      detail,
      createdAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };
    setMomentumEvents((current) => [event, ...current].slice(0, 8));
  }

  function addManualTask() {
    const title = captureText.trim();
    if (!title) {
      setProductivityNotice("Add a task before saving quick capture.");
      return;
    }

    const effort = Math.max(5, Math.min(180, captureMinutes));
    const impact = capturePriority === "urgent" ? 8 : capturePriority === "high" ? 7 : 5;
    const manualTask = createActionTask({
      title,
      detail: "Captured manually during planning.",
      source: "Quick capture",
      sourceRole: "Manual",
      sourceSubject: "Manual capture",
      priority: capturePriority,
      category: "follow-up",
      effort,
      impact,
      labels: ["manual", "capture"],
      risk: "Captured by the user so it stays visible in today's plan.",
    });

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
    recordMomentum("win", activeSprintTask.title, "Finished from a protected focus sprint.");
    setProductivityNotice(`${activeSprintTask.title} marked done from the focus sprint.`);
    setActiveSprintId("");
  }

  function runRescuePlaybook(playbook: RescuePlaybook) {
    const existingTitles = new Set(tasks.map((task) => task.title.toLowerCase()));
    const createdTasks = playbook.tasks
      .filter((task) => !existingTitles.has(task.title.toLowerCase()))
      .map((task) =>
        createActionTask({
          title: task.title,
          detail: task.detail,
          source: "Autopilot-AI",
          sourceRole: "Rescue playbook",
          sourceSubject: playbook.title,
          priority: task.priority,
          category: task.category,
          effort: task.effort,
          impact: task.impact,
          labels: task.labels,
          risk: `${playbook.title} created this task to recover time and reduce cognitive load.`,
        }),
      );

    if (createdTasks.length > 0) {
      setManualTasks((current) => [...createdTasks, ...current]);
    }

    setPlanMode(playbook.mode);
    setActivatedPlaybooks((current) => [
      {
        id: `playbook-${Date.now()}-${playbook.id}`,
        playbookId: playbook.id,
        title: playbook.title,
        activatedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        outcome: playbook.outcome,
        createdTaskIds: createdTasks.map((task) => task.id),
      },
      ...current.filter((item) => item.playbookId !== playbook.id),
    ]);
    setRescueNotice(
      createdTasks.length > 0
        ? `${playbook.title} activated. ${createdTasks.length} tasks added and ${planModeLabels[playbook.mode].toLowerCase()} mode selected.`
        : `${playbook.title} activated. Existing tasks already cover this rescue path, so nothing duplicated.`,
    );
    setProductivityNotice(
      `${playbook.title} set ${planModeLabels[playbook.mode].toLowerCase()} mode for the next block.`,
    );
    recordMomentum("playbook", `${playbook.title} activated`, playbook.outcome);
  }

  function createTeamHandoff() {
    const task = openHandoffTasks.find((item) => item.id === handoffTaskId) ?? openHandoffTasks[0];
    const owner = handoffOwner.trim();
    if (!task) {
      setHandoffNotice("No open task is available to hand off right now.");
      return;
    }
    if (!owner) {
      setHandoffNotice("Add the owner before creating a handoff.");
      return;
    }

    const note =
      handoffNote.trim() ||
      `Take ownership of ${task.title} and reply with the next checkpoint if timing changes.`;
    const shareUrl = buildHandoffShareUrl(window.location.href.split("#")[0], {
      taskTitle: task.title,
      owner,
      note,
      channel: handoffChannel,
    });
    const handoff: TeamHandoff = {
      id: `handoff-${Date.now()}-${task.id}`,
      taskId: task.id,
      taskTitle: task.title,
      owner,
      note,
      channel: handoffChannel,
      sharedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      shareUrl,
    };

    setTeamHandoffs((current) => [handoff, ...current.filter((item) => item.taskId !== task.id)]);
    setDelegatedTaskIds((current) => new Set(current).add(task.id));
    setCompletedTasks((current) => {
      const next = new Set(current);
      next.delete(task.id);
      return next;
    });
    setHandoffOwner("");
    setHandoffNote("");
    setHandoffNotice(`${task.title} handed off to ${owner}.`);
    recordMomentum("handoff", `Handoff sent to ${owner}`, task.title);
  }

  function reclaimHandoff(handoffId: string) {
    const handoff = teamHandoffs.find((item) => item.id === handoffId);
    if (!handoff) return;
    const hasRemainingHandoff = teamHandoffs.some(
      (item) => item.id !== handoffId && item.taskId === handoff.taskId,
    );
    setTeamHandoffs((current) => current.filter((item) => item.id !== handoffId));
    if (!hasRemainingHandoff) {
      setDelegatedTaskIds((current) => {
        const next = new Set(current);
        next.delete(handoff.taskId);
        return next;
      });
    }
    setHandoffNotice(`${handoff.taskTitle} is back in your queue.`);
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
      setConnectionNotice("Finish Gmail and Calendar connection on Sources before syncing.");
      return;
    }
    const { dayStartIso, dayEndIso } = buildLocalDayRange(planningDate);
    setConnectionNotice("Syncing Google Workspace data...");
    const result = await syncGoogleWorkspace({
      date: planningDate,
      dayStartIso,
      dayEndIso,
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
      await refreshWorkspaceData();
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
      date: planningDate,
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

  function startCalendarDraft(
    hour = settings.calendar.startHour,
    seed?: Partial<CalendarDraft>,
  ) {
    const safeHour = Math.min(Math.max(hour, settings.calendar.startHour), settings.calendar.endHour - 1);
    const startTime = seed?.startTime ?? `${String(safeHour).padStart(2, "0")}:00`;
    const endHour = Math.min(
      safeHour + Math.max(1, Math.round((seed?.endTime ? 0 : 1))),
      settings.calendar.endHour,
    );
    const endTime = seed?.endTime ?? `${String(endHour).padStart(2, "0")}:00`;
    setCalendarDraft({
      id: seed?.id,
      title: seed?.title ?? "",
      date: seed?.date ?? planningDate,
      startTime,
      endTime,
      type: seed?.type ?? "meeting",
    });
  }

  function openCalendarSlot(hour: number) {
    startCalendarDraft(hour);
    setCalendarNotice(`Drafting a new calendar block at ${formatHourLabel(hour)}.`);
  }

  function selectCalendarEvent(event: CalendarEvent) {
    if (!event.editable) {
      setCalendarDraft(null);
      setCalendarNotice(
        `${event.title} came from ${event.provider === "microsoft" ? "Microsoft" : "Google"} and stays read-only until external write approval is enabled.`,
      );
      return;
    }

    setCalendarDraft({
      id: event.id,
      title: event.title,
      date: localDateFromIso(event.start),
      startTime: formatTimeInputValue(event.start),
      endTime: formatTimeInputValue(event.end),
      type: event.type,
    });
    setCalendarNotice(`Editing ${event.title}.`);
  }

  function updateCalendarDraft(next: Partial<CalendarDraft>) {
    setCalendarDraft((current) => (current ? { ...current, ...next } : current));
  }

  function cancelCalendarDraft() {
    setCalendarDraft(null);
    setCalendarNotice("Tap the grid to add a block you control, or open one of your own items to move it.");
  }

  function saveCalendarDraftItem() {
    if (!calendarDraft) return;

    const title = calendarDraft.title.trim();
    if (!title) {
      setCalendarNotice("Add a title before saving the calendar item.");
      return;
    }

    const start = buildCalendarIso(calendarDraft.date, calendarDraft.startTime);
    const end = buildCalendarIso(calendarDraft.date, calendarDraft.endTime);
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      setCalendarNotice("End time must be later than the start time.");
      return;
    }

    const savedEvent: CalendarEvent = {
      id: calendarDraft.id ?? `manual-${Date.now()}-${Math.round(Math.random() * 10_000)}`,
      title,
      start,
      end,
      type: calendarDraft.type,
      provider: "manual",
      editable: true,
      attendees: [],
    };

    setManualCalendarEvents((current) => {
      const others = current.filter((event) => event.id !== savedEvent.id);
      return [...others, savedEvent].sort(
        (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
      );
    });
    setCalendarDraft(null);
    setCalendarNotice(`${title} saved to your editable calendar blocks.`);
    recordMomentum("win", title, "Added or updated from the calendar workspace.");
  }

  function applyWorkflowTemplate(template: WorkflowTemplate) {
    const task = createActionTask({
      title: template.title,
      detail: template.detail,
      source: "Workflow template",
      sourceRole: "Template gallery",
      sourceSubject: template.title,
      priority: template.priority,
      category: template.category,
      effort: template.defaultMinutes,
      impact: template.priority === "urgent" ? 9 : 7,
      labels: template.labels,
      risk: "Template-generated task. Review and adjust before sending or changing anything external.",
    });
    setManualTasks((current) => [task, ...current]);
    setPlanMode(template.mode);
    startCalendarDraft(settings.calendar.startHour + 1, {
      title: template.title,
      type: template.blockType,
      endTime: addMinutesToTime(`${String(settings.calendar.startHour + 1).padStart(2, "0")}:00`, template.defaultMinutes),
    });
    setProductivityNotice(`${template.title} added to the plan and staged as a calendar block.`);
    setCalendarNotice(`Confirm the ${template.title.toLowerCase()} block if you want to reserve time for it.`);
    recordMomentum("playbook", `${template.title} template applied`, template.detail);
  }

  const dailyHeadline = buildDailyHeadline(orderedTasks);

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
        workflowTemplates={workflowTemplates}
        onAddManualTask={addManualTask}
        onApplyTemplate={applyWorkflowTemplate}
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
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                todayISO={planningDate}
                index={index}
                onToggle={toggleTask}
              />
            ))
          ) : (
            <article className="task-empty-state">
              <strong>
                {workspaceSource === "empty"
                  ? "No source-backed action items yet."
                  : "Nothing is waiting in this filter right now."}
              </strong>
              <p>{workspaceNotice}</p>
            </article>
          )}
        </div>
      </section>
    );
  }

  function renderCurrentPage() {
    switch (activePage) {
      case "daily":
        return (
          <>
            <Header planningDate={planningDate} sourceCount={sourceCount} summary={summary} />
            <section className="command-band" aria-label="Daily command summary">
              <div>
                <span className="eyebrow">Today&apos;s call</span>
                <h2>{dailyHeadline}</h2>
              </div>
              <button className="primary-action" type="button" onClick={() => navigate("productivity")}>
                Start next task
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </section>
            <RescuePlaybooksPanel
              activePlaybookIds={activatedPlaybookIds}
              notice={rescueNotice}
              playbooks={rescuePlaybooks}
              recommendedPlaybookId={recommendedPlaybookId}
              onRun={runRescuePlaybook}
            />
            <MomentumBoard
              completedCount={completedCount}
              handoffCount={teamHandoffs.length}
              milestones={milestones}
              playbookCount={activatedPlaybooks.length}
              events={momentumEvents}
            />
            {renderTaskSection()}
          </>
        );
      case "productivity":
        return (
          <>
            <PageHeader
              eyebrow="Productivity"
              title="Plan the next block of work"
              body="Capture loose work, apply reusable workflow templates, switch planning modes, and protect the next focus sprint without mixing it into the task list."
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
                isSyncing={isWorkspaceLoading}
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
            <WorkspaceSnapshotPanel
              calendarEvents={calendarEvents}
              isLoading={isWorkspaceLoading}
              notice={workspaceNotice}
              source={workspaceSource}
              syncedEmails={workspaceEmails}
            />
            <SupabaseSetupPanel />
          </>
        );
      case "actions":
        return (
          <>
            <PageHeader
              eyebrow="Actions"
              title="Turn recommendations into controlled changes"
              body="Apply, undo, queue, snooze, share, save AI action presets, and hand work off cleanly before connecting live inbox data."
            />
            <TeamHandoffRoom
              channel={handoffChannel}
              handoffs={teamHandoffs}
              notice={handoffNotice}
              note={handoffNote}
              owner={handoffOwner}
              selectedTaskId={handoffTaskId}
              tasks={openHandoffTasks}
              onChannelChange={setHandoffChannel}
              onCreate={createTeamHandoff}
              onNoteChange={setHandoffNote}
              onOwnerChange={setHandoffOwner}
              onReclaim={reclaimHandoff}
              onTaskChange={setHandoffTaskId}
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
              body="A Google Calendar-style view keeps the time grid, event colors, agenda, and editable user-scheduled blocks in one focused page."
            />
            <FullCalendarSection
              date={planningDate}
              draft={calendarDraft}
              events={calendarEvents}
              notice={calendarNotice}
              preferences={settings.calendar}
              onCancelDraft={cancelCalendarDraft}
              onDraftChange={updateCalendarDraft}
              onEditEvent={selectCalendarEvent}
              onJumpToToday={() => setPlanningDate(getLocalDateISO())}
              onSaveDraft={saveCalendarDraftItem}
              onSelectDate={setPlanningDate}
              onSlotClick={openCalendarSlot}
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
        <h1 id="login-title">Sign in first. Then connect the work that matters.</h1>
        <p className="auth-copy">
          Google sign-in creates your session. The Sources page then upgrades access for Gmail and Calendar sync. Email
          sign-in keeps your account available when you want to connect Google later.
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
        <SiteLinks className="auth-links" />
      </section>
    </main>
  );
}

function SiteLinks({ className }: { className?: string }) {
  return (
    <nav className={className ?? "site-links"} aria-label="Site links">
      <a href="./home.html">Home</a>
      <a href="./privacy.html">Privacy policy</a>
      <a href="./terms.html">Terms &amp; conditions</a>
    </nav>
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
      <SiteLinks className="sidebar-links" />
      <div className="operator">
        <img
          src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&q=80"
          alt=""
        />
        <div>
          <strong>{session?.user.email ?? "Mock workspace"}</strong>
          <span>
            {googleConnected
              ? "Google workspace connected"
              : session?.user.app_metadata.provider === "google"
                ? "Signed in with Google"
                : "Google not connected"}
          </span>
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
  isSyncing,
  onConnect,
  onSyncGoogle,
}: {
  connectionNotice: string;
  googleConnected: boolean;
  isSyncing: boolean;
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
          disabled={!hasSupabaseConfig || !googleConnected || isSyncing}
        >
          {isSyncing ? "Syncing Google data..." : "Sync Google data"}
        </button>
        <span className="inline-help">
          {googleConnected
            ? "Google is saved. Sync stores recent Gmail and today's Calendar events."
            : "Finish Gmail and Calendar connection to enable sync."}
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

function WorkspaceSnapshotPanel({
  calendarEvents,
  isLoading,
  notice,
  source,
  syncedEmails,
}: {
  calendarEvents: CalendarEvent[];
  isLoading: boolean;
  notice: string;
  source: WorkspaceDataSource;
  syncedEmails: EmailMessage[];
}) {
  const statusLabel =
    source === "live" ? "Live workspace" : source === "demo" ? "Preview workspace" : "Waiting for sync";

  return (
    <section className="setup-panel workspace-snapshot" aria-labelledby="workspace-snapshot-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Workspace state</span>
          <h2 id="workspace-snapshot-title">What Autopilot-AI is actually planning from</h2>
        </div>
        <div className={source === "live" ? "status-pill ready" : "status-pill"}>
          <Inbox size={15} aria-hidden="true" />
          {isLoading ? "Refreshing" : statusLabel}
        </div>
      </div>
      <p className="section-note">{notice}</p>
      <div className="setup-grid compact">
        <article>
          <strong>{syncedEmails.length}</strong>
          <p>source-backed emails currently in the planning set</p>
        </article>
        <article>
          <strong>{calendarEvents.length}</strong>
          <p>calendar events visible in the day view</p>
        </article>
        <article>
          <strong>{source === "live" ? "No fake tasks" : "Preview only"}</strong>
          <p>
            {source === "live"
              ? "Action items are derived from synced message metadata and keep a visible source trail."
              : "The app only shows demo tasks until a real source is connected and synced."}
          </p>
        </article>
      </div>
      <div className="source-proof-list" aria-label="Recent synced email threads">
        {syncedEmails.slice(0, 4).map((email) => (
          <article className="source-proof-card" key={email.id}>
            <strong>{email.subject}</strong>
            <span>
              {email.from} · {formatTime(email.receivedAt)}
            </span>
            <p>{email.preview}</p>
          </article>
        ))}
        {syncedEmails.length === 0 ? (
          <article className="source-proof-card empty">
            <strong>No synced email threads yet</strong>
            <p>Once Google data is stored, recent subjects and previews appear here before they become action items.</p>
          </article>
        ) : null}
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
          <p>Deploy `store-google-connection`, `sync-google-workspace`, `sync-microsoft-workspace`, and `plan-day`, then set Google, Microsoft, encryption, and OpenAI secrets.</p>
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
  workflowTemplates,
  onAddManualTask,
  onApplyTemplate,
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
  workflowTemplates: WorkflowTemplate[];
  onAddManualTask: () => void;
  onApplyTemplate: (template: WorkflowTemplate) => void;
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

        <article className="productivity-card">
          <span className="productivity-label">Template gallery</span>
          <div className="template-gallery">
            {workflowTemplates.map((template) => (
              <div className="template-card" key={template.id}>
                <strong>{template.title}</strong>
                <p>{template.detail}</p>
                <div className="template-meta">
                  <span>{planModeLabels[template.mode]}</span>
                  <span>{template.defaultMinutes}m block</span>
                </div>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => onApplyTemplate(template)}
                >
                  Use template
                </button>
              </div>
            ))}
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

function RescuePlaybooksPanel({
  activePlaybookIds,
  notice,
  playbooks,
  recommendedPlaybookId,
  onRun,
}: {
  activePlaybookIds: Set<string>;
  notice: string;
  playbooks: RescuePlaybook[];
  recommendedPlaybookId: string;
  onRun: (playbook: RescuePlaybook) => void;
}) {
  return (
    <section className="rescue-panel" aria-labelledby="rescue-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Time rescue</span>
          <h2 id="rescue-title">Time rescue playbooks</h2>
        </div>
        <div className="status-pill ready" aria-live="polite">
          <Clock3 size={15} aria-hidden="true" />
          {notice}
        </div>
      </div>
      <div className="playbook-grid">
        {playbooks.map((playbook) => {
          const isRecommended = playbook.id === recommendedPlaybookId;
          const isActive = activePlaybookIds.has(playbook.id);

          return (
            <article
              className={isRecommended ? "playbook-card recommended" : "playbook-card"}
              key={playbook.id}
            >
              <div className="playbook-topline">
                <span>{playbook.duration}m</span>
                <span>{planModeLabels[playbook.mode]}</span>
                {isRecommended ? <span>Recommended</span> : null}
              </div>
              <h3>{playbook.title}</h3>
              <p>{playbook.summary}</p>
              <p className="playbook-trigger">{playbook.trigger}</p>
              <div className="playbook-task-list">
                {playbook.tasks.map((task) => (
                  <span key={task.title}>{task.title}</span>
                ))}
              </div>
              {isActive ? <div className="enabled-pill">Used today</div> : null}
              <button className="primary-action" type="button" onClick={() => onRun(playbook)}>
                Run {playbook.title}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MomentumBoard({
  completedCount,
  handoffCount,
  milestones,
  playbookCount,
  events,
}: {
  completedCount: number;
  handoffCount: number;
  milestones: MilestoneProgress[];
  playbookCount: number;
  events: MomentumEvent[];
}) {
  return (
    <section className="momentum-panel" aria-labelledby="momentum-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Momentum</span>
          <h2 id="momentum-title">Momentum and milestones</h2>
        </div>
        <div className="status-pill ready">
          <CheckCircle2 size={15} aria-hidden="true" />
          {events.length === 0 ? "No wins logged yet" : `${events.length} useful moves logged`}
        </div>
      </div>
      <div className="momentum-layout">
        <div className="momentum-column">
          <div className="momentum-stats">
            <article className="momentum-stat-card">
              <span>Closed</span>
              <strong>{completedCount}</strong>
            </article>
            <article className="momentum-stat-card">
              <span>Playbooks</span>
              <strong>{playbookCount}</strong>
            </article>
            <article className="momentum-stat-card">
              <span>Handoffs</span>
              <strong>{handoffCount}</strong>
            </article>
            <article className="momentum-stat-card">
              <span>Unlocked</span>
              <strong>{milestones.filter((milestone) => milestone.complete).length}</strong>
            </article>
          </div>
          <div className="milestone-list">
            {milestones.map((milestone) => {
              const progress = Math.min(100, Math.round((milestone.current / milestone.target) * 100));
              return (
                <article className="milestone-card" key={milestone.id}>
                  <div className="milestone-copy">
                    <strong>{milestone.title}</strong>
                    <span>{milestone.detail}</span>
                  </div>
                  <div className="milestone-meta">
                    <span>
                      {Math.min(milestone.current, milestone.target)}/{milestone.target}
                    </span>
                    <div className="milestone-meter" aria-hidden="true">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="momentum-feed">
          <h3>Recent wins</h3>
          {events.length === 0 ? <p>No wins recorded yet. Run a playbook or finish a task.</p> : null}
          {events.map((event) => (
            <article className={`momentum-event ${event.kind}`} key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
              </div>
              <span>{event.createdAt}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamHandoffRoom({
  channel,
  handoffs,
  notice,
  note,
  owner,
  selectedTaskId,
  tasks,
  onChannelChange,
  onCreate,
  onNoteChange,
  onOwnerChange,
  onReclaim,
  onTaskChange,
}: {
  channel: HandoffChannel;
  handoffs: TeamHandoff[];
  notice: string;
  note: string;
  owner: string;
  selectedTaskId: string;
  tasks: ActionItem[];
  onChannelChange: (channel: HandoffChannel) => void;
  onCreate: () => void;
  onNoteChange: (note: string) => void;
  onOwnerChange: (owner: string) => void;
  onReclaim: (handoffId: string) => void;
  onTaskChange: (taskId: string) => void;
}) {
  return (
    <section className="handoff-panel" aria-labelledby="handoff-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Delegation</span>
          <h2 id="handoff-title">Team handoff room</h2>
        </div>
        <div className="status-pill ready" aria-live="polite">
          <MailOpen size={15} aria-hidden="true" />
          {notice}
        </div>
      </div>
      <div className="handoff-layout">
        <form
          className="handoff-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <label className="field-label">
            Task
            <select
              aria-label="Handoff task"
              value={selectedTaskId}
              onChange={(event) => onTaskChange(event.target.value)}
              disabled={tasks.length === 0}
            >
              {tasks.length === 0 ? <option value="">No open tasks</option> : null}
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Owner
            <input
              aria-label="Handoff owner"
              placeholder="Who should own this next?"
              value={owner}
              onChange={(event) => onOwnerChange(event.target.value)}
            />
          </label>
          <label className="field-label">
            Channel
            <select
              aria-label="Handoff channel"
              value={channel}
              onChange={(event) => onChannelChange(event.target.value as HandoffChannel)}
            >
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="link">Link</option>
            </select>
          </label>
          <label className="field-label">
            Note
            <textarea
              aria-label="Handoff note"
              placeholder="Context, deadline, and what good looks like."
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
          <button className="primary-action" type="submit" disabled={tasks.length === 0}>
            Create handoff
          </button>
        </form>

        <div className="handoff-list">
          <h3>Active handoffs</h3>
          {handoffs.length === 0 ? <p>No handoffs created yet.</p> : null}
          {handoffs.map((handoff) => (
            <article className="handoff-card" key={handoff.id}>
              <div className="handoff-copy">
                <strong>{handoff.taskTitle}</strong>
                <span>
                  {handoff.owner} via {handoff.channel} at {handoff.sharedAt}
                </span>
                <p>{handoff.note}</p>
              </div>
              <input
                aria-label="Handoff share link"
                className="share-output"
                readOnly
                value={handoff.shareUrl}
              />
              <button className="secondary-action" type="button" onClick={() => onReclaim(handoff.id)}>
                Reclaim task
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Header({
  planningDate,
  sourceCount,
  summary,
}: {
  planningDate: string;
  sourceCount: number;
  summary: ReturnType<typeof summarizePlan>;
}) {
  return (
    <header className="top-header">
      <div>
        <span className="eyebrow">{formatCalendarHeader(planningDate)}</span>
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
        <Metric label="Sources" value={String(sourceCount)} />
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
  const actionLabel =
    isConnected
      ? "Connected"
      : readiness === "ready"
      ? `Connect ${provider.shortName}`
      : "Open setup";

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
      <p className="integration-detail">
        {readiness === "needs-server"
          ? `Backend route required. First setup step: ${provider.requiredSetup[0]}`
          : `Scopes visible before connect: ${provider.scopes.join(", ")}`}
      </p>
      <button
        type="button"
        className="secondary-action"
        disabled={isConnected}
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
            <span className={isWaiting ? "task-state waiting" : isDone ? "task-state done" : "task-state open"}>
              {isWaiting ? "Waiting" : isDone ? "Done" : "Open"}
            </span>
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
  draft,
  events,
  notice,
  preferences,
  onCancelDraft,
  onDraftChange,
  onEditEvent,
  onJumpToToday,
  onSaveDraft,
  onSelectDate,
  onSlotClick,
}: {
  date: string;
  draft: CalendarDraft | null;
  events: CalendarEvent[];
  notice: string;
  preferences: CalendarPreferences;
  onCancelDraft: () => void;
  onDraftChange: (draft: Partial<CalendarDraft>) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onJumpToToday: () => void;
  onSaveDraft: () => void;
  onSelectDate: (date: string) => void;
  onSlotClick: (hour: number) => void;
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
            <button
              type="button"
              onClick={onJumpToToday}
              disabled={date === getLocalDateISO()}
            >
              Today
            </button>
            <span>
              {preferences.startHour}:00 - {preferences.endHour}:00
            </span>
          </div>

          <div className="calendar-week-strip large" aria-label="Week overview">
            {weekDays.map((day) => (
              <button
                aria-label={`Open ${formatCalendarHeader(day.dateIso)}`}
                className={day.isSelected ? "calendar-day active" : "calendar-day"}
                key={day.key}
                onClick={() => onSelectDate(day.dateIso)}
                type="button"
              >
                <span>{day.weekday}</span>
                <strong>{day.day}</strong>
              </button>
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
                <button
                  aria-label={`Add event at ${formatHourLabel(hour)}`}
                  className="calendar-slot-button"
                  type="button"
                  onClick={() => onSlotClick(hour)}
                >
                  <span>Add</span>
                </button>
              </div>
            ))}
            <div className="calendar-events-layer">
              {events.map((event) => (
                <button
                  aria-label={
                    event.editable ? `Edit ${event.title}` : `View ${event.title}`
                  }
                  className={`calendar-event-block ${event.type}`}
                  key={event.id}
                  type="button"
                  onClick={() => onEditEvent(event)}
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
                  <small>{event.editable ? "Editable" : "Read only"}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="full-calendar-side">
          {preferences.showAgenda ? (
            <section className="full-calendar-agenda" aria-label="Calendar agenda">
              <h3>Agenda</h3>
              {events.map((event) => (
                <article className={`event-row ${event.type}`} key={event.id}>
                  <span>
                    {formatTime(event.start)} - {formatTime(event.end)}
                  </span>
                  <strong>{event.title}</strong>
                  {event.attendees ? <small>{event.attendees.join(", ")}</small> : null}
                  <button
                    className="agenda-action"
                    type="button"
                    onClick={() => onEditEvent(event)}
                  >
                    {event.editable ? "Edit" : "Inspect"}
                  </button>
                </article>
              ))}
              {events.length === 0 ? <p className="agenda-empty">No calendar items on this day yet.</p> : null}
            </section>
          ) : null}
          <CalendarDraftEditor
            draft={draft}
            notice={notice}
            onCancel={onCancelDraft}
            onChange={onDraftChange}
            onSave={onSaveDraft}
          />
        </aside>
      </div>
    </section>
  );
}

function CalendarDraftEditor({
  draft,
  notice,
  onCancel,
  onChange,
  onSave,
}: {
  draft: CalendarDraft | null;
  notice: string;
  onCancel: () => void;
  onChange: (draft: Partial<CalendarDraft>) => void;
  onSave: () => void;
}) {
  return (
    <section className="calendar-editor-panel" aria-labelledby="calendar-editor-title">
      <div className="rail-heading">
        <CalendarDays size={18} aria-hidden="true" />
        <h2 id="calendar-editor-title">{draft?.id ? "Edit your calendar item" : "Add a calendar item"}</h2>
      </div>
      <p className="section-note">{notice}</p>
      {draft ? (
        <div className="calendar-editor-form">
          <label className="field-label">
            Event title
            <input
              aria-label="Calendar event title"
              value={draft.title}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="Protected focus block"
            />
          </label>
          <div className="capture-row">
            <label className="field-label">
              Start time
              <input
                aria-label="Calendar event start time"
                type="time"
                value={draft.startTime}
                onChange={(event) => onChange({ startTime: event.target.value })}
              />
            </label>
            <label className="field-label">
              End time
              <input
                aria-label="Calendar event end time"
                type="time"
                value={draft.endTime}
                onChange={(event) => onChange({ endTime: event.target.value })}
              />
            </label>
          </div>
          <label className="field-label">
            Event type
            <select
              aria-label="Calendar event type"
              value={draft.type}
              onChange={(event) => onChange({ type: event.target.value as CalendarEventType })}
            >
              <option value="meeting">Meeting</option>
              <option value="focus">Focus</option>
              <option value="deadline">Deadline</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          <div className="button-row">
            <button className="primary-action" type="button" onClick={onSave}>
              Save calendar item
            </button>
            <button className="secondary-action" type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="calendar-editor-empty">
          <strong>Nothing selected yet</strong>
          <p>Tap a time row to add a user-controlled block, or open one of your own calendar items to change it.</p>
        </div>
      )}
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

function buildMilestones({
  playbookCount,
  completedCount,
  handoffCount,
}: {
  playbookCount: number;
  completedCount: number;
  handoffCount: number;
}): MilestoneProgress[] {
  return milestoneBlueprints.map((milestone) => {
    const current =
      milestone.id === "first-relief"
        ? playbookCount
        : milestone.id === "real-progress"
          ? completedCount
          : handoffCount;
    return {
      ...milestone,
      current,
      complete: current >= milestone.target,
    };
  });
}

function selectRecommendedPlaybook(
  summary: ReturnType<typeof summarizePlan>,
  conflictCount: number,
  orderedTasks: ActionItem[],
): string {
  const waitingCount = orderedTasks.filter((task) => task.status === "waiting").length;
  const longestOpenTask = orderedTasks
    .filter((task) => task.status === "open")
    .sort((a, b) => b.effort - a.effort)[0];

  if (summary.urgentCount >= 2) return "inbox-reset";
  if (conflictCount >= 1) return "meeting-defense";
  if (waitingCount >= 2) return "delegation-sweep";
  if (summary.focusMinutes < 90 || (longestOpenTask && longestOpenTask.effort >= 25)) {
    return "deep-work-recovery";
  }
  return "inbox-reset";
}

function buildHandoffShareUrl(
  baseUrl: string,
  payload: { taskTitle: string; owner: string; note: string; channel: HandoffChannel },
): string {
  const safeBase = baseUrl || window.location.origin;
  return `${safeBase}#handoff=${encodeURIComponent(JSON.stringify(payload))}`;
}

function buildDailyHeadline(tasks: ActionItem[]): string {
  const openTasks = tasks.filter((task) => task.status === "open").slice(0, 3);
  if (openTasks.length === 0) {
    return "Connect a source or add a manual task so Autopilot-AI can build today's real plan.";
  }

  const titles = openTasks.map((task) => task.title.replace(/: /, " "));
  if (titles.length === 1) {
    return `Start with ${titles[0].toLowerCase()}.`;
  }
  if (titles.length === 2) {
    return `Do ${titles[0].toLowerCase()} and ${titles[1].toLowerCase()} first.`;
  }
  return `Do ${titles[0].toLowerCase()}, ${titles[1].toLowerCase()}, and ${titles[2].toLowerCase()} first.`;
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
    const dayDateIso = formatDateIso(day);
    return {
      key: day.toISOString(),
      dateIso: dayDateIso,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day),
      day: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(day),
      isSelected: dayDateIso === dateISO,
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

function formatDateIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
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

function formatTimeInputValue(isoDate: string): string {
  const date = new Date(isoDate);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildCalendarIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hoursPart, minutesPart] = time.split(":").map(Number);
  const totalMinutes = hoursPart * 60 + minutesPart + minutes;
  const normalized = Math.min(23 * 60 + 59, Math.max(0, totalMinutes));
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default App;
