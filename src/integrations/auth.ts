import type { IntegrationKey } from "./providers";
import { getProviderByKey } from "./providers";
import { getAppUrl, hasSupabaseConfig, supabase } from "./supabaseClient";

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

export async function startIntegrationConnection(
  key: IntegrationKey,
): Promise<ConnectionResult> {
  const provider = getProviderByKey(key);

  if (provider.serverRequired || !provider.supabaseProvider) {
    return {
      ok: false,
      message: `${provider.shortName} needs a backend token exchange before it can be connected safely.`,
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      ok: false,
      message:
        "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the dev server.",
    };
  }

  const queryParams =
    provider.key === "google"
      ? {
          access_type: "offline",
          prompt: "consent",
        }
      : undefined;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: provider.supabaseProvider,
    options: {
      redirectTo: `${getAppUrl()}/auth/callback`,
      scopes: provider.scopes.join(" "),
      queryParams,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Opening ${provider.shortName} authorization.`,
  };
}

export async function completeOAuthRedirect(): Promise<ConnectionResult | null> {
  if (!supabase || !window.location.pathname.includes("/auth/callback")) {
    return null;
  }

  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) {
    return {
      ok: false,
      message: "OAuth callback returned without a code.",
    };
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return { ok: false, message: error.message };
  }

  window.history.replaceState({}, document.title, "/");
  const provider = data.session?.user.app_metadata.provider ?? "provider";

  return {
    ok: true,
    message: `Connected ${String(provider)}. Tokens must be stored server-side before real ingestion is enabled.`,
  };
}
