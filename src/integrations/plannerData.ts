import type { ActionItem, CalendarEvent, CalendarEventType, EmailPriority, TaskCategory, TaskStatus } from "../types";
import { isVerificationActionLike } from "../emailSignals";
import { supabase } from "./supabaseClient";

interface PlanRunRow {
  id: string;
  model: string | null;
  status: string;
  summary: {
    headline?: string;
  } | null;
  input_counts: {
    emails?: number;
    blockedEmails?: number;
    calendarEvents?: number;
  } | null;
  created_at: string;
}

interface ActionItemRow {
  id: string;
  source_external_id: string | null;
  source_provider: string | null;
  source_subject: string | null;
  source_url: string | null;
  source_sender_name: string | null;
  source_sender_email: string | null;
  title: string;
  detail: string | null;
  due_at: string | null;
  priority: string;
  category: string;
  status: string;
  confidence: number;
  effort_minutes: number;
  impact: number;
  risk: string | null;
  labels: string[] | null;
  rank_score: number;
  requires_approval: boolean;
  created_at: string;
}

interface ScheduleBlockRow {
  id: string;
  title: string;
  detail: string | null;
  start_at: string;
  end_at: string;
  block_type: string;
}

export interface PlannerOutputResult {
  ok: boolean;
  message: string;
  actionItems: ActionItem[];
  scheduleBlocks: CalendarEvent[];
}

export interface LoadPlannerOutputOptions {
  date?: string;
}

export async function loadLatestPlannerOutput(
  options: LoadPlannerOutputOptions = {},
): Promise<PlannerOutputResult> {
  if (!supabase) {
    return {
      ok: true,
      message: "Add Supabase env vars before loading saved AI planning runs.",
      actionItems: [],
      scheduleBlocks: [],
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, message: sessionError.message, actionItems: [], scheduleBlocks: [] };
  }
  if (!sessionData.session) {
    return {
      ok: true,
      message: "Sign in and run planning to load saved AI actions.",
      actionItems: [],
      scheduleBlocks: [],
    };
  }

  let runQuery = supabase
    .from("plan_runs")
    .select("id, model, status, summary, input_counts, created_at")
    .eq("user_id", sessionData.session.user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);
  if (options.date) {
    runQuery = runQuery.eq("run_date", options.date);
  }

  const { data: planRuns, error: runError } = await runQuery;
  const run = (planRuns ?? [])[0] as PlanRunRow | undefined;
  if (runError) {
    return { ok: false, message: runError.message, actionItems: [], scheduleBlocks: [] };
  }
  if (!run) {
    return {
      ok: true,
      message: "Run the AI planner after syncing Gmail and Calendar to load a saved plan.",
      actionItems: [],
      scheduleBlocks: [],
    };
  }

  const [{ data: actionRows, error: actionError }, { data: blockRows, error: blockError }] =
    await Promise.all([
      supabase
        .from("action_items")
        .select(
          "id, source_external_id, source_provider, source_subject, source_url, source_sender_name, source_sender_email, title, detail, due_at, priority, category, status, confidence, effort_minutes, impact, risk, labels, rank_score, requires_approval, created_at",
        )
        .eq("user_id", sessionData.session.user.id)
        .eq("plan_run_id", run.id)
        .order("rank_score", { ascending: false }),
      supabase
        .from("schedule_blocks")
        .select("id, title, detail, start_at, end_at, block_type")
        .eq("user_id", sessionData.session.user.id)
        .eq("plan_run_id", run.id)
        .order("start_at", { ascending: true }),
    ]);

  if (actionError || blockError) {
    return {
      ok: false,
      message: actionError?.message ?? blockError?.message ?? "Could not load the saved AI plan.",
      actionItems: [],
      scheduleBlocks: [],
    };
  }

  const actionItems = (actionRows ?? []).map(mapActionItemRow).filter((item) => !isVerificationActionLike(item));
  const scheduleBlocks = (blockRows ?? []).map(mapScheduleBlockRow);
  const blockedEmailCount = Number(run.input_counts?.blockedEmails ?? 0);
  const messageParts = [
    run.summary?.headline?.trim() || `${actionItems.length} AI actions loaded.`,
    `${actionItems.length} action${actionItems.length === 1 ? "" : "s"}`,
    `${scheduleBlocks.length} schedule block${scheduleBlocks.length === 1 ? "" : "s"}`,
  ];
  if (blockedEmailCount > 0) {
    messageParts.push(`${blockedEmailCount} private sender${blockedEmailCount === 1 ? "" : "s"} excluded`);
  }
  if (run.model) {
    messageParts.push(`model ${run.model}`);
  }

  return {
    ok: true,
    message: messageParts.join(" | "),
    actionItems,
    scheduleBlocks,
  };
}

export function mapActionItemRow(row: ActionItemRow): ActionItem {
  const sourceLabel =
    row.source_sender_name?.trim() ||
    row.source_sender_email?.trim() ||
    humanizeProvider(row.source_provider ?? "google");

  return {
    id: row.id,
    sourceEmailId: row.source_external_id ?? row.id,
    sourceUrl: row.source_url?.trim() || undefined,
    title: row.title,
    detail: row.detail ?? "Open the source thread and confirm the next action.",
    source: sourceLabel,
    sourceRole: inferRoleLabel(row.source_sender_email, row.source_provider),
    sourceAvatar: buildAvatarDataUri(sourceLabel, row.source_provider ?? "google"),
    sourceSubject: row.source_subject?.trim() || row.title,
    sourceProvider: row.source_provider ?? "google",
    sourceSenderEmail: row.source_sender_email?.trim() || undefined,
    receivedAt: row.created_at,
    dueAt: row.due_at ?? undefined,
    priority: normalizePriority(row.priority),
    category: normalizeCategory(row.category),
    status: normalizeStatus(row.status),
    confidence: clamp(row.confidence, 0, 100, 75),
    effort: clamp(row.effort_minutes, 1, 480, 15),
    impact: clamp(row.impact, 1, 10, 5),
    risk: row.risk ?? "Review the source before taking sensitive action.",
    labels: Array.isArray(row.labels) ? row.labels : [],
    rankScore: Number.isFinite(row.rank_score) ? row.rank_score : 0,
    requiresApproval: Boolean(row.requires_approval),
  };
}

export function mapScheduleBlockRow(row: ScheduleBlockRow): CalendarEvent {
  return {
    id: `planner-${row.id}`,
    title: row.title,
    start: row.start_at,
    end: row.end_at,
    type: normalizeCalendarEventType(row.block_type),
    provider: "planner",
    editable: false,
    description: row.detail ?? "AI-planned focus block based on synced Gmail and Calendar context.",
  };
}

function normalizePriority(value: string): EmailPriority {
  return value === "urgent" || value === "high" || value === "low" ? value : "medium";
}

function normalizeCategory(value: string): TaskCategory {
  return value === "reply" ||
    value === "review" ||
    value === "schedule" ||
    value === "send" ||
    value === "approve"
    ? value
    : "follow-up";
}

function normalizeStatus(value: string): TaskStatus {
  return value === "waiting" || value === "done" ? value : "open";
}

function normalizeCalendarEventType(value: string): CalendarEventType {
  return value === "meeting" || value === "deadline" || value === "personal" ? value : "focus";
}

function inferRoleLabel(senderEmail: string | null, provider: string | null): string {
  if (!senderEmail) return humanizeProvider(provider ?? "google");
  const domain = senderEmail.split("@")[1];
  if (!domain) return humanizeProvider(provider ?? "google");
  return domain.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

function humanizeProvider(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "microsoft") return "Microsoft";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function buildAvatarDataUri(label: string, provider: string): string {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";
  const background = provider === "microsoft" ? "#1a73e8" : provider === "google" ? "#1f8a68" : "#171717";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${background}"/><text x="48" y="57" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="white">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
