import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";

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
  const providerAccessToken = typeof body.providerAccessToken === "string" ? body.providerAccessToken : "";
  if (!providerAccessToken) {
    return json({ error: "Google provider access token missing. Connect Google again, then retry sync." }, 400);
  }

  const userId = authData.user.id;
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

  const date = typeof body.date === "string" ? body.date : new Date().toISOString().slice(0, 10);
  const maxEmails = clamp(body.maxEmails, 1, 50, 25);
  const maxEvents = clamp(body.maxEvents, 1, 100, 50);

  await supabase.from("connected_accounts").upsert(
    {
      user_id: userId,
      organization_id: organizationId,
      provider: "google",
      provider_user_id: authData.user.email ?? userId,
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ],
      status: "connected",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider,provider_user_id" },
  );

  let gmailMessages;
  let calendarEvents;
  try {
    gmailMessages = await fetchGmailMessages(providerAccessToken, maxEmails);
    calendarEvents = await fetchCalendarEvents(providerAccessToken, date, maxEvents);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Google sync failed." }, 502);
  }

  const emailRows = gmailMessages.map((message) => ({
    user_id: userId,
    organization_id: organizationId,
    provider: "google",
    provider_message_id: message.id,
    thread_id: message.threadId,
    from_name: parseSenderName(message.from),
    from_email: parseSenderEmail(message.from),
    subject: message.subject,
    snippet: message.snippet,
    body_preview: null,
    received_at: message.receivedAt,
    labels: message.labels,
    importance: message.importance,
    processed_at: new Date().toISOString(),
  }));

  const calendarRows = calendarEvents.map((event) => ({
    user_id: userId,
    organization_id: organizationId,
    provider: "google",
    provider_event_id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    start_at: event.startAt,
    end_at: event.endAt,
    event_type: event.eventType,
    attendees: event.attendees,
  }));

  const { error: emailError } = emailRows.length
    ? await supabase.from("email_messages").upsert(emailRows, { onConflict: "user_id,provider,provider_message_id" })
    : { error: null };
  if (emailError) return json({ error: emailError.message }, 500);

  const { error: calendarError } = calendarRows.length
    ? await supabase
        .from("calendar_events")
        .upsert(calendarRows, { onConflict: "user_id,provider,provider_event_id" })
    : { error: null };
  if (calendarError) return json({ error: calendarError.message }, 500);

  await supabase.from("audit_events").insert({
    user_id: userId,
    organization_id: organizationId,
    actor_type: "system",
    action: "sync_google.completed",
    target_type: "connected_account",
    target_id: "google",
    metadata: { emailCount: emailRows.length, calendarEventCount: calendarRows.length },
  });
  await supabase.from("usage_events").insert({
    user_id: userId,
    organization_id: organizationId,
    event_type: "google_sync",
    quantity: 1,
    metadata: { emailCount: emailRows.length, calendarEventCount: calendarRows.length },
  });

  return json({
    ok: true,
    emailCount: emailRows.length,
    calendarEventCount: calendarRows.length,
  });
});

async function fetchGmailMessages(accessToken: string, maxResults: number) {
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(maxResults));
  listUrl.searchParams.set("q", "newer_than:14d -category:promotions -category:social");
  const listed = await googleFetch(accessToken, listUrl);
  const messages = Array.isArray(listed.messages) ? listed.messages.slice(0, maxResults) : [];
  const details = await Promise.all(
    messages.map(async (message: any) => {
      const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`);
      detailUrl.searchParams.set("format", "metadata");
      detailUrl.searchParams.append("metadataHeaders", "From");
      detailUrl.searchParams.append("metadataHeaders", "Subject");
      detailUrl.searchParams.append("metadataHeaders", "Date");
      return googleFetch(accessToken, detailUrl);
    }),
  );

  return details.map((detail: any) => {
    const headers = headerMap(detail.payload?.headers ?? []);
    const labels = Array.isArray(detail.labelIds) ? detail.labelIds.map(String) : [];
    return {
      id: detail.id,
      threadId: detail.threadId ?? detail.id,
      from: headers.from ?? "",
      subject: headers.subject ?? "",
      snippet: detail.snippet ?? "",
      labels,
      importance: labels.includes("IMPORTANT") ? "high" : "normal",
      receivedAt: gmailReceivedAt(headers.date, detail.internalDate),
    };
  });
}

async function fetchCalendarEvents(accessToken: string, date: string, maxResults: number) {
  const timeMin = `${date}T00:00:00.000Z`;
  const timeMax = new Date(Date.parse(timeMin) + 86_400_000).toISOString();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  const data = await googleFetch(accessToken, url);
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((event: any) => ({
      id: event.id,
      title: event.summary ?? "Untitled event",
      description: event.description ?? null,
      location: event.location ?? null,
      startAt: googleEventTime(event.start, date),
      endAt: googleEventTime(event.end, date, 30),
      eventType: inferEventType(event.summary ?? "", event.description ?? ""),
      attendees: Array.isArray(event.attendees)
        ? event.attendees.map((attendee: any) => ({
            email: attendee.email,
            name: attendee.displayName,
            responseStatus: attendee.responseStatus,
          }))
        : [],
    }))
    .filter((event: any) => event.id && Date.parse(event.endAt) > Date.parse(event.startAt));
}

async function googleFetch(accessToken: string, url: URL) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function safeBody(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function headerMap(headers: Array<{ name: string; value: string }>) {
  return Object.fromEntries(headers.map((header) => [header.name.toLowerCase(), header.value]));
}

function gmailReceivedAt(dateHeader: string | undefined, internalDate: string | undefined) {
  if (dateHeader && !Number.isNaN(Date.parse(dateHeader))) return new Date(dateHeader).toISOString();
  const internalMillis = Number(internalDate);
  if (Number.isFinite(internalMillis)) return new Date(internalMillis).toISOString();
  return new Date().toISOString();
}

function googleEventTime(value: any, date: string, fallbackMinutes = 0) {
  if (value?.dateTime) return value.dateTime;
  if (value?.date) return `${value.date}T${String(9 + Math.floor(fallbackMinutes / 60)).padStart(2, "0")}:00:00.000Z`;
  return `${date}T09:00:00.000Z`;
}

function inferEventType(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(focus|deep work|heads down)\b/.test(text)) return "focus";
  if (/\b(deadline|due)\b/.test(text)) return "deadline";
  return "meeting";
}

function parseSenderName(sender: string) {
  const match = sender.match(/^(.*?)\s*<[^>]+>$/);
  return (match?.[1] ?? sender).replace(/^"|"$/g, "").trim();
}

function parseSenderEmail(sender: string) {
  const match = sender.match(/<([^>]+)>/);
  return (match?.[1] ?? sender).trim();
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
