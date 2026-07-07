import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

await pool.query(
  `
    UPDATE appointments
    SET status = 'PENDING', livekit_room_name = NULL
    WHERE appointment_id = 'apt_demo_001'
  `,
);

const result = await pool.query(
  `
    SELECT appointment_id, status, livekit_room_name
    FROM appointments
    WHERE appointment_id = 'apt_demo_001'
  `,
);

console.log("Reset demo appointment:", result.rows[0]);
await pool.end();