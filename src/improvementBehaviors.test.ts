import { describe, expect, it } from "vitest";
import {
  buildBehaviorActions,
  getRoleRecommendation,
  surfaceOrder,
} from "./improvementBehaviors";
import { capabilityOrder } from "./improvements";

describe("improvement behavior mapping", () => {
  it("turns every generated behavior family into an executable action", () => {
    const actions = buildBehaviorActions("templates", "personalized", "operator");

    expect(actions).toHaveLength(capabilityOrder.length);
    expect(actions.map((action) => action.capability)).toEqual(capabilityOrder);
    expect(actions[0].detail).toContain("Personalized recommendation");
  });

  it("keeps role-aware recommendations distinct", () => {
    expect(getRoleRecommendation("dashboard", "operator")).not.toEqual(
      getRoleRecommendation("dashboard", "founder"),
    );
  });

  it("covers every generated work surface", () => {
    expect(surfaceOrder).toEqual([
      "templates",
      "onboarding",
      "workspace",
      "checklist",
      "dashboard",
      "assistant",
      "history",
      "reminders",
      "search",
      "feed",
    ]);
  });
});
