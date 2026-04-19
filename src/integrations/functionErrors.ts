export async function describeFunctionError(
  error: unknown,
  fallbackMessage: string,
): Promise<string> {
  const context = extractErrorContext(error);
  if (context) {
    const message = await readResponseMessage(context);
    if (message) return normalizeFunctionErrorMessage(message, fallbackMessage);
  }

  if (error instanceof Error && error.message.trim()) {
    return normalizeFunctionErrorMessage(error.message, fallbackMessage);
  }

  return fallbackMessage;
}

interface ResponseLike {
  clone?: () => ResponseLike;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  status?: number;
  statusText?: string;
}

function extractErrorContext(error: unknown): ResponseLike | null {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: unknown }).context;
  return context && typeof context === "object" ? (context as ResponseLike) : null;
}

async function readResponseMessage(response: ResponseLike): Promise<string | null> {
  const readable = typeof response.clone === "function" ? response.clone() : response;

  if (typeof readable.json === "function") {
    try {
      const payload = await readable.json();
      const message = messageFromPayload(payload);
      if (message) return message;
    } catch {
      // Fall back to raw text below.
    }
  }

  if (typeof readable.text === "function") {
    try {
      const rawText = (await readable.text()).trim();
      if (!rawText) return statusLabel(readable);
      const parsed = tryParseJson(rawText);
      return messageFromPayload(parsed) ?? rawText;
    } catch {
      return statusLabel(readable);
    }
  }

  return statusLabel(readable);
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function messageFromPayload(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload.trim() || null;
  if (typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  for (const key of ["error", "message", "warning", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  return null;
}

function statusLabel(response: ResponseLike): string | null {
  if (typeof response.status !== "number") return null;
  const suffix = response.statusText ? ` ${response.statusText}` : "";
  return `Edge Function ${response.status}${suffix}`;
}

function normalizeFunctionErrorMessage(message: string, fallbackMessage: string): string {
  const trimmed = message.trim();
  if (!trimmed) return fallbackMessage;

  if (/unsupported jwt algorithm/i.test(trimmed)) {
    return "Your Google session needs to be refreshed before the AI service can run. Sign in with Google again, then refresh the daily digest.";
  }

  if (/bearer token|jwt/i.test(trimmed) && /\b(expired|invalid|missing|session)\b/i.test(trimmed)) {
    return "Your Google session expired before the AI service could run. Sign in again, then retry.";
  }

  return trimmed;
}
