import { describe, expect, it } from "vitest";
import { getFunctionAuthorizationHeaders } from "./functionAuth";

describe("function auth helpers", () => {
  it("builds an authorization header from an explicit Supabase access token", async () => {
    await expect(getFunctionAuthorizationHeaders("supabase-access-token")).resolves.toEqual({
      Authorization: "Bearer supabase-access-token",
    });
  });

  it("returns undefined when there is no available Supabase access token", async () => {
    await expect(getFunctionAuthorizationHeaders()).resolves.toBeUndefined();
  });
});
