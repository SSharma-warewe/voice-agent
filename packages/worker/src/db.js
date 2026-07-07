import pg from "pg";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }

    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  return pool;
}

const APPOINTMENT_COLUMNS = `
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

export async function fetchAppointments() {
  const result = await getPool().query(`
    SELECT ${APPOINTMENT_COLUMNS}
    FROM appointments
    ORDER BY created_at DESC
  `);

  return result.rows;
}

export async function fetchPendingAppointmentsWithoutRoom() {
  const result = await getPool().query(`
    SELECT ${APPOINTMENT_COLUMNS}
    FROM appointments
    WHERE livekit_room_name IS NULL
      AND status = 'PENDING'
    ORDER BY created_at ASC
  `);

  return result.rows;
}

export async function countActiveCalls() {
  const result = await getPool().query(`
    SELECT COUNT(*)::int AS count
    FROM appointments
    WHERE status = 'CALLING'
      AND livekit_room_name IS NOT NULL
  `);

  return result.rows[0]?.count ?? 0;
}

export async function releaseStuckAppointments() {
  const result = await getPool().query(`
    UPDATE appointments
    SET status = 'PENDING'
    WHERE status = 'CALLING'
      AND livekit_room_name IS NULL
    RETURNING appointment_id AS "appointmentId"
  `);

  return result.rows;
}

export async function getAppointmentById(appointmentId) {
  const result = await getPool().query(
    `
      SELECT ${APPOINTMENT_COLUMNS}
      FROM appointments
      WHERE appointment_id = $1
      LIMIT 1
    `,
    [appointmentId],
  );

  return result.rows[0] ?? null;
}

export async function claimAppointmentForCall(appointmentId) {
  const claimed = await getPool().query(
    `
      UPDATE appointments
      SET status = 'CALLING'
      WHERE appointment_id = $1
        AND status = 'PENDING'
        AND livekit_room_name IS NULL
      RETURNING ${APPOINTMENT_COLUMNS}
    `,
    [appointmentId],
  );

  if (claimed.rows[0]) {
    return claimed.rows[0];
  }

  const stuck = await getPool().query(
    `
      SELECT ${APPOINTMENT_COLUMNS}
      FROM appointments
      WHERE appointment_id = $1
        AND status = 'CALLING'
        AND livekit_room_name IS NULL
      LIMIT 1
    `,
    [appointmentId],
  );

  return stuck.rows[0] ?? null;
}

export async function updateAppointmentCall(appointmentId, livekitRoomName, status) {
  const result = await getPool().query(
    `
      UPDATE appointments
      SET livekit_room_name = $2, status = $3
      WHERE appointment_id = $1
      RETURNING ${APPOINTMENT_COLUMNS}
    `,
    [appointmentId, livekitRoomName, status],
  );

  return result.rows[0] ?? null;
}

export async function createCall({ callId, appointmentId, roomName, status = "INITIATED" }) {
  const result = await getPool().query(
    `
      INSERT INTO calls (
        call_id,
        appointment_id,
        livekit_room_name,
        status
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (call_id) DO UPDATE
      SET status = EXCLUDED.status
      RETURNING call_id AS "callId"
    `,
    [callId, appointmentId, roomName, status],
  );

  return result.rows[0] ?? null;
}