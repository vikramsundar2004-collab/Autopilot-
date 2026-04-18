import { describe, expect, it } from "vitest";
import {
  buildLocalDayRange,
  buildSourceBackedActionHint,
  isActionableEmailMessage,
  mapEmailRowToMessage,
  mapEmailRowsToMessages,
} from "./workspaceData";

describe("workspaceData", () => {
  it("builds source-backed action hints from real message subjects", () => {
    expect(buildSourceBackedActionHint("Approval needed: analytics renewal", "approve")).toBe(
      "Approve: Approval needed: analytics renewal",
    );
    expect(
      buildSourceBackedActionHint("Waiting on staging logs", "follow-up", "Victor"),
    ).toBe("Track waiting thread: Waiting on staging logs");
  });

  it("maps email rows without inventing non-source-backed task titles", () => {
    const message = mapEmailRowToMessage(
      {
        id: "row-1",
        provider: "google",
        provider_message_id: "message-1",
        thread_id: "thread-1",
        from_name: "Noah Patel",
        from_email: "noah@company.com",
        subject: "Approval needed: analytics renewal",
        snippet: "Renewal discount expires today. Please approve the analytics renewal.",
        body_preview: null,
        received_at: "2026-04-17T08:00:00.000Z",
        labels: ["IMPORTANT"],
        importance: "high",
      },
      "2026-04-17",
    );

    expect(message.actionHint).toBe("Approve: Approval needed: analytics renewal");
    expect(message.risk).toContain("Source-backed");
    expect(message.priority).toBe("high");
  });

  it("marks waiting threads as waiting instead of pretending they are ready to execute", () => {
    const [message] = mapEmailRowsToMessages(
      [
        {
          id: "row-2",
          provider: "google",
          provider_message_id: "message-2",
          thread_id: "thread-2",
          from_name: "Victor Hall",
          from_email: "victor@company.com",
          subject: "Waiting on staging logs",
          snippet: "I will send the staging logs once the deploy finishes. Nothing for you until that lands.",
          body_preview: null,
          received_at: "2026-04-17T10:00:00.000Z",
          labels: [],
          importance: "normal",
        },
      ],
      "2026-04-17",
    );

    expect(message.waitingOn).toBe("Victor Hall");
    expect(message.actionHint).toBe("Track waiting thread: Waiting on staging logs");
  });

  it("filters out FYI-only email rows so the action list stays source-backed and conservative", () => {
    const messages = mapEmailRowsToMessages(
      [
        {
          id: "row-3",
          provider: "google",
          provider_message_id: "message-3",
          thread_id: "thread-3",
          from_name: "Ops Digest",
          from_email: "digest@company.com",
          subject: "FYI: system status weekly digest",
          snippet: "No action needed. Sharing the weekly digest for visibility.",
          body_preview: null,
          received_at: "2026-04-17T10:00:00.000Z",
          labels: [],
          importance: "normal",
        },
      ],
      "2026-04-17",
    );

    expect(messages).toHaveLength(0);
  });

  it("keeps explicit requests actionable even when they are phrased as follow-ups", () => {
    expect(
      isActionableEmailMessage({
        id: "message-4",
        from: "Alex",
        role: "ops",
        avatar: "",
        subject: "Follow up on vendor insurance",
        preview: "Please let me know whether we can approve this today.",
        receivedAt: "2026-04-17T10:00:00.000Z",
        priority: "medium",
        confidence: 90,
        effort: 15,
        impact: 5,
        category: "follow-up",
        actionHint: "Follow up on: vendor insurance",
        risk: "",
        labels: [],
      }),
    ).toBe(true);
  });

  it("builds local day ranges using local midnight instead of UTC midnight", () => {
    const range = buildLocalDayRange("2026-04-17");

    expect(range.dayStartIso).toBe(new Date("2026-04-17T00:00:00").toISOString());
    expect(range.dayEndIso).toBe(new Date("2026-04-18T00:00:00").toISOString());
    expect(new Date(range.dayEndIso).getTime() - new Date(range.dayStartIso).getTime()).toBe(
      86_400_000,
    );
  });
});
