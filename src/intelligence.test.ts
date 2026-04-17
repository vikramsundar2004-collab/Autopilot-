import { describe, expect, it } from "vitest";
import { demoCalendar, demoDate, demoEmails } from "./data";
import {
  buildDailyPlan,
  deriveActionItems,
  formatDueLabel,
  getDueBoost,
  rankActionItems,
} from "./intelligence";

describe("email intelligence", () => {
  it("turns action-oriented emails into explainable tasks", () => {
    const tasks = deriveActionItems(demoEmails, demoDate);
    const customerTask = tasks.find((task) => task.sourceEmailId === "email-customer");

    expect(tasks).toHaveLength(demoEmails.length);
    expect(customerTask).toMatchObject({
      title: "Send a direct reply to Northstar Health",
      priority: "urgent",
      source: "Priya Shah",
      status: "open",
    });
    expect(customerTask?.risk).toContain("High-value customer");
  });

  it("keeps waiting items visible but ranked below active work", () => {
    const tasks = rankActionItems(deriveActionItems(demoEmails, demoDate));
    const waitingIndex = tasks.findIndex((task) => task.status === "waiting");
    const firstDoneOrWaitingIndex = tasks.findIndex((task) => task.status !== "open");

    expect(waitingIndex).toBe(firstDoneOrWaitingIndex);
    expect(tasks[0].status).toBe("open");
  });

  it("boosts work due today more than work due later", () => {
    expect(getDueBoost("2026-04-16T17:00:00-07:00", demoDate)).toBeGreaterThan(
      getDueBoost("2026-04-18T17:00:00-07:00", demoDate),
    );
  });

  it("builds a calendar-aware plan with rescue work left over", () => {
    const tasks = deriveActionItems(demoEmails, demoDate);
    const plan = buildDailyPlan(tasks, demoCalendar, demoDate);

    expect(plan.focusWindows.length).toBeGreaterThan(0);
    expect(plan.focusWindows.some((window) => window.assignedTaskIds.length > 0)).toBe(
      true,
    );
    expect(plan.rescuePlan.length).toBeGreaterThan(0);
  });

  it("formats due dates in user-facing language", () => {
    expect(formatDueLabel("2026-04-16T17:00:00-07:00", demoDate)).toContain("Today");
    expect(formatDueLabel(undefined, demoDate)).toBe("No deadline");
  });
});
