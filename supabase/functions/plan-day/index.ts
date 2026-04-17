import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";

type Priority = "urgent" | "high" | "medium" | "low";
type Category = "reply" | "review" | "schedule" | "send" | "approve" | "follow-up";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Missing Supabase env." }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Missing bearer token." }, 401);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
  const userId = authData.user.id;
  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const timezone = body.timezone ?? "America/Los_Angeles";
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : null;
  if (organizationId) {
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError || !membership) {
      return json({ error: "You are not a member of this organization." }, 403);
    }
  }
  const policy = await loadPolicy(supabase, organizationId);
  const emails = Array.isArray(body.emails)
    ? body.emails
    : await loadEmails(supabase, userId, policy.max_email_messages ?? 50);
  const events =
    Array.isArray(body.calendarEvents)
      ? body.calendarEvents
      : await loadCalendar(supabase, userId, date, policy.max_calendar_events ?? 100);

  const { data: run, error: runError } = await supabase
    .from("plan_runs")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      run_date: date,
      timezone,
      status: "pending",
      input_counts: { emails: emails.length, calendarEvents: events.length },
    })
    .select("id")
    .single();
  if (runError || !run) return json({ error: runError?.message ?? "Could not create plan run." }, 500);

  const planned = await planWithAiOrFallback({
    date,
    timezone,
    planningMode: body.planningMode ?? "impact",
    emails: sanitizeEmails(emails, policy),
    events,
    policy,
  });

  const persisted = await persistPlan(supabase, {
    userId,
    organizationId,
    planRunId: run.id,
    plan: planned.plan,
    emails,
    source: planned.source,
    model: planned.model,
  });
  if (!persisted.ok) {
    await supabase
      .from("plan_runs")
      .update({ status: "failed", error: persisted.error, completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return json({ error: persisted.error }, 500);
  }

  return json({
    planRunId: run.id,
    source: planned.source,
    model: planned.model,
    fallbackReason: planned.fallbackReason,
    ...planned.plan,
    persisted,
  });
});

async function safeBody(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function loadPolicy(supabase: any, organizationId: string | null) {
  if (!organizationId) return defaultPolicy();
  const { data } = await supabase
    .from("enterprise_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ?? defaultPolicy();
}

async function loadEmails(supabase: any, userId: string, limit: number) {
  const { data } = await supabase
    .from("email_messages")
    .select(
      "id, provider, provider_message_id, thread_id, from_name, from_email, subject, snippet, body_preview, received_at, labels, importance",
    )
    .eq("user_id", userId)
    .order("received_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    provider: row.provider ?? "google",
    providerMessageId: row.provider_message_id ?? row.id,
    threadId: row.thread_id,
    fromName: row.from_name,
    fromEmail: row.from_email,
    subject: row.subject ?? "",
    snippet: row.snippet ?? "",
    bodyPreview: row.body_preview,
    receivedAt: row.received_at,
    labels: row.labels ?? [],
    importance: row.importance ?? "normal",
  }));
}

async function loadCalendar(supabase: any, userId: string, date: string, limit: number) {
  const start = `${date}T00:00:00.000Z`;
  const end = new Date(Date.parse(start) + 86_400_000).toISOString();
  const { data } = await supabase
    .from("calendar_events")
    .select("id, provider_event_id, title, description, start_at, end_at, event_type, attendees")
    .eq("user_id", userId)
    .gte("start_at", start)
    .lt("start_at", end)
    .order("start_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    providerEventId: row.provider_event_id ?? row.id,
    title: row.title,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    eventType: row.event_type ?? "meeting",
    attendees: row.attendees ?? [],
  }));
}

function sanitizeEmails(emails: any[], policy: any) {
  return emails.map((email) => ({
    ...email,
    bodyPreview: policy.allow_message_body_processing ? email.bodyPreview : email.snippet,
  }));
}

async function planWithAiOrFallback(input: any) {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_PLANNER_MODEL") ?? input.policy.ai_model ?? "gpt-5-mini";
  if (!openAiKey) {
    return {
      source: "fallback",
      model: "deterministic-fallback",
      fallbackReason: "OPENAI_API_KEY is not configured.",
      plan: fallbackPlan(input),
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are Autopilot-AI. Extract action items from email, schedule them around calendar events, preserve evidence, and require approval for sending or external writes.",
          },
          { role: "user", content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "autopilot_daily_plan",
            schema: plannerSchema,
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    const raw = await response.json();
    return { source: "openai", model, plan: normalizePlan(JSON.parse(extractText(raw)), input.date) };
  } catch (error) {
    return {
      source: "fallback",
      model: "deterministic-fallback",
      fallbackReason: error instanceof Error ? error.message : "OpenAI planning failed.",
      plan: fallbackPlan(input),
    };
  }
}

async function persistPlan(supabase: any, input: any) {
  const emailById = new Map(input.emails.map((email: any) => [email.id, email]));
  const actions = input.plan.actionItems.map((item: any) => {
    const email: any = item.sourceMessageId ? emailById.get(item.sourceMessageId) : null;
    return {
      user_id: input.userId,
      organization_id: input.organizationId,
      plan_run_id: input.planRunId,
      source_provider: email?.provider ?? "google",
      source_external_id: email?.providerMessageId ?? item.sourceMessageId,
      source_thread_id: email?.threadId ?? null,
      source_subject: email?.subject ?? null,
      title: item.title,
      detail: item.detail,
      due_at: item.dueAt,
      priority: item.priority,
      category: item.category,
      status: item.status,
      confidence: item.confidence,
      effort_minutes: item.effortMinutes,
      impact: item.impact,
      rank_score: item.rankScore,
      risk: item.risk,
      labels: item.labels,
      requires_approval: item.requiresApproval,
    };
  });
  const { data: insertedActions, error: actionError } = actions.length
    ? await supabase.from("action_items").insert(actions).select("id, source_external_id")
    : { data: [], error: null };
  if (actionError) return { ok: false, error: actionError.message };

  const actionIdBySource = new Map((insertedActions ?? []).map((row: any) => [row.source_external_id, row.id]));
  const blocks = input.plan.scheduleBlocks.map((block: any) => ({
    user_id: input.userId,
    organization_id: input.organizationId,
    plan_run_id: input.planRunId,
    title: block.title,
    detail: block.detail,
    start_at: block.startAt,
    end_at: block.endAt,
    block_type: block.blockType,
    action_item_ids: block.sourceMessageIds.map((id: string) => actionIdBySource.get(id)).filter(Boolean),
  }));
  const { error: blockError } = blocks.length
    ? await supabase.from("schedule_blocks").insert(blocks)
    : { error: null };
  if (blockError) return { ok: false, error: blockError.message };

  const approvals = input.plan.actionItems
    .filter((item: any) => item.requiresApproval && item.approvalType)
    .map((item: any) => ({
      user_id: input.userId,
      organization_id: input.organizationId,
      plan_run_id: input.planRunId,
      action_item_id: item.sourceMessageId ? actionIdBySource.get(item.sourceMessageId) ?? null : null,
      approval_type: item.approvalType,
      title: item.title,
      detail: item.risk,
    }));
  const { error: approvalError } = approvals.length
    ? await supabase.from("approval_requests").insert(approvals)
    : { error: null };
  if (approvalError) return { ok: false, error: approvalError.message };

  const { error: runError } = await supabase
    .from("plan_runs")
    .update({
      status: "completed",
      model: input.model,
      summary: input.plan.summary,
      raw_plan: input.plan,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.planRunId);
  if (runError) return { ok: false, error: runError.message };

  await supabase.from("audit_events").insert({
    user_id: input.userId,
    organization_id: input.organizationId,
    actor_type: "system",
    action: "plan_day.completed",
    target_type: "plan_run",
    target_id: input.planRunId,
    metadata: { source: input.source, model: input.model, actionCount: actions.length },
  });
  await supabase.from("usage_events").insert({
    user_id: input.userId,
    organization_id: input.organizationId,
    event_type: "ai_plan_run",
    quantity: 1,
    metadata: { source: input.source, model: input.model, emailCount: input.emails.length },
  });

  return { ok: true, actionCount: actions.length, scheduleBlockCount: blocks.length, approvalCount: approvals.length };
}

function fallbackPlan(input: any) {
  const actionItems = input.emails
    .map((email: any) => emailToAction(email, input.date, input.policy))
    .sort((a: any, b: any) => b.rankScore - a.rankScore)
    .slice(0, 12);
  const scheduleBlocks = buildSchedule(actionItems, input.events, input.date, input.planningMode);
  const urgentCount = actionItems.filter((item: any) => item.priority === "urgent").length;
  const focusMinutes = scheduleBlocks.reduce(
    (total: number, block: any) => total + Math.max(0, (Date.parse(block.endAt) - Date.parse(block.startAt)) / 60_000),
    0,
  );
  return normalizePlan(
    {
      summary: {
        headline: `${actionItems.length} action items planned, ${urgentCount} urgent.`,
        brief:
          actionItems.length === 0
            ? "Add email records or pass emails in the request body to generate a schedule."
            : "Autopilot-AI ranked the inbox, planned focus time, and routed sensitive work to approvals.",
        openCount: actionItems.length,
        urgentCount,
        focusMinutes: Math.round(focusMinutes),
        risks: actionItems.filter((item: any) => item.priority === "urgent").slice(0, 4).map((item: any) => item.risk),
      },
      actionItems,
      scheduleBlocks,
      enterpriseSignals: [
        {
          type: "security",
          title: "Approval gates active",
          detail: "Sending and external writes become approval requests before execution.",
          severity: "medium",
        },
        {
          type: "ops",
          title: "Usage metering active",
          detail: "Every API plan run creates a usage event for premium-plan metering.",
          severity: "low",
        },
      ],
    },
    input.date,
  );
}

function emailToAction(email: any, date: string, policy: any) {
  const text = `${email.subject} ${email.snippet} ${email.bodyPreview ?? ""}`.toLowerCase();
  const category = inferCategory(text);
  const priority = inferPriority(email.importance, text);
  const effortMinutes = category === "review" ? 25 : category === "schedule" ? 10 : 15;
  const impact = priority === "urgent" ? 9 : priority === "high" ? 7 : priority === "low" ? 3 : 5;
  const requiresApproval =
    (policy.require_approval_for_sending ?? true) && ["reply", "send", "approve"].includes(category);
  return {
    sourceMessageId: email.id,
    title: `${actionVerb(category)} ${email.subject || "source message"}`.slice(0, 140),
    detail: email.snippet || email.bodyPreview || "Open the source message and decide the next action.",
    priority,
    category,
    dueAt: `${date}T${priority === "urgent" ? "16" : "17"}:00:00.000Z`,
    status: "open",
    confidence: text.length > 80 ? 86 : 72,
    effortMinutes,
    impact,
    risk:
      priority === "urgent"
        ? `Missing this could block ${email.fromName || email.fromEmail || "the sender"} today.`
        : "This can become stale if it is not handled while context is fresh.",
    labels: Array.from(new Set([...(email.labels ?? []), category, priority])).slice(0, 6),
    requiresApproval,
    approvalType: requiresApproval ? (category === "reply" || category === "send" ? "send_email" : "sensitive_action") : null,
    rankScore: priorityWeight(priority) + impact * 6 - effortMinutes * 0.25 + (requiresApproval ? 8 : 0),
  };
}

function buildSchedule(actionItems: any[], events: any[], date: string, mode: string) {
  const ordered = [...actionItems].sort((a, b) => {
    if (mode === "quickWins") return a.effortMinutes - b.effortMinutes || b.rankScore - a.rankScore;
    if (mode === "deepWork") return b.effortMinutes - a.effortMinutes || b.impact - a.impact;
    return b.rankScore - a.rankScore;
  });
  const windows = focusWindows(date, events);
  const blocks = [];
  let cursor = 0;
  for (const window of windows) {
    let start = Date.parse(window.startAt);
    const end = Date.parse(window.endAt);
    const ids = [];
    const titles = [];
    while (cursor < ordered.length && start + ordered[cursor].effortMinutes * 60_000 <= end) {
      ids.push(ordered[cursor].sourceMessageId);
      titles.push(ordered[cursor].title);
      start += ordered[cursor].effortMinutes * 60_000;
      cursor += 1;
    }
    if (ids.length) {
      blocks.push({
        title: ids.length === 1 ? titles[0] : `${ids.length} priority actions`,
        detail: titles.join("; "),
        startAt: window.startAt,
        endAt: new Date(start).toISOString(),
        blockType: "focus",
        sourceMessageIds: ids.filter(Boolean),
      });
    }
  }
  if (cursor < ordered.length) {
    blocks.push({
      title: "Overflow review",
      detail: ordered.slice(cursor).map((item) => item.title).join("; "),
      startAt: `${date}T23:00:00.000Z`,
      endAt: `${date}T23:30:00.000Z`,
      blockType: "overflow",
      sourceMessageIds: ordered.slice(cursor).map((item) => item.sourceMessageId).filter(Boolean),
    });
  }
  return blocks;
}

function focusWindows(date: string, events: any[]) {
  const workStart = new Date(`${date}T09:00:00.000Z`);
  const workEnd = new Date(`${date}T17:00:00.000Z`);
  const blocking = events
    .filter((event) => event.eventType !== "focus")
    .map((event) => ({ start: new Date(event.startAt), end: new Date(event.endAt) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const windows = [];
  let cursor = workStart;
  for (const event of blocking) {
    if (event.start.getTime() - cursor.getTime() >= 25 * 60_000) {
      windows.push({ startAt: cursor.toISOString(), endAt: event.start.toISOString() });
    }
    if (event.end > cursor) cursor = event.end;
  }
  if (workEnd.getTime() - cursor.getTime() >= 25 * 60_000) {
    windows.push({ startAt: cursor.toISOString(), endAt: workEnd.toISOString() });
  }
  return windows;
}

function normalizePlan(plan: any, date: string) {
  const actionItems = (plan.actionItems ?? []).map((item: any) => ({
    sourceMessageId: item.sourceMessageId ?? null,
    title: limit(item.title || "Review inbox item", 140),
    detail: limit(item.detail || "Open the source and decide the next action.", 600),
    priority: normalizePriority(item.priority),
    category: normalizeCategory(item.category),
    dueAt: item.dueAt && !Number.isNaN(Date.parse(item.dueAt)) ? item.dueAt : `${date}T17:00:00.000Z`,
    status: item.status === "waiting" ? "waiting" : "open",
    confidence: clamp(item.confidence, 0, 100, 75),
    effortMinutes: clamp(item.effortMinutes, 1, 480, 15),
    impact: clamp(item.impact, 1, 10, 5),
    risk: limit(item.risk || "No specific risk provided.", 400),
    labels: Array.isArray(item.labels) ? item.labels.map(String).slice(0, 8) : [],
    requiresApproval: Boolean(item.requiresApproval),
    approvalType: normalizeApprovalType(item.approvalType, item.category),
    rankScore: Number.isFinite(item.rankScore) ? item.rankScore : 0,
  }));
  return {
    summary: {
      headline: limit(plan.summary?.headline || `${actionItems.length} action items planned.`, 160),
      brief: limit(plan.summary?.brief || "Autopilot-AI generated a daily action plan.", 700),
      openCount: clamp(plan.summary?.openCount, 0, 500, actionItems.length),
      urgentCount: clamp(plan.summary?.urgentCount, 0, 500, actionItems.filter((item: any) => item.priority === "urgent").length),
      focusMinutes: clamp(plan.summary?.focusMinutes, 0, 1440, 0),
      risks: Array.isArray(plan.summary?.risks) ? plan.summary.risks.map(String).slice(0, 8) : [],
    },
    actionItems,
    scheduleBlocks: (plan.scheduleBlocks ?? [])
      .filter((block: any) => block.startAt && block.endAt && Date.parse(block.endAt) > Date.parse(block.startAt))
      .map((block: any) => ({
        title: limit(block.title || "Focus block", 140),
        detail: limit(block.detail || "Work through the planned action items.", 700),
        startAt: block.startAt,
        endAt: block.endAt,
        blockType: normalizeBlockType(block.blockType),
        sourceMessageIds: Array.isArray(block.sourceMessageIds) ? block.sourceMessageIds.map(String).slice(0, 20) : [],
      })),
    enterpriseSignals: Array.isArray(plan.enterpriseSignals) ? plan.enterpriseSignals : [],
  };
}

function extractText(raw: any): string {
  if (typeof raw.output_text === "string") return raw.output_text;
  for (const item of raw.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") return part.text;
    }
  }
  throw new Error("OpenAI response did not include text.");
}

function defaultPolicy() {
  return {
    ai_model: "gpt-5-mini",
    max_email_messages: 50,
    max_calendar_events: 100,
    require_approval_for_sending: true,
    require_approval_for_external_writes: true,
    allow_message_body_processing: false,
    retention_days: 90,
  };
}

function inferCategory(text: string): Category {
  if (/\b(reply|respond|get back)\b/.test(text)) return "reply";
  if (/\b(schedule|book|calendar)\b/.test(text)) return "schedule";
  if (/\b(send|share|forward)\b/.test(text)) return "send";
  if (/\b(approve|approval|sign off|renewal)\b/.test(text)) return "approve";
  if (/\b(review|read|audit|look over)\b/.test(text)) return "review";
  return "follow-up";
}

function inferPriority(importance: string, text: string): Priority {
  if (importance === "urgent" || /\b(urgent|asap|today|blocked|critical|eod)\b/.test(text)) return "urgent";
  if (importance === "high" || /\b(important|deadline|customer|renewal|contract)\b/.test(text)) return "high";
  if (importance === "low" || /\b(fyi|newsletter|optional)\b/.test(text)) return "low";
  return "medium";
}

function actionVerb(category: Category): string {
  return {
    reply: "Reply to",
    review: "Review",
    schedule: "Schedule",
    send: "Send follow-up for",
    approve: "Approve or decide on",
    "follow-up": "Follow up on",
  }[category];
}

function priorityWeight(priority: Priority): number {
  return { urgent: 80, high: 58, medium: 36, low: 16 }[priority];
}

function normalizePriority(value: string): Priority {
  return value === "urgent" || value === "high" || value === "low" ? value : "medium";
}

function normalizeCategory(value: string): Category {
  return value === "reply" || value === "review" || value === "schedule" || value === "send" || value === "approve"
    ? value
    : "follow-up";
}

function normalizeBlockType(value: string) {
  return value === "meeting" || value === "admin" || value === "break" || value === "overflow" ? value : "focus";
}

function normalizeApprovalType(value: string | null | undefined, category: string) {
  if (value === "send_email" || value === "external_write" || value === "calendar_change" || value === "sensitive_action") {
    return value;
  }
  if (category === "reply" || category === "send") return "send_email";
  if (category === "schedule") return "calendar_change";
  if (category === "approve") return "sensitive_action";
  return null;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
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

const plannerSchema = {
  type: "object",
  required: ["summary", "actionItems", "scheduleBlocks", "enterpriseSignals"],
  properties: {
    summary: { type: "object" },
    actionItems: { type: "array" },
    scheduleBlocks: { type: "array" },
    enterpriseSignals: { type: "array" },
  },
};
