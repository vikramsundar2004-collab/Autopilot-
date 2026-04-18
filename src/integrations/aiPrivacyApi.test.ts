import { describe, expect, it } from "vitest";
import { filterAiBlockedActions, filterAiBlockedEmails, normalizeSenderEmail } from "./aiPrivacyApi";

describe("AI privacy helpers", () => {
  it("normalizes sender emails for stable matching", () => {
    expect(normalizeSenderEmail("  Founder@Example.com ")).toBe("founder@example.com");
  });

  it("filters blocked emails out of the AI planning set", () => {
    const emails = [
      {
        id: "1",
        from: "Founder",
        senderEmail: "founder@example.com",
        role: "example",
        avatar: "",
        subject: "Private note",
        preview: "Keep this out of AI",
        receivedAt: "2026-04-17T10:00:00.000Z",
        priority: "high" as const,
        confidence: 90,
        effort: 15,
        impact: 8,
        category: "reply" as const,
        actionHint: "Reply",
        risk: "Sensitive",
        labels: [],
      },
      {
        id: "2",
        from: "Team",
        senderEmail: "team@example.com",
        role: "example",
        avatar: "",
        subject: "Roadmap",
        preview: "Please review",
        receivedAt: "2026-04-17T11:00:00.000Z",
        priority: "medium" as const,
        confidence: 82,
        effort: 20,
        impact: 5,
        category: "review" as const,
        actionHint: "Review",
        risk: "Fresh context",
        labels: [],
      },
    ];

    const allowed = filterAiBlockedEmails(emails, [
      {
        id: "block-1",
        provider: "google",
        senderEmail: "FOUNDER@example.com",
        reason: "Private sender",
      },
    ]);

    expect(allowed).toHaveLength(1);
    expect(allowed[0]?.id).toBe("2");
  });

  it("filters blocked action items using source sender email", () => {
    const actions = [
      {
        id: "task-1",
        sourceEmailId: "1",
        title: "Reply privately",
        detail: "Sensitive thread",
        source: "Founder",
        sourceRole: "example",
        sourceAvatar: "",
        sourceSubject: "Private note",
        sourceProvider: "google",
        sourceSenderEmail: "founder@example.com",
        receivedAt: "2026-04-17T10:00:00.000Z",
        priority: "high" as const,
        category: "reply" as const,
        status: "open" as const,
        confidence: 90,
        effort: 15,
        impact: 8,
        risk: "Sensitive",
        labels: [],
        rankScore: 88,
      },
      {
        id: "task-2",
        sourceEmailId: "2",
        title: "Review roadmap",
        detail: "Team thread",
        source: "Team",
        sourceRole: "example",
        sourceAvatar: "",
        sourceSubject: "Roadmap",
        sourceProvider: "google",
        sourceSenderEmail: "team@example.com",
        receivedAt: "2026-04-17T11:00:00.000Z",
        priority: "medium" as const,
        category: "review" as const,
        status: "open" as const,
        confidence: 84,
        effort: 20,
        impact: 5,
        risk: "Fresh context",
        labels: [],
        rankScore: 54,
      },
    ];

    const allowed = filterAiBlockedActions(actions, [
      {
        id: "block-1",
        provider: "google",
        senderEmail: "founder@example.com",
        reason: "Private sender",
      },
    ]);

    expect(allowed).toHaveLength(1);
    expect(allowed[0]?.id).toBe("task-2");
  });
});
