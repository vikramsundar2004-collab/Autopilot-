import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import type { IntegrationKey } from "./providers";
import { getProviderByKey } from "./providers";
import { getAppUrl, hasSupabaseConfig, supabase } from "./supabaseClient";

const pendingOAuthIntentStorageKey = "autopilot-ai:pending-oauth-intent";
type OAuthIntent = IntegrationKey | "google-login" | "google-workspace";

export interface ConnectionResult {
  ok: boolean;
  message: string;
  googleConnected?: boolean;
}

export async function startIntegrationConnection(
  key: IntegrationKey,
): Promise<ConnectionResult> {
  const provider = getProviderByKey(key);

  if (provider.serverRequired || !provider.supabaseProvider) {
    return {
      ok: false,
      message: `${provider.shortName} needs backend setup before it can connect safely. First step: ${provider.requiredSetup[0]}`,
    };
  }

  if (!hasSupabaseConfig || !supabase) {
    return {
      ok: false,
      message:
        "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the dev server.",
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const oauthOptions =
    provider.key === "google"
      ? buildGoogleWorkspaceOAuthOptions(provider)
      : {
          redirectTo: getOAuthRedirectUrl(),
          scopes: provider.scopes.join(" "),
        };
  const oauthCredentials = {
    provider: provider.supabaseProvider,
    options: oauthOptions,
  };

  rememberPendingOAuthIntent(provider.key === "google" ? "google-workspace" : key);
  const { error } =
    sessionData.session && provider.key === "google"
      ? await supabase.auth.linkIdentity(oauthCredentials)
      : await supabase.auth.signInWithOAuth(oauthCredentials);

  if (error) {
    clearPendingOAuthIntent();
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Opening ${provider.shortName} authorization.`,
  };
}

export async function startGoogleLogin(): Promise<ConnectionResult> {
  if (!hasSupabaseConfig || !supabase) {
    return {
      ok: false,
      message:
        "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the dev server.",
    };
  }

  rememberPendingOAuthIntent("google-login");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getOAuthRedirectUrl(),
    },
  });
  if (error) {
    clearPendingOAuthIntent();
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: "Opening Google sign-in.",
  };
}

export async function startEmailLogin(email: string): Promise<ConnectionResult> {
  if (!hasSupabaseConfig || !supabase) {
    return {
      ok: false,
      message:
        "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the dev server.",
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }

  clearPendingOAuthIntent();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: getOAuthRedirectUrl(),
    },
  });
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    message: `Check ${normalizedEmail} for your Autopilot-AI login link.`,
  };
}

export async function signOut(): Promise<ConnectionResult> {
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  clearPendingOAuthIntent();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Signed out." };
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
  const pendingIntent = consumePendingOAuthIntent();

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
  const tokenResult = await storeGoogleConnection(data.session, pendingIntent);
  if (tokenResult && !tokenResult.ok) {
    return {
      ok: false,
      message: `Signed in with ${String(provider)}, but Google storage failed: ${tokenResult.message}`,
    };
  }

  return {
    ok: true,
    googleConnected: Boolean(tokenResult?.googleConnected),
    message:
      tokenResult?.googleConnected
        ? "Google is connected. You can sync Gmail and Calendar without reconnecting."
        : pendingIntent === "google-login"
          ? "Signed in with Google. Open Sources to finish Gmail and Calendar connection."
        : `Signed in with ${String(provider)}.`,
  };
}

export async function storeGoogleConnection(
  session: Session | null,
  pendingIntent?: OAuthIntent | null,
): Promise<ConnectionResult | null> {
  if (!supabase || !session?.provider_token) return null;
  if (!shouldStoreGoogleConnection(session, pendingIntent)) return null;

  const { data, error } = await supabase.functions.invoke("store-google-connection", {
    body: {
      providerAccessToken: session.provider_token,
      providerRefreshToken: session.provider_refresh_token,
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ],
    },
  });
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    googleConnected: Boolean(data?.connected),
    message: data?.refreshTokenStored
      ? "Google connection saved for background sync."
      : "Google connection saved with the current access token.",
  };
}

export function shouldStoreGoogleConnection(
  session: Pick<Session, "provider_token" | "user"> | null,
  pendingIntent?: OAuthIntent | null,
): boolean {
  if (!session?.provider_token) return false;
  return pendingIntent === "google-workspace";
}

export function rememberPendingOAuthIntent(intent: OAuthIntent): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(pendingOAuthIntentStorageKey, intent);
}

export function consumePendingOAuthIntent(): OAuthIntent | null {
  if (typeof window === "undefined") return null;
  const rawIntent = window.localStorage.getItem(pendingOAuthIntentStorageKey);
  clearPendingOAuthIntent();
  return isOAuthIntent(rawIntent) ? rawIntent : null;
}

function clearPendingOAuthIntent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(pendingOAuthIntentStorageKey);
}

function isOAuthIntent(value: string | null): value is OAuthIntent {
  return value === "google-login" || value === "google-workspace" || value === "google" || value === "slack" || value === "whatsapp" || value === "microsoft" || value === "notion";
}

function buildGoogleWorkspaceOAuthOptions(provider: ReturnType<typeof getProviderByKey>) {
  return {
    redirectTo: getOAuthRedirectUrl(),
    scopes: provider.scopes.join(" "),
    queryParams: {
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
    },
  };
}

function getOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return import.meta.env.VITE_IOS_REDIRECT_URL?.trim() || "com.autopilotai.app://auth/callback";
  }

  return `${getAppUrl()}/auth/callback`;
}
