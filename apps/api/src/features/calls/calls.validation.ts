export type TranscriptValidationResult =
  | { valid: true; speaker: string; text: string; at?: string }
  | { valid: false; errorMessage: string };

export function validateTranscriptSegment(
  body: unknown,
): TranscriptValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errorMessage: "speaker and text are required" };
  }

  const { speaker, text, at } = body as {
    speaker?: unknown;
    text?: unknown;
    at?: unknown;
  };

  if (typeof speaker !== "string" || typeof text !== "string" || text.trim() === "") {
    return { valid: false, errorMessage: "speaker and text are required" };
  }

  return {
    valid: true,
    speaker,
    text: text.trim(),
    ...(typeof at === "string" ? { at } : {}),
  };
}
