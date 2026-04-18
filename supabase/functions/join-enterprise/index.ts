import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { getAuthenticatedUser } from "../_shared/auth.ts";

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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { user, error: authError } = await getAuthenticatedUser({
    supabaseUrl,
    supabaseAnonKey,
    authorization,
  });
  if (authError || !user) return json({ error: authError ?? "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
  const joinKey = String(body.joinKey ?? "").trim().toUpperCase();
  if (!joinKey) return json({ error: "Enter a valid enterprise key." }, 400);

  const organizationResult = await serviceClient
    .from("organizations")
    .select("id, name, plan, join_key, created_by, created_at, updated_at")
    .eq("join_key", joinKey)
    .maybeSingle();
  if (organizationResult.error) {
    return json({ error: organizationResult.error.message }, 400);
  }
  if (!organizationResult.data) {
    return json({ error: "No enterprise matched that key." }, 404);
  }

  const organization = organizationResult.data;
  const membershipResult = await serviceClient.from("organization_memberships").upsert(
    {
      organization_id: organization.id,
      user_id: user.id,
      role: "member",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" },
  );
  if (membershipResult.error) {
    return json({ error: membershipResult.error.message }, 400);
  }

  await serviceClient.from("audit_events").insert({
    user_id: user.id,
    organization_id: organization.id,
    actor_type: "user",
    action: "enterprise.joined",
    target_type: "organization",
    target_id: organization.id,
    metadata: {
      joinKey,
      email: user.email ?? null,
    },
  });

  return json({
    ok: true,
    message: `Joined ${organization.name}.`,
    organization,
  });
});

async function safeBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
