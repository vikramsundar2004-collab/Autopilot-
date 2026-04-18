import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { getAuthenticatedUser } from "../_shared/auth.ts";

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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ error: "Missing Supabase env." }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Missing bearer token." }, 401);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
  const userId = user.id;
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
  const dayStartIso = typeof body.dayStartIso === "string" ? body.dayStartIso : null;
  const dayEndIso = typeof body.dayEndIso === "string" ? body.dayEndIso : null;
  const maxEmails = clamp(body.maxEmails, 1, 50, 25);
  const maxEvents = clamp(body.maxEvents, 1, 100, 50);
  const bodyAccessToken = typeof body.providerAccessToken === "string" ? body.providerAccessToken : "";
  const bodyRefreshToken = typeof body.providerRefreshToken === "string" ? body.providerRefreshToken : "";
  const tokenResult = await resolveMicrosoftAccessToken(serviceClient, {
    userId,
    organizationId,
    providerUserId: user.email ?? userId,
    bodyAccessToken,
    bodyRefreshToken,
  });
  if (!tokenResult.ok) return json({ error: tokenResult.error }, tokenResult.status);
  const providerAccessToken = tokenResult.accessToken;

  await serviceClient.from("connected_accounts").upsert(
    {
      user_id: userId,
      organization_id: organizationId,
      provider: "microsoft",
      provider_user_id: user.email ?? userId,
      scopes: ["Mail.Read", "Calendars.Read", "offline_access"],
      status: "connected",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider,provider_user_id" },
  );

  let outlookMessages;
  let calendarEvents;
  try {
    outlookMessages = await fetchOutlookMessages(providerAccessToken, maxEmails);
    calendarEvents = await fetchOutlookCalendarEvents(
      providerAccessToken,
      date,
      maxEvents,
      dayStartIso,
      dayEndIso,
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Microsoft 365 sync failed." }, 502);
  }

  const emailRows = outlookMessages.map((message) => ({
    user_id: userId,
    organization_id: organizationId,
    provider: "microsoft",
    provider_message_id: message.id,
    thread_id: message.threadId,
    from_name: message.fromName,
    from_email: message.fromEmail,
    subject: message.subject,
    snippet: message.snippet,
    body_preview: message.bodyPreview,
    received_at: message.receivedAt,
    labels: message.labels,
    importance: message.importance,
    processed_at: new Date().toISOString(),
  }));

  const calendarRows = calendarEvents.map((event) => ({
    user_id: userId,
    organization_id: organizationId,
    provider: "microsoft",
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

  await serviceClient.from("audit_events").insert({
    user_id: userId,
    organization_id: organizationId,
    actor_type: "system",
    action: "sync_microsoft.completed",
    target_type: "connected_account",
    target_id: "microsoft",
    metadata: { emailCount: emailRows.length, calendarEventCount: calendarRows.length },
  });
  await serviceClient.from("usage_events").insert({
    user_id: userId,
    organization_id: organizationId,
    event_type: "microsoft_sync",
    quantity: 1,
    metadata: { emailCount: emailRows.length, calendarEventCount: calendarRows.length },
  });

  return json({
    ok: true,
    emailCount: emailRows.length,
    calendarEventCount: calendarRows.length,
  });
});

async function fetchOutlookMessages(accessToken: string, maxResults: number) {
  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$top", String(maxResults));
  url.searchParams.set(
    "$select",
    "id,conversationId,subject,bodyPreview,receivedDateTime,from,importance,categories",
  );
  url.searchParams.set("$orderby", "receivedDateTime DESC");
  const data = await graphFetch(accessToken, url);
  const messages = Array.isArray(data.value) ? data.value : [];
  return messages.map((message: any) => ({
    id: String(message.id),
    threadId: String(message.conversationId ?? message.id),
    fromName: String(message.from?.emailAddress?.name ?? ""),
    fromEmail: String(message.from?.emailAddress?.address ?? ""),
    subject: String(message.subject ?? ""),
    snippet: String(message.bodyPreview ?? ""),
    bodyPreview: String(message.bodyPreview ?? ""),
    receivedAt: message.receivedDateTime ? new Date(String(message.receivedDateTime)).toISOString() : new Date().toISOString(),
    labels: Array.isArray(message.categories) ? message.categories.map(String) : [],
    importance: normalizeImportance(message.importance),
  }));
}

async function fetchOutlookCalendarEvents(
  accessToken: string,
  date: string,
  maxResults: number,
  dayStartIso?: string | null,
  dayEndIso?: string | null,
) {
  const start = dayStartIso && !Number.isNaN(Date.parse(dayStartIso))
    ? dayStartIso
    : new Date(`${date}T00:00:00`).toISOString();
  const end = dayEndIso && !Number.isNaN(Date.parse(dayEndIso))
    ? dayEndIso
    : new Date(Date.parse(start) + 86_400_000).toISOString();
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  url.searchParams.set("$top", String(maxResults));
  url.searchParams.set(
    "$select",
    "id,subject,bodyPreview,location,start,end,attendees",
  );
  url.searchParams.set("$orderby", "start/dateTime");
  const data = await graphFetch(accessToken, url);
  const items = Array.isArray(data.value) ? data.value : [];
  return items
    .map((event: any) => ({
      id: String(event.id),
      title: String(event.subject ?? "Untitled event"),
      description: event.bodyPreview ? String(event.bodyPreview) : null,
      location: event.location?.displayName ? String(event.location.displayName) : null,
      startAt: normalizeGraphDateTime(event.start, date),
      endAt: normalizeGraphDateTime(event.end, date, 30),
      eventType: inferEventType(String(event.subject ?? ""), String(event.bodyPreview ?? "")),
      attendees: Array.isArray(event.attendees)
        ? event.attendees.map((attendee: any) => ({
            email: attendee.emailAddress?.address,
            name: attendee.emailAddress?.name,
            responseStatus: attendee.status?.response,
          }))
        : [],
    }))
    .filter((event: any) => event.id && Date.parse(event.endAt) > Date.parse(event.startAt));
}

async function graphFetch(accessToken: string, url: URL) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Microsoft Graph ${response.status}: ${await response.text()}`);
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

async function resolveMicrosoftAccessToken(
  serviceClient: any,
  input: {
    userId: string;
    organizationId: string | null;
    providerUserId: string;
    bodyAccessToken: string;
    bodyRefreshToken: string;
  },
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string; status: number }> {
  const { data: tokenRow, error: tokenError } = await serviceClient
    .from("provider_token_vault")
    .select("access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, scopes")
    .eq("user_id", input.userId)
    .eq("provider", "microsoft")
    .eq("provider_user_id", input.providerUserId)
    .maybeSingle();
  if (tokenError) return { ok: false, error: tokenError.message, status: 500 };

  try {
    const expiresAt = tokenRow?.access_token_expires_at ? Date.parse(tokenRow.access_token_expires_at) : 0;
    if (tokenRow?.access_token_ciphertext && expiresAt > Date.now() + 5 * 60_000) {
      return { ok: true, accessToken: await decryptToken(tokenRow.access_token_ciphertext, "Microsoft") };
    }

    if (tokenRow?.refresh_token_ciphertext) {
      const refreshToken = await decryptToken(tokenRow.refresh_token_ciphertext, "Microsoft");
      const refreshed = await refreshMicrosoftAccessToken(refreshToken);
      await upsertMicrosoftToken(serviceClient, {
        userId: input.userId,
        organizationId: input.organizationId,
        providerUserId: input.providerUserId,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? refreshToken,
        expiresIn: refreshed.expiresIn,
        scopes: refreshed.scope ? refreshed.scope.split(" ") : tokenRow.scopes ?? [],
      });
      return { ok: true, accessToken: refreshed.accessToken };
    }

    if (input.bodyAccessToken) {
      await upsertMicrosoftToken(serviceClient, {
        userId: input.userId,
        organizationId: input.organizationId,
        providerUserId: input.providerUserId,
        accessToken: input.bodyAccessToken,
        refreshToken: input.bodyRefreshToken || null,
        expiresIn: 3300,
        scopes: ["Mail.Read", "Calendars.Read", "offline_access"],
      });
      return { ok: true, accessToken: input.bodyAccessToken };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not resolve Microsoft token.", status: 500 };
  }

  return {
    ok: false,
    error: "Microsoft 365 is not connected for this user. Complete the backend OAuth install, then sync again.",
    status: 400,
  };
}

async function refreshMicrosoftAccessToken(refreshToken: string) {
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID") || "common";
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be set for background Microsoft sync.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "offline_access Mail.Read Calendars.Read",
  });
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Microsoft token refresh failed ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Microsoft token refresh did not return an access token.");

  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : null,
    expiresIn: Number(data.expires_in ?? 3300),
    scope: typeof data.scope === "string" ? data.scope : "",
  };
}

async function upsertMicrosoftToken(
  serviceClient: any,
  input: {
    userId: string;
    organizationId: string | null;
    providerUserId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number;
    scopes: string[];
  },
) {
  const row: Record<string, unknown> = {
    user_id: input.userId,
    organization_id: input.organizationId,
    provider: "microsoft",
    provider_user_id: input.providerUserId,
    access_token_ciphertext: await encryptToken(input.accessToken),
    access_token_expires_at: new Date(Date.now() + Math.max(60, input.expiresIn - 60) * 1000).toISOString(),
    scopes: input.scopes,
    status: "connected",
    updated_at: new Date().toISOString(),
  };
  if (input.refreshToken) row.refresh_token_ciphertext = await encryptToken(input.refreshToken);
  const { error } = await serviceClient
    .from("provider_token_vault")
    .upsert(row, { onConflict: "user_id,provider,provider_user_id" });
  if (error) throw new Error(error.message);
}

async function encryptToken(value: string) {
  const key = await encryptionKey("encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptToken(payload: string, providerName: string) {
  const [ivText, encryptedText] = payload.split(".");
  if (!ivText || !encryptedText) throw new Error(`Stored ${providerName} token is not readable.`);
  const key = await encryptionKey("decrypt");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    key,
    fromBase64(encryptedText),
  );
  return new TextDecoder().decode(decrypted);
}

async function encryptionKey(usage: "encrypt" | "decrypt") {
  const secret = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set to at least 32 characters.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [usage]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function normalizeImportance(value: unknown) {
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "normal";
}

function normalizeGraphDateTime(value: any, date: string, fallbackMinutes = 0) {
  const rawDateTime = typeof value?.dateTime === "string" ? value.dateTime : "";
  if (rawDateTime) {
    const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(rawDateTime) ? rawDateTime : `${rawDateTime}Z`;
    return new Date(normalized).toISOString();
  }
  return `${date}T${String(9 + Math.floor(fallbackMinutes / 60)).padStart(2, "0")}:00:00.000Z`;
}

function inferEventType(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(focus|deep work|heads down)\b/.test(text)) return "focus";
  if (/\b(deadline|due)\b/.test(text)) return "deadline";
  if (/\b(personal|family|pickup)\b/.test(text)) return "personal";
  return "meeting";
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
