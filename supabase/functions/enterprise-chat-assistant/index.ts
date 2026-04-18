import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { extractOpenAiText, normalizeOpenAiModel } from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChatMessage = {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
};

type Member = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase function env." }, 500);
  }
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Missing bearer token." }, 401);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { user, error: authError } = await getAuthenticatedUser({
    supabaseUrl,
    supabaseAnonKey,
    authorization,
  });
  if (authError || !user) return json({ error: authError ?? "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
  const organizationId = String(body.organizationId ?? "").trim();
  const messageId = String(body.messageId ?? "").trim();
  const timezone = String(body.timezone ?? "America/Los_Angeles").trim() || "America/Los_Angeles";
  if (!organizationId) return json({ error: "organizationId is required." }, 400);

  const membershipResult = await userClient
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipResult.error || !membershipResult.data) {
    return json({ error: "You are not a member of this enterprise." }, 403);
  }

  const organizationResult = await serviceClient
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationResult.error || !organizationResult.data) {
    return json({ error: organizationResult.error?.message ?? "Enterprise not found." }, 404);
  }

  const members = await loadMembers(serviceClient, organizationId);
  const messages = Array.isArray(body.messages)
    ? body.messages.map(sanitizeIncomingMessage).filter(Boolean).slice(-24)
    : await loadRecentMessages(serviceClient, organizationId);
  if (messages.length === 0) {
    return json({
      ok: true,
      message: "No enterprise chat was available to analyze yet.",
      assignments: [],
    });
  }

  const extraction = await extractAssignmentsWithAiOrFallback({
    messages,
    members,
    timezone,
    organizationName: organizationResult.data.name,
  });

  if (messageId) {
    await serviceClient
      .from("enterprise_assignments")
      .delete()
      .eq("organization_id", organizationId)
      .eq("source_chat_message_id", messageId);
  }

  const sourceMessage = messageId ? messages.find((message) => message.id === messageId) : messages[messages.length - 1];
  const referenceTime = sourceMessage?.createdAt ?? new Date().toISOString();
  const rows = extraction.assignments.map((assignment, index) => {
    const assignee = resolveAssignee(assignment.assignedTo, members);
    const window = normalizeScheduledWindow(assignment.startAt, assignment.endAt, referenceTime, index);
    const detail = limit(
      `${assignment.detail}${assignment.startAt ? "" : " Auto-scheduled from enterprise chat."}`.trim(),
      500,
    );

    return {
      organization_id: organizationId,
      source_chat_message_id: messageId || null,
      created_by: user.id,
      assigned_to_user_id: assignee?.userId ?? null,
      assigned_to_label: assignee?.fullName ?? limit(assignment.assignedTo || "Team member", 120),
      title: limit(assignment.title || "Enterprise follow-up", 160),
      detail,
      start_at: window.startAt,
      end_at: window.endAt,
      status: "open",
    };
  });

  if (rows.length === 0) {
    return json({
      ok: true,
      source: extraction.source,
      message: "No explicit assigned action items were found in the enterprise chat.",
      assignments: [],
    });
  }

  const insertResult = await serviceClient
    .from("enterprise_assignments")
    .insert(rows)
    .select(
      "id, organization_id, source_chat_message_id, created_by, assigned_to_user_id, assigned_to_label, title, detail, start_at, end_at, status, created_at, updated_at",
    );
  if (insertResult.error) {
    return json({ error: insertResult.error.message }, 400);
  }

  await serviceClient.from("audit_events").insert({
    user_id: user.id,
    organization_id: organizationId,
    actor_type: "system",
    action: "enterprise.chat_assignments_generated",
    target_type: "enterprise_assignments",
    target_id: messageId || organizationId,
    metadata: {
      source: extraction.source,
      assignmentCount: rows.length,
      timezone,
    },
  });

  return json({
    ok: true,
    source: extraction.source,
    message: `AI captured ${rows.length} enterprise action item${rows.length === 1 ? "" : "s"} and placed them on the shared calendar.`,
    assignments: insertResult.data ?? [],
  });
});

async function safeBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function loadMembers(serviceClient: any, organizationId: string): Promise<Member[]> {
  const membershipsResult = await serviceClient
    .from("organization_memberships")
    .select("user_id, role")
    .eq("organization_id", organizationId);
  if (membershipsResult.error) throw new Error(membershipsResult.error.message);

  const memberships = membershipsResult.data ?? [];
  const userIds = Array.from(
    new Set(
      memberships
        .map((membership: any) => String(membership.user_id ?? ""))
        .filter(Boolean),
    ),
  );
  const profilesResult = userIds.length
    ? await serviceClient
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new Error(profilesResult.error.message);

  const profileById = new Map(
    (profilesResult.data ?? []).map((profile: any) => [
      String(profile.id ?? ""),
      {
        email: String(profile.email ?? ""),
        fullName: String(profile.full_name ?? ""),
      },
    ]),
  );

  return memberships.map((membership: any) => {
    const profile = profileById.get(String(membership.user_id ?? ""));
    return {
      userId: String(membership.user_id ?? ""),
      fullName: profile?.fullName?.trim() || profile?.email || "Team member",
      email: profile?.email ?? "",
      role: String(membership.role ?? "member"),
    };
  });
}

async function loadRecentMessages(serviceClient: any, organizationId: string): Promise<ChatMessage[]> {
  const result = await serviceClient
    .from("enterprise_chat_messages")
    .select("id, sender_name, body, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(24);
  if (result.error) throw new Error(result.error.message);

  return (result.data ?? [])
    .map((message: any) => sanitizeIncomingMessage(message))
    .filter(Boolean)
    .reverse();
}

async function extractAssignmentsWithAiOrFallback(input: {
  messages: ChatMessage[];
  members: Member[];
  timezone: string;
  organizationName: string;
}) {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = normalizeOpenAiModel(Deno.env.get("OPENAI_PLANNER_MODEL"));
  if (!openAiKey) {
    return {
      source: "fallback",
      assignments: fallbackAssignments(input.messages),
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are the enterprise assistant inside Autopilot-AI. Read team chat, extract only explicit or strongly implied assigned action items, attach them to a named owner, and schedule each item into a reasonable calendar slot. Ignore general discussion, brainstorming, or FYI messages with no accountable owner.",
          },
          {
            role: "user",
            content: JSON.stringify({
              organizationName: input.organizationName,
              timezone: input.timezone,
              members: input.members,
              messages: input.messages,
              instructions: [
                "Return only assignments that have a specific owner or a clearly addressed teammate.",
                "Use the teammate's name or email in assignedTo.",
                "Keep titles short and operational.",
                "If time is explicit, preserve it in ISO 8601.",
                "If time is not explicit, choose a realistic placeholder slot within the next workday.",
                "Do not invent assignments when a message is just informational.",
              ],
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "autopilot_enterprise_assignments",
            schema: assignmentSchema,
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }

    const raw = await response.json();
    const parsed = JSON.parse(extractOpenAiText(raw));
    return {
      source: "openai",
      assignments: normalizeAssignments(parsed?.assignments ?? []),
    };
  } catch {
    return {
      source: "fallback",
      assignments: fallbackAssignments(input.messages),
    };
  }
}

function sanitizeIncomingMessage(raw: any): ChatMessage | null {
  const id = String(raw?.id ?? "").trim();
  const body = limit(String(raw?.body ?? ""), 2_000).trim();
  if (!id || !body) return null;

  return {
    id,
    senderName: limit(String(raw?.senderName ?? raw?.sender_name ?? "Team member"), 120),
    body,
    createdAt: validIso(raw?.createdAt ?? raw?.created_at) ?? new Date().toISOString(),
  };
}

function fallbackAssignments(messages: ChatMessage[]) {
  const assignments: Array<{
    assignedTo: string;
    title: string;
    detail: string;
    startAt?: string;
    endAt?: string;
  }> = [];

  for (const message of messages.slice(-8)) {
    const lines = message.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const match = line.match(
        /^(?:@)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)[:,]?\s+(?:please\s+)?(.+)$/i,
      );
      if (!match) continue;
      const assignedTo = limit(match[1], 120);
      const actionText = cleanActionText(match[2]);
      if (!looksActionable(actionText)) continue;

      assignments.push({
        assignedTo,
        title: titleFromAction(actionText),
        detail: limit(`From ${message.senderName}: ${actionText}`, 400),
      });
    }
  }

  return assignments.slice(0, 8);
}

function normalizeAssignments(assignments: any[]) {
  return assignments
    .map((assignment) => ({
      assignedTo: limit(String(assignment?.assignedTo ?? ""), 120),
      title: limit(String(assignment?.title ?? ""), 160),
      detail: limit(String(assignment?.detail ?? ""), 400),
      startAt: validIso(assignment?.startAt ?? null) ?? undefined,
      endAt: validIso(assignment?.endAt ?? null) ?? undefined,
    }))
    .filter((assignment) => assignment.assignedTo && assignment.title);
}

function resolveAssignee(label: string, members: Member[]) {
  const needle = label.trim().toLowerCase();
  if (!needle) return null;

  const exact = members.find((member) => {
    const fullName = member.fullName.trim().toLowerCase();
    const email = member.email.trim().toLowerCase();
    return fullName === needle || email === needle || email.split("@")[0] === needle;
  });
  if (exact) return exact;

  return (
    members.find((member) => {
      const fullName = member.fullName.trim().toLowerCase();
      const firstName = fullName.split(/\s+/)[0] ?? "";
      return firstName === needle || fullName.includes(needle);
    }) ?? null
  );
}

function normalizeScheduledWindow(
  startAtRaw: string | undefined,
  endAtRaw: string | undefined,
  referenceTime: string,
  index: number,
) {
  const fallbackStart = nextWorkSlot(referenceTime, index);
  const startAt = startAtRaw && !Number.isNaN(Date.parse(startAtRaw))
    ? new Date(startAtRaw)
    : fallbackStart;
  const endAt = endAtRaw && !Number.isNaN(Date.parse(endAtRaw)) && Date.parse(endAtRaw) > startAt.getTime()
    ? new Date(endAtRaw)
    : new Date(startAt.getTime() + 60 * 60_000);

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

function nextWorkSlot(referenceTime: string, index: number) {
  const date = !Number.isNaN(Date.parse(referenceTime)) ? new Date(referenceTime) : new Date();
  date.setSeconds(0, 0);
  if (date.getHours() < 9) {
    date.setHours(9, 0, 0, 0);
  } else if (date.getHours() >= 17) {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  } else {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  }

  const hour = date.getHours() + index;
  if (hour <= 16) {
    date.setHours(hour, 0, 0, 0);
    return date;
  }

  date.setDate(date.getDate() + Math.floor((hour - 9) / 8));
  date.setHours(9 + ((hour - 9) % 8), 0, 0, 0);
  return date;
}

function looksActionable(value: string) {
  return /\b(send|draft|reply|review|prepare|update|schedule|share|check|finish|confirm|follow up|deliver|book|call)\b/i.test(
    value,
  );
}

function cleanActionText(value: string) {
  return value.replace(/[.?!]+$/, "").trim();
}

function titleFromAction(value: string) {
  const cleaned = cleanActionText(value);
  return limit(cleaned.charAt(0).toUpperCase() + cleaned.slice(1), 160);
}

function validIso(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null;
}

function limit(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const assignmentSchema = {
  type: "object",
  required: ["assignments"],
  additionalProperties: false,
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        required: ["assignedTo", "title", "detail"],
        additionalProperties: false,
        properties: {
          assignedTo: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          startAt: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
          endAt: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
        },
      },
    },
  },
};
