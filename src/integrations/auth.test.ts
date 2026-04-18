import { beforeEach, describe, expect, it } from "vitest";
import {
  consumePendingOAuthIntent,
  rememberPendingOAuthIntent,
  startIntegrationConnection,
  shouldStoreGoogleConnection,
} from "./auth";

describe("auth integration helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores Google tokens only for the workspace-connect OAuth intent", () => {
    const session = {
      provider_token: "google-access-token",
      user: {
        app_metadata: {
          provider: "email",
        },
      },
    } as any;

    expect(shouldStoreGoogleConnection(session, "google-workspace")).toBe(true);
  });

  it("does not store workspace tokens for plain Google sign-in", () => {
    const session = {
      provider_token: "google-access-token",
      user: {
        app_metadata: {
          provider: "google",
        },
      },
    } as any;

    expect(shouldStoreGoogleConnection(session, "google-login")).toBe(false);
  });

  it("remembers and consumes the pending OAuth intent once", () => {
    rememberPendingOAuthIntent("google-workspace");

    expect(consumePendingOAuthIntent()).toBe("google-workspace");
    expect(consumePendingOAuthIntent()).toBeNull();
  });

  it("returns setup guidance for server-backed providers instead of pretending they can connect", async () => {
    const result = await startIntegrationConnection("microsoft");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/First step: Register an Azure app\./);
  });
});
