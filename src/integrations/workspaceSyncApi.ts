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
  if (!providerAccessToken) {
    return {
      ok: false,
      message: "Connect Google again, then run sync. Supabase did not expose a Google provider token for this session.",
    };
  }

  const { data, error } = await supabase.functions.invoke("sync-google-workspace", {
    body: {
      ...request,
      providerAccessToken,
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
