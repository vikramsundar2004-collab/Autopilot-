import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  exchangeCodeForSessionMock,
  getFunctionAuthorizationHeadersMock,
  getSessionMock,
  invokeMock,
  linkIdentityMock,
  signInWithOAuthMock,
  signInWithOtpMock,
  signOutMock,
} = vi.hoisted(() => ({
  exchangeCodeForSessionMock: vi.fn(),
  getFunctionAuthorizationHeadersMock: vi.fn(),
  getSessionMock: vi.fn(),
  invokeMock: vi.fn(),
  linkIdentityMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("./functionAuth", () => ({
  getFunctionAuthorizationHeaders: getFunctionAuthorizationHeadersMock,
}));

vi.mock("./supabaseClient", () => ({
  getAppUrl: () => "http://127.0.0.1:5173",
  hasSupabaseConfig: true,
  supabase: {
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      getSession: getSessionMock,
      linkIdentity: linkIdentityMock,
      signInWithOAuth: signInWithOAuthMock,
      signInWithOtp: signInWithOtpMock,
      signOut: signOutMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

import {
  consumePendingOAuthIntent,
  rememberPendingOAuthIntent,
  shouldStoreGoogleConnection,
  startIntegrationConnection,
  storeGoogleConnection,
} from "./auth";

describe("auth integration helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    exchangeCodeForSessionMock.mockReset();
    getFunctionAuthorizationHeadersMock.mockReset();
    getSessionMock.mockReset();
    invokeMock.mockReset();
    linkIdentityMock.mockReset();
    signInWithOAuthMock.mockReset();
    signInWithOtpMock.mockReset();
    signOutMock.mockReset();

    getSessionMock.mockResolvedValue({ data: { session: null } });
    getFunctionAuthorizationHeadersMock.mockResolvedValue({
      Authorization: "Bearer supabase-access-token",
    });
    invokeMock.mockResolvedValue({
      data: { connected: true, refreshTokenStored: true },
      error: null,
    });
  });

  it("stores Google tokens for the single Google OAuth intent", () => {
    const session = {
      provider_token: "google-access-token",
      user: {
        app_metadata: {
          provider: "email",
        },
      },
    } as any;

    expect(shouldStoreGoogleConnection(session, "google")).toBe(true);
  });

  it("stores Google tokens when the session already identifies Google", () => {
    const session = {
      provider_token: "google-access-token",
      user: {
        app_metadata: {
          provider: "google",
        },
        identities: [{ provider: "google" }],
      },
    } as any;

    expect(shouldStoreGoogleConnection(session, null)).toBe(true);
  });

  it("passes the Supabase access token explicitly when storing Google tokens", async () => {
    const session = {
      access_token: "supabase-access-token",
      provider_token: "google-access-token",
      provider_refresh_token: "google-refresh-token",
      user: {
        app_metadata: {
          provider: "google",
        },
        identities: [{ provider: "google" }],
      },
    } as any;

    const result = await storeGoogleConnection(session, "google");

    expect(getFunctionAuthorizationHeadersMock).toHaveBeenCalledWith("supabase-access-token");
    expect(invokeMock).toHaveBeenCalledWith(
      "store-google-connection",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer supabase-access-token",
        },
        body: expect.objectContaining({
          providerAccessToken: "google-access-token",
          providerRefreshToken: "google-refresh-token",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        googleConnected: true,
      }),
    );
  });

  it("remembers and consumes the pending OAuth intent once", () => {
    rememberPendingOAuthIntent("google");

    expect(consumePendingOAuthIntent()).toBe("google");
    expect(consumePendingOAuthIntent()).toBeNull();
  });

  it("returns setup guidance for server-backed providers instead of pretending they can connect", async () => {
    const result = await startIntegrationConnection("microsoft");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/First step: Register an Azure app\./);
  });
});
