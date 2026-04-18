import { describe, expect, it } from "vitest";
import { supabaseAuthOptions } from "./supabaseClient";

describe("supabase auth client config", () => {
  it("keeps callback exchange manual so PKCE is not consumed twice", () => {
    expect(supabaseAuthOptions.detectSessionInUrl).toBe(false);
    expect(supabaseAuthOptions.flowType).toBe("pkce");
    expect(supabaseAuthOptions.persistSession).toBe(true);
  });
});
