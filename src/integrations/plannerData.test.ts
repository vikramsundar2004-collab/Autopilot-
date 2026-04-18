import { describe, expect, it } from "vitest";
import { mapActionItemRow, mapScheduleBlockRow } from "./plannerData";

describe("planner data mapping", () => {
  it("maps stored planner actions into app action items", () => {
    const item = mapActionItemRow({
      id: "action-1",
      source_external_id: "gmail-1",
      source_provider: "google",
      source_subject: "Board follow-up",
      source_url: "https://mail.google.com/mail/u/0/#inbox/thread-123",
      source_sender_name: "Avery",
      source_sender_email: "avery@example.com",
      title: "Reply to Board follow-up",
      detail: "Confirm the timeline",
      due_at: "2026-04-17T17:00:00.000Z",
      priority: "high",
      category: "reply",
      status: "open",
      confidence: 92,
      effort_minutes: 20,
      impact: 8,
      risk: "Missing this could block the board update.",
      labels: ["reply", "high"],
      rank_score: 77,
      requires_approval: true,
      created_at: "2026-04-17T09:30:00.000Z",
    });

    expect(item.sourceSenderEmail).toBe("avery@example.com");
    expect(item.source).toBe("Avery");
    expect(item.sourceUrl).toBe("https://mail.google.com/mail/u/0/#inbox/thread-123");
    expect(item.requiresApproval).toBe(true);
    expect(item.effort).toBe(20);
  });

  it("maps stored planner blocks into read-only calendar events", () => {
    const block = mapScheduleBlockRow({
      id: "block-1",
      title: "2 priority actions",
      detail: "Reply to Board follow-up; Review renewal",
      start_at: "2026-04-17T15:00:00.000Z",
      end_at: "2026-04-17T15:45:00.000Z",
      block_type: "overflow",
    });

    expect(block.id).toBe("planner-block-1");
    expect(block.type).toBe("focus");
    expect(block.editable).toBe(false);
  });
});
