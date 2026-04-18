import { demoCalendar, demoDate, demoEmails } from "../data";
import type {
  CalendarEvent,
  CalendarEventType,
  EmailMessage,
  EmailPriority,
  TaskCategory,
} from "../types";
import { supabase } from "./supabaseClient";

export type WorkspaceDataSource = "demo" | "live" | "empty";

interface EmailMessageRow {
  id: string;
  provider: string;
  provider_message_id: string;
  thread_id: string | null;
  from_name: string | null;
  from_email: string | null;
  subject: string;
  snippet: string;
  body_preview: string | null;
  received_at: string;
  labels: string[] | null;
  importance: "low" | "normal" | "high" | "urgent";
}

interface CalendarEventRow {
  id: string;
  provider: string;
  provider_event_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  event_type: CalendarEventType;
  attendees: unknown;
}

export interface WorkspaceDataResult {
  date: string;
  source: WorkspaceDataSource;
  notice: string;
  emails: EmailMessage[];
  calendarEvents: CalendarEvent[];
}

export interface LoadWorkspaceDataOptions {
  allowDemoFallback?: boolean;
  date?: string;
  emailLimit?: number;
  eventLimit?: number;
}

const defaultEmailLimit = 25;
const defaultEventLimit = 50;

export async function loadWorkspaceData(
  options: LoadWorkspaceDataOptions = {},
): Promise<WorkspaceDataResult> {
  const date = options.date ?? getLocalDateISO();
  const allowDemoFallback = Boolean(options.allowDemoFallback);

  if (!supabase) {
    return demoWorkspace(date, allowDemoFallback);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return emptyWorkspace(
      date,
      "Sign in and sync a source before Autopilot-AI plans from live work.",
      allowDemoFallback,
    );
  }

  const { dayStartIso, dayEndIso } = buildLocalDayRange(date);

  const userId = sessionData.session.user.id;
  const [emailsResult, calendarResult] = await Promise.all([
    supabase
      .from("email_messages")
      .select(
        "id, provider, provider_message_id, thread_id, from_name, from_email, subject, snippet, body_preview, received_at, labels, importance",
      )
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(options.emailLimit ?? defaultEmailLimit),
    supabase
      .from("calendar_events")
      .select(
        "id, provider, provider_event_id, title, description, location, start_at, end_at, event_type, attendees",
      )
      .eq("user_id", userId)
      .lt("start_at", dayEndIso)
      .gt("end_at", dayStartIso)
      .order("start_at", { ascending: true })
      .limit(options.eventLimit ?? defaultEventLimit),
  ]);

  if (emailsResult.error || calendarResult.error) {
    return emptyWorkspace(
      date,
      `Live workspace data could not be loaded. ${
        emailsResult.error?.message ?? calendarResult.error?.message ?? "Try syncing again."
      }`,
      allowDemoFallback,
    );
  }

  const emails = mapEmailRowsToMessages(emailsResult.data ?? [], date);
  const calendarEvents = mapCalendarRowsToEvents(calendarResult.data ?? []);
  if (emails.length === 0 && calendarEvents.length === 0) {
    return emptyWorkspace(
      date,
      "No synced Gmail or calendar data is stored yet. Connect Google once, then run a sync.",
      allowDemoFallback,
    );
  }

  return {
    date,
    source: "live",
    notice: `Loaded ${emails.length} source-backed emails and ${calendarEvents.length} calendar events for ${formatWorkspaceDate(
      date,
    )}.`,
    emails,
    calendarEvents,
  };
}

export function getLocalDateISO(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function buildLocalDayRange(date: string): { dayStartIso: string; dayEndIso: string } {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return {
    dayStartIso: dayStart.toISOString(),
    dayEndIso: dayEnd.toISOString(),
  };
}

export function localDateFromIso(isoDate: string): string {
  return getLocalDateISO(new Date(isoDate));
}

export function mapEmailRowsToMessages(
  rows: EmailMessageRow[],
  planningDate: string,
): EmailMessage[] {
  return rows
    .map((row) => mapEmailRowToMessage(row, planningDate))
    .filter((message) => isActionableEmailMessage(message));
}

export function mapCalendarRowsToEvents(rows: CalendarEventRow[]): CalendarEvent[] {
  return rows.map((row) => ({
    id: row.provider_event_id || row.id,
    title: row.title?.trim() || "Untitled event",
    start: row.start_at,
    end: row.end_at,
    type: row.event_type,
    location: row.location ?? undefined,
    attendees: parseAttendees(row.attendees),
    provider: row.provider,
    editable: row.provider === "manual",
    description: row.description ?? undefined,
  }));
}

export function mapEmailRowToMessage(
  row: EmailMessageRow,
  planningDate: string,
): EmailMessage {
  const subject = row.subject?.trim() || "Untitled thread";
  const preview = row.snippet?.trim() || row.body_preview?.trim() || "Open the source thread to inspect the latest message.";
  const senderName = row.from_name?.trim() || row.from_email?.trim() || humanizeProvider(row.provider);
  const waitingOn = inferWaitingOwner(subject, preview, row.from_name, row.from_email);
  const category = inferTaskCategory(subject, preview);
  const priority = inferPriority(row.importance, row.labels ?? [], subject, preview);
  const actionHint = buildSourceBackedActionHint(subject, category, waitingOn);

  return {
    id: row.provider_message_id || row.id,
    from: senderName,
    senderEmail: row.from_email?.trim() || undefined,
    sourceUrl: buildSourceUrl(row.provider, row.thread_id, row.provider_message_id || row.id),
    role: inferSenderRole(row.from_email, row.provider),
    avatar: buildAvatarDataUri(senderName, row.provider),
    subject,
    preview,
    receivedAt: row.received_at,
    priority,
    confidence: inferConfidence(row),
    effort: inferEffort(category, priority),
    impact: inferImpact(priority),
    dueAt: inferExplicitDueAt(`${subject} ${preview}`, planningDate),
    category,
    actionHint,
    risk: waitingOn
      ? `This thread looks blocked on ${waitingOn}. Keep it visible, but open the source thread before changing ownership or timing.`
      : `Source-backed from ${humanizeProvider(row.provider)} message metadata. Open the source thread before sending, approving, or editing anything sensitive.`,
    labels: Array.from(new Set([...(row.labels ?? []), row.provider])),
    provider: row.provider,
    waitingOn,
  };
}

export function buildSourceBackedActionHint(
  subject: string,
  category: TaskCategory,
  waitingOn?: string,
): string {
  const normalizedSubject = sanitizeSubject(subject);
  if (waitingOn) {
    return `Track waiting thread: ${normalizedSubject}`;
  }

  const prefixByCategory: Record<TaskCategory, string> = {
    approve: "Approve",
    "follow-up": "Follow up on",
    reply: "Reply on",
    review: "Review",
    schedule: "Schedule",
    send: "Send",
  };

  return `${prefixByCategory[category]}: ${normalizedSubject}`;
}

export function isActionableEmailMessage(message: EmailMessage): boolean {
  if (message.waitingOn) return true;
  if (message.category !== "follow-up") return true;

  const text = `${message.subject} ${message.preview}`.toLowerCase();
  return /\b(action required|please|need you|needs your|let me know|follow up|next step|deadline|today|tomorrow)\b/.test(
    text,
  );
}

function demoWorkspace(date: string, allowDemoFallback: boolean): WorkspaceDataResult {
  if (!allowDemoFallback) {
    return emptyWorkspace(date, "Add Supabase configuration to move from preview data to live sources.");
  }

  return {
    date: demoDate,
    source: "demo",
    notice: "Preview mode is using demo inbox and calendar data. Live sync replaces this once Supabase is configured.",
    emails: demoEmails,
    calendarEvents: demoCalendar,
  };
}

function emptyWorkspace(
  date: string,
  notice: string,
  allowDemoFallback = false,
): WorkspaceDataResult {
  if (allowDemoFallback) {
    return demoWorkspace(date, true);
  }

  return {
    date,
    source: "empty",
    notice,
    emails: [],
    calendarEvents: [],
  };
}

function inferPriority(
  importance: EmailMessageRow["importance"],
  labels: string[],
  subject: string,
  preview: string,
): EmailPriority {
  const body = `${subject} ${preview}`.toLowerCase();
  if (importance === "urgent" || /\burgent\b|\basap\b|\bimmediately\b/.test(body)) {
    return "urgent";
  }
  if (
    importance === "high" ||
    labels.some((label) => /important|starred/i.test(label)) ||
    /\bapprove\b|\bdeadline\b|\btoday\b/.test(body)
  ) {
    return "high";
  }
  if (importance === "low") return "low";
  return "medium";
}

function inferTaskCategory(subject: string, preview: string): TaskCategory {
  const body = `${subject} ${preview}`.toLowerCase();
  if (/\bapprove\b|\bapproval\b|\bsign off\b/.test(body)) return "approve";
  if (/\bschedule\b|\bavailability\b|\bcalendar\b|\bmeeting\b|\bmeet\b/.test(body)) return "schedule";
  if (/\breview\b|\bfeedback\b|\bcomments\b|\blook over\b|\bedit\b/.test(body)) return "review";
  if (/\bsend\b|\bshare\b|\bforward\b|\bdeliver\b/.test(body)) return "send";
  if (/\breply\b|\brespond\b|\banswer\b|\bcan you\b|\?\s*$/.test(body)) return "reply";
  return "follow-up";
}

function inferWaitingOwner(
  subject: string,
  preview: string,
  fromName: string | null,
  fromEmail: string | null,
): string | undefined {
  const body = `${subject} ${preview}`.toLowerCase();
  if (
    /\bwaiting on\b|\bi will send\b|\bonce .* finishes\b|\bnothing for you\b|\bwill update you\b/.test(
      body,
    )
  ) {
    return fromName?.trim() || fromEmail?.trim() || "the sender";
  }
  return undefined;
}

function inferConfidence(row: EmailMessageRow): number {
  if (row.subject && row.snippet) return 92;
  if (row.subject || row.snippet) return 84;
  return 72;
}

function inferEffort(category: TaskCategory, priority: EmailPriority): number {
  const baseByCategory: Record<TaskCategory, number> = {
    approve: 10,
    "follow-up": 15,
    reply: 20,
    review: 25,
    schedule: 15,
    send: 20,
  };
  return priority === "urgent" ? Math.max(10, baseByCategory[category] - 5) : baseByCategory[category];
}

function inferImpact(priority: EmailPriority): number {
  if (priority === "urgent") return 9;
  if (priority === "high") return 7;
  if (priority === "medium") return 5;
  return 3;
}

function inferExplicitDueAt(content: string, planningDate: string): string | undefined {
  const normalized = content.toLowerCase();
  const dayOffset = normalized.includes("tomorrow") ? 1 : normalized.includes("today") ? 0 : null;
  if (dayOffset === null) return undefined;

  const timeMatch = normalized.match(/\b(1[0-2]|0?\d)(?::([0-5]\d))?\s?(am|pm)\b/);
  if (!timeMatch) return undefined;

  const baseDate = new Date(`${planningDate}T00:00:00`);
  baseDate.setDate(baseDate.getDate() + dayOffset);
  let hour = Number(timeMatch[1]) % 12;
  if (timeMatch[3] === "pm") hour += 12;
  const minute = Number(timeMatch[2] ?? "0");
  baseDate.setHours(hour, minute, 0, 0);
  return baseDate.toISOString();
}

function inferSenderRole(fromEmail: string | null, provider: string): string {
  if (!fromEmail) return humanizeProvider(provider);
  const domain = fromEmail.split("@")[1];
  if (!domain) return humanizeProvider(provider);
  return domain.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

function humanizeProvider(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "microsoft") return "Microsoft";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function sanitizeSubject(subject: string): string {
  return subject.replace(/^\s*(re|fwd)\s*:\s*/i, "").trim() || "untitled thread";
}

function parseAttendees(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];
  return attendees
    .map((attendee) => {
      if (!attendee || typeof attendee !== "object") return null;
      const record = attendee as Record<string, unknown>;
      return String(record.name || record.email || "").trim() || null;
    })
    .filter((value): value is string => Boolean(value));
}

function buildAvatarDataUri(label: string, provider: string): string {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";
  const background = provider === "microsoft" ? "#1a73e8" : provider === "google" ? "#1f8a68" : "#171717";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${background}"/><text x="48" y="57" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="white">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatWorkspaceDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function buildSourceUrl(provider: string, threadId: string | null, messageId: string): string | undefined {
  if (provider !== "google") return undefined;
  const safeThreadId = threadId?.trim() || messageId.trim();
  return safeThreadId ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(safeThreadId)}` : undefined;
}
