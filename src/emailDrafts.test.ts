import { describe, expect, it } from "vitest";
import { buildReplyDraft, deriveReplyDrafts, isAdLikeEmail, shouldDraftReplyForEmail } from "./emailDrafts";
import type { EmailMessage } from "./types";

function buildEmail(overrides: Partial<EmailMessage>): EmailMessage {
  return {
    id: "email-1",
    from: "Priya Shah",
    senderEmail: "priya@example.com",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/thread-1",
    role: "Customer success",
    avatar: "https://example.com/avatar.png",
    subject: "Escalation from Northstar Health",
    preview: "They want a direct reply on the missing audit export.",
    receivedAt: "2026-04-16T10:11:00-07:00",
    priority: "urgent",
    confidence: 90,
    effort: 25,
    impact: 9,
    category: "reply",
    actionHint: "Send a direct reply to Northstar Health",
    risk: "High-value customer feels ignored on an audit issue.",
    labels: ["IMPORTANT"],
    ...overrides,
  };
}

describe("emailDrafts", () => {
  it("builds reply drafts for important actionable email", () => {
    const draft = buildReplyDraft(buildEmail({}));

    expect(draft.subject).toBe("Re: Escalation from Northstar Health");
    expect(draft.body).toContain("Hi Priya,");
    expect(draft.body).toContain("I am preparing the direct reply now");
  });

  it("filters promotional mail out of reply drafting", () => {
    const promotional = buildEmail({
      id: "promo-1",
      subject: "Newsletter: 20% off analytics templates",
      preview: "Unsubscribe any time. Limited-time marketing offer.",
      priority: "high",
      labels: ["CATEGORY_PROMOTIONS", "newsletter"],
    });

    expect(isAdLikeEmail(promotional)).toBe(true);
    expect(shouldDraftReplyForEmail(promotional)).toBe(false);
    expect(deriveReplyDrafts([promotional])).toHaveLength(0);
  });

  it("keeps medium-priority FYI threads out of reply drafts", () => {
    const mediumThread = buildEmail({
      id: "medium-1",
      priority: "medium",
      impact: 5,
      labels: [],
      subject: "Homepage visuals ready for async review",
      preview: "No rush, but a decision this week helps us avoid another revision loop.",
      category: "review",
    });

    expect(shouldDraftReplyForEmail(mediumThread)).toBe(false);
  });

  it("returns drafts ordered by urgency", () => {
    const urgent = buildEmail({ id: "urgent-1", priority: "urgent", receivedAt: "2026-04-16T10:11:00-07:00" });
    const high = buildEmail({
      id: "high-1",
      priority: "high",
      subject: "Can we schedule the staff engineer loop?",
      preview: "The candidate can do Friday afternoon or Monday morning.",
      category: "schedule",
      receivedAt: "2026-04-16T09:03:00-07:00",
    });

    const drafts = deriveReplyDrafts([high, urgent]);

    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.sourceEmailId).toBe("urgent-1");
    expect(drafts[1]?.sourceEmailId).toBe("high-1");
  });
});
