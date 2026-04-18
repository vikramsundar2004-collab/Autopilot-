import { supabase } from "./supabaseClient";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export async function getFunctionAuthorizationHeaders(
  preferredAccessToken?: string | null,
): Promise<Record<string, string> | undefined> {
  const accessToken = await getSupabaseAccessToken(preferredAccessToken);
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options: {
    body?: unknown;
    accessToken?: string | null;
    headers?: Record<string, string>;
    method?: "POST" | "GET" | "DELETE";
  } = {},
): Promise<{ data: T | null; error: unknown }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      data: null,
      error: new Error("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before calling Edge Functions."),
    };
  }

  const accessToken = await getSupabaseAccessToken(options.accessToken);
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error("Edge Function request failed.");
  });

  if (!response.ok) {
    return {
      data: null,
      error: { context: response },
    };
  }

  const contentType = response.headers.get("Content-Type")?.split(";")[0].trim();
  if (contentType === "application/json") {
    return {
      data: (await response.json()) as T,
      error: null,
    };
  }

  return {
    data: (await response.text()) as T,
    error: null,
  };
}

async function getSupabaseAccessToken(
  preferredAccessToken?: string | null,
): Promise<string | null> {
  const explicitToken = preferredAccessToken?.trim();
  if (explicitToken) return explicitToken;
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) return null;

  const sessionToken = data.session?.access_token?.trim();
  return sessionToken || null;
}
