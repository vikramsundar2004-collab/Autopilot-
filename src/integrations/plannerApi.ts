import { supabase } from "./supabaseClient";
import { describeFunctionError } from "./functionErrors";

export interface PlannerApiRequest {
  date?: string;
  timezone?: string;
  organizationId?: string;
  planningMode?: "impact" | "quickWins" | "deepWork";
  emails?: PlannerApiEmailInput[];
  calendarEvents?: PlannerApiCalendarInput[];
}

export interface PlannerApiEmailInput {
  id: string;
  provider?: string;
  providerMessageId?: string;
  threadId?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  subject: string;
  snippet: string;
  bodyPreview?: string | null;
  receivedAt: string;
  labels?: string[];
  importance?: "low" | "normal" | "high" | "urgent";
}

export interface PlannerApiCalendarInput {
  id: string;
  providerEventId?: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  eventType?: string;
  attendees?: string[];
}

export interface PlannerApiAction {
  sourceMessageId: string | null;
  title: string;
  detail: string;
  priority: "urgent" | "high" | "medium" | "low";
  category: "reply" | "review" | "schedule" | "send" | "approve" | "follow-up";
  dueAt: string;
  status: "open" | "waiting";
  confidence: number;
  effortMinutes: number;
  impact: number;
  risk: string;
  labels: string[];
  requiresApproval: boolean;
  approvalType: string | null;
  rankScore: number;
}

export interface PlannerApiScheduleBlock {
  title: string;
  detail: string;
  startAt: string;
  endAt: string;
  blockType: string;
  sourceMessageIds: string[];
}

export interface PlannerApiResult {
  ok: boolean;
  message: string;
  planRunId?: string;
  actionCount?: number;
  scheduleBlockCount?: number;
  approvalCount?: number;
  persisted?: boolean;
  persistenceError?: string;
  actionItems: PlannerApiAction[];
  scheduleBlocks: PlannerApiScheduleBlock[];
}

export async function runDailyPlanner(
  request: PlannerApiRequest = {},
): Promise<PlannerApiResult> {
  if (import.meta.env.MODE === "test") {
    return {
      ok: false,
      message: "Planner API is disabled in test mode.",
      actionItems: [],
      scheduleBlocks: [],
    };
  }

  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before running the AI planning API.",
      actionItems: [],
      scheduleBlocks: [],
    };
  }

  const { data, error } = await supabase.functions.invoke("plan-day", {
    body: request,
  });

  if (error) {
    return {
      ok: false,
      message: await describeFunctionError(error, "AI planning failed."),
      actionItems: [],
      scheduleBlocks: [],
    };
  }

  const persisted = data?.persisted;
  const actionItems = Array.isArray(data?.actionItems)
    ? data.actionItems.map((item: any) => ({
        sourceMessageId: item.sourceMessageId ? String(item.sourceMessageId) : null,
        title: String(item.title ?? "Review inbox item"),
        detail: String(item.detail ?? ""),
        priority: item.priority === "urgent" || item.priority === "high" || item.priority === "low" ? item.priority : "medium",
        category:
          item.category === "reply" ||
          item.category === "review" ||
          item.category === "schedule" ||
          item.category === "send" ||
          item.category === "approve"
            ? item.category
            : "follow-up",
        dueAt: String(item.dueAt ?? ""),
        status: item.status === "waiting" ? "waiting" : "open",
        confidence: Number(item.confidence ?? 75),
        effortMinutes: Number(item.effortMinutes ?? 15),
        impact: Number(item.impact ?? 5),
        risk: String(item.risk ?? ""),
        labels: Array.isArray(item.labels) ? item.labels.map(String) : [],
        requiresApproval: Boolean(item.requiresApproval),
        approvalType: item.approvalType ? String(item.approvalType) : null,
        rankScore: Number(item.rankScore ?? 0),
      }))
    : [];
  const scheduleBlocks = Array.isArray(data?.scheduleBlocks)
    ? data.scheduleBlocks.map((block: any) => ({
        title: String(block.title ?? "Focus block"),
        detail: String(block.detail ?? ""),
        startAt: String(block.startAt ?? ""),
        endAt: String(block.endAt ?? ""),
        blockType: String(block.blockType ?? "focus"),
        sourceMessageIds: Array.isArray(block.sourceMessageIds) ? block.sourceMessageIds.map(String) : [],
      }))
    : [];
  const persistenceError = typeof persisted?.error === "string" ? persisted.error : undefined;
  const persistedOk = persisted?.ok !== false;

  return {
    ok: true,
    message: persistedOk
      ? data?.source === "fallback"
        ? `Plan created with fallback logic. ${data?.fallbackReason ?? ""}`.trim()
        : "AI plan created."
      : `Plan created for the current session. Storage unavailable: ${persistenceError ?? "Could not save the plan."}`,
    planRunId: data?.planRunId,
    actionCount: persisted?.actionCount,
    scheduleBlockCount: persisted?.scheduleBlockCount,
    approvalCount: persisted?.approvalCount,
    persisted: persistedOk,
    persistenceError,
    actionItems,
    scheduleBlocks,
  };
}
