import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase function env." }, 500);
  }
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Missing bearer token." }, 401);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
  const accessToken = typeof body.providerAccessToken === "string" ? body.providerAccessToken : "";
  const refreshToken = typeof body.providerRefreshToken === "string" ? body.providerRefreshToken : "";
  if (!accessToken && !refreshToken) {
    return json({ error: "No Google provider token was available to store." }, 400);
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : null;
  if (organizationId) {
    const { data: membership, error: membershipError } = await userClient
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membershipError || !membership) {
      return json({ error: "You are not a member of this organization." }, 403);
    }
  }

  const providerUserId = authData.user.email ?? authData.user.id;
  const accessTokenExpiresAt = new Date(Date.now() + 55 * 60_000).toISOString();
  const warnings: string[] = [];
  let tokenStored = false;

  try {
    const accessTokenCiphertext = accessToken ? await encryptToken(accessToken) : null;
    const refreshTokenCiphertext = refreshToken ? await encryptToken(refreshToken) : undefined;
    const vaultRow: Record<string, unknown> = {
      user_id: authData.user.id,
      organization_id: organizationId,
      provider: "google",
      provider_user_id: providerUserId,
      access_token_ciphertext: accessTokenCiphertext,
      access_token_expires_at: accessToken ? accessTokenExpiresAt : null,
      scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : googleScopes,
      status: "connected",
      updated_at: new Date().toISOString(),
    };
    if (refreshTokenCiphertext) vaultRow.refresh_token_ciphertext = refreshTokenCiphertext;

    const { error: vaultError } = await serviceClient
      .from("provider_token_vault")
      .upsert(vaultRow, { onConflict: "user_id,provider,provider_user_id" });
    if (vaultError) {
      warnings.push(`Google token storage is unavailable: ${vaultError.message}`);
    } else {
      tokenStored = true;
    }
  } catch (error) {
    warnings.push(
      `Google token storage is unavailable: ${error instanceof Error ? error.message : "Could not encrypt Google token."}`,
    );
  }

  let metadataStored = false;
  const { error: metadataError } = await serviceClient.from("connected_accounts").upsert(
    {
      user_id: authData.user.id,
      organization_id: organizationId,
      provider: "google",
      provider_user_id: providerUserId,
      scopes: googleScopes,
      status: "connected",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider,provider_user_id" },
  );
  if (metadataError) {
    warnings.push(`Google connection metadata could not be saved: ${metadataError.message}`);
  } else {
    metadataStored = true;
  }

  await serviceClient.from("audit_events").insert({
    user_id: authData.user.id,
    organization_id: organizationId,
    actor_type: "system",
    action: refreshToken ? "google_connection.stored_refresh_token" : "google_connection.stored_access_token",
    target_type: "connected_account",
    target_id: "google",
    metadata: {
      hasRefreshToken: Boolean(refreshToken),
      hasAccessToken: Boolean(accessToken),
      tokenStored,
      metadataStored,
      warnings,
    },
  });

  const warning = warnings.join(" ").trim() || null;

  return json({
    ok: true,
    connected: true,
    refreshTokenStored: tokenStored && Boolean(refreshToken),
    accessTokenStored: tokenStored && Boolean(accessToken),
    tokenStored,
    metadataStored,
    warning,
  });
});

async function safeBody(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function encryptToken(value: string) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function encryptionKey() {
  const secret = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set to at least 32 characters.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
