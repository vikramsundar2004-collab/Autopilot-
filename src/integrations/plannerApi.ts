import { supabase } from "./supabaseClient";

export interface PlannerApiRequest {
  date?: string;
  timezone?: string;
  organizationId?: string;
  planningMode?: "impact" | "quickWins" | "deepWork";
}

export interface PlannerApiResult {
  ok: boolean;
  message: string;
  planRunId?: string;
  actionCount?: number;
  scheduleBlockCount?: number;
  approvalCount?: number;
}

export async function runDailyPlanner(
  request: PlannerApiRequest = {},
): Promise<PlannerApiResult> {
  if (import.meta.env.MODE === "test") {
    return {
      ok: false,
      message: "Planner API is disabled in test mode.",
    };
  }

  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before running the AI planning API.",
    };
  }

  const { data, error } = await supabase.functions.invoke("plan-day", {
    body: request,
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  const persisted = data?.persisted;
  return {
    ok: true,
    message:
      data?.source === "fallback"
        ? `Plan created with fallback logic. ${data?.fallbackReason ?? ""}`.trim()
        : "AI plan created.",
    planRunId: data?.planRunId,
    actionCount: persisted?.actionCount,
    scheduleBlockCount: persisted?.scheduleBlockCount,
    approvalCount: persisted?.approvalCount,
  };
}
