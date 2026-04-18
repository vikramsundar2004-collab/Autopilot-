import type {
  ActionItem,
  CalendarConflict,
  CalendarEvent,
  DailyPlan,
  EmailMessage,
  EmailPriority,
  FocusWindow,
} from "./types";

const priorityWeight: Record<EmailPriority, number> = {
  urgent: 40,
  high: 28,
  medium: 16,
  low: 6,
};

const workdayStartHour = 9;
const workdayEndHour = 17;

export function deriveActionItems(
  emails: EmailMessage[],
  todayISO: string,
): ActionItem[] {
  return emails.map((email) => {
    const status = email.waitingOn ? "waiting" : "open";
    const rankScore = scoreEmail(email, todayISO);

    return {
      id: `task-${email.id}`,
      sourceEmailId: email.id,
      sourceUrl: email.sourceUrl,
      title: email.actionHint,
      detail: email.preview,
      source: email.from,
      sourceRole: email.role,
      sourceAvatar: email.avatar,
      sourceSubject: email.subject,
      receivedAt: email.receivedAt,
      dueAt: email.dueAt,
      priority: email.priority,
      category: email.category,
      status,
      confidence: email.confidence,
      effort: email.effort,
      impact: email.impact,
      risk: email.risk,
      labels: email.labels,
      rankScore,
    };
  });
}

export function rankActionItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    const statusDelta = statusWeight(a.status) - statusWeight(b.status);
    if (statusDelta !== 0) return statusDelta;
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
  });
}

export function buildDailyPlan(
  items: ActionItem[],
  calendarEvents: CalendarEvent[],
  todayISO: string,
): DailyPlan {
  const rankedTasks = rankActionItems(items);
  const conflicts = findCalendarConflicts(calendarEvents);
  const focusWindows = assignTasksToFocusWindows(
    buildFocusWindows(calendarEvents, todayISO),
    rankedTasks,
  );
  const assigned = new Set(focusWindows.flatMap((window) => window.assignedTaskIds));
  const overflowTasks = rankedTasks
    .filter((task) => task.status === "open" && !assigned.has(task.id))
    .slice(0, 3);
  const rescuePlan =
    overflowTasks.length > 0
      ? overflowTasks
      : [...rankedTasks]
          .filter((task) => task.status === "open")
          .sort((a, b) => a.rankScore - b.rankScore)
          .slice(0, 2);

  return {
    date: todayISO,
    rankedTasks,
    focusWindows,
    conflicts,
    rescuePlan,
  };
}

export function scoreEmail(email: EmailMessage, todayISO: string): number {
  const dueBoost = getDueBoost(email.dueAt, todayISO);
  const waitingPenalty = email.waitingOn ? -20 : 0;
  const confidenceBoost = Math.round(email.confidence / 10);

  return (
    priorityWeight[email.priority] +
    email.impact * 5 -
    email.effort * 0.35 +
    dueBoost +
    confidenceBoost +
    waitingPenalty
  );
}

export function getDueBoost(dueAt: string | undefined, todayISO: string): number {
  if (!dueAt) return 0;
  const todayStart = new Date(`${todayISO}T00:00:00`);
  const due = new Date(dueAt);
  const daysUntilDue = Math.floor(
    (startOfDay(due).getTime() - todayStart.getTime()) / 86_400_000,
  );

  if (daysUntilDue < 0) return 36;
  if (daysUntilDue === 0) return 30;
  if (daysUntilDue === 1) return 20;
  if (daysUntilDue <= 3) return 10;
  return 4;
}

export function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

export function formatDueLabel(dueAt: string | undefined, todayISO: string): string {
  if (!dueAt) return "No deadline";
  const todayStart = new Date(`${todayISO}T00:00:00`);
  const due = new Date(dueAt);
  const daysUntilDue = Math.floor(
    (startOfDay(due).getTime() - todayStart.getTime()) / 86_400_000,
  );

  if (daysUntilDue < 0) return `Overdue, ${formatTime(dueAt)}`;
  if (daysUntilDue === 0) return `Today, ${formatTime(dueAt)}`;
  if (daysUntilDue === 1) return `Tomorrow, ${formatTime(dueAt)}`;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(due);
}

export function summarizePlan(plan: DailyPlan): {
  openCount: number;
  urgentCount: number;
  waitingCount: number;
  focusMinutes: number;
} {
  return {
    openCount: plan.rankedTasks.filter((task) => task.status === "open").length,
    urgentCount: plan.rankedTasks.filter((task) => task.priority === "urgent").length,
    waitingCount: plan.rankedTasks.filter((task) => task.status === "waiting").length,
    focusMinutes: plan.focusWindows.reduce((total, window) => total + window.minutes, 0),
  };
}

function statusWeight(status: ActionItem["status"]): number {
  if (status === "open") return 0;
  if (status === "waiting") return 1;
  return 2;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildFocusWindows(
  calendarEvents: CalendarEvent[],
  todayISO: string,
): FocusWindow[] {
  const dayStart = new Date(`${todayISO}T${String(workdayStartHour).padStart(2, "0")}:00:00`);
  const dayEnd = new Date(`${todayISO}T${String(workdayEndHour).padStart(2, "0")}:00:00`);
  const blockingEvents = calendarEvents
    .filter((event) => event.type === "meeting" || event.type === "personal")
    .map((event) => ({ start: new Date(event.start), end: new Date(event.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const windows: FocusWindow[] = [];
  let cursor = dayStart;

  for (const event of blockingEvents) {
    if (event.start > cursor) {
      pushWindow(windows, cursor, event.start);
    }
    if (event.end > cursor) {
      cursor = event.end;
    }
  }

  if (cursor < dayEnd) {
    pushWindow(windows, cursor, dayEnd);
  }

  return windows;
}

function pushWindow(windows: FocusWindow[], start: Date, end: Date): void {
  const minutes = Math.floor((end.getTime() - start.getTime()) / 60_000);
  if (minutes < 25) return;
  windows.push({
    id: `focus-${windows.length + 1}`,
    start: start.toISOString(),
    end: end.toISOString(),
    minutes,
    assignedTaskIds: [],
  });
}

function assignTasksToFocusWindows(
  windows: FocusWindow[],
  rankedTasks: ActionItem[],
): FocusWindow[] {
  const unscheduled = rankedTasks.filter((task) => task.status === "open");

  return windows.map((window) => {
    let remaining = window.minutes;
    const assignedTaskIds: string[] = [];

    for (const task of unscheduled) {
      if (assignedTaskIds.includes(task.id)) continue;
      const alreadyAssigned = windows.some((candidate) =>
        candidate.assignedTaskIds.includes(task.id),
      );
      if (alreadyAssigned) continue;
      if (task.effort > remaining) continue;

      assignedTaskIds.push(task.id);
      remaining -= task.effort;
    }

    window.assignedTaskIds.push(...assignedTaskIds);
    return window;
  });
}

function findCalendarConflicts(calendarEvents: CalendarEvent[]): CalendarConflict[] {
  const sorted = [...calendarEvents].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const conflicts: CalendarConflict[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (new Date(current.end) > new Date(next.start)) {
      conflicts.push({
        id: `${current.id}-${next.id}`,
        title: current.title,
        startsAt: current.start,
        endsAt: current.end,
        overlapsWith: next.title,
      });
    }
  }

  return conflicts;
}
