import type { ActionItem, EmailMessage } from "./types";

type VerificationSignalInput = {
  subject?: string | null;
  preview?: string | null;
  snippet?: string | null;
  bodyPreview?: string | null;
  body_preview?: string | null;
  from?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  senderEmail?: string | null;
  labels?: string[] | null;
};

const verificationSignalPatterns = [
  /\b(?:verification|authentication|security|access|login|sign[\s-]?in)\s+(?:code|passcode|password|otp|token|link)\b/i,
  /\b(?:one[\s-]?time|single[\s-]?use)\s+(?:code|passcode|password)\b/i,
  /\b(?:two[\s-]?factor|2fa|otp|magic link|device verification|email confirmation|account confirmation)\b/i,
  /\b(?:verify|confirm|approve)(?:\s+\w+){0,4}\s+(?:email|account|identity|login|sign[\s-]?in|device)\b/i,
  /\bsudo email verification code\b/i,
];

export function isVerificationEmailLike(
  signal: Pick<EmailMessage, "subject" | "preview" | "labels" | "from" | "senderEmail"> | VerificationSignalInput,
): boolean {
  return verificationSignalPatterns.some((pattern) => pattern.test(buildVerificationSearchText(signal)));
}

export function isVerificationActionLike(
  action: Pick<ActionItem, "title" | "detail" | "labels"> & {
    sourceSubject?: string | null;
    sourceSenderEmail?: string | null;
  },
): boolean {
  return isVerificationEmailLike({
    subject: action.sourceSubject || action.title,
    preview: action.detail,
    senderEmail: action.sourceSenderEmail,
    labels: action.labels,
  });
}

function buildVerificationSearchText(signal: VerificationSignalInput): string {
  return [
    signal.subject,
    signal.preview,
    signal.snippet,
    signal.bodyPreview,
    signal.body_preview,
    signal.from,
    signal.fromName,
    signal.fromEmail,
    signal.from_name,
    signal.from_email,
    signal.senderEmail,
    ...(Array.isArray(signal.labels) ? signal.labels : []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}
