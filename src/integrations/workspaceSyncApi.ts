import { supabase } from "./supabaseClient";

export interface GoogleWorkspaceSyncRequest {
  date?: string;
  organizationId?: string;
  maxEmails?: number;
  maxEvents?: number;
}

export interface GoogleWorkspaceSyncResult {
  ok: boolean;
  message: string;
  emailCount?: number;
  calendarEventCount?: number;
}

export interface GoogleWorkspaceConnectionStatus {
  connected: boolean;
  status?: string;
}

export async function getGoogleWorkspaceConnectionStatus(): Promise<GoogleWorkspaceConnectionStatus> {
  if (!supabase) return { connected: false };
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("status")
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();
  if (error) return { connected: false };
  return { connected: Boolean(data), status: data?.status };
}

export async function syncGoogleWorkspace(
  request: GoogleWorkspaceSyncRequest = {},
): Promise<GoogleWorkspaceSyncResult> {
  if (!supabase) {
    return {
      ok: false,
      message: "Add Supabase env vars before syncing Google Workspace.",
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, message: sessionError.message };
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
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: "Google Workspace sync complete.",
    emailCount: data?.emailCount ?? 0,
    calendarEventCount: data?.calendarEventCount ?? 0,
  };
}
