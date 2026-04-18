import type { EmailMessage, EmailPriority, TaskCategory } from "./types";

export type DraftTheme = "direct" | "warm" | "executive";

export interface EmailReplyDraft {
  id: string;
  sourceEmailId: string;
  sourceUrl?: string;
  sender: string;
  senderEmail?: string;
  originalSubject: string;
  subject: string;
  preview: string;
  priority: EmailPriority;
  category: TaskCategory;
  reason: string;
  body: string;
}

const adLikePattern =
  /\b(category_promotions|category_social|promotion|promotions|newsletter|unsubscribe|advertisement|marketing|sale|coupon|discount|deal|sponsored)\b/i;

export function deriveReplyDrafts(
  emails: EmailMessage[],
  theme: DraftTheme = "direct",
): EmailReplyDraft[] {
  return emails
    .filter(shouldDraftReplyForEmail)
    .sort((left, right) => {
      const priorityDelta = priorityWeight(right.priority) - priorityWeight(left.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime();
    })
    .map((email) => buildReplyDraft(email, theme));
}

export function shouldDraftReplyForEmail(email: EmailMessage): boolean {
  if (email.waitingOn) return false;
  if (isAdLikeEmail(email)) return false;
  if (email.priority === "urgent" || email.priority === "high") return true;
  if (email.impact >= 7) return true;
  return email.labels.some((label) => /\bimportant\b|\bstarred\b/i.test(label));
}

export function isAdLikeEmail(email: EmailMessage): boolean {
  const text = `${email.subject} ${email.preview} ${email.labels.join(" ")}`;
  return adLikePattern.test(text);
}

export function buildReplyDraft(
  email: EmailMessage,
  theme: DraftTheme = "direct",
): EmailReplyDraft {
  const originalSubject = email.subject.trim() || "Untitled thread";
  const subject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
  const sender = email.from.trim() || "there";
  const greeting = firstName(sender);
  const preview = email.preview.trim();
  const reason = buildDraftReason(email);
  const actionLine = buildActionLine(email, theme);
  const contextLine = preview
    ? `I saw the request about "${truncatePreview(preview)}".`
    : `I saw the note about "${originalSubject}".`;
  const signOff = buildSignOff(theme);

  return {
    id: `draft-${email.id}`,
    sourceEmailId: email.id,
    sourceUrl: email.sourceUrl,
    sender,
    senderEmail: email.senderEmail,
    originalSubject,
    subject,
    preview,
    priority: email.priority,
    category: email.category,
    reason,
    body: [
      `Hi ${greeting},`,
      "",
      `Thanks for the note about "${originalSubject}".`,
      contextLine,
      actionLine,
      "",
      signOff,
      "[Your name]",
    ].join("\n"),
  };
}

function buildDraftReason(email: EmailMessage): string {
  if (email.priority === "urgent") return "Urgent source-backed thread.";
  if (email.priority === "high") return "High-priority source-backed thread.";
  if (email.labels.some((label) => /\bimportant\b|\bstarred\b/i.test(label))) {
    return "Marked important in the source mailbox.";
  }
  return "Important email based on impact and timing.";
}

function buildActionLine(email: EmailMessage, theme: DraftTheme): string {
  const directLines: Record<TaskCategory, string> = {
    approve: "I am reviewing the request and I will send the decision back shortly.",
    "follow-up": "I am handling the next step and I will follow up with a clear update shortly.",
    reply: "I am preparing the direct reply now and I will send the next update shortly.",
    review: "I am reviewing the material now and I will send feedback shortly.",
    schedule: "I am checking the calendar options now and I will send back the best time shortly.",
    send: "I am getting the requested material together now and I will send it shortly.",
  };
  const warmLines: Record<TaskCategory, string> = {
    approve: "I am reviewing the request now, and I will send a clear decision as soon as I finish.",
    "follow-up": "I am on it, and I will follow up with a useful update as soon as I have it.",
    reply: "I am pulling the details together now, and I will send a direct reply shortly.",
    review: "I am reviewing this now, and I will send thoughtful feedback shortly.",
    schedule: "I am checking the schedule now, and I will send back the best options shortly.",
    send: "I am getting this ready now, and I will send it over shortly.",
  };
  const executiveLines: Record<TaskCategory, string> = {
    approve: "I am reviewing the request now and will return a decision once the final check is complete.",
    "follow-up": "I am taking the next step now and will return with a concrete status update shortly.",
    reply: "I am preparing the response now and will send a precise update shortly.",
    review: "I am reviewing the material now and will return focused feedback shortly.",
    schedule: "I am checking the calendar constraints now and will send the best slot shortly.",
    send: "I am preparing the requested material now and will send it shortly.",
  };

  const lineSet = theme === "warm" ? warmLines : theme === "executive" ? executiveLines : directLines;
  return lineSet[email.category];
}

function buildSignOff(theme: DraftTheme): string {
  if (theme === "warm") return "Thanks,";
  if (theme === "executive") return "Regards,";
  return "Best,";
}

function truncatePreview(preview: string): string {
  if (preview.length <= 140) return preview;
  return `${preview.slice(0, 137).trimEnd()}...`;
}

function firstName(sender: string): string {
  const [candidate] = sender.trim().split(/\s+/);
  return candidate || "there";
}

function priorityWeight(priority: EmailPriority): number {
  if (priority === "urgent") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
