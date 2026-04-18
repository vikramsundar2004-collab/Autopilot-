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

  const { user, error: authError } = await getAuthenticatedUser({
    supabaseUrl,
    supabaseAnonKey,
    authorization,
  });
  if (authError || !user) return json({ error: authError ?? "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
  const name = String(body.name ?? "").trim();
  if (!name) return json({ error: "Enter a name for the enterprise." }, 400);
  if (name.length > 120) return json({ error: "Enterprise name must be 120 characters or fewer." }, 400);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const insertResult = await serviceClient
    .from("organizations")
    .insert({
      name,
      created_by: user.id,
      plan: "enterprise",
    })
    .select("id, name, plan, join_key, created_by, created_at, updated_at")
    .single();

  if (insertResult.error || !insertResult.data) {
    return json({ error: insertResult.error?.message ?? "Could not create the enterprise." }, 400);
  }

  await serviceClient.from("audit_events").insert({
    user_id: user.id,
    organization_id: insertResult.data.id,
    actor_type: "user",
    action: "enterprise.created",
    target_type: "organization",
    target_id: insertResult.data.id,
    metadata: {
      name,
      email: user.email ?? null,
    },
  });

  return json({
    ok: true,
    message: `Created ${name}.`,
    organization: insertResult.data,
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
