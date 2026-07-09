import "../src/load-env.js";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

const result = await pool.query(`
  UPDATE appointments
  SET status = 'PENDING', livekit_room_name = NULL
  WHERE status = 'CALLING'
  RETURNING appointment_id AS "appointmentId"
`);

console.log(`Reset ${result.rowCount} stuck CALLING appointment(s):`);
for (const row of result.rows) {
  console.log(`  - ${row.appointmentId}`);
}

await pool.end();