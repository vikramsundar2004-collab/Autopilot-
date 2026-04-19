import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type AuthResult =
  | { user: AuthenticatedUser; error: null }
  | { user: null; error: string };

export async function getAuthenticatedUser(input: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authorization: string;
}): Promise<AuthResult> {
  const token = input.authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { user: null, error: "Missing bearer token." };
  }

  const authClient = createClient(input.supabaseUrl, input.supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const claimsResult = await authClient.auth.getClaims(token);
  if (claimsResult.error) {
    return { user: null, error: claimsResult.error.message.trim() || "Invalid Supabase session." };
  }

  const claims = claimsResult.data?.claims;
  const user = claims ? mapClaimsToAuthenticatedUser(claims as Record<string, unknown>) : null;
  if (!user) {
    return { user: null, error: "Invalid Supabase session." };
  }

  return { user, error: null };
}

function mapClaimsToAuthenticatedUser(claims: Record<string, unknown>): AuthenticatedUser | null {
  const id = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!id) return null;

  const appMetadata =
    claims.app_metadata && typeof claims.app_metadata === "object"
      ? (claims.app_metadata as Record<string, unknown>)
      : undefined;
  const userMetadata =
    claims.user_metadata && typeof claims.user_metadata === "object"
      ? (claims.user_metadata as Record<string, unknown>)
      : undefined;

  return {
    id,
    email: typeof claims.email === "string" ? claims.email : null,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  };
}
