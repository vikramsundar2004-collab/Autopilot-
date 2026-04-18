import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  describeFunctionErrorMock,
  getSessionMock,
  invokeEdgeFunctionMock,
} = vi.hoisted(() => ({
  describeFunctionErrorMock: vi.fn(),
  getSessionMock: vi.fn(),
  invokeEdgeFunctionMock: vi.fn(),
}));

vi.mock("./functionAuth", () => ({
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

vi.mock("./functionErrors", () => ({
  describeFunctionError: describeFunctionErrorMock,
}));

vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

import { createEnterpriseOrganization } from "./enterpriseApi";

describe("enterprise API client", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    invokeEdgeFunctionMock.mockReset();
    describeFunctionErrorMock.mockReset();

    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "supabase-access-token",
        },
      },
      error: null,
    });
  });

  it("calls the create-enterprise edge function with the signed-in access token", async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      data: {
        message: "Created Dad Team.",
        organization: {
          id: "org-1",
          name: "Dad Team",
          plan: "enterprise",
          join_key: "TEAM42SYNC",
          created_by: "user-1",
          created_at: "2026-04-18T12:00:00.000Z",
          updated_at: "2026-04-18T12:00:00.000Z",
        },
      },
      error: null,
    });

    const result = await createEnterpriseOrganization("Dad Team");

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith(
      "create-enterprise",
      expect.objectContaining({
        accessToken: "supabase-access-token",
        body: { name: "Dad Team" },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        message: "Created Dad Team.",
        data: expect.objectContaining({
          id: "org-1",
          name: "Dad Team",
          joinKey: "TEAM42SYNC",
        }),
      }),
    );
  });

  it("fails cleanly when there is no active Supabase session", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await createEnterpriseOrganization("Dad Team");

    expect(result).toEqual({
      ok: false,
      message: "Sign in before creating an enterprise.",
    });
    expect(invokeEdgeFunctionMock).not.toHaveBeenCalled();
  });
});
