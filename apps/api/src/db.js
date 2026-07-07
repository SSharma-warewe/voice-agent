import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(DATABASE_URL);

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS appointments (
      appointment_id TEXT PRIMARY KEY,
      patient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS doctor_name TEXT NOT NULL DEFAULT 'Dr. Smith'
  `;
  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING'
  `;
  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS livekit_room_name TEXT
  `;
  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS decline_reason TEXT
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS calls (
      call_id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL REFERENCES appointments(appointment_id),
      livekit_room_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'INITIATED',
      outcome TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      patient_joined_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
      decline_reason TEXT
    )
  `;
}

const TERMINAL_CALL_STATUSES = new Set(["COMPLETED", "ABANDONED", "NO_ANSWER", "FAILED"]);

function computeDurationSeconds(startedAt, patientJoinedAt, endedAt) {
  const start = patientJoinedAt ?? startedAt;
  const end = endedAt ?? new Date();
  return Math.max(0, Math.round((end.getTime() - new Date(start).getTime()) / 1000));
}

const TERMINAL_STATUSES = new Set(["CONFIRMED", "DECLINED", "RESCHEDULED"]);

export async function saveAppointment(appointment) {
  const rows = await sql`
    INSERT INTO appointments (
      appointment_id,
      patient_name,
      phone,
      doctor_name,
      appointment_date,
      appointment_time
    )
    VALUES (
      ${appointment.appointmentId},
      ${appointment.patientName},
      ${appointment.phone},
      ${appointment.doctorName ?? "Dr. Smith"},
      ${appointment.appointmentDate},
      ${appointment.appointmentTime}
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

  return rows[0];
}

export async function listAppointments() {
  return sql`
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
}

export async function getAppointmentById(appointmentId) {
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

  return rows[0] ?? null;
}

export async function updateAppointmentStatus(appointmentId, update) {
  const { status, appointmentDate, appointmentTime, declineReason } = update;

  if (!TERMINAL_STATUSES.has(status)) {
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

  return rows[0] ?? null;
}

function mapCallRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
  };
}

export async function listCalls() {
  const rows = await sql`
    SELECT
      call_id AS "callId",
      appointment_id AS "appointmentId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
    FROM calls
    ORDER BY started_at DESC
  `;

  return rows.map(mapCallRow);
}

export async function getCallById(callId) {
  const rows = await sql`
    SELECT
      call_id AS "callId",
      appointment_id AS "appointmentId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
    FROM calls
    WHERE call_id = ${callId}
    LIMIT 1
  `;

  return mapCallRow(rows[0] ?? null);
}

export async function getCallByAppointmentId(appointmentId) {
  const rows = await sql`
    SELECT
      call_id AS "callId",
      appointment_id AS "appointmentId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
    FROM calls
    WHERE appointment_id = ${appointmentId}
    ORDER BY started_at DESC
    LIMIT 1
  `;

  return mapCallRow(rows[0] ?? null);
}

export async function getCallStats() {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('INITIATED', 'WAITING', 'IN_PROGRESS'))::int AS "activeCount",
      COUNT(*) FILTER (
        WHERE status = 'COMPLETED'
          AND ended_at >= date_trunc('day', NOW())
      )::int AS "completedToday",
      COALESCE(
        ROUND(AVG(duration_seconds) FILTER (
          WHERE status = 'COMPLETED'
            AND duration_seconds IS NOT NULL
        ))::int,
        0
      ) AS "avgDurationSeconds"
    FROM calls
  `;

  return rows[0];
}

export async function updateCall(callId, update) {
  const existing = await getCallById(callId);
  if (!existing) {
    return null;
  }

  const status = update.status ?? existing.status;
  const outcome = update.outcome !== undefined ? update.outcome : existing.outcome;
  const declineReason =
    update.declineReason !== undefined ? update.declineReason : existing.declineReason;
  const patientJoinedAt =
    update.patientJoinedAt !== undefined
      ? update.patientJoinedAt
      : existing.patientJoinedAt;
  const endedAt = update.endedAt !== undefined ? update.endedAt : existing.endedAt;

  let durationSeconds = update.durationSeconds ?? existing.durationSeconds;
  if (endedAt && durationSeconds == null) {
    durationSeconds = computeDurationSeconds(
      existing.startedAt,
      patientJoinedAt,
      endedAt instanceof Date ? endedAt : new Date(endedAt),
    );
  }

  const rows = await sql`
    UPDATE calls
    SET
      status = ${status},
      outcome = ${outcome},
      decline_reason = ${declineReason},
      patient_joined_at = COALESCE(${patientJoinedAt ?? null}, patient_joined_at),
      ended_at = COALESCE(${endedAt ?? null}, ended_at),
      duration_seconds = COALESCE(${durationSeconds ?? null}, duration_seconds)
    WHERE call_id = ${callId}
    RETURNING
      call_id AS "callId",
      appointment_id AS "appointmentId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
  `;

  return mapCallRow(rows[0] ?? null);
}

export async function appendTranscriptSegment(callId, { speaker, text, at }) {
  const existing = await getCallById(callId);
  if (!existing) {
    return null;
  }

  const segment = {
    speaker,
    text,
    at: at ?? new Date().toISOString(),
  };
  const transcript = [...existing.transcript, segment];

  const rows = await sql`
    UPDATE calls
    SET transcript = ${JSON.stringify(transcript)}::jsonb
    WHERE call_id = ${callId}
    RETURNING
      call_id AS "callId",
      appointment_id AS "appointmentId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
  `;

  return mapCallRow(rows[0] ?? null);
}

export async function finalizeCallForAppointment(appointmentId, { outcome, declineReason }) {
  const call = await getCallByAppointmentId(appointmentId);
  if (!call || call.status === "COMPLETED") {
    return call;
  }

  const endedAt = new Date();
  const durationSeconds = computeDurationSeconds(
    call.startedAt,
    call.patientJoinedAt,
    endedAt,
  );

  return updateCall(call.callId, {
    status: "COMPLETED",
    outcome,
    declineReason: declineReason ?? call.declineReason,
    endedAt,
    durationSeconds,
  });
}

export async function markCallAbandoned(callId) {
  const call = await getCallById(callId);
  if (!call || TERMINAL_CALL_STATUSES.has(call.status)) {
    return call;
  }

  const endedAt = new Date();
  return updateCall(callId, {
    status: "ABANDONED",
    endedAt,
    durationSeconds: computeDurationSeconds(call.startedAt, call.patientJoinedAt, endedAt),
  });
}