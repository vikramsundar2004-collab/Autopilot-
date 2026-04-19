export interface ParsedCalendarCommand {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractSenderEmails(input: string): string[] {
  const matches = input.match(emailPattern) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim().toLowerCase())));
}

export function isDraftCommand(query: string): boolean {
  const normalized = query.toLowerCase();
  return /\b(draft|reply)\b/.test(normalized);
}

export function isAiSenderBlockCommand(query: string): boolean {
  const normalized = query.toLowerCase();
  return (
    /\b(block|hide|private)\b/.test(normalized) ||
    /\b(?:do\s+not|don't|dont|never|stop)\s+(?:let\s+(?:the\s+)?ai\s+)?(?:read|use|show|see|process)\b/.test(
      normalized,
    ) ||
    /\b(?:keep|leave|exclude)\b[\s\S]{0,80}\b(?:out\s+of|away\s+from)\s+(?:the\s+)?ai\b/.test(
      normalized,
    )
  );
}

export function extractDraftSearchTerm(query: string): string {
  return query
    .replace(/\b(generate|make|create|write|show)\b/gi, "")
    .replace(/\b(a|an|the)\b/gi, "")
    .replace(/\b(reply|draft|email)\b/gi, "")
    .replace(/\bfor|to|about|from\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAssistantCalendarCommand(
  query: string,
  planningDate: string,
): ParsedCalendarCommand | null {
  const normalized = query.toLowerCase();
  if (!/\b(calendar|event|schedule|block|meeting)\b/.test(normalized)) return null;

  const timeMatch = query.match(
    /(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|-|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );

  if (!timeMatch) return null;

  const offset = normalized.includes("tomorrow") ? 1 : 0;
  const date = addDays(planningDate, offset);
  const startTime = toTwentyFourHour(timeMatch[1]!, timeMatch[2], timeMatch[3]!);
  const endMeridiem = inferEndMeridiem(timeMatch[1]!, timeMatch[3]!, timeMatch[4]!, timeMatch[6]);
  const endTime = toTwentyFourHour(timeMatch[4]!, timeMatch[5], endMeridiem);

  const title = query
    .replace(timeMatch[0], "")
    .replace(/\b(add|create|put|schedule|block)\b/gi, "")
    .replace(/\bcalendar|event|meeting|for|at\b/gi, "")
    .replace(/\btoday|tomorrow\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: title || "New calendar block",
    date,
    startTime,
    endTime,
  };
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00`);
  base.setDate(base.getDate() + days);
  return [
    base.getFullYear(),
    String(base.getMonth() + 1).padStart(2, "0"),
    String(base.getDate()).padStart(2, "0"),
  ].join("-");
}

function toTwentyFourHour(hoursPart: string, minutesPart: string | undefined, meridiem: string): string {
  let hours = Number(hoursPart) % 12;
  if (meridiem.toLowerCase() === "pm") {
    hours += 12;
  }
  const minutes = Number(minutesPart ?? "0");
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function inferEndMeridiem(
  startHoursPart: string,
  startMeridiem: string,
  endHoursPart: string,
  endMeridiem: string | undefined,
): string {
  if (endMeridiem) return endMeridiem;

  const startHours = Number(startHoursPart) % 12 || 12;
  const endHours = Number(endHoursPart) % 12 || 12;
  if (startMeridiem.toLowerCase() === "am" && endHours < startHours) {
    return "pm";
  }

  return startMeridiem;
}
