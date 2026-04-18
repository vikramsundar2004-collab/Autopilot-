import { getAuthenticatedUser } from "../_shared/auth.ts";

type DraftTheme = "direct" | "warm" | "executive";
type Priority = "urgent" | "high" | "medium" | "low";
type Category = "reply" | "review" | "schedule" | "send" | "approve" | "follow-up";

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
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Missing Supabase env." }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Missing bearer token." }, 401);

  const { user, error: authError } = await getAuthenticatedUser({
    supabaseUrl,
    supabaseAnonKey,
    authorization,
  });
  if (authError || !user) return json({ error: authError ?? "Invalid Supabase session." }, 401);

  const body = await safeBody(req);
  const theme = normalizeTheme(body.theme);
  const emails = Array.isArray(body.emails) ? body.emails.map(sanitizeEmail).filter(Boolean) : [];
  if (emails.length === 0) {
    return json({ source: "fallback", message: "No important email was provided for draft generation.", drafts: [] });
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_PLANNER_MODEL") ?? "gpt-5.4";
  if (!openAiKey) {
    return json({
      source: "fallback",
      message: "OPENAI_API_KEY is not configured. Returning fallback reply drafts.",
      drafts: fallbackDrafts(emails, theme),
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You write reply drafts for Autopilot-AI. Use only the provided email context. Be concise, professional, and safe. Never claim the work is already complete if the source email does not say that. Keep each reply editable by a human and do not promise actions you cannot verify.",
          },
          {
            role: "user",
            content: JSON.stringify({
              theme,
              emails,
              instructions: [
                "Write one reply draft per email.",
                "Return subject, body, and one short reason.",
                "Respect the theme: direct, warm, or executive.",
                "Do not include markdown.",
              ],
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "autopilot_email_drafts",
            schema: draftSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }

    const raw = await response.json();
    const parsed = JSON.parse(extractText(raw));
    return json({
      source: "openai",
      message: "Reply drafts generated with the API.",
      drafts: normalizeDrafts(parsed?.drafts ?? [], emails, theme),
    });
  } catch (error) {
    return json({
      source: "fallback",
      message: error instanceof Error ? error.message : "OpenAI draft generation failed.",
      drafts: fallbackDrafts(emails, theme),
    });
  }
});

async function safeBody(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function sanitizeEmail(raw: any) {
  const id = String(raw?.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    from: limit(String(raw?.from ?? "there"), 120),
    senderEmail: raw?.senderEmail ? limit(String(raw.senderEmail), 160) : null,
    subject: limit(String(raw?.subject ?? "Untitled thread"), 200),
    preview: limit(String(raw?.preview ?? ""), 400),
    priority: normalizePriority(raw?.priority),
    category: normalizeCategory(raw?.category),
    actionHint: limit(String(raw?.actionHint ?? ""), 180),
    labels: Array.isArray(raw?.labels) ? raw.labels.map(String).slice(0, 8) : [],
  };
}

function fallbackDrafts(emails: any[], theme: DraftTheme) {
  return emails.map((email) => ({
    sourceMessageId: email.id,
    subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`,
    reason: `Fallback ${theme} draft for ${email.priority} priority email.`,
    body: [
      `Hi ${firstName(email.from)},`,
      "",
      `Thanks for the note about "${email.subject}".`,
      buildFallbackLine(email.category, theme),
      "",
      buildSignOff(theme),
      "[Your name]",
    ].join("\n"),
  }));
}

function normalizeDrafts(drafts: any[], emails: any[], theme: DraftTheme) {
  const emailById = new Map(emails.map((email) => [email.id, email]));
  return drafts
    .map((draft) => {
      const sourceMessageId = String(draft?.sourceMessageId ?? "").trim();
      const email = emailById.get(sourceMessageId);
      if (!sourceMessageId || !email) return null;
      return {
        sourceMessageId,
        subject: limit(
          String(draft?.subject ?? `Re: ${email.subject}`),
          220,
        ),
        body: limit(
          String(draft?.body ?? fallbackDrafts([email], theme)[0].body),
          1800,
        ),
        reason: limit(
          String(draft?.reason ?? `API ${theme} draft for ${email.priority} priority email.`),
          180,
        ),
      };
    })
    .filter(Boolean);
}

function extractText(raw: any): string {
  if (typeof raw.output_text === "string") return raw.output_text;
  for (const item of raw.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") return part.text;
    }
  }
  throw new Error("OpenAI response did not include text.");
}

function firstName(sender: string) {
  return sender.trim().split(/\s+/)[0] || "there";
}

function buildFallbackLine(category: Category, theme: DraftTheme) {
  const direct = {
    approve: "I am reviewing the request and I will send the decision back shortly.",
    "follow-up": "I am handling the next step and I will follow up with a clear update shortly.",
    reply: "I am preparing the direct reply now and I will send the next update shortly.",
    review: "I am reviewing the material now and I will send feedback shortly.",
    schedule: "I am checking the calendar options now and I will send back the best time shortly.",
    send: "I am getting the requested material together now and I will send it shortly.",
  };
  const warm = {
    approve: "I am reviewing the request now, and I will send a clear decision as soon as I finish.",
    "follow-up": "I am on it, and I will follow up with a useful update as soon as I have it.",
    reply: "I am pulling the details together now, and I will send a direct reply shortly.",
    review: "I am reviewing this now, and I will send thoughtful feedback shortly.",
    schedule: "I am checking the schedule now, and I will send back the best options shortly.",
    send: "I am getting this ready now, and I will send it over shortly.",
  };
  const executive = {
    approve: "I am reviewing the request now and will return a decision once the final check is complete.",
    "follow-up": "I am taking the next step now and will return with a concrete status update shortly.",
    reply: "I am preparing the response now and will send a precise update shortly.",
    review: "I am reviewing the material now and will return focused feedback shortly.",
    schedule: "I am checking the calendar constraints now and will send the best slot shortly.",
    send: "I am preparing the requested material now and will send it shortly.",
  };

  return (theme === "warm" ? warm : theme === "executive" ? executive : direct)[category];
}

function buildSignOff(theme: DraftTheme) {
  if (theme === "warm") return "Thanks,";
  if (theme === "executive") return "Regards,";
  return "Best,";
}

function normalizeTheme(value: unknown): DraftTheme {
  return value === "warm" || value === "executive" ? value : "direct";
}

function normalizePriority(value: unknown): Priority {
  return value === "urgent" || value === "high" || value === "low" ? value : "medium";
}

function normalizeCategory(value: unknown): Category {
  return value === "reply" || value === "review" || value === "schedule" || value === "send" || value === "approve"
    ? value
    : "follow-up";
}

function limit(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const draftSchema = {
  type: "object",
  required: ["drafts"],
  additionalProperties: false,
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        required: ["sourceMessageId", "subject", "body", "reason"],
        additionalProperties: false,
        properties: {
          sourceMessageId: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
};
