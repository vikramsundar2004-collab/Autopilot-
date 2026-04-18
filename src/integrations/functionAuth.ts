import { supabase } from "./supabaseClient";

export async function getFunctionAuthorizationHeaders(
  preferredAccessToken?: string | null,
): Promise<Record<string, string> | undefined> {
  const accessToken = await getSupabaseAccessToken(preferredAccessToken);
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
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
