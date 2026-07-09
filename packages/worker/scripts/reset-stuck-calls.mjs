import "../src/load-env.js";
import PgBoss from "pg-boss";
import pg from "pg";

const QUEUES = [
  "fetch-appointments",
  "start-confirmation-call",
  "fetch-leads",
  "start-lead-call",
];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

// Put all open outbound items back in queue (end of line via created_at).
const appointments = await pool.query(`
  UPDATE appointments
  SET status = 'PENDING', livekit_room_name = NULL, created_at = NOW()
  WHERE status IN ('CALLING', 'PENDING')
  RETURNING appointment_id AS "appointmentId", status
`);

console.log(`Requeued ${appointments.rowCount} appointment(s) to PENDING (cleared rooms):`);
for (const row of appointments.rows) {
  console.log(`  - ${row.appointmentId}`);
}

const leads = await pool.query(`
  UPDATE leads
  SET status = 'PENDING', livekit_room_name = NULL, outcome = NULL, created_at = NOW()
  WHERE status IN ('CALLING', 'PENDING')
  RETURNING lead_id AS "leadId"
`);

console.log(`Requeued ${leads.rowCount} lead(s) to PENDING (cleared rooms):`);
for (const row of leads.rows) {
  console.log(`  - ${row.leadId}`);
}

// Never-joined open calls → NO_ANSWER (requeue history), not permanent abandon.
const calls = await pool.query(`
  UPDATE calls
  SET
    status = 'NO_ANSWER',
    outcome = COALESCE(outcome, 'NO_ANSWER'),
    ended_at = COALESCE(ended_at, NOW())
  WHERE status IN ('INITIATED', 'WAITING', 'IN_PROGRESS')
    AND patient_joined_at IS NULL
  RETURNING call_id AS "callId"
`);
console.log(`Marked ${calls.rowCount} never-joined call row(s) as NO_ANSWER`);

const joinedOpen = await pool.query(`
  UPDATE calls
  SET
    status = 'ABANDONED',
    ended_at = COALESCE(ended_at, NOW())
  WHERE status IN ('INITIATED', 'WAITING', 'IN_PROGRESS')
    AND patient_joined_at IS NOT NULL
  RETURNING call_id AS "callId"
`);
console.log(`Marked ${joinedOpen.rowCount} mid-call row(s) as ABANDONED`);

await pool.end();

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

await boss.start();
for (const queue of QUEUES) {
  try {
    await boss.purgeQueue(queue);
    console.log(`Purged pg-boss queue: ${queue}`);
  } catch (error) {
    console.log(`Queue ${queue}: ${error.message}`);
  }
}
await boss.stop();

console.log("Reset complete. Use Start queue buttons (or worker poll) to open the next rooms.");
