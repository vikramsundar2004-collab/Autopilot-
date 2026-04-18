import type { CalendarEvent, CalendarEventType } from "./types";

const CALENDAR_STORAGE_KEY = "autopilot-ai-manual-calendar-events";

interface CalendarEventRecord {
  id: string;
  title: string;
  start: string;
  end: string;
  type: CalendarEventType;
  provider?: string;
  editable?: boolean;
  location?: string;
  attendees?: string[];
  description?: string;
}

export function loadManualCalendarEvents(): CalendarEvent[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeCalendarEvent)
      .filter((event): event is CalendarEvent => Boolean(event));
  } catch {
    return [];
  }
}

export function saveManualCalendarEvents(events: CalendarEvent[]): void {
  if (typeof window === "undefined") return;

  const serializable = events
    .filter((event) => event.provider === "manual" || event.editable)
    .map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      type: event.type,
      provider: "manual",
      editable: true,
      location: event.location,
      attendees: event.attendees,
      description: event.description,
    }));

  try {
    window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Manual scheduling should keep working even if local persistence fails.
  }
}

function sanitizeCalendarEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as CalendarEventRecord;
  if (!event.id || !event.title || !event.start || !event.end || !isCalendarEventType(event.type)) {
    return null;
  }

  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    type: event.type,
    provider: "manual",
    editable: true,
    location: event.location,
    attendees: Array.isArray(event.attendees) ? event.attendees.filter(Boolean) : undefined,
    description: event.description,
  };
}

function isCalendarEventType(value: unknown): value is CalendarEventType {
  return value === "meeting" || value === "focus" || value === "deadline" || value === "personal";
}
