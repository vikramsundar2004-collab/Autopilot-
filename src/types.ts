export type EmailPriority = "urgent" | "high" | "medium" | "low";
export type TaskCategory =
  | "reply"
  | "review"
  | "schedule"
  | "send"
  | "approve"
  | "follow-up";
export type TaskStatus = "open" | "waiting" | "done";
export type CalendarEventType = "meeting" | "focus" | "deadline" | "personal";

export interface EmailMessage {
  id: string;
  from: string;
  role: string;
  avatar: string;
  subject: string;
  preview: string;
  receivedAt: string;
  priority: EmailPriority;
  confidence: number;
  effort: number;
  impact: number;
  dueAt?: string;
  category: TaskCategory;
  actionHint: string;
  risk: string;
  labels: string[];
  waitingOn?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: CalendarEventType;
  location?: string;
  attendees?: string[];
}

export interface ActionItem {
  id: string;
  sourceEmailId: string;
  title: string;
  detail: string;
  source: string;
  sourceRole: string;
  sourceAvatar: string;
  sourceSubject: string;
  receivedAt: string;
  dueAt?: string;
  priority: EmailPriority;
  category: TaskCategory;
  status: TaskStatus;
  confidence: number;
  effort: number;
  impact: number;
  risk: string;
  labels: string[];
  rankScore: number;
}

export interface FocusWindow {
  id: string;
  start: string;
  end: string;
  minutes: number;
  assignedTaskIds: string[];
}

export interface CalendarConflict {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  overlapsWith: string;
}

export interface DailyPlan {
  date: string;
  rankedTasks: ActionItem[];
  focusWindows: FocusWindow[];
  conflicts: CalendarConflict[];
  rescuePlan: ActionItem[];
}
