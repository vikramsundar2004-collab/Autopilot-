export function normalizeOpenAiModel(
  value: string | null | undefined,
  fallback = "gpt-5.4",
): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return normalized === "gpt-5-4" ? "gpt-5.4" : normalized;
}

export function extractOpenAiText(raw: any): string {
  if (typeof raw?.output_text === "string" && raw.output_text.trim()) {
    return raw.output_text;
  }

  for (const item of raw?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
      if (typeof part?.output_text === "string" && part.output_text.trim()) {
        return part.output_text;
      }
    }
  }

  throw new Error("OpenAI response did not include text.");
}
