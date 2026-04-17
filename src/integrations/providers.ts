import type { Provider } from "@supabase/supabase-js";

export type IntegrationKey =
  | "google"
  | "slack"
  | "whatsapp"
  | "microsoft"
  | "notion";

export type IntegrationAuthKind =
  | "supabase-oauth"
  | "server-oauth"
  | "server-api";

export interface IntegrationProvider {
  key: IntegrationKey;
  name: string;
  shortName: string;
  authKind: IntegrationAuthKind;
  supabaseProvider?: Provider;
  summary: string;
  usefulFor: string[];
  scopes: string[];
  requiredSetup: string[];
  serverRequired: boolean;
  accent: "green" | "coral" | "yellow" | "blue" | "ink";
}

export const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

export const integrationProviders: IntegrationProvider[] = [
  {
    key: "google",
    name: "Google Workspace",
    shortName: "Google",
    authKind: "supabase-oauth",
    supabaseProvider: "google",
    summary: "Gmail tasks, Calendar events, deadlines, and meeting context.",
    usefulFor: ["Gmail", "Google Calendar", "account sign-in"],
    scopes: [...googleScopes],
    requiredSetup: [
      "Create a Supabase project and add the public URL and anon key to .env.",
      "Create a Google OAuth web client.",
      "Enable the Google provider in Supabase Auth.",
      "Add Gmail and Calendar scopes to the Google consent screen.",
    ],
    serverRequired: false,
    accent: "green",
  },
  {
    key: "slack",
    name: "Slack Workspace",
    shortName: "Slack",
    authKind: "supabase-oauth",
    supabaseProvider: "slack_oidc",
    summary: "Workspace identity now, message ingestion later through a backend OAuth install.",
    usefulFor: ["identity", "channels", "direct messages"],
    scopes: ["openid", "profile", "email"],
    requiredSetup: [
      "Create a Slack app with Slack OIDC sign-in.",
      "Add the Supabase callback URL to Slack OAuth redirect URLs.",
      "Enable Slack OIDC in Supabase Auth.",
      "For channel messages, add a backend OAuth flow with Slack message scopes.",
    ],
    serverRequired: false,
    accent: "yellow",
  },
  {
    key: "whatsapp",
    name: "WhatsApp Business",
    shortName: "WhatsApp",
    authKind: "server-api",
    summary: "Customer messages and reminders through Meta's WhatsApp Business Platform.",
    usefulFor: ["customer messages", "message templates", "webhooks"],
    scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
    requiredSetup: [
      "Create a Meta app with WhatsApp Business Platform enabled.",
      "Create or connect a WhatsApp Business Account.",
      "Generate a system-user access token server-side.",
      "Add a webhook endpoint that validates Meta signatures before ingesting messages.",
    ],
    serverRequired: true,
    accent: "coral",
  },
  {
    key: "microsoft",
    name: "Microsoft 365",
    shortName: "Microsoft",
    authKind: "server-oauth",
    summary: "Outlook mail and calendar for teams outside Google Workspace.",
    usefulFor: ["Outlook", "Microsoft Calendar", "Teams later"],
    scopes: ["Mail.Read", "Calendars.Read", "offline_access"],
    requiredSetup: [
      "Register an Azure app.",
      "Add a backend token exchange route.",
      "Store refresh tokens in Supabase with row-level security.",
    ],
    serverRequired: true,
    accent: "blue",
  },
  {
    key: "notion",
    name: "Notion",
    shortName: "Notion",
    authKind: "server-oauth",
    summary: "Project docs, decisions, and follow-up databases.",
    usefulFor: ["docs", "tasks", "decision logs"],
    scopes: ["read_content", "read_user"],
    requiredSetup: [
      "Create a Notion integration.",
      "Add backend OAuth callback handling.",
      "Map selected workspaces and databases to task sources.",
    ],
    serverRequired: true,
    accent: "ink",
  },
];

export function getProviderByKey(key: IntegrationKey): IntegrationProvider {
  const provider = integrationProviders.find((candidate) => candidate.key === key);
  if (!provider) {
    throw new Error(`Unknown integration provider: ${key}`);
  }
  return provider;
}

export function getConnectionReadiness(
  provider: IntegrationProvider,
  hasSupabaseConfig: boolean,
): "ready" | "needs-supabase" | "needs-server" {
  if (provider.serverRequired) return "needs-server";
  if (!hasSupabaseConfig) return "needs-supabase";
  return "ready";
}
