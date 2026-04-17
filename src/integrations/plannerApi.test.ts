import { describe, expect, it } from "vitest";
import { runDailyPlanner } from "./plannerApi";

describe("planner API client", () => {
  it("fails clearly until Supabase client env vars are configured", async () => {
    await expect(runDailyPlanner()).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("Supabase env vars"),
    });
  });
});
