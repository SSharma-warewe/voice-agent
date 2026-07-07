import "../src/load-env.js";
import PgBoss from "pg-boss";
import pg from "pg";

const FETCH_QUEUE = "fetch-appointments";
const CALL_QUEUE = "start-confirmation-call";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

const result = await pool.query(`
  UPDATE appointments
  SET status = 'PENDING', livekit_room_name = NULL
  RETURNING appointment_id AS "appointmentId"
`);

console.log(`Reset ${result.rowCount} appointment(s) to PENDING:`);
for (const row of result.rows) {
  console.log(`  - ${row.appointmentId}`);
}

await pool.end();

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

await boss.start();
await boss.purgeQueue(FETCH_QUEUE);
await boss.purgeQueue(CALL_QUEUE);
await boss.stop();

console.log(`Purged pg-boss queues: ${FETCH_QUEUE}, ${CALL_QUEUE}`);