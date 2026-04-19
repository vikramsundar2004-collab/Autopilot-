import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { extractOpenAiText, normalizeOpenAiModel } from "../_shared/openai.ts";

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
  const { user, error: authError } = await getAuthenticatedUser({
    supabaseUrl,
    supabaseAnonKey,
    authorization,
  });
  if (authError || !user) return json({ error: authError ?? "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
  const userId = user.id;
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
    : await loadEmails(supabase, userId, policy.max_email_messages ?? 200);
  const blockedSenderEmails = await loadAiSenderBlocks(supabase, userId);
  const nonVerificationEmails = emails.filter((email) => !isVerificationEmail(email));
  const verificationEmailCount = Math.max(0, emails.length - nonVerificationEmails.length);
  const digestEmails = filterBlockedEmails(nonVerificationEmails, blockedSenderEmails);
  const blockedEmailCount = Math.max(0, nonVerificationEmails.length - digestEmails.length);
  const events =
    Array.isArray(body.calendarEvents)
      ? body.calendarEvents
      : await loadCalendar(supabase, userId, date, policy.max_calendar_events ?? 100);
  const interests = sanitizeInterests(body.interests);
  const interestEvents = interests.length > 0 ? await fetchInterestEvents(interests) : [];

  const digest = await buildDigestWithAiOrFallback({
    date,
    timezone,
    emails: sanitizeEmails(digestEmails, policy),
    events,
    interests,
    interestEvents,
  });

  return json({
    message:
      digest.source === "openai"
        ? "AI daily digest created."
        : `Daily digest created with fallback logic. ${digest.fallbackReason ?? ""}`.trim(),
    source: digest.source,
    model: digest.model,
    fallbackReason: digest.fallbackReason,
    emailCount: digestEmails.length,
    blockedEmailCount,
    verificationEmailCount,
    headline: digest.headline,
    brief: digest.brief,
    mainThings: digest.mainThings,
    actionItems: digest.actionItems,
    interestEvents: digest.interestEvents,
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

async function loadAiSenderBlocks(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("ai_sender_blocks")
    .select("sender_email")
    .eq("user_id", userId);
  if (error) return [] as string[];
  return (data ?? [])
    .map((row: any) => String(row.sender_email ?? "").trim().toLowerCase())
    .filter(Boolean);
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

function filterBlockedEmails(emails: any[], blockedSenderEmails: string[]) {
  if (blockedSenderEmails.length === 0) return emails;
  const blocked = new Set(blockedSenderEmails.map((senderEmail) => senderEmail.trim().toLowerCase()));
  return emails.filter((email) => {
    const senderEmail = String(email.fromEmail ?? "").trim().toLowerCase();
    return senderEmail ? !blocked.has(senderEmail) : true;
  });
}

function isVerificationEmail(email: any) {
  const text = [
    email.subject,
    email.snippet,
    email.bodyPreview,
    email.body_preview,
    email.fromName,
    email.fromEmail,
    email.from_name,
    email.from_email,
    ...(Array.isArray(email.labels) ? email.labels : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\b(?:verification|authentication|security|access|login|sign[\s-]?in)\s+(?:code|passcode|password|otp|token|link)\b/.test(
      text,
    ) ||
    /\b(?:one[\s-]?time|single[\s-]?use)\s+(?:code|passcode|password)\b/.test(text) ||
    /\b(?:two[\s-]?factor|2fa|otp|magic link|device verification|email confirmation|account confirmation)\b/.test(
      text,
    ) ||
    /\b(?:verify|confirm|approve)(?:\s+\w+){0,4}\s+(?:email|account|identity|login|sign[\s-]?in|device)\b/.test(
      text,
    ) ||
    /\bsudo email verification code\b/.test(text)
  );
}

function sanitizeInterests(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const cleaned = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 6);
  return Array.from(new Set(cleaned));
}

async function fetchInterestEvents(interests: string[]) {
  const perInterest = await Promise.all(
    interests.map(async (interest) => {
      try {
        const url = new URL("https://news.google.com/rss/search");
        url.searchParams.set("q", `${interest} when:7d`);
        url.searchParams.set("hl", "en-US");
        url.searchParams.set("gl", "US");
        url.searchParams.set("ceid", "US:en");
        const response = await fetch(url);
        if (!response.ok) return [];
        const xml = await response.text();
        return parseNewsItems(xml)
          .slice(0, 2)
          .map((item) => ({
            interest,
            title: item.title,
            summary: item.summary,
            source: item.source,
            url: item.url,
            publishedAt: item.publishedAt,
          }));
      } catch {
        return [];
      }
    }),
  );

  const deduped = new Map<string, any>();
  for (const item of perInterest.flat()) {
    const key = `${item.interest}:${item.title}`.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return Array.from(deduped.values())
    .sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""))
    .slice(0, 6);
}

function parseNewsItems(xml: string) {
  const matches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g));
  return matches.map((match) => {
    const item = match[1];
    return {
      title: cleanXmlText(extractTag(item, "title")) || "Recent event",
      url: cleanXmlText(extractTag(item, "link")) || "",
      publishedAt: cleanXmlText(extractTag(item, "pubDate")) || null,
      source: cleanXmlText(extractSource(item)) || "News",
      summary: limit(stripHtml(cleanXmlText(extractTag(item, "description"))), 220),
    };
  });
}

function extractTag(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ?? "";
}

function extractSource(xml: string) {
  const match = xml.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
  return match?.[1] ?? "";
}

function cleanXmlText(value: string) {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function buildDigestWithAiOrFallback(input: any) {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = normalizeOpenAiModel(
    Deno.env.get("OPENAI_PLANNER_MODEL") ?? input.policy?.ai_model,
  );
  const rankedCandidates = rankDigestEmails(input.emails, input.date, input.events);

  if (!openAiKey) {
    return {
      source: "fallback",
      model: "deterministic-fallback",
      fallbackReason: "OPENAI_API_KEY is not configured.",
      ...fallbackDigest(input, rankedCandidates),
    };
  }

  const aiInput = {
    date: input.date,
    timezone: input.timezone,
    emailCount: input.emails.length,
    calendarEventCount: input.events.length,
    interests: input.interests,
    topEmailCandidates: rankedCandidates.slice(0, 60).map((candidate) => ({
      id: candidate.email.id,
      sourceUrl: buildSourceUrl(candidate.email),
      fromName: candidate.email.fromName ?? null,
      fromEmail: candidate.email.fromEmail ?? null,
      subject: candidate.email.subject,
      snippet: candidate.email.snippet,
      receivedAt: candidate.email.receivedAt,
      labels: candidate.email.labels ?? [],
      heuristicPriority: candidate.action.priority,
      heuristicCategory: candidate.action.category,
      heuristicRankScore: candidate.action.rankScore,
    })),
    calendarEvents: input.events.slice(0, 30).map((event: any) => ({
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      eventType: event.eventType,
    })),
    interestEvents: input.interestEvents,
  };

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
              "You are Autopilot-AI. Build a concise daily digest from ranked inbox and calendar context. Prioritize only meaningful work for today. Verification, OTP, security-code, sign-in, magic-link, and account-confirmation emails are already handled by the user and must never appear as main priorities. Keep the headline short, the brief executive, the main things practical, and the action list tight.",
          },
          {
            role: "user",
            content: JSON.stringify(aiInput),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "autopilot_daily_digest",
            schema: digestSchema,
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    const raw = await response.json();
    return {
      source: "openai",
      model,
      ...normalizeDigest(JSON.parse(extractOpenAiText(raw)), rankedCandidates, input.interestEvents),
    };
  } catch (error) {
    return {
      source: "fallback",
      model: "deterministic-fallback",
      fallbackReason: error instanceof Error ? error.message : "OpenAI daily digest failed.",
      ...fallbackDigest(input, rankedCandidates),
    };
  }
}

function rankDigestEmails(emails: any[], date: string, events: any[]) {
  return emails
    .map((email) => ({
      email,
      action: emailToAction(email, date),
    }))
    .sort((left, right) => {
      if (right.action.rankScore !== left.action.rankScore) {
        return right.action.rankScore - left.action.rankScore;
      }
      return Date.parse(right.email.receivedAt ?? "") - Date.parse(left.email.receivedAt ?? "");
    })
    .slice(0, Math.min(emails.length, Math.max(12, Math.min(200, emails.length || 12))));
}

function fallbackDigest(input: any, rankedCandidates: any[]) {
  const topActions = rankedCandidates.slice(0, 5).map((candidate) => ({
    sourceMessageId: candidate.email.id,
    sourceUrl: buildSourceUrl(candidate.email),
    title: candidate.action.title,
    detail: candidate.action.detail,
    priority: candidate.action.priority,
  }));
  const mainThings = buildFallbackMainThings(topActions, input.events, input.emails.length);
  return {
    headline: buildFallbackHeadline(topActions),
    brief: `Ranked ${input.emails.length} synced emails against today's calendar and reduced the day to the next useful decisions.`,
    mainThings,
    actionItems: topActions.slice(0, 3),
    interestEvents: input.interestEvents.slice(0, 4),
  };
}

function buildFallbackMainThings(actions: any[], events: any[], emailCount: number) {
  const lines = [] as string[];
  if (actions[0]) {
    lines.push(`Start with ${actions[0].title}.`);
  }
  if (actions.length > 1) {
    lines.push(`The next ${Math.min(3, actions.length)} action items are already ranked from ${emailCount} synced emails.`);
  }
  if (events.length > 0) {
    lines.push(`There are ${events.length} calendar commitments on the board, so protect the free windows before adding more work.`);
  }
  if (lines.length === 0) {
    lines.push("No urgent inbox work is standing out yet. Sync more mail or review today's calendar context.");
  }
  return lines.slice(0, 4);
}

function buildFallbackHeadline(actions: any[]) {
  if (actions.length === 0) return "No important inbox work is standing out yet.";
  if (actions[0].priority === "urgent") {
    return "Clear the urgent thread first, then move the next two actions.";
  }
  return "Start with the highest-leverage inbox work and keep the rest of the day contained.";
}

function normalizeDigest(raw: any, rankedCandidates: any[], fallbackInterestEvents: any[]) {
  const actionById = new Map(
    rankedCandidates.map((candidate) => [candidate.email.id, candidate]),
  );
  const normalizedActions = Array.isArray(raw.actionItems)
    ? raw.actionItems.map((item: any) => {
        const candidate = item.sourceMessageId ? actionById.get(String(item.sourceMessageId)) : null;
        return {
          sourceMessageId: candidate?.email.id ?? (item.sourceMessageId ? String(item.sourceMessageId) : null),
          sourceUrl: candidate ? buildSourceUrl(candidate.email) : item.sourceUrl ? String(item.sourceUrl) : null,
          title: limit(String(item.title ?? "Review inbox item"), 140),
          detail: limit(String(item.detail ?? ""), 320),
          priority:
            item.priority === "urgent" || item.priority === "high" || item.priority === "low"
              ? item.priority
              : "medium",
        };
      })
    : [];

  const normalizedInterestEvents = Array.isArray(raw.interestEvents)
    ? raw.interestEvents.map((item: any) => ({
        interest: limit(String(item.interest ?? ""), 40),
        title: limit(String(item.title ?? ""), 180),
        summary: limit(String(item.summary ?? ""), 260),
        source: limit(String(item.source ?? "Recent event"), 60),
        url: String(item.url ?? ""),
        publishedAt: item.publishedAt ? String(item.publishedAt) : null,
      }))
    : fallbackInterestEvents.slice(0, 4);

  return {
    headline: limit(String(raw.headline ?? buildFallbackHeadline(normalizedActions)), 160),
    brief: limit(String(raw.brief ?? ""), 420),
    mainThings: Array.isArray(raw.mainThings)
      ? raw.mainThings.map((item: any) => limit(String(item), 220)).slice(0, 5)
      : buildFallbackMainThings(normalizedActions, [], normalizedActions.length),
    actionItems: normalizedActions.slice(0, 5),
    interestEvents: normalizedInterestEvents.slice(0, 6),
  };
}

function emailToAction(email: any, date: string) {
  const text = `${email.subject} ${email.snippet} ${email.bodyPreview ?? ""}`.toLowerCase();
  const category = inferCategory(text);
  const priority = inferPriority(email.importance, text);
  const effortMinutes = category === "review" ? 25 : category === "schedule" ? 10 : 15;
  const impact = priority === "urgent" ? 9 : priority === "high" ? 7 : priority === "low" ? 3 : 5;
  return {
    sourceMessageId: email.id,
    title: `${actionVerb(category)} ${email.subject || "source message"}`.slice(0, 140),
    detail: email.snippet || email.bodyPreview || "Open the source message and decide the next action.",
    priority,
    category,
    dueAt: `${date}T${priority === "urgent" ? "16" : "17"}:00:00.000Z`,
    rankScore:
      priorityWeight(priority) +
      impact * 6 -
      effortMinutes * 0.25 +
      (/\b(today|eod|blocked|customer|approval|renewal)\b/.test(text) ? 10 : 0),
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

function buildSourceUrl(email: any) {
  if (!email || email.provider !== "google") return null;
  const threadId = String(email.threadId ?? email.providerMessageId ?? "").trim();
  return threadId ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}` : null;
}

function priorityWeight(priority: Priority): number {
  return { urgent: 80, high: 58, medium: 36, low: 16 }[priority];
}

function limit(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function defaultPolicy() {
  return {
    ai_model: "gpt-5.4",
    max_email_messages: 200,
    max_calendar_events: 100,
    allow_message_body_processing: false,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const digestSchema = {
  type: "object",
  required: ["headline", "brief", "mainThings", "actionItems", "interestEvents"],
  properties: {
    headline: { type: "string" },
    brief: { type: "string" },
    mainThings: { type: "array", items: { type: "string" } },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "detail", "priority", "sourceMessageId", "sourceUrl"],
        properties: {
          sourceMessageId: { type: ["string", "null"] },
          sourceUrl: { type: ["string", "null"] },
          title: { type: "string" },
          detail: { type: "string" },
          priority: { type: "string" },
        },
      },
    },
    interestEvents: {
      type: "array",
      items: {
        type: "object",
        required: ["interest", "title", "summary", "source", "url", "publishedAt"],
        properties: {
          interest: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          source: { type: "string" },
          url: { type: "string" },
          publishedAt: { type: ["string", "null"] },
        },
      },
    },
  },
};
