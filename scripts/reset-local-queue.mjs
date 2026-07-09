/**
 * Reset local outbound queue rows to PENDING so UI "Start … queue" can reclaim them.
 * Refuses to run against deployment db `neondb`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const require = createRequire(path.join(root, "packages/worker/package.json"));
const pg = require("pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL required");

const dbName = new URL(connectionString).pathname.replace(/^\//, "");
if (dbName === "neondb") {
  console.error("Refusing: still on deployment database neondb");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

const client = await pool.connect();
try {
  await client.query(`
    UPDATE appointments
    SET status = 'PENDING', livekit_room_name = NULL, created_at = NOW()
    WHERE status IN ('CALLING', 'PENDING')
  `);
  await client.query(`
    UPDATE leads
    SET status = 'PENDING', livekit_room_name = NULL, outcome = NULL, created_at = NOW()
    WHERE status IN ('CALLING', 'PENDING')
  `);
  await client.query(`
    UPDATE calls
    SET status = 'ABANDONED', ended_at = COALESCE(ended_at, NOW())
    WHERE status IN ('INITIATED', 'WAITING', 'IN_PROGRESS')
  `);

  // Ensure seed rows exist for a clean test
  await client.query(`
    INSERT INTO appointments (
      appointment_id, patient_name, phone, doctor_name,
      appointment_date, appointment_time, status, livekit_room_name
    ) VALUES (
      'apt_local_001', 'Alex Rivera', '+15551234001', 'Dr. Chen',
      '2026-07-15', '10:30', 'PENDING', NULL
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET status = 'PENDING', livekit_room_name = NULL, created_at = NOW()
  `);

  await client.query(`
    INSERT INTO campaigns (campaign_id, name, script)
    VALUES (
      'camp_local_001',
      'Local outreach',
      'Be warm and professional. Goal: book a clinic appointment. Ask preferred day and time next week.'
    )
    ON CONFLICT (campaign_id) DO UPDATE SET script = EXCLUDED.script
  `);

  await client.query(`
    INSERT INTO leads (lead_id, campaign_id, name, phone, status, livekit_room_name, outcome)
    VALUES (
      'lead_local_001', 'camp_local_001', 'Sam Patel', '+15551234002',
      'PENDING', NULL, NULL
    )
    ON CONFLICT (lead_id) DO UPDATE
    SET status = 'PENDING', livekit_room_name = NULL, outcome = NULL, created_at = NOW()
  `);

  const a = await client.query(
    `SELECT appointment_id, status, livekit_room_name FROM appointments ORDER BY created_at DESC LIMIT 5`,
  );
  const l = await client.query(
    `SELECT lead_id, status, livekit_room_name FROM leads ORDER BY created_at DESC LIMIT 5`,
  );
  console.log(`Reset local db "${dbName}"`);
  console.log("Appointments:", a.rows);
  console.log("Leads:", l.rows);
} finally {
  client.release();
  await pool.end();
}
