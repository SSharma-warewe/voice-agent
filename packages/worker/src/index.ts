import "./load-env.ts";

import {
  createConfirmationRoom,
  createLeadOutreachRoom,
} from "@voice-repo/livekit";
import PgBoss from "pg-boss";

import { getConfig } from "./config.ts";
import {
  claimAppointmentForCall,
  claimLeadForCall,
  countActiveCalls,
  countActiveConfirmationCalls,
  countActiveLeadCalls,
  createCall,
  createLeadCall,
  fetchAppointments,
  fetchPendingAppointmentsWithoutRoom,
  fetchPendingLeadsWithoutRoom,
  getCampaignScript,
  releaseStuckAppointments,
  releaseStuckLeads,
  requeueStaleCallingRooms,
  updateAppointmentCall,
  updateLeadCall,
} from "./db.ts";
import type {
  ConfirmationCallJobData,
  FetchJobData,
  LeadCallJobData,
} from "./types.ts";

const FETCH_QUEUE = "fetch-appointments";
const CALL_QUEUE = "start-confirmation-call";
const FETCH_LEADS_QUEUE = "fetch-leads";
const LEAD_CALL_QUEUE = "start-lead-call";

/**
 * OUTBOUND ONLY (confirmation + lead).
 *
 * INBOUND booking agent is completely separate:
 * - Started only via API POST /booking/start (createBookingRoom → inbound-booking-agent)
 * - Never uses pg-boss, never counts toward outbound slots
 * - Never mixed with appointment-confirmation-agent
 *
 * Default mode (WORKER_AUTO_DISPATCH=false):
 * - This process only runs hygiene (stuck release + requeue after join window)
 * - Outbound rooms are started by the real UI queue:
 *     POST /queue/confirmation/start
 *     POST /queue/leads/start
 *
 * Optional auto mode (WORKER_AUTO_DISPATCH=true):
 * - Polls pending rows and dispatches LiveKit rooms automatically
 */

const config = getConfig();
const {
  databaseUrl,
  pollIntervalMs: POLL_INTERVAL_MS,
  maxConcurrentCalls: MAX_CONCURRENT_CALLS,
  maxConfirmationCalls: MAX_CONFIRMATION_CALLS,
  maxLeadCalls: MAX_LEAD_CALLS,
  roomRequeueSeconds: ROOM_REQUEUE_SECONDS,
  neonSsl,
  autoDispatch: AUTO_DISPATCH,
} = config;

const boss = new PgBoss({
  connectionString: databaseUrl,
  ssl: neonSsl ? { rejectUnauthorized: false } : undefined,
});

boss.on("error", (error: Error) => {
  console.error("pg-boss error:", error);
});

await boss.start();
await boss.createQueue(FETCH_QUEUE);
await boss.createQueue(CALL_QUEUE);
await boss.createQueue(FETCH_LEADS_QUEUE);
await boss.createQueue(LEAD_CALL_QUEUE);

/** How many confirmation slots are free right now (per-type + global cap). */
async function confirmationAvailableSlots(): Promise<number> {
  const [activeConfirmation, activeTotal] = await Promise.all([
    countActiveConfirmationCalls(),
    countActiveCalls(),
  ]);
  const byType = Math.max(0, MAX_CONFIRMATION_CALLS - activeConfirmation);
  const byTotal = Math.max(0, MAX_CONCURRENT_CALLS - activeTotal);
  return Math.min(byType, byTotal);
}

/** How many lead slots are free right now (per-type + global cap). */
async function leadAvailableSlots(): Promise<number> {
  const [activeLead, activeTotal] = await Promise.all([
    countActiveLeadCalls(),
    countActiveCalls(),
  ]);
  const byType = Math.max(0, MAX_LEAD_CALLS - activeLead);
  const byTotal = Math.max(0, MAX_CONCURRENT_CALLS - activeTotal);
  return Math.min(byType, byTotal);
}

if (AUTO_DISPATCH) {
  await boss.work(FETCH_QUEUE, async ([job]) => {
    if (!job) return;

    const appointments = await fetchAppointments();

    console.log(
      `[${FETCH_QUEUE}] job ${job.id} fetched ${appointments.length} appointment(s)`,
    );

    const activeConfirmation = await countActiveConfirmationCalls();
    const availableSlots = await confirmationAvailableSlots();
    const pending = (await fetchPendingAppointmentsWithoutRoom()).slice(
      0,
      availableSlots,
    );

    if (availableSlots === 0) {
      const waiting = await fetchPendingAppointmentsWithoutRoom();
      if (waiting.length > 0) {
        console.log(
          `[${FETCH_QUEUE}] ${waiting.length} pending appointment(s) waiting for slots (${activeConfirmation}/${MAX_CONFIRMATION_CALLS} confirmation, total cap ${MAX_CONCURRENT_CALLS})`,
        );
      }
      return;
    }

    if (pending.length > 0) {
      console.log(
        `[${FETCH_QUEUE}] enqueueing ${pending.length} confirmation call(s) (${activeConfirmation}/${MAX_CONFIRMATION_CALLS} active, ${availableSlots} slot(s) available)`,
      );
    }

    for (const appointment of pending) {
      const jobId = await boss.send(
        CALL_QUEUE,
        {
          appointmentId: appointment.appointmentId,
        } satisfies ConfirmationCallJobData,
        {
          expireInMinutes: 5,
          retryLimit: 5,
          retryDelay: 20,
        },
      );

      if (jobId) {
        console.log(
          `[${FETCH_QUEUE}] enqueued ${CALL_QUEUE} for ${appointment.appointmentId}`,
        );
      }
    }
  });

  await boss.work(FETCH_LEADS_QUEUE, async ([job]) => {
    if (!job) return;

    const leads = await fetchPendingLeadsWithoutRoom();
    console.log(
      `[${FETCH_LEADS_QUEUE}] job ${job.id} fetched ${leads.length} lead(s)`,
    );

    const activeLead = await countActiveLeadCalls();
    const availableSlots = await leadAvailableSlots();
    const pending = leads.slice(0, availableSlots);

    if (availableSlots === 0) {
      if (leads.length > 0) {
        console.log(
          `[${FETCH_LEADS_QUEUE}] ${leads.length} pending lead(s) waiting for slots (${activeLead}/${MAX_LEAD_CALLS} lead, total cap ${MAX_CONCURRENT_CALLS})`,
        );
      }
      return;
    }

    if (pending.length > 0) {
      console.log(
        `[${FETCH_LEADS_QUEUE}] enqueueing ${pending.length} lead call(s) (${activeLead}/${MAX_LEAD_CALLS} active, ${availableSlots} slot(s) available)`,
      );
    }

    for (const lead of pending) {
      const jobId = await boss.send(
        LEAD_CALL_QUEUE,
        { leadId: lead.leadId } satisfies LeadCallJobData,
        {
          expireInMinutes: 5,
          retryLimit: 5,
          retryDelay: 20,
        },
      );
      if (jobId) {
        console.log(
          `[${FETCH_LEADS_QUEUE}] enqueued ${LEAD_CALL_QUEUE} for ${lead.leadId}`,
        );
      }
    }
  });

  await boss.work(CALL_QUEUE, async ([job]) => {
    if (!job) return;

    const data = job.data as ConfirmationCallJobData | undefined;
    const appointmentId = data?.appointmentId;

    if (!appointmentId) {
      throw new Error("appointmentId is required in job data");
    }

    const availableSlots = await confirmationAvailableSlots();
    if (availableSlots <= 0) {
      console.log(
        `[${CALL_QUEUE}] slots full for ${appointmentId}; will retry (${await countActiveConfirmationCalls()}/${MAX_CONFIRMATION_CALLS} confirmation)`,
      );
      throw new Error("Confirmation slots full; retry later");
    }

    const appointment = await claimAppointmentForCall(appointmentId);

    if (!appointment) {
      console.log(
        `[${CALL_QUEUE}] skipping ${appointmentId} (already claimed or not pending)`,
      );
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
        `[${CALL_QUEUE}] job ${job.id} created room ${roomName} for ${appointmentId} → appointment-confirmation-agent`,
      );
    } catch (error) {
      await releaseStuckAppointments();
      console.error(`[${CALL_QUEUE}] failed for ${appointmentId}:`, error);
      throw error;
    }
  });

  await boss.work(LEAD_CALL_QUEUE, async ([job]) => {
    if (!job) return;

    const data = job.data as LeadCallJobData | undefined;
    const leadId = data?.leadId;
    if (!leadId) {
      throw new Error("leadId is required in job data");
    }

    const availableSlots = await leadAvailableSlots();
    if (availableSlots <= 0) {
      console.log(
        `[${LEAD_CALL_QUEUE}] slots full for ${leadId}; will retry (${await countActiveLeadCalls()}/${MAX_LEAD_CALLS} lead)`,
      );
      throw new Error("Lead slots full; retry later");
    }

    const lead = await claimLeadForCall(leadId);
    if (!lead) {
      console.log(
        `[${LEAD_CALL_QUEUE}] skipping ${leadId} (claimed or not pending)`,
      );
      return;
    }

    try {
      const script = lead.campaignId
        ? await getCampaignScript(lead.campaignId)
        : null;
      const roomName = await createLeadOutreachRoom(lead, script || "");
      await updateLeadCall(leadId, roomName, "CALLING");
      await createLeadCall({
        callId: roomName,
        leadId,
        roomName,
        status: "INITIATED",
      });

      console.log(
        `[${LEAD_CALL_QUEUE}] job ${job.id} created room ${roomName} for lead ${leadId} → lead-outreach-agent`,
      );
    } catch (error) {
      await releaseStuckLeads();
      console.error(`[${LEAD_CALL_QUEUE}] failed for ${leadId}:`, error);
      throw error;
    }
  });
}

async function enqueueFetchJob(trigger: string): Promise<void> {
  await boss.send(FETCH_QUEUE, { trigger } satisfies FetchJobData);
}

async function enqueueFetchLeadsJob(trigger: string): Promise<void> {
  await boss.send(FETCH_LEADS_QUEUE, { trigger } satisfies FetchJobData);
}

async function runHygiene(trigger: string): Promise<void> {
  const freedA = await releaseStuckAppointments();
  const freedL = await releaseStuckLeads();
  if (freedA.length > 0) {
    console.log(
      `[${trigger}] released ${freedA.length} stuck appointment(s):`,
      freedA.map((r) => r.appointmentId).join(", "),
    );
  }
  if (freedL.length > 0) {
    console.log(
      `[${trigger}] released ${freedL.length} stuck lead(s):`,
      freedL.map((r) => r.leadId).join(", "),
    );
  }

  const requeued = await requeueStaleCallingRooms(ROOM_REQUEUE_SECONDS);
  if (requeued.appointments.length > 0) {
    console.log(
      `[${trigger}] requeued ${requeued.appointments.length} unanswered appointment(s) to end of queue:`,
      requeued.appointments.map((r) => r.appointmentId).join(", "),
    );
  }
  if (requeued.leads.length > 0) {
    console.log(
      `[${trigger}] requeued ${requeued.leads.length} unanswered lead(s) to end of queue:`,
      requeued.leads.map((r) => r.leadId).join(", "),
    );
  }
  if (requeued.calls.length > 0) {
    console.log(
      `[${trigger}] marked ${requeued.calls.length} stale call(s) NO_ANSWER`,
    );
  }
}

await runHygiene("startup");

if (AUTO_DISPATCH) {
  await enqueueFetchJob("startup");
  await enqueueFetchLeadsJob("startup");
}

setInterval(() => {
  void (async () => {
    try {
      await runHygiene("poll");
    } catch (error) {
      console.error("Failed stuck-call / requeue hygiene:", error);
    }
    if (AUTO_DISPATCH) {
      void enqueueFetchJob("poll").catch((error: unknown) => {
        console.error("Failed to enqueue fetch job:", error);
      });
      void enqueueFetchLeadsJob("poll").catch((error: unknown) => {
        console.error("Failed to enqueue leads fetch job:", error);
      });
    }
  })();
}, POLL_INTERVAL_MS);

console.log(
  `Worker started (poll ${POLL_INTERVAL_MS}ms). Mode: ${
    AUTO_DISPATCH
      ? "AUTO_DISPATCH=on (worker starts outbound rooms)"
      : "AUTO_DISPATCH=off (hygiene only — use POST /queue/*/start for outbound)"
  }. Outbound caps: confirmation ${MAX_CONFIRMATION_CALLS}, lead ${MAX_LEAD_CALLS}, total ${MAX_CONCURRENT_CALLS}. Requeue after ${ROOM_REQUEUE_SECONDS}s. Inbound booking is separate (POST /booking/start → inbound-booking-agent only).`,
);
