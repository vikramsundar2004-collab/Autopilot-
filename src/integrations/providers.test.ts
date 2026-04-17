import { describe, expect, it } from "vitest";
import {
  getConnectionReadiness,
  getProviderByKey,
  googleScopes,
  integrationProviders,
} from "./providers";

describe("integration provider registry", () => {
  it("keeps Google scoped to read-only Gmail and Calendar access", () => {
    expect(googleScopes).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(googleScopes).toContain(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
    expect(googleScopes).not.toContain("https://mail.google.com/");
  });

  it("marks WhatsApp as server-only so tokens are not requested in the browser", () => {
    const provider = getProviderByKey("whatsapp");

    expect(provider.serverRequired).toBe(true);
    expect(getConnectionReadiness(provider, true)).toBe("needs-server");
  });

  it("keeps the provider list extensible", () => {
    expect(integrationProviders.map((provider) => provider.key)).toEqual([
      "google",
      "slack",
      "whatsapp",
      "microsoft",
      "notion",
    ]);
  });
});
