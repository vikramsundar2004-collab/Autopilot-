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
  const response = await fetch(`${input.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: input.supabaseAnonKey,
      Authorization: input.authorization,
    },
  });

  if (!response.ok) {
    let message = `Invalid Supabase session (${response.status}).`;
    try {
      const payload = await response.json();
      if (typeof payload?.msg === "string" && payload.msg.trim()) {
        message = payload.msg.trim();
      } else if (typeof payload?.message === "string" && payload.message.trim()) {
        message = payload.message.trim();
      } else if (typeof payload?.error === "string" && payload.error.trim()) {
        message = payload.error.trim();
      }
    } catch {
      // Ignore JSON parse failures and fall back to the generic session message.
    }
    return { user: null, error: message };
  }

  const user = await response.json();
  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    return { user: null, error: "Invalid Supabase session." };
  }

  return { user, error: null };
}
