/**
 * Seed a clean local queue with one pending appointment + one pending lead
 * so real agents (not placeholders) have work to do.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const dbName = new URL(connectionString).pathname.replace(/^\//, "");
if (dbName === "neondb") {
  console.error(
    "Refusing to seed: DATABASE_URL still points at deployment db `neondb`. Run ensure-local-db and switch to voice_repo_local.",
  );
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
  // Minimal schema (mirrors API init; safe if already created)
  await client.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      appointment_id TEXT PRIMARY KEY,
      patient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_name TEXT NOT NULL DEFAULT 'Dr. Smith'`,
  );
  await client.query(
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING'`,
  );
  await client.query(
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS livekit_room_name TEXT`,
  );
  await client.query(
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS decline_reason TEXT`,
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS calls (
      call_id TEXT PRIMARY KEY,
      appointment_id TEXT,
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
  `);
  await client.query(`ALTER TABLE calls ADD COLUMN IF NOT EXISTS lead_id TEXT`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      campaign_id TEXT PRIMARY KEY,
      name TEXT,
      script TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS leads (
      lead_id TEXT PRIMARY KEY,
      campaign_id TEXT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      livekit_room_name TEXT,
      outcome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

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
    ON CONFLICT (campaign_id) DO UPDATE
    SET script = EXCLUDED.script
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
    `SELECT appointment_id, patient_name, status FROM appointments WHERE appointment_id = 'apt_local_001'`,
  );
  const l = await client.query(
    `SELECT lead_id, name, status FROM leads WHERE lead_id = 'lead_local_001'`,
  );

  console.log(`Seeded local db "${dbName}"`);
  console.log("Appointment:", a.rows[0]);
  console.log("Lead:", l.rows[0]);
} finally {
  client.release();
  await pool.end();
}
