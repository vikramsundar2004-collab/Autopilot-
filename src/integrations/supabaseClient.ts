import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
      },
    })
  : null;

export function getAppUrl(): string {
  const configuredUrl = import.meta.env.VITE_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  return window.location.origin;
}
