import type { DraftTheme } from "../emailDrafts";
import type { EmailPriority, TaskCategory } from "../types";
import { supabase } from "./supabaseClient";

export interface DraftApiEmail {
  id: string;
  from: string;
  senderEmail?: string;
  subject: string;
  preview: string;
  priority: EmailPriority;
  category: TaskCategory;
  actionHint: string;
  labels: string[];
}

export interface DraftApiDraft {
  sourceMessageId: string;
  subject: string;
  body: string;
  reason: string;
}

export interface DraftApiResult {
  ok: boolean;
  message: string;
  source?: "openai" | "fallback";
  drafts: DraftApiDraft[];
}

export async function generateReplyDraftsApi(input: {
  theme: DraftTheme;
  emails: DraftApiEmail[];
}): Promise<DraftApiResult> {
  if (import.meta.env.MODE === "test") {
    return {
      ok: false,
      message: "Draft API is disabled in test mode.",
      drafts: [],
    };
  }

  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before generating API-backed reply drafts.",
      drafts: [],
    };
  }

  const { data, error } = await supabase.functions.invoke("draft-email", {
    body: input,
  });

  if (error) {
    return {
      ok: false,
      message: error.message,
      drafts: [],
    };
  }

  return {
    ok: true,
    message: data?.message ?? "Reply drafts generated.",
    source: data?.source,
    drafts: Array.isArray(data?.drafts)
      ? data.drafts.map((draft: any) => ({
          sourceMessageId: String(draft.sourceMessageId ?? ""),
          subject: String(draft.subject ?? ""),
          body: String(draft.body ?? ""),
          reason: String(draft.reason ?? ""),
        }))
      : [],
  };
}
