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
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
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
  const dayStartIso = typeof body.dayStartIso === "string" ? body.dayStartIso : null;
  const dayEndIso = typeof body.dayEndIso === "string" ? body.dayEndIso : null;
  const maxEmails = clamp(body.maxEmails, 1, 50, 25);
  const maxEvents = clamp(body.maxEvents, 1, 100, 50);
  const bodyAccessToken = typeof body.providerAccessToken === "string" ? body.providerAccessToken : "";
  const bodyRefreshToken = typeof body.providerRefreshToken === "string" ? body.providerRefreshToken : "";
  const tokenResult = await resolveGoogleAccessToken(serviceClient, {
    userId,
    organizationId,
    providerUserId: authData.user.email ?? userId,
    bodyAccessToken,
    bodyRefreshToken,
  });
  if (!tokenResult.ok) return json({ error: tokenResult.error }, tokenResult.status);
  const providerAccessToken = tokenResult.accessToken;
  const warnings: string[] = [];
  if (tokenResult.warning) warnings.push(tokenResult.warning);

  const { error: metadataError } = await serviceClient.from("connected_accounts").upsert(
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
  if (metadataError) {
    warnings.push(`Google connection metadata could not be saved: ${metadataError.message}`);
  }

  let gmailMessages;
  let calendarEvents;
  try {
    gmailMessages = await fetchGmailMessages(providerAccessToken, maxEmails);
    calendarEvents = await fetchCalendarEvents(providerAccessToken, date, maxEvents, dayStartIso, dayEndIso);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sync failed.";
    if (isGooglePermissionsError(message)) {
      await markGoogleConnectionStatus(serviceClient, {
        userId,
        organizationId,
        providerUserId: authData.user.email ?? userId,
        status: "needs_reauth",
      });
      return json(
        {
          error:
            "Google permissions need to be reconnected. Sign in with Google again to restore Gmail and Calendar access.",
          status: "needs_reauth",
        },
        401,
      );
    }
    return json({ error: message }, 502);
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
  if (emailError) {
    warnings.push(`Email storage is unavailable: ${emailError.message}`);
  }

  const { error: calendarError } = calendarRows.length
    ? await supabase
        .from("calendar_events")
        .upsert(calendarRows, { onConflict: "user_id,provider,provider_event_id" })
    : { error: null };
  if (calendarError) {
    warnings.push(`Calendar storage is unavailable: ${calendarError.message}`);
  }

  await serviceClient.from("audit_events").insert({
    user_id: userId,
    organization_id: organizationId,
    actor_type: "system",
    action: "sync_google.completed",
    target_type: "connected_account",
    target_id: "google",
    metadata: { emailCount: emailRows.length, calendarEventCount: calendarRows.length },
  });
  await serviceClient.from("usage_events").insert({
    user_id: userId,
    organization_id: organizationId,
    event_type: "google_sync",
    quantity: 1,
    metadata: { emailCount: emailRows.length, calendarEventCount: calendarRows.length },
  });

  const emailResponseRows = emailRows.map((row) => ({
    id: row.provider_message_id,
    provider: row.provider,
    provider_message_id: row.provider_message_id,
    thread_id: row.thread_id,
    from_name: row.from_name,
    from_email: row.from_email,
    subject: row.subject,
    snippet: row.snippet,
    body_preview: row.body_preview,
    received_at: row.received_at,
    labels: row.labels,
    importance: row.importance,
  }));
  const calendarResponseRows = calendarRows.map((row) => ({
    id: row.provider_event_id,
    provider: row.provider,
    provider_event_id: row.provider_event_id,
    title: row.title,
    description: row.description,
    location: row.location,
    start_at: row.start_at,
    end_at: row.end_at,
    event_type: row.event_type,
    attendees: row.attendees,
  }));
  const warning = warnings.join(" ").trim();
  const persisted = warnings.length === 0;

  return json({
    ok: true,
    persisted,
    message: persisted
      ? "Google Workspace sync complete."
      : `Google Workspace synced for the current session. ${warning}`,
    emailCount: emailRows.length,
    calendarEventCount: calendarRows.length,
    emailRows: emailResponseRows,
    calendarRows: calendarResponseRows,
    warning: warning || null,
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

async function fetchCalendarEvents(
  accessToken: string,
  date: string,
  maxResults: number,
  dayStartIso?: string | null,
  dayEndIso?: string | null,
) {
  const timeMin = dayStartIso && !Number.isNaN(Date.parse(dayStartIso))
    ? dayStartIso
    : new Date(`${date}T00:00:00`).toISOString();
  const timeMax = dayEndIso && !Number.isNaN(Date.parse(dayEndIso))
    ? dayEndIso
    : new Date(Date.parse(timeMin) + 86_400_000).toISOString();
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

async function markGoogleConnectionStatus(
  serviceClient: any,
  input: {
    userId: string;
    organizationId: string | null;
    providerUserId: string;
    status: "connected" | "needs_reauth" | "disabled";
  },
) {
  await serviceClient.from("connected_accounts").upsert(
    {
      user_id: input.userId,
      organization_id: input.organizationId,
      provider: "google",
      provider_user_id: input.providerUserId,
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ],
      status: input.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider,provider_user_id" },
  );
}

async function resolveGoogleAccessToken(
  serviceClient: any,
  input: {
    userId: string;
    organizationId: string | null;
    providerUserId: string;
    bodyAccessToken: string;
    bodyRefreshToken: string;
  },
): Promise<
  | { ok: true; accessToken: string; warning?: string }
  | { ok: false; error: string; status: number }
> {
  const { data: tokenRow, error: tokenError } = await serviceClient
    .from("provider_token_vault")
    .select("access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, scopes")
    .eq("user_id", input.userId)
    .eq("provider", "google")
    .eq("provider_user_id", input.providerUserId)
    .maybeSingle();
  if (tokenError) return { ok: false, error: tokenError.message, status: 500 };

  try {
    if (input.bodyAccessToken) {
      const warning = await bestEffortTokenUpsert(serviceClient, {
        userId: input.userId,
        organizationId: input.organizationId,
        providerUserId: input.providerUserId,
        accessToken: input.bodyAccessToken,
        refreshToken: input.bodyRefreshToken || null,
        expiresIn: 3300,
        scopes: tokenRow?.scopes ?? [],
      });
      return warning
        ? { ok: true, accessToken: input.bodyAccessToken, warning }
        : { ok: true, accessToken: input.bodyAccessToken };
    }

    const expiresAt = tokenRow?.access_token_expires_at ? Date.parse(tokenRow.access_token_expires_at) : 0;
    if (tokenRow?.access_token_ciphertext && expiresAt > Date.now() + 5 * 60_000) {
      return { ok: true, accessToken: await decryptToken(tokenRow.access_token_ciphertext) };
    }

    if (tokenRow?.refresh_token_ciphertext) {
      const refreshToken = await decryptToken(tokenRow.refresh_token_ciphertext);
      const refreshed = await refreshGoogleAccessToken(refreshToken);
      const warning = await bestEffortTokenUpsert(serviceClient, {
        userId: input.userId,
        organizationId: input.organizationId,
        providerUserId: input.providerUserId,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? refreshToken,
        expiresIn: refreshed.expiresIn,
        scopes: refreshed.scope ? refreshed.scope.split(" ") : tokenRow.scopes ?? [],
      });
      return warning
        ? { ok: true, accessToken: refreshed.accessToken, warning }
        : { ok: true, accessToken: refreshed.accessToken };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve Google token.";
    if (isGoogleRefreshReauthError(message)) {
      await markGoogleConnectionStatus(serviceClient, {
        userId: input.userId,
        organizationId: input.organizationId,
        providerUserId: input.providerUserId,
        status: "needs_reauth",
      });
      return {
        ok: false,
        error: "Google permissions expired. Sign in with Google again to restore Gmail and Calendar access.",
        status: 401,
      };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Could not resolve Google token.", status: 500 };
  }

  return {
    ok: false,
    error: "Google is not connected for this user. Sign in with Google once, then sync again.",
    status: 400,
  };
}

async function bestEffortTokenUpsert(
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
  try {
    await upsertGoogleToken(serviceClient, input);
    return undefined;
  } catch (error) {
    return `Google token vault is unavailable for background sync: ${
      error instanceof Error ? error.message : "Could not store the Google token."
    }`;
  }
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for background Google sync.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Google token refresh failed ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Google token refresh did not return an access token.");
  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : null,
    expiresIn: Number(data.expires_in ?? 3300),
    scope: typeof data.scope === "string" ? data.scope : "",
  };
}

async function upsertGoogleToken(
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
    provider: "google",
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

async function decryptToken(payload: string) {
  const [ivText, encryptedText] = payload.split(".");
  if (!ivText || !encryptedText) throw new Error("Stored Google token is not readable.");
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

function isGoogleRefreshReauthError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("google token refresh failed 400") ||
    normalized.includes("google token refresh failed 401") ||
    normalized.includes("invalid_grant")
  );
}

function isGooglePermissionsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("google api 401") ||
    normalized.includes("insufficient authentication scopes") ||
    normalized.includes("insufficientpermissions")
  );
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
