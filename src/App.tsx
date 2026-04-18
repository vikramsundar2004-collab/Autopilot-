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
import { EnterprisePage } from "./EnterprisePage";
import {
  extractDraftSearchTerm,
  extractSenderEmails,
  isDraftCommand,
  parseAssistantCalendarCommand,
} from "./assistantCommands";
import { demoCalendar, demoDate, demoEmails } from "./data";
import { loadManualCalendarEvents, saveManualCalendarEvents } from "./calendarStore";
import {
  deriveReplyDrafts,
  isAdLikeEmail,
  type DraftTheme,
  type EmailReplyDraft,
} from "./emailDrafts";
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
import {
  blockAiSender,
  filterAiBlockedActions,
  filterAiBlockedEmails,
  findAiSenderBlock,
  loadAiSenderBlocks,
  unblockAiSender,
  type AiSenderBlock,
} from "./integrations/aiPrivacyApi";
import {
  analyzeEnterpriseChat,
  createEnterpriseOrganization,
  joinEnterpriseWithKey,
  loadEnterpriseConversation,
  loadEnterpriseWorkspace,
  sendEnterpriseMessage,
  updateEnterpriseAssignmentStatus,
  type EnterpriseAssignment,
  type EnterpriseChatMessage,
  type EnterpriseMember,
  type EnterpriseOrganization,
} from "./integrations/enterpriseApi";
import {
  type PlannerApiAction,
  type PlannerApiCalendarInput,
  type PlannerApiEmailInput,
  type PlannerApiScheduleBlock,
  runDailyPlanner,
} from "./integrations/plannerApi";
import { loadLatestPlannerOutput } from "./integrations/plannerData";
import { generateReplyDraftsApi } from "./integrations/draftApi";
import {
  type GoogleWorkspaceConnectionStatus,
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
type AssistantMessageKind = "info" | "success" | "warning";

interface AssistantMessage {
  id: string;
  kind: AssistantMessageKind;
  title: string;
  detail: string;
}

const appPages = [
  "daily",
  "productivity",
  "sources",
  "drafts",
  "actions",
  "customize",
  "calendar",
  "privacy",
  "premium",
] as const;
type AppPage = (typeof appPages)[number];

const assistantSetupStorageKey = "autopilot-ai-assistant-setup";

const pageLabels: Record<AppPage, string> = {
  daily: "Daily plan",
  productivity: "Productivity",
  sources: "Sources",
  drafts: "Drafts",
  actions: "Actions",
  customize: "Customize",
  calendar: "Calendar",
  privacy: "Privacy",
  premium: "Enterprise",
};

const premiumFeatures = [
  {
    title: "Enterprise team workspace",
    outcome: "Create a company workspace, invite teammates with a key, collaborate in chat, and let AI schedule owned work on a shared calendar.",
    surface: "Enterprise",
  },
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
    outcome: "Calendar-aware focus windows, manual blocks, and rescue plans that protect expensive deep work.",
    surface: "Productivity",
  },
  {
    title: "Editable reply drafts",
    outcome: "Important Gmail threads can become editable drafts with selectable themes before the user sends anything.",
    surface: "Drafts",
  },
  {
    title: "Delegation and owner tracking",
    outcome: "Track who owns each follow-up, who is waiting, and where the next reminder belongs.",
    surface: "Productivity",
  },
  {
    title: "Approval-gated automation",
    outcome: "Reply approvals, task changes, snoozes, and syncs are staged before anything touches live accounts.",
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
    title: "Feature overview surface",
    outcome: "The enterprise page doubles as the in-app product map so the live feature set is always visible.",
    surface: "Enterprise",
  },
] as const;

const previewEnterpriseOrganizations: EnterpriseOrganization[] = [
  {
    id: "preview-enterprise-1",
    name: "Autopilot Dad Team",
    plan: "enterprise",
    joinKey: "TEAM42SYNC",
    createdBy: "preview-user",
    createdAt: "2026-04-17T16:00:00.000Z",
    updatedAt: "2026-04-17T16:00:00.000Z",
  },
];

const previewEnterpriseMembers: EnterpriseMember[] = [
  {
    id: "preview-member-1",
    organizationId: "preview-enterprise-1",
    userId: "preview-user",
    role: "owner",
    fullName: "Vikram Sundar",
    email: "vikram.sundar2004@gmail.com",
  },
  {
    id: "preview-member-2",
    organizationId: "preview-enterprise-1",
    userId: "preview-maya",
    role: "member",
    fullName: "Maya Chen",
    email: "maya@autopilot.ai",
  },
];

const previewEnterpriseMessages: EnterpriseChatMessage[] = [
  {
    id: "preview-chat-1",
    organizationId: "preview-enterprise-1",
    userId: "preview-user",
    senderName: "Vikram Sundar",
    body: "Maya please draft the renewal response for Northstar and send me the update by 3 PM.",
    createdAt: "2026-04-17T17:15:00.000Z",
    updatedAt: "2026-04-17T17:15:00.000Z",
  },
];

const previewEnterpriseAssignments: EnterpriseAssignment[] = [
  {
    id: "preview-assignment-1",
    organizationId: "preview-enterprise-1",
    sourceChatMessageId: "preview-chat-1",
    createdBy: "preview-user",
    assignedToUserId: "preview-maya",
    assignedToLabel: "Maya Chen",
    title: "Draft the Northstar renewal response",
    detail: "Captured from enterprise chat and staged on the shared calendar.",
    startAt: "2026-04-17T22:00:00.000Z",
    endAt: "2026-04-17T23:00:00.000Z",
    status: "open",
    createdAt: "2026-04-17T17:16:00.000Z",
    updatedAt: "2026-04-17T17:16:00.000Z",
  },
];

function getInitialPage(): AppPage {
  const rawHash = window.location.hash.replace(/^#\/?/, "");
  return appPages.includes(rawHash as AppPage) ? (rawHash as AppPage) : "daily";
}

function loadAssistantSetupState(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(assistantSetupStorageKey) === "done";
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

const plannerPlaceholderAvatar =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23171b19'/%3E%3Ctext x='48' y='57' text-anchor='middle' font-family='Segoe UI, Arial, sans-serif' font-size='34' font-weight='700' fill='white'%3EAI%3C/text%3E%3C/svg%3E";

function buildPlannerEmailPayload(email: EmailMessage): PlannerApiEmailInput {
  return {
    id: email.id,
    provider: email.provider ?? "google",
    providerMessageId: email.id,
    threadId: email.id,
    fromName: email.from,
    fromEmail: email.senderEmail ?? null,
    subject: email.subject,
    snippet: email.preview,
    bodyPreview: email.preview,
    receivedAt: email.receivedAt,
    labels: email.labels,
    importance: email.priority === "medium" ? "normal" : email.priority,
  };
}

function buildPlannerCalendarPayload(event: CalendarEvent): PlannerApiCalendarInput {
  return {
    id: event.id,
    providerEventId: event.id,
    title: event.title,
    description: event.description ?? null,
    startAt: event.start,
    endAt: event.end,
    eventType: event.type,
    attendees: event.attendees ?? [],
  };
}

function mapPlannerActionToTask(
  item: PlannerApiAction,
  sourceEmail: EmailMessage | undefined,
  index: number,
): ActionItem {
  return {
    id: `planner-session-${index}-${item.sourceMessageId ?? item.title}`,
    sourceEmailId: item.sourceMessageId ?? `planner-session-${index}`,
    sourceUrl: sourceEmail?.sourceUrl,
    title: item.title,
    detail: item.detail,
    source: sourceEmail?.from ?? "Autopilot-AI",
    sourceRole: sourceEmail?.role ?? "Planner",
    sourceAvatar: sourceEmail?.avatar ?? plannerPlaceholderAvatar,
    sourceSubject: sourceEmail?.subject ?? item.title,
    sourceProvider: sourceEmail?.provider ?? "google",
    sourceSenderEmail: sourceEmail?.senderEmail,
    receivedAt: sourceEmail?.receivedAt ?? new Date().toISOString(),
    dueAt: item.dueAt || undefined,
    priority: item.priority,
    category: item.category,
    status: item.status,
    confidence: Math.round(item.confidence),
    effort: Math.round(item.effortMinutes),
    impact: Math.round(item.impact),
    risk: item.risk,
    labels: item.labels,
    rankScore: item.rankScore,
    requiresApproval: item.requiresApproval,
  };
}

function mapPlannerBlockToCalendarEvent(
  block: PlannerApiScheduleBlock,
  index: number,
): CalendarEvent {
  return {
    id: `planner-session-block-${index}`,
    title: block.title,
    start: block.startAt,
    end: block.endAt,
    type: normalizePlannerBlockType(block.blockType),
    provider: "planner",
    editable: false,
    description: block.detail,
  };
}

function normalizePlannerBlockType(blockType: string): CalendarEventType {
  return blockType === "meeting" || blockType === "deadline" || blockType === "personal"
    ? blockType
    : "focus";
}

function isGoogleReauthState(status: GoogleWorkspaceConnectionStatus["status"] | undefined) {
  return status === "needs_reauth";
}

function googleConnectionCopy(status: GoogleWorkspaceConnectionStatus["status"] | undefined, session: Session | null) {
  if (status === "connected" || status === "session") return "Google workspace connected";
  if (status === "needs_reauth") return "Reconnect Google permissions";
  if (session?.user.app_metadata.provider === "google") return "Google sign-in needs setup";
  return "Google not connected";
}

function mapEnterpriseAssignmentToCalendarEvent(assignment: EnterpriseAssignment): CalendarEvent {
  return {
    id: `enterprise-${assignment.id}`,
    title: `${assignment.assignedToLabel}: ${assignment.title}`,
    start: assignment.startAt,
    end: assignment.endAt,
    type: "meeting",
    provider: "enterprise",
    editable: false,
    description: assignment.detail,
    attendees: [assignment.assignedToLabel],
  };
}

function buildEnterpriseJoinKey() {
  return Math.random().toString(36).slice(2, 12).toUpperCase();
}

function buildPreviewEnterpriseAssignments(input: {
  message: EnterpriseChatMessage;
  members: EnterpriseMember[];
}): EnterpriseAssignment[] {
  const lines = input.message.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const assignments: EnterpriseAssignment[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(?:@)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)[:,]?\s+(?:please\s+)?(.+)$/i);
    if (!match) return;

    const member = resolvePreviewMember(match[1], input.members);
    const detail = match[2].replace(/[.?!]+$/, "").trim();
    if (!/\b(send|draft|reply|review|prepare|update|schedule|share|check|finish|confirm|follow up|deliver|book|call)\b/i.test(detail)) {
      return;
    }

    const window = buildPreviewAssignmentWindow(input.message.createdAt, index);
    assignments.push({
      id: `preview-assignment-${Date.now()}-${index}`,
      organizationId: input.message.organizationId,
      sourceChatMessageId: input.message.id,
      createdBy: input.message.userId,
      assignedToUserId: member?.userId,
      assignedToLabel: member?.fullName ?? match[1],
      title: detail.charAt(0).toUpperCase() + detail.slice(1),
      detail: `Captured from enterprise chat. ${detail}`,
      startAt: window.startAt,
      endAt: window.endAt,
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return assignments;
}

function resolvePreviewMember(name: string, members: EnterpriseMember[]) {
  const needle = name.trim().toLowerCase();
  return (
    members.find((member) => {
      const fullName = member.fullName.toLowerCase();
      const firstName = fullName.split(/\s+/)[0] ?? "";
      return fullName === needle || firstName === needle;
    }) ?? null
  );
}

function buildPreviewAssignmentWindow(referenceTime: string, index: number) {
  const start = new Date(referenceTime);
  if (Number.isNaN(start.getTime())) {
    start.setTime(Date.now());
  }
  start.setMinutes(0, 0, 0);
  start.setHours(Math.max(9, Math.min(16, start.getHours() + 1 + index)));
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

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
      ? "Sign in with Google to unlock Gmail and Calendar, or use email login for workspace-only access."
      : "Add Supabase env vars before testing login.",
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [googleConnection, setGoogleConnection] = useState<GoogleWorkspaceConnectionStatus>({
    connected: false,
    status: undefined,
  });
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
  const [draftNotice, setDraftNotice] = useState(
    "Reply drafts are generated from important synced email and stay in the app until you copy them into Gmail.",
  );
  const [draftTheme, setDraftTheme] = useState<DraftTheme>("direct");
  const [connectionNotice, setConnectionNotice] = useState(
    hasSupabaseConfig
      ? "Sign in with Google to unlock Gmail and Calendar, then sync metadata into the workspace."
      : "Add Supabase env vars when you are ready to test live OAuth.",
  );
  const [workspaceSource, setWorkspaceSource] = useState<WorkspaceDataSource>(
    previewMode ? "demo" : "empty",
  );
  const [workspaceNotice, setWorkspaceNotice] = useState(
    previewMode
      ? "Preview mode is using demo inbox and calendar data."
      : "Sign in with Google, then sync Gmail and Calendar from Sources before planning live data.",
  );
  const [workspaceEmails, setWorkspaceEmails] = useState<EmailMessage[]>(
    previewMode ? demoEmails : [],
  );
  const [workspaceCalendarEvents, setWorkspaceCalendarEvents] = useState<CalendarEvent[]>(
    previewMode ? demoCalendar : [],
  );
  const [plannerActionItems, setPlannerActionItems] = useState<ActionItem[]>([]);
  const [plannerCalendarEvents, setPlannerCalendarEvents] = useState<CalendarEvent[]>([]);
  const [plannerNotice, setPlannerNotice] = useState(
    previewMode
      ? "Preview mode uses local planning logic until live Gmail and Calendar are connected."
      : "Run the AI planner after syncing Gmail and Calendar to load a saved plan.",
  );
  const [aiSenderBlocks, setAiSenderBlocks] = useState<AiSenderBlock[]>([]);
  const [privacyControlNotice, setPrivacyControlNotice] = useState(
    previewMode
      ? "Preview mode has no live private senders to block."
      : "Block specific senders from AI before running planning on private email.",
  );
  const [replyDraftEdits, setReplyDraftEdits] = useState<Record<string, string>>({});
  const [apiReplyDrafts, setApiReplyDrafts] = useState<Record<string, { subject: string; body: string; reason: string }>>({});
  const [isDraftApiLoading, setIsDraftApiLoading] = useState(false);
  const [assistantSetupComplete, setAssistantSetupComplete] = useState(() =>
    loadAssistantSetupState(),
  );
  const [assistantSenderInput, setAssistantSenderInput] = useState("");
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: "assistant-start",
      kind: "info",
      title: "Autopilot assistant is ready",
      detail:
        "Ask it to block private senders, add a calendar block, or generate a reply draft from synced Gmail.",
    },
  ]);
  const [assistantFocusedDraftId, setAssistantFocusedDraftId] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [manualCalendarEvents, setManualCalendarEvents] = useState<CalendarEvent[]>(() =>
    loadManualCalendarEvents(),
  );
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft | null>(null);
  const [enterpriseOrganizations, setEnterpriseOrganizations] = useState<EnterpriseOrganization[]>(
    previewMode ? previewEnterpriseOrganizations : [],
  );
  const [enterpriseMembers, setEnterpriseMembers] = useState<EnterpriseMember[]>(
    previewMode ? previewEnterpriseMembers : [],
  );
  const [enterpriseMessages, setEnterpriseMessages] = useState<EnterpriseChatMessage[]>(
    previewMode ? previewEnterpriseMessages : [],
  );
  const [enterpriseAssignments, setEnterpriseAssignments] = useState<EnterpriseAssignment[]>(
    previewMode ? previewEnterpriseAssignments : [],
  );
  const [activeEnterpriseId, setActiveEnterpriseId] = useState<string | null>(
    previewMode ? previewEnterpriseOrganizations[0]?.id ?? null : null,
  );
  const [enterpriseCreateName, setEnterpriseCreateName] = useState("");
  const [enterpriseJoinKey, setEnterpriseJoinKey] = useState("");
  const [enterpriseMessageDraft, setEnterpriseMessageDraft] = useState("");
  const [enterpriseNotice, setEnterpriseNotice] = useState(
    previewMode
      ? "Preview mode includes a demo enterprise workspace with chat and assignments."
      : "Create an enterprise or join one with a team key.",
  );
  const [isEnterpriseLoading, setIsEnterpriseLoading] = useState(false);
  const isGoogleConnected = googleConnection.connected;

  const aiEligibleEmails = useMemo(
    () => filterAiBlockedEmails(workspaceEmails, aiSenderBlocks),
    [aiSenderBlocks, workspaceEmails],
  );
  const replyDraftBlueprints = useMemo(
    () => deriveReplyDrafts(aiEligibleEmails, draftTheme),
    [aiEligibleEmails, draftTheme],
  );
  const replyDrafts = useMemo(
    () =>
      replyDraftBlueprints.map((draft) => ({
        ...draft,
        subject: apiReplyDrafts[draft.sourceEmailId]?.subject ?? draft.subject,
        reason: apiReplyDrafts[draft.sourceEmailId]?.reason ?? draft.reason,
        body: replyDraftEdits[draft.id] ?? apiReplyDrafts[draft.sourceEmailId]?.body ?? draft.body,
      })),
    [apiReplyDrafts, replyDraftBlueprints, replyDraftEdits],
  );
  const visiblePlannerActionItems = useMemo(
    () => filterAiBlockedActions(plannerActionItems, aiSenderBlocks),
    [aiSenderBlocks, plannerActionItems],
  );
  const visibleManualCalendarEvents = useMemo(
    () => manualCalendarEvents.filter((event) => localDateFromIso(event.start) === planningDate),
    [manualCalendarEvents, planningDate],
  );
  const visibleEnterpriseCalendarEvents = useMemo(
    () =>
      enterpriseAssignments
        .filter((assignment) => localDateFromIso(assignment.startAt) === planningDate)
        .map(mapEnterpriseAssignmentToCalendarEvent),
    [enterpriseAssignments, planningDate],
  );
  const calendarEvents = useMemo(
    () =>
      [
        ...workspaceCalendarEvents,
        ...plannerCalendarEvents,
        ...visibleEnterpriseCalendarEvents,
        ...visibleManualCalendarEvents,
      ].sort(
        (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
      ),
    [
      plannerCalendarEvents,
      visibleEnterpriseCalendarEvents,
      visibleManualCalendarEvents,
      workspaceCalendarEvents,
    ],
  );
  const baseTasks = useMemo(
    () =>
      visiblePlannerActionItems.length > 0
        ? visiblePlannerActionItems
        : deriveActionItems(aiEligibleEmails, planningDate),
    [aiEligibleEmails, planningDate, visiblePlannerActionItems],
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
  const activeEnterpriseMembers = useMemo(
    () => enterpriseMembers.filter((member) => member.organizationId === activeEnterpriseId),
    [activeEnterpriseId, enterpriseMembers],
  );
  const promotionalEmailCount = useMemo(
    () => workspaceEmails.filter((email) => isAdLikeEmail(email)).length,
    [workspaceEmails],
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      assistantSetupStorageKey,
      assistantSetupComplete ? "done" : "pending",
    );
  }, [assistantSetupComplete]);

  useEffect(() => {
    const draftIds = new Set(replyDraftBlueprints.map((draft) => draft.id));
    setReplyDraftEdits((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([draftId]) => draftIds.has(draftId)),
      ),
    );
    const sourceIds = new Set(replyDraftBlueprints.map((draft) => draft.sourceEmailId));
    setApiReplyDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([sourceMessageId]) => sourceIds.has(sourceMessageId)),
      ),
    );
  }, [replyDraftBlueprints]);

  useEffect(() => {
    if (activePage !== "drafts") return;
    if (replyDraftBlueprints.length === 0) return;

    void generateApiReplyDrafts();
  }, [activePage, draftTheme, replyDraftBlueprints]);

  async function refreshGoogleConnectionStatus() {
    const status = await getGoogleWorkspaceConnectionStatus();
    setGoogleConnection(status);
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

  async function refreshPlannerOutput() {
    if (previewMode && !authSession) {
      setPlannerActionItems([]);
      setPlannerCalendarEvents([]);
      setPlannerNotice("Preview mode uses local task extraction until a live AI plan is saved.");
      return;
    }

    if (!authSession && !previewMode) {
      setPlannerActionItems([]);
      setPlannerCalendarEvents([]);
      setPlannerNotice("Run the AI planner after syncing Gmail and Calendar to load a saved plan.");
      return;
    }

    const result = await loadLatestPlannerOutput({ date: planningDate });
    setPlannerActionItems(result.actionItems);
    setPlannerCalendarEvents(result.scheduleBlocks);
    setPlannerNotice(result.message);
  }

  async function refreshAiPrivacyControls() {
    if (previewMode && !authSession) {
      setAiSenderBlocks([]);
      setPrivacyControlNotice("Preview mode has no live private senders to block.");
      return;
    }

    if (!authSession && !previewMode) {
      setAiSenderBlocks([]);
      setPrivacyControlNotice("Sign in to block private senders from AI planning.");
      return;
    }

    const result = await loadAiSenderBlocks();
    setAiSenderBlocks(result.blocks);
    setPrivacyControlNotice(result.message);
  }

  async function refreshEnterpriseWorkspace() {
    if (previewMode) return;

    if (!authSession) {
      setEnterpriseOrganizations([]);
      setEnterpriseMembers([]);
      setEnterpriseMessages([]);
      setEnterpriseAssignments([]);
      setActiveEnterpriseId(null);
      setEnterpriseNotice("Sign in before creating or joining an enterprise.");
      return;
    }

    setIsEnterpriseLoading(true);
    const result = await loadEnterpriseWorkspace();
    setEnterpriseNotice(result.message);
    if (!result.ok) {
      setEnterpriseOrganizations([]);
      setEnterpriseMembers([]);
      setEnterpriseMessages([]);
      setEnterpriseAssignments([]);
      setActiveEnterpriseId(null);
      setIsEnterpriseLoading(false);
      return;
    }

    setEnterpriseOrganizations(result.organizations);
    setEnterpriseMembers(result.members);
    setActiveEnterpriseId((current) =>
      current && result.organizations.some((organization) => organization.id === current)
        ? current
        : result.organizations[0]?.id ?? null,
    );
    setIsEnterpriseLoading(false);
  }

  async function refreshEnterpriseConversation(organizationId: string | null) {
    if (previewMode) return;
    if (!authSession || !organizationId) {
      setEnterpriseMessages([]);
      setEnterpriseAssignments([]);
      return;
    }

    setIsEnterpriseLoading(true);
    const result = await loadEnterpriseConversation(organizationId);
    setEnterpriseNotice(result.message);
    if (result.ok) {
      setEnterpriseMessages(result.messages);
      setEnterpriseAssignments(result.assignments);
    } else {
      setEnterpriseMessages([]);
      setEnterpriseAssignments([]);
    }
    setIsEnterpriseLoading(false);
  }

  useEffect(() => {
    if (!authRequired || !supabase) return undefined;

    let isMounted = true;
    const waitingOnOAuthCallback = window.location.pathname.includes("/auth/callback");
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setAuthSession(data.session);
      if (data.session || !waitingOnOAuthCallback) {
        setIsAuthReady(true);
      }
      if (data.session) {
        void refreshGoogleConnectionStatus();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      setIsAuthReady(true);
      if (!session) {
        setGoogleConnection({ connected: false, status: undefined });
        return;
      }
      window.setTimeout(() => {
        void refreshGoogleConnectionStatus();
      }, 0);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [authRequired]);

  useEffect(() => {
    void refreshWorkspaceData();
    void refreshPlannerOutput();
    void refreshAiPrivacyControls();
  }, [authSession, planningDate, previewMode]);

  useEffect(() => {
    void refreshEnterpriseWorkspace();
  }, [authSession, previewMode]);

  useEffect(() => {
    void refreshEnterpriseConversation(activeEnterpriseId);
  }, [activeEnterpriseId, authSession, previewMode]);

  useEffect(() => {
    let isMounted = true;
    let removeNativeListener: (() => void) | undefined;
    const handleConnectionResult = (result: Awaited<ReturnType<typeof completeOAuthRedirect>>) => {
      if (!isMounted) return;
      if (result) {
        setIsAuthReady(true);
        if (result.googleConnected) {
          setGoogleConnection({ connected: true, status: "connected" });
        } else {
          void refreshGoogleConnectionStatus();
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
    sourceUrl,
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
    sourceUrl?: string;
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
      sourceUrl,
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
      setGoogleConnection({ connected: true, status: "connected" });
    }
  }

  async function syncGoogleWorkspaceData() {
    if (isGoogleReauthState(googleConnection.status)) {
      setConnectionNotice("Reconnect Google permissions from the Sources page before syncing again.");
      return;
    }
    if (!isGoogleConnected) {
      setConnectionNotice("Sign in with Google to unlock Gmail and Calendar, then sync.");
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
        ? `${result.message} ${result.emailCount ?? 0} emails and ${result.calendarEventCount ?? 0} calendar events loaded.`
        : `Google sync failed: ${result.message}`,
    );
    if (result.ok) {
      setGoogleConnection({ connected: true, status: "connected" });
      setPlannerActionItems([]);
      setPlannerCalendarEvents([]);
      setWorkspaceSource("live");
      setWorkspaceEmails(result.emails);
      setWorkspaceCalendarEvents(result.calendarEvents);
      setWorkspaceNotice(result.message);
      setPlannerNotice(
        result.persisted
          ? "Google sync completed. Run the AI planner again to rebuild the Gmail-backed action list."
          : "Google data is loaded for this session. Run the AI planner now while the current Google session is active.",
      );
      if (result.persisted) {
        await refreshWorkspaceData();
      }
      return;
    }

    await refreshGoogleConnectionStatus();
  }

  async function blockSenderFromAi(email: EmailMessage) {
    await blockSenderAddressFromAi(
      email.senderEmail,
      email.from,
      email.provider ?? "google",
      "Private sender",
    );
  }

  async function unblockSenderFromAi(block: AiSenderBlock) {
    if (block.id.startsWith("local-")) {
      setAiSenderBlocks((current) => current.filter((item) => item.id !== block.id));
      setPrivacyControlNotice("The sender is allowed back into AI planning.");
      setPlannerNotice("Sender restored for AI. Re-run planning to include that sender again.");
      return;
    }

    const result = await unblockAiSender(block.id);
    setPrivacyControlNotice(result.message);
    if (!result.ok) return;

    setAiSenderBlocks((current) => current.filter((item) => item.id !== block.id));
    setPlannerNotice("Sender restored for AI. Re-run planning to include that sender again.");
  }

  async function blockSenderAddressFromAi(
    senderEmail: string | undefined,
    senderName?: string,
    provider = "google",
    reason = "Private sender",
  ): Promise<boolean> {
    if (!senderEmail?.trim()) {
      setPrivacyControlNotice("Add a valid sender email before blocking it from AI.");
      return false;
    }

    const existingBlock = findAiSenderBlock(senderEmail, aiSenderBlocks);
    if (existingBlock) {
      setPrivacyControlNotice(`${existingBlock.senderName ?? existingBlock.senderEmail} is already blocked from AI.`);
      return true;
    }

    const result = await blockAiSender({
      provider,
      senderEmail,
      senderName,
      reason,
    });

    if (result.ok && result.block) {
      applyAiSenderBlock(result.block);
      setPrivacyControlNotice(result.message);
      setPlannerNotice("Private sender blocked from AI. Re-run planning to rebuild the action list and schedule without that sender.");
      return true;
    }

    const localBlock = createLocalAiSenderBlock(senderEmail, senderName, provider, reason);
    applyAiSenderBlock(localBlock);
    setPrivacyControlNotice(
      hasSupabaseConfig
        ? `${localBlock.senderName ?? localBlock.senderEmail} is blocked locally while the privacy API is unavailable.`
        : `${localBlock.senderName ?? localBlock.senderEmail} is blocked locally in preview mode.`,
    );
    setPlannerNotice("Private sender blocked from AI. Re-run planning to rebuild the action list and schedule without that sender.");
    return true;
  }

  function applyAiSenderBlock(block: AiSenderBlock) {
    setAiSenderBlocks((current) => {
      const next = current.filter((item) => item.id !== block.id && item.senderEmail !== block.senderEmail);
      return [block, ...next];
    });
  }

  async function loginWithGoogle() {
    setAuthNotice("Opening Google sign-in for Gmail and Calendar...");
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
      setGoogleConnection({ connected: false, status: undefined });
      setPlannerActionItems([]);
      setPlannerCalendarEvents([]);
      setAiSenderBlocks([]);
      setEnterpriseOrganizations([]);
      setEnterpriseMembers([]);
      setEnterpriseMessages([]);
      setEnterpriseAssignments([]);
      setActiveEnterpriseId(null);
    }
  }

  async function copyEnterpriseJoinKey(joinKey: string) {
    const copied = await copyTextToClipboard(joinKey);
    setEnterpriseNotice(copied ? `Enterprise key ${joinKey} copied.` : "Copy failed. Select the key and copy it manually.");
  }

  async function createEnterpriseWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = enterpriseCreateName.trim();
    if (!name) {
      setEnterpriseNotice("Enter a name before creating the enterprise.");
      return;
    }

    if (previewMode) {
      const organizationId = `preview-enterprise-${Date.now()}`;
      const organization: EnterpriseOrganization = {
        id: organizationId,
        name,
        plan: "enterprise",
        joinKey: buildEnterpriseJoinKey(),
        createdBy: authSession?.user.id ?? "preview-user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const owner: EnterpriseMember = {
        id: `preview-member-${Date.now()}`,
        organizationId,
        userId: authSession?.user.id ?? "preview-user",
        role: "owner",
        fullName: authSession?.user.user_metadata.full_name ?? authSession?.user.email ?? "Workspace owner",
        email: authSession?.user.email ?? "workspace@example.com",
      };
      setEnterpriseOrganizations((current) => [...current, organization]);
      setEnterpriseMembers((current) => [...current, owner]);
      setEnterpriseMessages((current) => current);
      setEnterpriseAssignments((current) => current);
      setActiveEnterpriseId(organizationId);
      setEnterpriseCreateName("");
      setEnterpriseNotice(`Created ${name}. Share join key ${organization.joinKey} with teammates.`);
      return;
    }

    setIsEnterpriseLoading(true);
    const result = await createEnterpriseOrganization(name);
    setEnterpriseNotice(result.message);
    if (result.ok) {
      setEnterpriseCreateName("");
      await refreshEnterpriseWorkspace();
      setActiveEnterpriseId(result.data?.id ?? null);
    }
    setIsEnterpriseLoading(false);
  }

  async function joinEnterpriseWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const joinKey = enterpriseJoinKey.trim().toUpperCase();
    if (!joinKey) {
      setEnterpriseNotice("Enter an enterprise key before joining.");
      return;
    }

    if (previewMode) {
      const organization = enterpriseOrganizations.find((candidate) => candidate.joinKey === joinKey);
      if (!organization) {
        setEnterpriseNotice(`No preview enterprise matched ${joinKey}.`);
        return;
      }
      setActiveEnterpriseId(organization.id);
      setEnterpriseJoinKey("");
      setEnterpriseNotice(`Opened ${organization.name} from the enterprise key.`);
      return;
    }

    setIsEnterpriseLoading(true);
    const result = await joinEnterpriseWithKey(joinKey);
    setEnterpriseNotice(result.message);
    if (result.ok) {
      setEnterpriseJoinKey("");
      await refreshEnterpriseWorkspace();
      setActiveEnterpriseId(result.data?.id ?? null);
    }
    setIsEnterpriseLoading(false);
  }

  function selectEnterpriseWorkspace(organizationId: string) {
    setActiveEnterpriseId(organizationId);
    const organization = enterpriseOrganizations.find((candidate) => candidate.id === organizationId);
    if (organization) {
      setEnterpriseNotice(`Switched to ${organization.name}.`);
    }
  }

  async function sendEnterpriseChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = enterpriseMessageDraft.trim();
    if (!activeEnterpriseId) {
      setEnterpriseNotice("Create or join an enterprise before sending chat.");
      return;
    }
    if (!body) {
      setEnterpriseNotice("Write a message before sending it to the enterprise chat.");
      return;
    }

    if (previewMode) {
      const message: EnterpriseChatMessage = {
        id: `preview-chat-${Date.now()}`,
        organizationId: activeEnterpriseId,
        userId: authSession?.user.id ?? "preview-user",
        senderName: authSession?.user.user_metadata.full_name ?? authSession?.user.email ?? "You",
        body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const nextMessages = [...enterpriseMessages, message];
      const nextAssignments = buildPreviewEnterpriseAssignments({
        message,
        members: activeEnterpriseMembers,
      });
      setEnterpriseMessages(nextMessages);
      if (nextAssignments.length > 0) {
        setEnterpriseAssignments((current) => [...current, ...nextAssignments]);
      }
      setEnterpriseMessageDraft("");
      setEnterpriseNotice(
        nextAssignments.length > 0
          ? `Preview AI captured ${nextAssignments.length} team assignment${nextAssignments.length === 1 ? "" : "s"} and placed them on the shared calendar.`
          : "Preview chat saved. No explicit assigned action items were found.",
      );
      return;
    }

    setIsEnterpriseLoading(true);
    const sendResult = await sendEnterpriseMessage({
      organizationId: activeEnterpriseId,
      body,
      senderName: authSession?.user.user_metadata.full_name ?? authSession?.user.email ?? undefined,
    });
    if (!sendResult.ok || !sendResult.data) {
      setEnterpriseNotice(sendResult.message);
      setIsEnterpriseLoading(false);
      return;
    }

    const messagesForAnalysis = [...enterpriseMessages, sendResult.data]
      .filter((message) => message.organizationId === activeEnterpriseId)
      .slice(-24)
      .map((message) => ({
        id: message.id,
        senderName: message.senderName,
        body: message.body,
        createdAt: message.createdAt,
      }));
    const analysis = await analyzeEnterpriseChat({
      organizationId: activeEnterpriseId,
      messageId: sendResult.data.id,
      timezone: "America/Los_Angeles",
      messages: messagesForAnalysis,
    });
    setEnterpriseMessageDraft("");
    setEnterpriseNotice(analysis.message || sendResult.message);
    await refreshEnterpriseConversation(activeEnterpriseId);
    setIsEnterpriseLoading(false);
  }

  async function markEnterpriseAssignmentComplete(assignmentId: string) {
    if (previewMode) {
      setEnterpriseAssignments((current) =>
        current.map((assignment) =>
          assignment.id === assignmentId
            ? { ...assignment, status: "done", updatedAt: new Date().toISOString() }
            : assignment,
        ),
      );
      setEnterpriseNotice("Preview assignment marked done.");
      return;
    }

    setIsEnterpriseLoading(true);
    const result = await updateEnterpriseAssignmentStatus({
      assignmentId,
      status: "done",
    });
    setEnterpriseNotice(result.message);
    if (result.ok && activeEnterpriseId) {
      await refreshEnterpriseConversation(activeEnterpriseId);
    }
    setIsEnterpriseLoading(false);
  }

  async function runApiPlanner() {
    setProductivityNotice("Running the AI planning API...");
    const result = await runDailyPlanner({
      date: planningDate,
      timezone: "America/Los_Angeles",
      planningMode: planMode,
      emails: aiEligibleEmails.map(buildPlannerEmailPayload),
      calendarEvents: calendarEvents
        .filter((event) => event.provider !== "planner")
        .map(buildPlannerCalendarPayload),
    });
    setProductivityNotice(
      result.ok
        ? `${result.message} ${result.actionCount ?? 0} actions, ${result.scheduleBlockCount ?? 0} schedule blocks, ${result.approvalCount ?? 0} approvals.`
        : `AI planning API failed: ${result.message}`,
    );
    if (result.ok) {
      const emailById = new Map(workspaceEmails.map((email) => [email.id, email]));
      setPlannerActionItems(
        result.actionItems.map((item, index) =>
          mapPlannerActionToTask(item, item.sourceMessageId ? emailById.get(item.sourceMessageId) : undefined, index),
        ),
      );
      setPlannerCalendarEvents(
        result.scheduleBlocks.map((block, index) => mapPlannerBlockToCalendarEvent(block, index)),
      );
      setPlannerNotice(result.message);
      if (result.persisted) {
        await refreshPlannerOutput();
      }
    }
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
        `${event.title} came from ${
          event.provider === "microsoft"
            ? "Microsoft"
            : event.provider === "enterprise"
              ? "the enterprise workspace"
              : "Google"
        } and stays read-only until external write approval is enabled.`,
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
    setCalendarNotice("Create a new event, tap the grid, or open one of your own items to move it.");
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

  function saveManualCalendarEvent(details: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    type?: CalendarEventType;
  }): boolean {
    const title = details.title.trim();
    if (!title) {
      setCalendarNotice("Add a title before saving the calendar item.");
      return false;
    }

    const start = buildCalendarIso(details.date, details.startTime);
    const end = buildCalendarIso(details.date, details.endTime);
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      setCalendarNotice("End time must be later than the start time.");
      return false;
    }

    const savedEvent: CalendarEvent = {
      id: `manual-${Date.now()}-${Math.round(Math.random() * 10_000)}`,
      title,
      start,
      end,
      type: details.type ?? "meeting",
      provider: "manual",
      editable: true,
      attendees: [],
    };

    setManualCalendarEvents((current) =>
      [...current, savedEvent].sort(
        (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
      ),
    );
    setCalendarNotice(`${title} saved to your editable calendar blocks.`);
    recordMomentum("win", title, "Added from the assistant into the calendar workspace.");
    return true;
  }

  function refreshReplyDrafts() {
    setReplyDraftEdits({});
    void generateApiReplyDrafts(true);
  }

  function updateReplyDraftBody(draftId: string, body: string) {
    setReplyDraftEdits((current) => ({
      ...current,
      [draftId]: body,
    }));
    setDraftNotice("Draft updated locally. Copy it into Gmail when you are ready to send.");
  }

  function resetReplyDraftBody(draftId: string) {
    setReplyDraftEdits((current) => {
      const next = { ...current };
      delete next[draftId];
      return next;
    });
    setDraftNotice("Draft reset to the latest source-backed suggestion.");
  }

  async function copyReplyDraft(draft: EmailReplyDraft) {
    const draftText = `${draft.subject}\n\n${draft.body}`;
    const copied = await copyTextToClipboard(draftText);
    setDraftNotice(
      copied
        ? "Draft copied. Open the source email and paste it into Gmail."
        : "Clipboard copy failed. Open the source email and copy the draft text manually.",
    );
  }

  async function generateApiReplyDrafts(forceMessage = false) {
    if (replyDraftBlueprints.length === 0) {
      setDraftNotice("No important non-promotional email needs a reply draft right now.");
      return;
    }

    setIsDraftApiLoading(true);
    const result = await generateReplyDraftsApi({
      theme: draftTheme,
      emails: replyDraftBlueprints.map((draft) => ({
        id: draft.sourceEmailId,
        from: draft.sender,
        senderEmail: draft.senderEmail,
        subject: draft.originalSubject,
        preview: draft.preview,
        priority: draft.priority,
        category: draft.category,
        actionHint: draft.reason,
        labels: [],
      })),
    });
    setIsDraftApiLoading(false);

    if (result.ok && result.drafts.length > 0) {
      setApiReplyDrafts(
        Object.fromEntries(
          result.drafts.map((draft) => [
            draft.sourceMessageId,
            {
              subject: draft.subject,
              body: draft.body,
              reason: draft.reason,
            },
          ]),
        ),
      );
      setDraftNotice(
        forceMessage || result.source === "openai"
          ? result.message
          : `${replyDraftBlueprints.length} reply drafts ready.`,
      );
      return;
    }

    if (forceMessage || result.message) {
      setDraftNotice(
        result.message || "Draft API unavailable. Showing source-backed fallback drafts.",
      );
    }
  }

  function pushAssistantMessage(kind: AssistantMessageKind, title: string, detail: string) {
    setAssistantMessages((current) => [
      {
        id: `${Date.now()}-${Math.round(Math.random() * 10_000)}`,
        kind,
        title,
        detail,
      },
      ...current,
    ].slice(0, 8));
  }

  async function saveAssistantSenderIntake() {
    const senders = extractSenderEmails(assistantSenderInput);
    if (senders.length === 0) {
      setPrivacyControlNotice("Add at least one sender email before saving the privacy intake.");
      pushAssistantMessage(
        "warning",
        "No sender emails detected",
        "Add sender email addresses like payroll@company.com or finance@bank.com.",
      );
      return;
    }

    let blockedCount = 0;
    for (const sender of senders) {
      // Sequential on purpose so notice text stays deterministic and easier to follow.
      const blocked = await blockSenderAddressFromAi(sender, undefined, "google", "Blocked during assistant setup");
      if (blocked) {
        blockedCount += 1;
      }
    }

    setAssistantSetupComplete(true);
    setAssistantSenderInput("");
    pushAssistantMessage(
      "success",
      "Privacy setup saved",
      `${blockedCount} sender${blockedCount === 1 ? "" : "s"} blocked from AI before planning starts.`,
    );
  }

  async function runAssistantCommand(rawQuery: string) {
    const query = rawQuery.trim();
    if (!query) {
      pushAssistantMessage(
        "warning",
        "Assistant needs a request",
        "Try: block payroll@company.com, add calendar Deep work tomorrow 3pm to 4pm, or draft a reply for Northstar.",
      );
      return;
    }

    const senderMatches = extractSenderEmails(query);
    if (/\b(block|hide|private)\b/i.test(query) && senderMatches.length > 0) {
      let blockedCount = 0;
      for (const sender of senderMatches) {
        const blocked = await blockSenderAddressFromAi(sender, undefined, "google", "Blocked from assistant command");
        if (blocked) blockedCount += 1;
      }
      pushAssistantMessage(
        "success",
        "Assistant updated AI privacy",
        `${blockedCount} sender${blockedCount === 1 ? "" : "s"} blocked from AI planning.`,
      );
      return;
    }

    const calendarCommand = parseAssistantCalendarCommand(query, planningDate);
    if (calendarCommand) {
      const saved = saveManualCalendarEvent({
        title: calendarCommand.title,
        date: calendarCommand.date,
        startTime: calendarCommand.startTime,
        endTime: calendarCommand.endTime,
        type: "focus",
      });
      if (saved) {
        setPlanningDate(calendarCommand.date);
        setActivePage("calendar");
        pushAssistantMessage(
          "success",
          "Assistant added a calendar block",
          `${calendarCommand.title} is on ${calendarCommand.date} from ${calendarCommand.startTime} to ${calendarCommand.endTime}.`,
        );
      }
      return;
    }

    if (isDraftCommand(query)) {
      await generateApiReplyDrafts();
      const searchTerm = extractDraftSearchTerm(query).toLowerCase();
      const matchedDraft =
        replyDraftBlueprints.find((draft) => {
          if (!searchTerm) return true;
          const text = `${draft.sender} ${draft.originalSubject} ${draft.preview}`.toLowerCase();
          return text.includes(searchTerm);
        }) ?? replyDraftBlueprints[0];

      if (matchedDraft) {
        setAssistantFocusedDraftId(matchedDraft.id);
        setActivePage("drafts");
        setDraftNotice(`Draft ready for ${matchedDraft.sender}. Open it, edit it, and copy it into Gmail.`);
        pushAssistantMessage(
          "success",
          "Assistant generated a draft",
          `${matchedDraft.subject} is ready on the Drafts page with the ${draftTheme} theme.`,
        );
      } else {
        pushAssistantMessage(
          "warning",
          "No draft candidate found",
          "Sync Gmail first, or ask for a draft for a sender that has an important non-promotional email in the workspace.",
        );
      }
      return;
    }

    pushAssistantMessage(
      "info",
      "Assistant needs a clearer command",
      "It currently understands sender blocking, calendar additions, and reply draft generation.",
    );
  }

  async function submitAssistantQuery(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await runAssistantCommand(assistantQuery);
    setAssistantQuery("");
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
            <AssistantPanel
              assistantMessages={assistantMessages}
              draftTheme={draftTheme}
              onAssistantQueryChange={setAssistantQuery}
              onAssistantSubmit={submitAssistantQuery}
              onQuickCommand={runAssistantCommand}
              onDraftThemeChange={setDraftTheme}
              onSaveSenderIntake={saveAssistantSenderIntake}
              onSenderInputChange={setAssistantSenderInput}
              query={assistantQuery}
              senderInput={assistantSenderInput}
              setupComplete={assistantSetupComplete}
              blockedSenderCount={aiSenderBlocks.length}
            />
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
                body="Use one Google sign-in to unlock Gmail and Calendar, then add server-backed Slack, WhatsApp, Microsoft, and Notion ingestion."
              />
              {settings.sections.integrations ? (
                <IntegrationPanel
                  connectionNotice={connectionNotice}
                  googleConnection={googleConnection}
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
              blockedSenders={aiSenderBlocks}
              filteredEmailCount={aiEligibleEmails.length}
              isLoading={isWorkspaceLoading}
              notice={workspaceNotice}
              onBlockSender={blockSenderFromAi}
              onUnblockSender={unblockSenderFromAi}
              plannerActionCount={visiblePlannerActionItems.length}
              plannerNotice={plannerNotice}
              privacyNotice={privacyControlNotice}
              source={workspaceSource}
              syncedEmails={workspaceEmails}
            />
            <SupabaseSetupPanel />
          </>
        );
      case "drafts":
        return (
          <>
            <PageHeader
              eyebrow="Drafts"
              title="Edit reply drafts before they go back into Gmail"
              body="Autopilot-AI drafts replies from important non-promotional email, lets the user pick a theme, and keeps every draft editable before anything is copied into Gmail."
            />
            <ReplyDraftsPage
              drafts={replyDrafts}
              draftTheme={draftTheme}
              focusedDraftId={assistantFocusedDraftId}
              isLoading={isDraftApiLoading}
              notice={draftNotice}
              promotionalEmailCount={promotionalEmailCount}
              source={workspaceSource}
              onCopyDraft={copyReplyDraft}
              onDraftThemeChange={setDraftTheme}
              onRefreshDrafts={refreshReplyDrafts}
              onResetDraft={resetReplyDraftBody}
              onUpdateDraft={updateReplyDraftBody}
            />
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
              body="A Google Calendar-style view keeps the time grid, event colors, agenda, editable blocks, and calendar AI controls in one focused page."
            />
            <FullCalendarSection
              assistantMessages={assistantMessages}
              date={planningDate}
              draftTheme={draftTheme}
              draft={calendarDraft}
              events={calendarEvents}
              notice={calendarNotice}
              preferences={settings.calendar}
              query={assistantQuery}
              setupComplete={assistantSetupComplete}
              onCancelDraft={cancelCalendarDraft}
              onCreateDraft={() => {
                startCalendarDraft(settings.calendar.startHour + 1);
                setCalendarNotice("Drafting a new calendar block.");
              }}
              onDraftChange={updateCalendarDraft}
              onDraftThemeChange={setDraftTheme}
              onEditEvent={selectCalendarEvent}
              onJumpToToday={() => setPlanningDate(getLocalDateISO())}
              onQuickCommand={runAssistantCommand}
              onSaveDraft={saveCalendarDraftItem}
              onSubmitAssistant={submitAssistantQuery}
              onAssistantQueryChange={setAssistantQuery}
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
          <EnterprisePage
            activeOrganizationId={activeEnterpriseId}
            assignments={enterpriseAssignments}
            createEnterpriseName={enterpriseCreateName}
            featureCards={premiumFeatures}
            isBusy={isEnterpriseLoading}
            joinKeyInput={enterpriseJoinKey}
            members={enterpriseMembers}
            messages={enterpriseMessages}
            messageDraft={enterpriseMessageDraft}
            notice={enterpriseNotice}
            organizations={enterpriseOrganizations}
            onCopyJoinKey={copyEnterpriseJoinKey}
            onCreateEnterprise={createEnterpriseWorkspace}
            onCreateEnterpriseNameChange={setEnterpriseCreateName}
            onJoinEnterprise={joinEnterpriseWorkspace}
            onJoinKeyChange={setEnterpriseJoinKey}
            onMarkAssignmentDone={markEnterpriseAssignmentComplete}
            onMessageDraftChange={setEnterpriseMessageDraft}
            onOpenActions={() => navigate("actions")}
            onOpenDrafts={() => navigate("drafts")}
            onOpenCalendar={() => navigate("calendar")}
            onOpenSources={() => navigate("sources")}
            onSelectOrganization={selectEnterpriseWorkspace}
            onSendMessage={sendEnterpriseChatMessage}
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
        googleConnection={googleConnection}
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
            <span>Opening your workspace</span>
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
            <span>Inbox to plan</span>
          </div>
        </div>
        <span className="eyebrow">Start here</span>
        <h1 id="login-title">Sign in once and unlock Gmail, Calendar, and planning.</h1>
        <p className="auth-copy">
          Google sign-in is the main path for inbox and calendar planning. It stores encrypted Google
          tokens for durable sync, caches only metadata, and avoids saving full email bodies.
        </p>
        <div className="auth-steps" aria-label="Sign-in flow">
          <article className="auth-step">
            <strong>1. Sign in</strong>
            <p>Use Google for Gmail and Calendar access, or email for workspace-only login.</p>
          </article>
          <article className="auth-step">
            <strong>2. Sync metadata</strong>
            <p>Load recent Gmail and today's Calendar events without storing full email bodies.</p>
          </article>
          <article className="auth-step">
            <strong>3. Sync and plan</strong>
            <p>Turn live inbox and calendar context into action items, drafts, and schedule blocks.</p>
          </article>
        </div>
        <button className="google-login-button" type="button" onClick={onGoogleLogin}>
          <GoogleMarkIcon />
          <span>Sign in with Google</span>
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
      <a href="/home.html">Home</a>
      <a href="/privacy.html">Privacy policy</a>
      <a href="/terms.html">Terms &amp; conditions</a>
    </nav>
  );
}

function Sidebar({
  activePage,
  googleConnection,
  layout,
  session,
  onNavigate,
  onSignOut,
}: {
  activePage: AppPage;
  googleConnection: GoogleWorkspaceConnectionStatus;
  layout: CustomizationSettings["layout"];
  session: Session | null;
  onNavigate: (page: AppPage) => void;
  onSignOut?: () => void;
}) {
  const navIcons: Record<AppPage, ReactNode> = {
    daily: <Inbox size={18} aria-hidden="true" />,
    productivity: <MailOpen size={18} aria-hidden="true" />,
    sources: <Link2 size={18} aria-hidden="true" />,
    drafts: <MailOpen size={18} aria-hidden="true" />,
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
  const userEmail = session?.user.email ?? "Mock workspace";
  const connectionLabel = googleConnectionCopy(googleConnection.status, session);

  return (
    <aside className={`sidebar sidebar-style-${layout.sidebarStyle}`} aria-label="Primary">
      <div className="brand-block">
        <div className="brand-mark">A</div>
        <div>
          <p>Autopilot-AI</p>
          <span>Inbox to plan</span>
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
        <div className="operator-avatar" aria-hidden="true">
          {userEmail.slice(0, 1).toUpperCase()}
        </div>
        <div className="operator-meta">
          <span className="operator-label">Workspace account</span>
          <strong className="operator-email" title={userEmail}>
            {userEmail}
          </strong>
          <span className="operator-status">{connectionLabel}</span>
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

function GoogleMarkIcon() {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 18 18">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.56 2.68-3.88 2.68-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.31-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.98 10.72A5.41 5.41 0 0 1 3.7 9c0-.6.1-1.18.28-1.72V4.95H.96a9 9 0 0 0 0 8.1l3.02-2.33Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.33l2.58-2.58C13.46.88 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.02 2.33c.7-2.12 2.68-3.7 5.02-3.7Z"
        fill="#EA4335"
      />
    </svg>
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
      <div className="page-header-copy">
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
  googleConnection,
  isSyncing,
  onConnect,
  onSyncGoogle,
}: {
  connectionNotice: string;
  googleConnection: GoogleWorkspaceConnectionStatus;
  isSyncing: boolean;
  onConnect: (key: IntegrationKey) => void;
  onSyncGoogle: () => void;
}) {
  const googleConnected = googleConnection.connected;
  const googleNeedsReauth = isGoogleReauthState(googleConnection.status);

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
          disabled={!hasSupabaseConfig || !googleConnected || googleNeedsReauth || isSyncing}
        >
          {isSyncing ? "Syncing Google data..." : "Sync Google data"}
        </button>
        <span className="inline-help">
          {googleNeedsReauth
            ? "Google permissions need to be reconnected before Gmail and Calendar sync can continue."
            : googleConnected
              ? "Google is connected. Sync stores Gmail and Calendar metadata only, never full email bodies."
              : "Sign in with Google to unlock Gmail and Calendar, then sync metadata into the workspace."}
        </span>
      </div>
      <div className="integration-grid">
        {integrationProviders.map((provider) => (
          <IntegrationCard
            googleConnection={googleConnection}
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
  blockedSenders,
  filteredEmailCount,
  isLoading,
  notice,
  onBlockSender,
  onUnblockSender,
  plannerActionCount,
  plannerNotice,
  privacyNotice,
  source,
  syncedEmails,
}: {
  calendarEvents: CalendarEvent[];
  blockedSenders: AiSenderBlock[];
  filteredEmailCount: number;
  isLoading: boolean;
  notice: string;
  onBlockSender: (email: EmailMessage) => void;
  onUnblockSender: (block: AiSenderBlock) => void;
  plannerActionCount: number;
  plannerNotice: string;
  privacyNotice: string;
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
      <p className="inline-help">{plannerNotice}</p>
      <p className="inline-help">{privacyNotice}</p>
      <div className="setup-grid compact">
        <article>
          <strong>{syncedEmails.length}</strong>
          <p>source-backed emails currently synced into the workspace</p>
        </article>
        <article>
          <strong>{filteredEmailCount}</strong>
          <p>emails currently eligible for AI after private sender blocks</p>
        </article>
        <article>
          <strong>{calendarEvents.length}</strong>
          <p>calendar events visible in the day view</p>
        </article>
        <article>
          <strong>{plannerActionCount}</strong>
          <p>
            {source === "live"
              ? "AI actions currently loaded back from the latest saved planner run."
              : "AI planner output stays empty until a real source is connected and synced."}
          </p>
        </article>
        <article>
          <strong>{blockedSenders.length}</strong>
          <p>private senders blocked from AI planning</p>
        </article>
        <article>
          <strong>{source === "live" ? "No fake tasks" : "Preview only"}</strong>
          <p>
            {source === "live"
              ? "Gmail sync is real, and planner-backed tasks keep a visible source trail."
              : "The app only shows demo tasks until a real source is connected and synced."}
          </p>
        </article>
      </div>
      <div className="source-proof-list" aria-label="Recent synced email threads">
        {syncedEmails.slice(0, 4).map((email) => {
          const senderBlock = findAiSenderBlock(email.senderEmail, blockedSenders);

          return (
            <article className="source-proof-card" key={email.id}>
            <strong>{email.subject}</strong>
            <span>
              {email.from} - {formatTime(email.receivedAt)}
            </span>
            <p>{email.preview}</p>
            <div className="source-proof-actions">
              {email.sourceUrl ? (
                <a
                  className="secondary-action"
                  href={email.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open Gmail thread
                </a>
              ) : null}
              {email.senderEmail ? (
                senderBlock ? (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => onUnblockSender(senderBlock)}
                  >
                    Allow sender in AI
                  </button>
                ) : (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => onBlockSender(email)}
                  >
                    Block sender from AI
                  </button>
                )
              ) : (
                <span className="inline-help">This thread has no sender email to block yet.</span>
              )}
              <span className={senderBlock ? "status-pill" : "status-pill ready"}>
                {senderBlock ? "Private sender blocked" : "AI can use this sender"}
              </span>
            </div>
            </article>
          );
        })}
        {syncedEmails.length === 0 ? (
          <article className="source-proof-card empty">
            <strong>No synced email threads yet</strong>
            <p>Once Google data is stored, recent subjects and previews appear here before they become action items.</p>
          </article>
        ) : null}
      </div>
      {blockedSenders.length > 0 ? (
        <div className="blocked-sender-list" aria-label="Private senders blocked from AI">
          {blockedSenders.map((block) => (
            <article className="source-proof-card" key={block.id}>
              <strong>{block.senderName ?? block.senderEmail}</strong>
              <span>
                {block.senderEmail} - {block.provider}
              </span>
              <p>{block.reason}</p>
              <div className="source-proof-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => onUnblockSender(block)}
                >
                  Allow sender in AI
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
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
          <p>Deploy `store-google-connection`, `sync-google-workspace`, `sync-microsoft-workspace`, `plan-day`, and `draft-email`, then set Google, Microsoft, encryption, and OpenAI secrets.</p>
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

function AssistantPanel({
  assistantMessages,
  blockedSenderCount,
  draftTheme,
  onAssistantQueryChange,
  onAssistantSubmit,
  onQuickCommand,
  onDraftThemeChange,
  onSaveSenderIntake,
  onSenderInputChange,
  query,
  senderInput,
  setupComplete,
}: {
  assistantMessages: AssistantMessage[];
  blockedSenderCount: number;
  draftTheme: DraftTheme;
  onAssistantQueryChange: (value: string) => void;
  onAssistantSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQuickCommand: (query: string) => Promise<void>;
  onDraftThemeChange: (theme: DraftTheme) => void;
  onSaveSenderIntake: () => void;
  onSenderInputChange: (value: string) => void;
  query: string;
  senderInput: string;
  setupComplete: boolean;
}) {
  return (
    <section className="assistant-panel" aria-labelledby="assistant-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Assistant</span>
          <h2 id="assistant-title">One place to steer privacy, drafts, and the calendar</h2>
        </div>
        <div className={setupComplete ? "status-pill ready" : "status-pill"}>
          {setupComplete ? "Privacy intake saved" : "Needs privacy setup"}
        </div>
      </div>
      <p className="section-note">
        The assistant uses synced Gmail and calendar context, but it starts by asking which senders
        you do not want AI to see.
      </p>
      {!setupComplete ? (
        <div className="assistant-setup">
          <label className="field-label">
            Private sender emails to block before planning
            <textarea
              aria-label="Private sender emails"
              placeholder="finance@bank.com&#10;payroll@company.com"
              value={senderInput}
              onChange={(event) => onSenderInputChange(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="primary-action" type="button" onClick={onSaveSenderIntake}>
              Save blocked senders
            </button>
            <span className="inline-help">
              {blockedSenderCount} sender{blockedSenderCount === 1 ? "" : "s"} currently blocked
              from AI.
            </span>
          </div>
        </div>
      ) : null}
      <div className="assistant-command-grid">
        <form className="assistant-command-form" onSubmit={onAssistantSubmit}>
          <div className="assistant-guide">
            <strong>First-win walkthrough</strong>
            <p>Run one of these to see the assistant do real work immediately.</p>
            <div className="button-row">
              <button
                className="secondary-action"
                type="button"
                onClick={() => void onQuickCommand("Draft a reply for Northstar")}
              >
                Generate a reply draft
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() => void onQuickCommand("Add calendar Deep work tomorrow 3pm to 4pm")}
              >
                Add a calendar block
              </button>
            </div>
          </div>
          <label className="field-label">
            Ask Autopilot-AI
            <input
              aria-label="Assistant request"
              placeholder="Block payroll@company.com, add calendar Deep work tomorrow 3pm to 4pm, or draft a reply for Northstar"
              value={query}
              onChange={(event) => onAssistantQueryChange(event.target.value)}
            />
          </label>
          <label className="field-label">
            Draft theme
            <select
              aria-label="Assistant draft theme"
              value={draftTheme}
              onChange={(event) => onDraftThemeChange(event.target.value as DraftTheme)}
            >
              <option value="direct">Direct</option>
              <option value="warm">Warm</option>
              <option value="executive">Executive</option>
            </select>
          </label>
          <div className="button-row">
            <button className="primary-action" type="submit">
              Run assistant
            </button>
          </div>
        </form>
        <div className="assistant-feed" aria-label="Assistant activity">
          {assistantMessages.map((message) => (
            <article className={`assistant-message ${message.kind}`} key={message.id}>
              <strong>{message.title}</strong>
              <p>{message.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReplyDraftsPage({
  drafts,
  draftTheme,
  focusedDraftId,
  isLoading,
  notice,
  promotionalEmailCount,
  source,
  onCopyDraft,
  onDraftThemeChange,
  onRefreshDrafts,
  onResetDraft,
  onUpdateDraft,
}: {
  drafts: EmailReplyDraft[];
  draftTheme: DraftTheme;
  focusedDraftId: string | null;
  isLoading: boolean;
  notice: string;
  promotionalEmailCount: number;
  source: WorkspaceDataSource;
  onCopyDraft: (draft: EmailReplyDraft) => void;
  onDraftThemeChange: (theme: DraftTheme) => void;
  onRefreshDrafts: () => void;
  onResetDraft: (draftId: string) => void;
  onUpdateDraft: (draftId: string, body: string) => void;
}) {
  const sourceLabel =
    isLoading
      ? "Generating API drafts"
      : source === "live"
        ? "Live Gmail drafts"
        : source === "demo"
          ? "Preview drafts"
          : "Waiting for Gmail sync";

  return (
    <>
      <section className="setup-panel" aria-labelledby="reply-drafts-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Reply drafts</span>
            <h2 id="reply-drafts-title">Important email gets a draft, but the user stays in control</h2>
          </div>
          <div className={drafts.length > 0 ? "status-pill ready" : "status-pill"}>{sourceLabel}</div>
        </div>
        <p className="section-note">{notice}</p>
        <div className="setup-grid compact">
          <article>
            <strong>{drafts.length}</strong>
            <p>drafts currently ready for important non-promotional email</p>
          </article>
          <article>
            <strong>{promotionalEmailCount}</strong>
            <p>promotional or newsletter emails ignored before draft generation</p>
          </article>
          <article>
            <strong>{draftTheme}</strong>
            <p>current draft theme applied across the draft workspace</p>
          </article>
          <article>
            <strong>Editable</strong>
            <p>every draft stays editable and copy-only until the user pastes it into Gmail</p>
          </article>
        </div>
        <div className="button-row">
          <label className="field-label inline-field">
            Draft theme
            <select
              aria-label="Draft theme"
              value={draftTheme}
              onChange={(event) => onDraftThemeChange(event.target.value as DraftTheme)}
            >
              <option value="direct">Direct</option>
              <option value="warm">Warm</option>
              <option value="executive">Executive</option>
            </select>
          </label>
          <button className="secondary-action" type="button" onClick={onRefreshDrafts}>
            Refresh drafts
          </button>
        </div>
      </section>
      <section className="draft-list" aria-label="Draft list">
        {drafts.length > 0 ? (
          drafts.map((draft) => (
            <article
              className={draft.id === focusedDraftId ? "draft-card focused" : "draft-card"}
              key={draft.id}
            >
              <div className="draft-card-header">
                <div>
                  <span className={`priority ${draft.priority}`}>{draft.priority}</span>
                  <h3>{draft.originalSubject}</h3>
                </div>
                <span className="status-pill ready">{draft.reason}</span>
              </div>
              <p>{draft.preview}</p>
              <div className="source-row">
                <div>
                  <strong>{draft.sender}</strong>
                  <span>{draft.senderEmail ?? "Sender email unavailable"}</span>
                </div>
              </div>
              <label className="field-label">
                Reply subject
                <input aria-label={`Draft subject for ${draft.originalSubject}`} readOnly value={draft.subject} />
              </label>
              <label className="field-label">
                Draft body
                <textarea
                  aria-label={`Draft body for ${draft.originalSubject}`}
                  value={draft.body}
                  onChange={(event) => onUpdateDraft(draft.id, event.target.value)}
                />
              </label>
              <div className="button-row">
                {draft.sourceUrl ? (
                  <a className="secondary-action" href={draft.sourceUrl} rel="noreferrer" target="_blank">
                    Open source email
                  </a>
                ) : null}
                <button className="secondary-action" type="button" onClick={() => onResetDraft(draft.id)}>
                  Reset text
                </button>
                <button className="primary-action" type="button" onClick={() => onCopyDraft(draft)}>
                  Copy draft
                </button>
              </div>
            </article>
          ))
        ) : (
          <article className="draft-card empty">
            <strong>No draft replies are ready yet.</strong>
            <p>Sync Gmail, then ask the assistant to generate a draft or open this page again.</p>
          </article>
        )}
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
  googleConnection,
  provider,
  onConnect,
}: {
  googleConnection: GoogleWorkspaceConnectionStatus;
  provider: IntegrationProvider;
  onConnect: (key: IntegrationKey) => void;
}) {
  const readiness = getConnectionReadiness(provider, hasSupabaseConfig);
  const isGoogleProvider = provider.key === "google";
  const isConnected = isGoogleProvider && googleConnection.connected;
  const needsReauth = isGoogleProvider && isGoogleReauthState(googleConnection.status);
  let actionLabel = readiness === "ready" ? `Connect ${provider.shortName}` : "Open setup";
  if (isGoogleProvider) {
    actionLabel = isConnected
      ? "Google connected"
      : needsReauth
        ? "Reconnect Google permissions"
        : readiness === "ready"
          ? "Sign in with Google to unlock Gmail and Calendar"
          : "Open setup";
  } else if (isConnected) {
    actionLabel = "Connected";
  }

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
          : isGoogleProvider
            ? "One Google sign-in grants Gmail and Calendar access, stores encrypted Google tokens for durable sync, and caches metadata only."
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
        {task.sourceUrl ? (
          <div className="button-row">
            <a
              className="secondary-action"
              href={task.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open source email
            </a>
          </div>
        ) : null}
        <div className="risk-note">
          <AlertTriangle size={16} aria-hidden="true" />
          {task.risk}
        </div>
      </div>
    </article>
  );
}

function FullCalendarSection({
  assistantMessages,
  date,
  draftTheme,
  draft,
  events,
  notice,
  preferences,
  query,
  setupComplete,
  onAssistantQueryChange,
  onCancelDraft,
  onCreateDraft,
  onDraftChange,
  onDraftThemeChange,
  onEditEvent,
  onJumpToToday,
  onQuickCommand,
  onSaveDraft,
  onSubmitAssistant,
  onSelectDate,
  onSlotClick,
}: {
  assistantMessages: AssistantMessage[];
  date: string;
  draftTheme: DraftTheme;
  draft: CalendarDraft | null;
  events: CalendarEvent[];
  notice: string;
  preferences: CalendarPreferences;
  query: string;
  setupComplete: boolean;
  onAssistantQueryChange: (value: string) => void;
  onCancelDraft: () => void;
  onCreateDraft: () => void;
  onDraftChange: (draft: Partial<CalendarDraft>) => void;
  onDraftThemeChange: (theme: DraftTheme) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onJumpToToday: () => void;
  onQuickCommand: (query: string) => Promise<void>;
  onSaveDraft: () => void;
  onSubmitAssistant: (event: FormEvent<HTMLFormElement>) => void;
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
            <div className="button-row">
              <button
                type="button"
                onClick={onJumpToToday}
                disabled={date === getLocalDateISO()}
              >
                Today
              </button>
              <button type="button" onClick={onCreateDraft}>
                New event
              </button>
            </div>
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
          <CalendarAiPanel
            assistantMessages={assistantMessages}
            draftTheme={draftTheme}
            query={query}
            setupComplete={setupComplete}
            onAssistantQueryChange={onAssistantQueryChange}
            onDraftThemeChange={onDraftThemeChange}
            onQuickCommand={onQuickCommand}
            onSubmit={onSubmitAssistant}
          />
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
            onCreateDraft={onCreateDraft}
            onChange={onDraftChange}
            onSave={onSaveDraft}
          />
        </aside>
      </div>
    </section>
  );
}

function CalendarAiPanel({
  assistantMessages,
  draftTheme,
  query,
  setupComplete,
  onAssistantQueryChange,
  onDraftThemeChange,
  onQuickCommand,
  onSubmit,
}: {
  assistantMessages: AssistantMessage[];
  draftTheme: DraftTheme;
  query: string;
  setupComplete: boolean;
  onAssistantQueryChange: (value: string) => void;
  onDraftThemeChange: (theme: DraftTheme) => void;
  onQuickCommand: (query: string) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const visibleMessages = assistantMessages.slice(0, 3);

  return (
    <section className="calendar-ai-panel" aria-labelledby="calendar-ai-title">
      <div className="rail-heading">
        <CalendarDays size={18} aria-hidden="true" />
        <h2 id="calendar-ai-title">Calendar AI</h2>
      </div>
      <p className="section-note">
        Add blocks, protect focus time, or jump into a Gmail draft without leaving the schedule.
      </p>
      <div className="calendar-ai-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => void onQuickCommand("Add calendar Deep work tomorrow 3pm to 4pm")}
        >
          Protect focus
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => void onQuickCommand("Draft a reply for Northstar")}
        >
          Draft reply
        </button>
      </div>
      <form className="calendar-ai-form" onSubmit={onSubmit}>
        <label className="field-label">
          Calendar assistant request
          <input
            aria-label="Calendar assistant request"
            placeholder="Add calendar Interview prep tomorrow 11am to 11:30am"
            value={query}
            onChange={(event) => onAssistantQueryChange(event.target.value)}
          />
        </label>
        <label className="field-label">
          Draft theme
          <select
            aria-label="Calendar assistant draft theme"
            value={draftTheme}
            onChange={(event) => onDraftThemeChange(event.target.value as DraftTheme)}
          >
            <option value="direct">Direct</option>
            <option value="warm">Warm</option>
            <option value="executive">Executive</option>
          </select>
        </label>
        <div className="button-row">
          <button className="primary-action" type="submit">
            Run calendar AI
          </button>
          <span className="inline-help">
            {setupComplete ? "Private sender intake saved." : "Finish private sender intake on Daily plan first."}
          </span>
        </div>
      </form>
      <div className="calendar-ai-feed" aria-label="Calendar AI activity">
        {visibleMessages.map((message) => (
          <article className={`assistant-message ${message.kind}`} key={message.id}>
            <strong>{message.title}</strong>
            <p>{message.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CalendarDraftEditor({
  draft,
  notice,
  onCancel,
  onCreateDraft,
  onChange,
  onSave,
}: {
  draft: CalendarDraft | null;
  notice: string;
  onCancel: () => void;
  onCreateDraft: () => void;
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
          <button className="primary-action" type="button" onClick={onCreateDraft}>
            Create new event
          </button>
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

function createLocalAiSenderBlock(
  senderEmail: string,
  senderName?: string,
  provider = "google",
  reason = "Private sender",
): AiSenderBlock {
  return {
    id: `local-${senderEmail.toLowerCase()}`,
    provider,
    senderEmail: senderEmail.trim().toLowerCase(),
    senderName: senderName?.trim() || undefined,
    reason,
  };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback below.
  }

  if (typeof document === "undefined") return false;

  const element = document.createElement("textarea");
  element.value = text;
  element.setAttribute("readonly", "true");
  element.style.position = "fixed";
  element.style.opacity = "0";
  document.body.appendChild(element);
  element.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(element);
  }

  return copied;
}

export default App;
