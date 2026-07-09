import {
  createBookingRoom,
  createParticipantToken,
} from "../../shared/livekit.ts";
import { sql } from "../../shared/db/client.ts";
import { AppError } from "../../shared/errors.ts";
import type { BookingConfig } from "../../shared/types.ts";
import * as callsService from "../calls/calls.service.ts";
import {
  defaultBookingConfig,
  validateBookingConfig,
} from "./booking-config.ts";

/**
 * Inbound booking is separate from outbound queue / MAX_CONCURRENT_CALLS.
 * Each call gets its own room + direct dispatch to inbound-booking-agent.
 */
export async function startBooking() {
  const sessionId = `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const roomName = (await createBookingRoom(sessionId)) as string;

  try {
    await callsService.createCall({
      callId: roomName,
      appointmentId: null,
      leadId: null,
      roomName,
      status: "INITIATED",
    });
  } catch (e) {
    console.warn(
      "Could not create call record for booking start:",
      e instanceof Error ? e.message : e,
    );
  }

  const join = (await createParticipantToken({
    roomName,
    identity: `patient-${sessionId}`,
    name: "Inbound Caller",
  })) as {
    token: string;
    serverUrl: string;
    roomName: string;
  };

  return {
    ...join,
    roomName,
    booking: { sessionId },
  };
}

export async function getBookingConfig(): Promise<BookingConfig> {
  const rows = await sql`
    SELECT config FROM booking_config WHERE id = 'default' LIMIT 1
  `;

  if (rows.length === 0) {
    const config = defaultBookingConfig();
    await sql`
      INSERT INTO booking_config (id, config, updated_at)
      VALUES ('default', ${JSON.stringify(config)}::jsonb, NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    return config;
  }

  const raw = rows[0]?.config;
  const parsed = validateBookingConfig(raw);
  if (!parsed.valid) {
    console.warn("[booking-config] stored config invalid, returning defaults:", parsed.errorMessage);
    return defaultBookingConfig();
  }
  return parsed.config;
}

export async function saveBookingConfig(body: unknown): Promise<BookingConfig> {
  const parsed = validateBookingConfig(body);
  if (!parsed.valid) {
    throw new AppError(400, parsed.errorMessage);
  }

  const config = parsed.config;
  await sql`
    INSERT INTO booking_config (id, config, updated_at)
    VALUES ('default', ${JSON.stringify(config)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET
      config = EXCLUDED.config,
      updated_at = NOW()
  `;

  return config;
}
