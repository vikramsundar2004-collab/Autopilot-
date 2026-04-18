import { describe, expect, it } from "vitest";
import {
  extractDraftSearchTerm,
  extractSenderEmails,
  isDraftCommand,
  parseAssistantCalendarCommand,
} from "./assistantCommands";

describe("assistantCommands", () => {
  it("extracts unique sender emails from freeform input", () => {
    expect(
      extractSenderEmails("block finance@example.com, Finance@example.com and payroll@example.com"),
    ).toEqual(["finance@example.com", "payroll@example.com"]);
  });

  it("detects draft commands and strips the search term", () => {
    expect(isDraftCommand("Generate a draft reply for Northstar")).toBe(true);
    expect(extractDraftSearchTerm("Generate a draft reply for Northstar")).toBe("Northstar");
  });

  it("parses calendar commands with tomorrow and a time range", () => {
    expect(
      parseAssistantCalendarCommand("Add calendar Deep work tomorrow 3pm to 4:30pm", "2026-04-17"),
    ).toEqual({
      title: "Deep work",
      date: "2026-04-18",
      startTime: "15:00",
      endTime: "16:30",
    });
  });
});
