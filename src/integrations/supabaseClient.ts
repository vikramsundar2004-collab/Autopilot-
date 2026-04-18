import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseAuthOptions = {
  detectSessionInUrl: false,
  flowType: "pkce" as const,
  persistSession: true,
};

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      // The app owns the /auth/callback exchange flow manually so it can support
      // browser and Capacitor deep-link callbacks without double-consuming the PKCE code.
      auth: supabaseAuthOptions,
    })
  : null;

export function getAppUrl(): string {
  const configuredUrl = import.meta.env.VITE_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  return window.location.origin;
}
