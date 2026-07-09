import { neon } from "@neondatabase/serverless";
import type { AppointmentDetails } from "../../shared/types.ts";

export interface AppointmentRow extends AppointmentDetails {
  status: string;
  phone: string;
}

export function getApiUrl(): string {
  return process.env.API_URL ?? "http://localhost:6080";
}

export async function isApiReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiUrl()}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function seedAppointment(
  appointment: AppointmentDetails & { phone: string },
): Promise<AppointmentRow> {
  const response = await fetch(`${getApiUrl()}/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appointment),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      errorMessage?: string;
    } | null;
    throw new Error(body?.errorMessage ?? `Failed to seed appointment (${response.status})`);
  }

  const data = (await response.json()) as { appointment: AppointmentRow };
  return data.appointment;
}

export async function fetchAppointment(
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const response = await fetch(`${getApiUrl()}/appointments/${appointmentId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      errorMessage?: string;
    } | null;
    throw new Error(body?.errorMessage ?? `Failed to fetch appointment (${response.status})`);
  }

  const data = (await response.json()) as { appointment: AppointmentRow };
  return data.appointment;
}

export async function resetAppointment(
  appointmentId: string,
  fields: {
    status?: string;
    appointmentDate?: string;
    appointmentTime?: string;
  },
): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for resetAppointment");
  }

  const sql = neon(connectionString);
  await sql`
    UPDATE appointments
    SET
      status = COALESCE(${fields.status ?? null}, status),
      appointment_date = COALESCE(${fields.appointmentDate ?? null}, appointment_date),
      appointment_time = COALESCE(${fields.appointmentTime ?? null}, appointment_time),
      decline_reason = NULL,
      livekit_room_name = NULL
    WHERE appointment_id = ${appointmentId}
  `;
}