import { describe, expect, it } from "vitest";
import { syncGoogleWorkspace } from "./workspaceSyncApi";

describe("workspace sync API client", () => {
  it("fails without throwing when Google sync is unavailable", async () => {
    const result = await syncGoogleWorkspace();
    expect(result.ok).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });
});
