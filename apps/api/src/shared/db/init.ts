import { sql } from "./client.ts";

/** Create tables / columns if missing (safe on every process start). */
export async function initDb(): Promise<void> {
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
      appointment_id TEXT REFERENCES appointments(appointment_id),
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

  await sql`
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS lead_id TEXT
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS campaigns (
      campaign_id TEXT PRIMARY KEY,
      name TEXT,
      script TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      lead_id TEXT PRIMARY KEY,
      campaign_id TEXT REFERENCES campaigns(campaign_id),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      livekit_room_name TEXT,
      outcome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Relax FK/not-null for mixed lead + appointment + booking calls
  try {
    await sql`ALTER TABLE calls ALTER COLUMN appointment_id DROP NOT NULL`;
  } catch {
    // already nullable or unsupported on this DB revision
  }

  await sql`
    CREATE TABLE IF NOT EXISTS booking_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      config JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
