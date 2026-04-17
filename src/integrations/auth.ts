import { Capacitor } from "@capacitor/core";
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
      redirectTo: getOAuthRedirectUrl(),
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

export async function completeOAuthRedirect(callbackUrl = window.location.href): Promise<ConnectionResult | null> {
  if (!supabase) {
    return null;
  }

  const url = new URL(callbackUrl);
  const callbackPath = `${url.host}${url.pathname}`;
  if (!callbackPath.includes("auth/callback")) {
    return null;
  }

  const code = url.searchParams.get("code");
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

  if (window.location.pathname.includes("/auth/callback")) {
    window.history.replaceState({}, document.title, "/");
  }
  const provider = data.session?.user.app_metadata.provider ?? "provider";

  return {
    ok: true,
    message: `Connected ${String(provider)}. Tokens must be stored server-side before real ingestion is enabled.`,
  };
}

function getOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return import.meta.env.VITE_IOS_REDIRECT_URL?.trim() || "com.autopilotai.app://auth/callback";
  }

  return `${getAppUrl()}/auth/callback`;
}
