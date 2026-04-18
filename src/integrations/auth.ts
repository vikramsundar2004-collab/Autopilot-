import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import type { IntegrationKey } from "./providers";
import { describeFunctionError } from "./functionErrors";
import { getFunctionAuthorizationHeaders } from "./functionAuth";
import { getProviderByKey, googleScopes } from "./providers";
import { getAppUrl, hasSupabaseConfig, supabase } from "./supabaseClient";

const pendingOAuthIntentStorageKey = "autopilot-ai:pending-oauth-intent";
const googleWorkspaceSessionStorageKey = "autopilot-ai:google-workspace-session";
type OAuthIntent = IntegrationKey;

const googleIdentityScopes = ["openid", "email", "profile"] as const;
const googleWorkspaceScopes = [...googleIdentityScopes, ...googleScopes];

export interface ConnectionResult {
  ok: boolean;
  message: string;
  googleConnected?: boolean;
}

export async function startIntegrationConnection(
  key: IntegrationKey,
): Promise<ConnectionResult> {
  if (key === "google") {
    return startGoogleLogin();
  }

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
  const session = sessionData.session;
  const oauthOptions = {
    redirectTo: getOAuthRedirectUrl(),
    scopes: provider.scopes.join(" "),
  };
  const oauthCredentials = {
    provider: provider.supabaseProvider,
    options: oauthOptions,
  };

  rememberPendingOAuthIntent(key);
  const shouldRefreshGoogleScopes =
    provider.key === "google" &&
    Boolean(
      session &&
        (session.user.app_metadata.provider === "google" ||
          session.user.app_metadata.providers?.includes("google") ||
          session.user.identities?.some((identity) => identity.provider === "google")),
    );
  const { error } =
    session && !shouldRefreshGoogleScopes
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

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const oauthCredentials = {
    provider: "google" as const,
    options: buildGoogleOAuthOptions(),
  };

  rememberPendingOAuthIntent("google");
  const shouldRefreshGoogleScopes = Boolean(
    session &&
      (session.user.app_metadata.provider === "google" ||
        session.user.app_metadata.providers?.includes("google") ||
        session.user.identities?.some((identity) => identity.provider === "google")),
  );
  const { error } =
    session && !shouldRefreshGoogleScopes
      ? await supabase.auth.linkIdentity(oauthCredentials)
      : await supabase.auth.signInWithOAuth(oauthCredentials);
  if (error) {
    clearPendingOAuthIntent();
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: "Opening Google sign-in for Gmail and Calendar.",
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
  clearGoogleWorkspaceSessionFlag();
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
  const cleanedLocation = buildPostAuthLocation(url);
  const errorDescription = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (errorDescription) {
    replaceCurrentWebCallbackUrl(cleanedLocation);
    return {
      ok: false,
      message: decodeURIComponent(errorDescription.replace(/\+/g, " ")),
    };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      replaceCurrentWebCallbackUrl(cleanedLocation);
      return {
        ok: true,
        message:
          pendingIntent === "google"
            ? "Signed in with Google."
            : "Signed in.",
      };
    }
    replaceCurrentWebCallbackUrl(cleanedLocation);
    return {
      ok: false,
      message: "OAuth callback returned without a code.",
    };
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    replaceCurrentWebCallbackUrl(cleanedLocation);
    return { ok: false, message: error.message };
  }
  if (pendingIntent === "google" && !data.session?.provider_token) {
    replaceCurrentWebCallbackUrl(cleanedLocation);
    return {
      ok: false,
      message:
        "Google sign-in finished, but Google did not return a provider token for Gmail and Calendar. Sign in with Google again and confirm the Gmail readonly and Calendar readonly consent screen.",
    };
  }

  replaceCurrentWebCallbackUrl(cleanedLocation);
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
      tokenResult?.message?.trim() ||
      (tokenResult?.googleConnected
        ? "Signed in with Google. Gmail and Calendar are connected."
        : pendingIntent === "google"
          ? "Signed in with Google."
          : `Signed in with ${String(provider)}.`),
  };
}

export async function storeGoogleConnection(
  session: Session | null,
  pendingIntent?: OAuthIntent | null,
): Promise<ConnectionResult | null> {
  if (!supabase || !session?.provider_token) return null;
  if (!shouldStoreGoogleConnection(session, pendingIntent)) return null;
  const headers = await getFunctionAuthorizationHeaders(session.access_token);

  const { data, error } = await supabase.functions.invoke("store-google-connection", {
    ...(headers ? { headers } : {}),
    body: {
      providerAccessToken: session.provider_token,
      providerRefreshToken: session.provider_refresh_token,
      scopes: googleWorkspaceScopes,
    },
  });
  if (error) {
    return {
      ok: false,
      message: await describeFunctionError(
        error,
        "Google connection storage failed.",
      ),
    };
  }

  const warning = typeof data?.warning === "string" ? data.warning.trim() : "";
  if (data?.connected) {
    markGoogleWorkspaceSessionConnected();
  }
  return {
    ok: true,
    googleConnected: Boolean(data?.connected),
    message: warning
      ? warning
      : data?.refreshTokenStored
        ? "Google sign-in complete. Gmail and Calendar are connected for background sync."
        : "Google sign-in complete. Gmail and Calendar are connected for this session.",
  };
}

export function shouldStoreGoogleConnection(
  session: Pick<Session, "provider_token" | "user"> | null,
  pendingIntent?: OAuthIntent | null,
): boolean {
  if (!session?.provider_token) return false;
  if (pendingIntent === "google") return true;

  return (
    session.user.app_metadata.provider === "google" ||
    Boolean(session.user.app_metadata.providers?.includes("google")) ||
    Boolean(session.user.identities?.some((identity) => identity.provider === "google"))
  );
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

export function hasGoogleWorkspaceSessionFlag(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(googleWorkspaceSessionStorageKey) === "connected";
}

export function markGoogleWorkspaceSessionConnected(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(googleWorkspaceSessionStorageKey, "connected");
}

function clearGoogleWorkspaceSessionFlag(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(googleWorkspaceSessionStorageKey);
}

function isOAuthIntent(value: string | null): value is OAuthIntent {
  return value === "google" || value === "slack" || value === "whatsapp" || value === "microsoft" || value === "notion";
}

function buildGoogleOAuthOptions() {
  return {
    redirectTo: getOAuthRedirectUrl(),
    scopes: googleWorkspaceScopes.join(" "),
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

function buildPostAuthLocation(url: URL): string {
  return url.hash ? `/${url.hash}` : "/";
}

function replaceCurrentWebCallbackUrl(cleanedLocation: string): void {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.includes("/auth/callback")) return;
  window.history.replaceState({}, document.title, cleanedLocation);
}
