import { describe, expect, it } from "vitest";
import { runDailyPlanner } from "./plannerApi";

describe("planner API client", () => {
  it("fails without throwing when the planning API is unavailable", async () => {
    const result = await runDailyPlanner();
    expect(result.ok).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });
});
