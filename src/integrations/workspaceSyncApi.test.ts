import { describe, expect, it } from "vitest";
import { syncGoogleWorkspace } from "./workspaceSyncApi";

describe("workspace sync API client", () => {
  it("fails clearly until Supabase client env vars are configured", async () => {
    await expect(syncGoogleWorkspace()).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("Supabase env vars"),
    });
  });
});
