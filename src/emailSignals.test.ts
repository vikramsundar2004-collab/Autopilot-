import { describe, expect, it } from "vitest";
import { isVerificationActionLike, isVerificationEmailLike } from "./emailSignals";

describe("emailSignals", () => {
  it("filters verification and authentication code emails out of rankings", () => {
    expect(
      isVerificationEmailLike({
        subject: "[GitHub] Sudo email verification code",
        preview: "Please verify your identity. Here is your GitHub sudo authentication code.",
        from: "GitHub",
        senderEmail: "noreply@github.com",
        labels: ["IMPORTANT"],
      }),
    ).toBe(true);

    expect(
      isVerificationEmailLike({
        subject: "Verify Discord Login from New Location",
        preview: "Someone tried to log into your Discord account from a new location.",
        from: "Discord",
        senderEmail: "noreply@discord.com",
        labels: [],
      }),
    ).toBe(true);
  });

  it("does not mark ordinary customer work as verification mail", () => {
    expect(
      isVerificationEmailLike({
        subject: "Escalation from Northstar Health",
        preview: "They want a direct reply on the missing audit export.",
        from: "Priya Shah",
        senderEmail: "priya@northstarhealth.com",
        labels: ["customer"],
      }),
    ).toBe(false);
  });

  it("filters stale verification actions out of saved planner output", () => {
    expect(
      isVerificationActionLike({
        title: "Follow up on [GitHub] Sudo email verification code",
        detail: "Please verify your identity with the GitHub authentication code.",
        sourceSubject: "[GitHub] Sudo email verification code",
        sourceSenderEmail: "noreply@github.com",
        labels: ["urgent"],
      }),
    ).toBe(true);
  });
});
