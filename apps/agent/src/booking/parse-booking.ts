import type { BookingContext } from "../shared/types.ts";

/**
 * Parse inbound booking room/job metadata only.
 * Rejects confirmation/lead shapes so agents never cross-wire.
 */
export function parseBookingMetadata(
  metadata: string | undefined,
): BookingContext | null {
  if (!metadata?.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    // Require booking shape so confirmation/lead rooms never parse as inbound.
    const isBooking =
      record.type === "booking" ||
      (typeof record.sessionId === "string" &&
        record.sessionId.trim() !== "" &&
        typeof record.appointmentId !== "string" &&
        typeof record.leadId !== "string");

    if (!isBooking) {
      return null;
    }

    const ctx: BookingContext = {};

    if (typeof record.sessionId === "string") ctx.sessionId = record.sessionId;
    if (typeof record.callerName === "string") ctx.callerName = record.callerName;
    if (typeof record.phone === "string") ctx.phone = record.phone;
    if (typeof record.name === "string" && !ctx.callerName) {
      ctx.callerName = record.name;
    }

    return Object.keys(ctx).length > 0 ? ctx : null;
  } catch {
    return null;
  }
}
