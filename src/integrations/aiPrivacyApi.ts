import type { ActionItem, EmailMessage } from "../types";
import { supabase } from "./supabaseClient";

interface AiSenderBlockRow {
  id: string;
  provider: string;
  sender_email: string;
  sender_name: string | null;
  reason: string;
}

export interface AiSenderBlock {
  id: string;
  provider: string;
  senderEmail: string;
  senderName?: string;
  reason: string;
}

export interface AiSenderBlockResult {
  ok: boolean;
  message: string;
  blocks: AiSenderBlock[];
}

export interface AiSenderBlockMutationResult {
  ok: boolean;
  message: string;
  block?: AiSenderBlock;
}

export interface BlockAiSenderRequest {
  provider?: string;
  senderEmail?: string | null;
  senderName?: string | null;
  reason?: string;
}

export function normalizeSenderEmail(senderEmail?: string | null): string {
  return senderEmail?.trim().toLowerCase() ?? "";
}

export function findAiSenderBlock(
  senderEmail: string | undefined,
  blocks: AiSenderBlock[],
): AiSenderBlock | undefined {
  const normalizedEmail = normalizeSenderEmail(senderEmail);
  if (!normalizedEmail) return undefined;
  return blocks.find((block) => normalizeSenderEmail(block.senderEmail) === normalizedEmail);
}

export function isAiSenderBlocked(senderEmail: string | undefined, blocks: AiSenderBlock[]): boolean {
  return Boolean(findAiSenderBlock(senderEmail, blocks));
}

export function filterAiBlockedEmails(
  emails: EmailMessage[],
  blocks: AiSenderBlock[],
): EmailMessage[] {
  return emails.filter((email) => !isAiSenderBlocked(email.senderEmail, blocks));
}

export function filterAiBlockedActions(
  actions: ActionItem[],
  blocks: AiSenderBlock[],
): ActionItem[] {
  return actions.filter((action) => !isAiSenderBlocked(action.sourceSenderEmail, blocks));
}

export async function loadAiSenderBlocks(): Promise<AiSenderBlockResult> {
  if (!supabase) {
    return {
      ok: true,
      message: "Add Supabase env vars before loading AI privacy controls.",
      blocks: [],
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, message: sessionError.message, blocks: [] };
  }
  if (!sessionData.session) {
    return { ok: true, message: "Sign in to manage blocked private senders.", blocks: [] };
  }

  const { data, error } = await supabase
    .from("ai_sender_blocks")
    .select("id, provider, sender_email, sender_name, reason")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      message: error.message,
      blocks: [],
    };
  }

  const blocks = (data ?? []).map(mapAiSenderBlockRow);
  return {
    ok: true,
    message:
      blocks.length === 0
        ? "No private senders are blocked from AI yet."
        : `${blocks.length} private sender${blocks.length === 1 ? "" : "s"} blocked from AI.`,
    blocks,
  };
}

export async function blockAiSender(
  request: BlockAiSenderRequest,
): Promise<AiSenderBlockMutationResult> {
  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before storing AI privacy controls.",
    };
  }

  const normalizedEmail = normalizeSenderEmail(request.senderEmail);
  if (!normalizedEmail) {
    return {
      ok: false,
      message: "This sender does not have a usable email address to block.",
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, message: sessionError.message };
  }
  if (!sessionData.session) {
    return { ok: false, message: "Sign in before changing AI privacy controls." };
  }

  const { data, error } = await supabase
    .from("ai_sender_blocks")
    .upsert(
      {
        user_id: sessionData.session.user.id,
        provider: request.provider ?? "google",
        sender_email: normalizedEmail,
        sender_name: request.senderName?.trim() || null,
        reason: request.reason ?? "Private sender",
      },
      {
        onConflict: "user_id,provider,sender_email",
      },
    )
    .select("id, provider, sender_email, sender_name, reason")
    .single();

  if (error || !data) {
    return {
      ok: false,
      message: error?.message ?? "Could not save the private sender block.",
    };
  }

  const block = mapAiSenderBlockRow(data);
  return {
    ok: true,
    message: `${block.senderName ?? block.senderEmail} is now blocked from AI planning.`,
    block,
  };
}

export async function unblockAiSender(blockId: string): Promise<AiSenderBlockMutationResult> {
  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before changing AI privacy controls.",
    };
  }

  const { error } = await supabase.from("ai_sender_blocks").delete().eq("id", blockId);
  if (error) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: true,
    message: "The sender is allowed back into AI planning.",
  };
}

function mapAiSenderBlockRow(row: AiSenderBlockRow): AiSenderBlock {
  return {
    id: row.id,
    provider: row.provider,
    senderEmail: row.sender_email,
    senderName: row.sender_name ?? undefined,
    reason: row.reason,
  };
}
