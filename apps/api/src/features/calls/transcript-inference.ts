import type { TranscriptSegment } from "../../shared/types.ts";

/**
 * Best-effort inference from transcript when the agent did not call a tool.
 * Safety net so calls that clearly ended in confirmation/decline don't leave
 * the appointment stuck in CALLING with "no final outcome".
 */
export function inferOutcomeFromTranscript(
  transcript: TranscriptSegment[] = [],
): { status: "CONFIRMED" | "DECLINED"; declineReason?: string } | null {
  if (!Array.isArray(transcript) || transcript.length === 0) return null;

  const allText = transcript
    .map((t) => (t.text || "").toLowerCase())
    .join(" ");

  const patientText = transcript
    .filter((t) => t.speaker === "user" || t.speaker === "patient")
    .map((t) => (t.text || "").toLowerCase())
    .join(" ");

  const combined = patientText || allText;

  const confirmSignals =
    /\b(yes|yep|yeah|sure|definitely|absolutely|confirm|works( great| for me)?|see you( then)?|i'?ll be there| sounds? good|perfect|great|okay then)\b/;
  const declineSignals =
    /\b(no|nah|can'?t|cannot|won'?t|cancel|declin|not (able|coming|make it)|busy|reschedul later)\b/;

  const hasConfirm = confirmSignals.test(combined);
  const hasDecline = declineSignals.test(combined);

  if (hasConfirm && !hasDecline) {
    return { status: "CONFIRMED" };
  }
  if (hasDecline && !hasConfirm) {
    const reasonMatch = combined.match(
      /(?:because|since|I'?m|too|have to)\s+([^.!?]{5,60})/i,
    );
    return {
      status: "DECLINED",
      ...(reasonMatch?.[1] ? { declineReason: reasonMatch[1].trim() } : {}),
    };
  }
  return null;
}
