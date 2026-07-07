import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

const demo = {
  appointmentId: "apt_demo_001",
  patientName: "Demo Patient",
  phone: "+15551234567",
  doctorName: "Dr. Smith",
  appointmentDate: "2026-07-10",
  appointmentTime: "14:00",
};

await pool.query(`
  ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS doctor_name TEXT NOT NULL DEFAULT 'Dr. Smith'
`);
await pool.query(`
  ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING'
`);
await pool.query(`
  ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS livekit_room_name TEXT
`);

await pool.query(
  `
    INSERT INTO appointments (
      appointment_id,
      patient_name,
      phone,
      doctor_name,
      appointment_date,
      appointment_time,
      status,
      livekit_room_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NULL)
    ON CONFLICT (appointment_id) DO UPDATE
    SET
      patient_name = EXCLUDED.patient_name,
      phone = EXCLUDED.phone,
      doctor_name = EXCLUDED.doctor_name,
      appointment_date = EXCLUDED.appointment_date,
      appointment_time = EXCLUDED.appointment_time,
      status = 'PENDING',
      livekit_room_name = NULL
  `,
  [
    demo.appointmentId,
    demo.patientName,
    demo.phone,
    demo.doctorName,
    demo.appointmentDate,
    demo.appointmentTime,
  ],
);

const result = await pool.query(
  `
    SELECT
      appointment_id AS "appointmentId",
      patient_name AS "patientName",
      doctor_name AS "doctorName",
      status,
      livekit_room_name AS "livekitRoomName"
    FROM appointments
    WHERE appointment_id = $1
  `,
  [demo.appointmentId],
);

console.log("Demo appointment ready:", result.rows[0]);
await pool.end();