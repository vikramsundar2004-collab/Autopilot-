import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import type { IntegrationKey } from "./providers";
import { getProviderByKey } from "./providers";
import { getAppUrl, hasSupabaseConfig, supabase } from "./supabaseClient";

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

  const { data: sessionData } = await supabase.auth.getSession();
  const oauthCredentials = {
    provider: provider.supabaseProvider,
    options: {
      redirectTo: getOAuthRedirectUrl(),
      scopes: provider.scopes.join(" "),
      queryParams,
    },
  };

  const { error } =
    sessionData.session && provider.key === "google"
      ? await supabase.auth.linkIdentity(oauthCredentials)
      : await supabase.auth.signInWithOAuth(oauthCredentials);

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Opening ${provider.shortName} authorization.`,
  };
}

export async function startGoogleLogin(): Promise<ConnectionResult> {
  return startIntegrationConnection("google");
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
  const tokenResult = await storeGoogleConnection(data.session);
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
        : `Signed in with ${String(provider)}.`,
  };
}

export async function storeGoogleConnection(session: Session | null): Promise<ConnectionResult | null> {
  if (!supabase || !session?.provider_token) return null;
  const provider = session.user.app_metadata.provider;
  if (provider !== "google") return null;

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

function getOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return import.meta.env.VITE_IOS_REDIRECT_URL?.trim() || "com.autopilotai.app://auth/callback";
  }

  return `${getAppUrl()}/auth/callback`;
}
