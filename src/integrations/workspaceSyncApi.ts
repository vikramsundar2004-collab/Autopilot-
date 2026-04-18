import type { CalendarEvent, EmailMessage } from "../types";
import {
  hasGoogleWorkspaceSessionFlag,
  markGoogleWorkspaceSessionConnected,
} from "./auth";
import { describeFunctionError } from "./functionErrors";
import {
  mapCalendarRowsToEvents,
  mapEmailRowsToMessages,
  type CalendarEventRow,
  type EmailMessageRow,
} from "./workspaceData";
import { supabase } from "./supabaseClient";

export interface GoogleWorkspaceSyncRequest {
  date?: string;
  dayStartIso?: string;
  dayEndIso?: string;
  organizationId?: string;
  maxEmails?: number;
  maxEvents?: number;
}

export interface GoogleWorkspaceSyncResult {
  ok: boolean;
  message: string;
  emailCount?: number;
  calendarEventCount?: number;
  persisted?: boolean;
  emails: EmailMessage[];
  calendarEvents: CalendarEvent[];
}

export interface MicrosoftWorkspaceSyncRequest {
  date?: string;
  dayStartIso?: string;
  dayEndIso?: string;
  organizationId?: string;
  maxEmails?: number;
  maxEvents?: number;
}

export interface GoogleWorkspaceConnectionStatus {
  connected: boolean;
  status?: string;
}

export async function getGoogleWorkspaceConnectionStatus(): Promise<GoogleWorkspaceConnectionStatus> {
  if (!supabase) return { connected: false };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (sessionError || !userId) return { connected: false };
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("status")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("status", "connected")
    .limit(1);
  if (error) {
    return hasGoogleWorkspaceSessionFlag()
      ? { connected: true, status: "session" }
      : { connected: false };
  }
  if (data?.length) {
    return { connected: true, status: data[0]?.status };
  }
  return hasGoogleWorkspaceSessionFlag()
    ? { connected: true, status: "session" }
    : { connected: false };
}

export async function syncGoogleWorkspace(
  request: GoogleWorkspaceSyncRequest = {},
): Promise<GoogleWorkspaceSyncResult> {
  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before syncing Google Workspace.",
      emails: [],
      calendarEvents: [],
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, message: sessionError.message, emails: [], calendarEvents: [] };
  }
  if (!sessionData.session) {
    return { ok: false, message: "Sign in before syncing Google Workspace.", emails: [], calendarEvents: [] };
  }

  const session = sessionData.session as (typeof sessionData.session & { provider_token?: string }) | null;
  const providerAccessToken = session?.provider_token;

  const { data, error } = await supabase.functions.invoke("sync-google-workspace", {
    body: {
      ...request,
      ...(providerAccessToken ? { providerAccessToken } : {}),
      ...(session?.provider_refresh_token ? { providerRefreshToken: session.provider_refresh_token } : {}),
    },
  });

  if (error) {
    return {
      ok: false,
      message: await describeFunctionError(error, "Google sync failed."),
      emails: [],
      calendarEvents: [],
    };
  }

  const date = request.date ?? new Date().toISOString().slice(0, 10);
  const emails = Array.isArray(data?.emailRows)
    ? mapEmailRowsToMessages(data.emailRows as EmailMessageRow[], date)
    : [];
  const calendarEvents = Array.isArray(data?.calendarRows)
    ? mapCalendarRowsToEvents(data.calendarRows as CalendarEventRow[])
    : [];
  const persisted = data?.persisted !== false;
  if (persisted || emails.length > 0 || calendarEvents.length > 0) {
    markGoogleWorkspaceSessionConnected();
  }

  return {
    ok: true,
    message:
      typeof data?.message === "string" && data.message.trim()
        ? data.message
        : persisted
          ? "Google Workspace sync complete."
          : "Google Workspace loaded for the current session, but storage is unavailable.",
    emailCount: data?.emailCount ?? 0,
    calendarEventCount: data?.calendarEventCount ?? 0,
    persisted,
    emails,
    calendarEvents,
  };
}

export async function syncMicrosoftWorkspace(
  request: MicrosoftWorkspaceSyncRequest = {},
): Promise<GoogleWorkspaceSyncResult> {
  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before syncing Microsoft 365.",
      emails: [],
      calendarEvents: [],
    };
  }

  const { data, error } = await supabase.functions.invoke("sync-microsoft-workspace", {
    body: request,
  });

  if (error) {
    return {
      ok: false,
      message: await describeFunctionError(error, "Microsoft 365 sync failed."),
      emails: [],
      calendarEvents: [],
    };
  }

  return {
    ok: true,
    message: "Microsoft 365 sync complete.",
    emailCount: data?.emailCount ?? 0,
    calendarEventCount: data?.calendarEventCount ?? 0,
    emails: [],
    calendarEvents: [],
  };
}
