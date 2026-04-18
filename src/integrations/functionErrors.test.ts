import { describe, expect, it } from "vitest";
import { describeFunctionError } from "./functionErrors";

describe("function error helper", () => {
  it("reads the structured edge-function payload when present", async () => {
    const message = await describeFunctionError(
      {
        context: {
          clone() {
            return this;
          },
          async json() {
            return { error: "provider_token_vault relation is missing" };
          },
        },
      },
      "fallback",
    );

    expect(message).toContain("provider_token_vault");
  });

  it("falls back to plain error text when no response payload exists", async () => {
    const message = await describeFunctionError(new Error("boom"), "fallback");

    expect(message).toBe("boom");
  });
});
