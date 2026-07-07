import "../src/load-env.js";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

const byStatus = await pool.query(`
  SELECT status, COUNT(*)::int AS count
  FROM appointments
  GROUP BY status
  ORDER BY status
`);

const stuck = await pool.query(`
  SELECT appointment_id, status, livekit_room_name
  FROM appointments
  WHERE appointment_id LIKE 'apt_int_%' OR status = 'CALLING'
  ORDER BY created_at DESC
  LIMIT 30
`);

console.log("Appointments by status:", byStatus.rows);
console.log("Integration/CALLING appointments:", stuck.rows);
await pool.end();