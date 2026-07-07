import "./load-env.js";
import PgBoss from "pg-boss";
import { createConfirmationRoom } from "@voice-repo/livekit";
import {
  claimAppointmentForCall,
  createCall,
  countActiveCalls,
  fetchAppointments,
  fetchPendingAppointmentsWithoutRoom,
  releaseStuckAppointments,
  updateAppointmentCall,
} from "./db.js";

const FETCH_QUEUE = "fetch-appointments";
const CALL_QUEUE = "start-confirmation-call";
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 30_000);
const MAX_CONCURRENT_CALLS = Number(process.env.MAX_CONCURRENT_CALLS ?? 3);

if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS < 5_000) {
  throw new Error("WORKER_POLL_INTERVAL_MS must be a number >= 5000");
}

if (!Number.isFinite(MAX_CONCURRENT_CALLS) || MAX_CONCURRENT_CALLS < 1) {
  throw new Error("MAX_CONCURRENT_CALLS must be a number >= 1");
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const boss = new PgBoss({
  connectionString,
  ssl: connectionString.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

boss.on("error", (error) => {
  console.error("pg-boss error:", error);
});

await boss.start();
await boss.createQueue(FETCH_QUEUE);
await boss.createQueue(CALL_QUEUE);

await boss.work(FETCH_QUEUE, async ([job]) => {
  const appointments = await fetchAppointments();

  console.log(
    `[${FETCH_QUEUE}] job ${job.id} fetched ${appointments.length} appointment(s)`,
  );

  const activeCalls = await countActiveCalls();
  const availableSlots = Math.max(0, MAX_CONCURRENT_CALLS - activeCalls);
  const pending = (await fetchPendingAppointmentsWithoutRoom()).slice(
    0,
    availableSlots,
  );

  if (availableSlots === 0) {
    const waiting = await fetchPendingAppointmentsWithoutRoom();
    if (waiting.length > 0) {
      console.log(
        `[${FETCH_QUEUE}] ${waiting.length} pending appointment(s) waiting for slots (${activeCalls}/${MAX_CONCURRENT_CALLS} active calls)`,
      );
    }
    return;
  }

  if (pending.length > 0) {
    console.log(
      `[${FETCH_QUEUE}] enqueueing ${pending.length} call(s) (${activeCalls}/${MAX_CONCURRENT_CALLS} active, ${availableSlots} slot(s) available)`,
    );
  }

  for (const appointment of pending) {
    const jobId = await boss.send(
      CALL_QUEUE,
      { appointmentId: appointment.appointmentId },
      {
        singletonKey: appointment.appointmentId,
        singletonHours: 24,
        expireInMinutes: 2,
      },
    );

    if (jobId) {
      console.log(
        `[${FETCH_QUEUE}] enqueued ${CALL_QUEUE} for ${appointment.appointmentId}`,
      );
    }
  }
});

await boss.work(CALL_QUEUE, async ([job]) => {
  const appointmentId = job.data?.appointmentId;

  if (!appointmentId) {
    throw new Error("appointmentId is required in job data");
  }

  const activeCalls = await countActiveCalls();
  if (activeCalls >= MAX_CONCURRENT_CALLS) {
    console.log(
      `[${CALL_QUEUE}] deferring ${appointmentId} (${activeCalls}/${MAX_CONCURRENT_CALLS} active calls)`,
    );
    return;
  }

  const appointment = await claimAppointmentForCall(appointmentId);

  if (!appointment) {
    console.log(`[${CALL_QUEUE}] skipping ${appointmentId} (already claimed or not pending)`);
    return;
  }

  try {
    const roomName = await createConfirmationRoom(appointment);
    await updateAppointmentCall(appointmentId, roomName, "CALLING");
    await createCall({
      callId: roomName,
      appointmentId,
      roomName,
      status: "INITIATED",
    });

    console.log(
      `[${CALL_QUEUE}] job ${job.id} created room ${roomName} for ${appointmentId}`,
    );
  } catch (error) {
    await releaseStuckAppointments();
    console.error(`[${CALL_QUEUE}] failed for ${appointmentId}:`, error);
    throw error;
  }
});

async function enqueueFetchJob(trigger) {
  await boss.send(FETCH_QUEUE, { trigger });
}

const released = await releaseStuckAppointments();
if (released.length > 0) {
  console.log(
    `[startup] released ${released.length} stuck appointment(s):`,
    released.map((row) => row.appointmentId).join(", "),
  );
}

await enqueueFetchJob("startup");

setInterval(() => {
  void enqueueFetchJob("poll").catch((error) => {
    console.error("Failed to enqueue fetch job:", error);
  });
}, POLL_INTERVAL_MS);

console.log(
  `Worker started. Queues "${FETCH_QUEUE}" and "${CALL_QUEUE}" ready (poll every ${POLL_INTERVAL_MS}ms, max ${MAX_CONCURRENT_CALLS} concurrent calls).`,
);