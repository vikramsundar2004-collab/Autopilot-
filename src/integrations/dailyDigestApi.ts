import { supabase } from "./supabaseClient";
import { describeFunctionError } from "./functionErrors";
import { invokeEdgeFunction } from "./functionAuth";
import type { PlannerApiCalendarInput, PlannerApiEmailInput } from "./plannerApi";

export interface DailyDigestRequest {
  date?: string;
  timezone?: string;
  organizationId?: string;
  interests?: string[];
  emails?: PlannerApiEmailInput[];
  calendarEvents?: PlannerApiCalendarInput[];
}

export interface DailyDigestActionItem {
  sourceMessageId: string | null;
  sourceUrl: string | null;
  title: string;
  detail: string;
  priority: "urgent" | "high" | "medium" | "low";
}

export interface DailyDigestInterestEvent {
  interest: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string | null;
}

export interface DailyDigestResult {
  ok: boolean;
  message: string;
  headline: string;
  brief: string;
  mainThings: string[];
  actionItems: DailyDigestActionItem[];
  interestEvents: DailyDigestInterestEvent[];
  emailCount: number;
  blockedEmailCount: number;
  verificationEmailCount: number;
}

export async function runDailyDigest(
  request: DailyDigestRequest = {},
  options: { accessToken?: string | null } = {},
): Promise<DailyDigestResult> {
  if (import.meta.env.MODE === "test") {
    return {
      ok: false,
      message: "Daily digest API is disabled in test mode.",
      headline: "Daily digest unavailable in test mode.",
      brief: "",
      mainThings: [],
      actionItems: [],
      interestEvents: [],
      emailCount: 0,
      blockedEmailCount: 0,
      verificationEmailCount: 0,
    };
  }

  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before running the daily digest API.",
      headline: "Daily digest needs Supabase configuration.",
      brief: "",
      mainThings: [],
      actionItems: [],
      interestEvents: [],
      emailCount: 0,
      blockedEmailCount: 0,
      verificationEmailCount: 0,
    };
  }

  try {
    const { data, error } = await invokeEdgeFunction<any>("daily-digest", {
      accessToken: options.accessToken,
      body: request,
    });

    if (error) {
      return {
        ok: false,
        message: await describeFunctionError(error, "Daily digest failed."),
        headline: "Daily digest could not be created.",
        brief: "",
        mainThings: [],
        actionItems: [],
        interestEvents: [],
        emailCount: 0,
        blockedEmailCount: 0,
        verificationEmailCount: 0,
      };
    }

    return {
      ok: true,
      message: String(data?.message ?? "Daily digest created."),
      headline: String(data?.headline ?? "Daily digest ready."),
      brief: String(data?.brief ?? ""),
      mainThings: Array.isArray(data?.mainThings) ? data.mainThings.map(String) : [],
      actionItems: Array.isArray(data?.actionItems)
        ? data.actionItems.map((item: any) => ({
            sourceMessageId: item.sourceMessageId ? String(item.sourceMessageId) : null,
            sourceUrl: item.sourceUrl ? String(item.sourceUrl) : null,
            title: String(item.title ?? "Review inbox item"),
            detail: String(item.detail ?? ""),
            priority:
              item.priority === "urgent" || item.priority === "high" || item.priority === "low"
                ? item.priority
                : "medium",
          }))
        : [],
      interestEvents: Array.isArray(data?.interestEvents)
        ? data.interestEvents.map((item: any) => ({
            interest: String(item.interest ?? ""),
            title: String(item.title ?? ""),
            summary: String(item.summary ?? ""),
            source: String(item.source ?? "Recent event"),
            url: String(item.url ?? ""),
            publishedAt: item.publishedAt ? String(item.publishedAt) : null,
          }))
        : [],
      emailCount: Number(data?.emailCount ?? 0),
      blockedEmailCount: Number(data?.blockedEmailCount ?? 0),
      verificationEmailCount: Number(data?.verificationEmailCount ?? 0),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Daily digest failed.",
      headline: "Daily digest could not be created.",
      brief: "",
      mainThings: [],
      actionItems: [],
      interestEvents: [],
      emailCount: 0,
      blockedEmailCount: 0,
      verificationEmailCount: 0,
    };
  }
}
