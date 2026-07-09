import { sql } from "../../shared/db/client.ts";
import type {
  Appointment,
  CreateAppointmentInput,
  UpdateAppointmentStatusInput,
} from "../../shared/types.ts";
import { APPOINTMENT_TERMINAL_STATUSES } from "../../shared/types.ts";

export async function saveAppointment(
  appointment: CreateAppointmentInput,
): Promise<Appointment> {
  // Only PENDING rows enter the outbound confirmation queue.
  // Inbound / lead bookings should pass status: "CONFIRMED" so they never re-queue.
  const initialStatus =
    typeof appointment.status === "string" && appointment.status.trim() !== ""
      ? appointment.status.trim()
      : "PENDING";

  const rows = await sql`
    INSERT INTO appointments (
      appointment_id,
      patient_name,
      phone,
      doctor_name,
      appointment_date,
      appointment_time,
      status
    )
    VALUES (
      ${appointment.appointmentId},
      ${appointment.patientName},
      ${appointment.phone},
      ${appointment.doctorName ?? "Dr. Smith"},
      ${appointment.appointmentDate},
      ${appointment.appointmentTime},
      ${initialStatus}
    )
    RETURNING
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      decline_reason AS "declineReason",
      created_at AS "createdAt"
  `;

  return rows[0] as Appointment;
}

export async function listAppointments(): Promise<Appointment[]> {
  const rows = await sql`
    SELECT
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      decline_reason AS "declineReason",
      created_at AS "createdAt"
    FROM appointments
    ORDER BY created_at DESC
  `;
  return rows as Appointment[];
}

export async function getAppointmentById(
  appointmentId: string,
): Promise<Appointment | null> {
  const rows = await sql`
    SELECT
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      decline_reason AS "declineReason",
      created_at AS "createdAt"
    FROM appointments
    WHERE appointment_id = ${appointmentId}
    LIMIT 1
  `;

  return (rows[0] as Appointment | undefined) ?? null;
}

/** Pure SQL status update (no call finalization). */
export async function updateAppointmentStatus(
  appointmentId: string,
  update: UpdateAppointmentStatusInput,
): Promise<Appointment | null> {
  const { status, appointmentDate, appointmentTime, declineReason } = update;

  if (!APPOINTMENT_TERMINAL_STATUSES.has(status)) {
    throw new Error(`Invalid terminal status: ${status}`);
  }

  const rows = await sql`
    UPDATE appointments
    SET
      status = ${status},
      appointment_date = COALESCE(${appointmentDate ?? null}, appointment_date),
      appointment_time = COALESCE(${appointmentTime ?? null}, appointment_time),
      decline_reason = COALESCE(${declineReason ?? null}, decline_reason),
      livekit_room_name = NULL
    WHERE appointment_id = ${appointmentId}
    RETURNING
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      decline_reason AS "declineReason",
      created_at AS "createdAt"
  `;

  return (rows[0] as Appointment | undefined) ?? null;
}

export async function clearAppointmentRoom(appointmentId: string): Promise<void> {
  await sql`
    UPDATE appointments
    SET livekit_room_name = NULL
    WHERE appointment_id = ${appointmentId}
  `;
}

export async function fetchPendingAppointmentsWithoutRoom(): Promise<
  Appointment[]
> {
  const rows = await sql`
    SELECT
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      created_at AS "createdAt"
    FROM appointments
    WHERE livekit_room_name IS NULL
      AND status = 'PENDING'
    ORDER BY created_at ASC
  `;
  return rows as Appointment[];
}

export async function claimAppointmentForCall(
  appointmentId: string,
): Promise<Appointment | null> {
  const claimed = await sql`
    UPDATE appointments
    SET status = 'CALLING'
    WHERE appointment_id = ${appointmentId}
      AND status = 'PENDING'
      AND livekit_room_name IS NULL
    RETURNING
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      created_at AS "createdAt"
  `;
  return (claimed[0] as Appointment | undefined) ?? null;
}

export async function updateAppointmentCall(
  appointmentId: string,
  livekitRoomName: string,
  status: string,
): Promise<Appointment | null> {
  const rows = await sql`
    UPDATE appointments
    SET livekit_room_name = ${livekitRoomName}, status = ${status}
    WHERE appointment_id = ${appointmentId}
    RETURNING
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      created_at AS "createdAt"
  `;
  return (rows[0] as Appointment | undefined) ?? null;
}

export async function countActiveConfirmationCalls(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM appointments
    WHERE status = 'CALLING' AND livekit_room_name IS NOT NULL
  `;
  return (rows[0] as { count: number } | undefined)?.count ?? 0;
}

export async function requeueAppointment(appointmentId: string): Promise<Appointment | null> {
  const rows = await sql`
    UPDATE appointments
    SET
      status = 'PENDING',
      livekit_room_name = NULL,
      created_at = NOW()
    WHERE appointment_id = ${appointmentId}
      AND status IN ('CALLING', 'PENDING')
    RETURNING
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      phone,
      doctor_name AS "doctorName",
      appointment_date AS "appointmentDate",
      appointment_time AS "appointmentTime",
      status,
      livekit_room_name AS "livekitRoomName",
      decline_reason AS "declineReason",
      created_at AS "createdAt"
  `;
  return (rows[0] as Appointment | undefined) ?? null;
}
