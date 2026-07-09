import * as appointmentsRepo from "../appointments/appointments.repo.ts";
import * as leadsRepo from "../leads/leads.repo.ts";
import {
  APPOINTMENT_TERMINAL_STATUSES,
  CALL_TERMINAL_STATUSES,
  LEAD_TERMINAL_STATUSES,
  type Call,
  type UpdateCallInput,
} from "../../shared/types.ts";
import * as callsRepo from "./calls.repo.ts";
import { inferOutcomeFromTranscript } from "./transcript-inference.ts";

export function computeDurationSeconds(
  startedAt: string | Date,
  patientJoinedAt: string | Date | null | undefined,
  endedAt: string | Date | null | undefined,
): number {
  const start = patientJoinedAt ?? startedAt;
  const end = endedAt ?? new Date();
  return Math.max(
    0,
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 1000,
    ),
  );
}

/**
 * Patient never joined: put entity back at end of PENDING queue (not ABANDONED/FAILED).
 * Bumps created_at so FIFO places it last.
 */
export async function requeueOutboundEntityForCall(call: {
  appointmentId?: string | null;
  leadId?: string | null;
}): Promise<{ appointment: unknown; lead: unknown }> {
  if (!call) return { appointment: null, lead: null };

  let appointment = null;
  let lead = null;

  if (call.appointmentId) {
    appointment = await appointmentsRepo.requeueAppointment(call.appointmentId);
  }

  if (call.leadId) {
    lead = await leadsRepo.requeueLead(call.leadId);
  }

  return { appointment, lead };
}

/**
 * Free the outbound queue slot for the appointment or lead attached to a call.
 * - Never joined (NO_ANSWER / abandon / failed before join) → requeue to PENDING.
 * - Joined then left / real outcome → terminal status + clear room.
 */
async function releaseOutboundEntityForCall(call: Call): Promise<void> {
  if (!call) return;

  const neverJoined = !call.patientJoinedAt;
  const unansweredOrFailed =
    call.status === "NO_ANSWER" ||
    call.status === "FAILED" ||
    (call.status === "ABANDONED" && neverJoined);

  if (neverJoined && unansweredOrFailed) {
    try {
      await requeueOutboundEntityForCall(call);
    } catch (error) {
      console.error(
        `Failed to requeue entity for call ${call.callId}:`,
        error,
      );
    }
    return;
  }

  if (call.appointmentId) {
    try {
      const appt = await appointmentsRepo.getAppointmentById(call.appointmentId);
      if (appt && !APPOINTMENT_TERMINAL_STATUSES.has(appt.status)) {
        const inferred = inferOutcomeFromTranscript(call.transcript || []);
        if (inferred) {
          await appointmentsRepo.updateAppointmentStatus(call.appointmentId, {
            status: inferred.status,
            ...(inferred.declineReason
              ? { declineReason: inferred.declineReason }
              : {}),
          });
        } else {
          const outcome = (call.outcome || "").toUpperCase();
          let status = "ABANDONED";
          if (APPOINTMENT_TERMINAL_STATUSES.has(outcome) && outcome !== "ABANDONED") {
            status = outcome;
          } else if (call.status === "ABANDONED" || call.status === "FAILED") {
            status = "ABANDONED";
          }
          await appointmentsRepo.updateAppointmentStatus(call.appointmentId, {
            status,
          });
        }
      } else if (appt && appt.livekitRoomName) {
        await appointmentsRepo.clearAppointmentRoom(call.appointmentId);
      }
    } catch (error) {
      console.error(
        `Failed to release appointment ${call.appointmentId} for call ${call.callId}:`,
        error,
      );
    }
  }

  if (call.leadId) {
    try {
      const lead = await leadsRepo.getLeadById(call.leadId);
      if (lead && !LEAD_TERMINAL_STATUSES.has(lead.status)) {
        const outcome = (call.outcome || "").toUpperCase();
        let status = "FAILED";
        if (outcome === "BOOKED" || lead.status === "BOOKED") {
          status = "BOOKED";
        } else if (outcome === "DECLINED" || call.status === "COMPLETED") {
          status =
            outcome === "DECLINED"
              ? "DECLINED"
              : lead.status === "CALLING"
                ? "FAILED"
                : "DECLINED";
        } else if (call.status === "ABANDONED" || call.status === "FAILED") {
          status = "FAILED";
        }
        await leadsRepo.updateLeadStatusFields(call.leadId, {
          status,
          outcome: call.outcome || status,
        });
      } else if (lead && lead.livekitRoomName) {
        await leadsRepo.updateLeadStatusFields(call.leadId, {
          status: lead.status,
          outcome: lead.outcome,
          clearRoom: true,
        });
      }
    } catch (error) {
      console.error(
        `Failed to release lead ${call.leadId} for call ${call.callId}:`,
        error,
      );
    }
  }
}

export async function updateCall(
  callId: string,
  update: UpdateCallInput,
): Promise<Call | null> {
  const existing = await callsRepo.getCallById(callId);
  if (!existing) {
    return null;
  }

  const status = update.status ?? existing.status;
  const outcome =
    update.outcome !== undefined ? update.outcome : existing.outcome;
  const declineReason =
    update.declineReason !== undefined
      ? update.declineReason
      : existing.declineReason;
  const patientJoinedAt =
    update.patientJoinedAt !== undefined
      ? update.patientJoinedAt
      : existing.patientJoinedAt;
  const endedAt =
    update.endedAt !== undefined ? update.endedAt : existing.endedAt;

  let durationSeconds = update.durationSeconds ?? existing.durationSeconds;
  if (endedAt && durationSeconds == null) {
    durationSeconds = computeDurationSeconds(
      existing.startedAt,
      patientJoinedAt,
      endedAt instanceof Date ? endedAt : new Date(endedAt),
    );
  }

  const result = await callsRepo.updateCallFields(callId, {
    status,
    outcome: outcome ?? null,
    declineReason: declineReason ?? null,
    patientJoinedAt: patientJoinedAt ?? null,
    endedAt: endedAt ?? null,
    durationSeconds: durationSeconds ?? null,
  });

  if (!result) {
    return null;
  }

  // Session close without a terminal status → treat as abandoned
  if (
    result.endedAt &&
    !existing.endedAt &&
    !CALL_TERMINAL_STATUSES.has(result.status)
  ) {
    return updateCall(callId, {
      status: "ABANDONED",
      endedAt: result.endedAt,
      outcome: result.outcome || "ABANDONED",
      durationSeconds: result.durationSeconds,
    });
  }

  const becameTerminal =
    CALL_TERMINAL_STATUSES.has(result.status) &&
    !CALL_TERMINAL_STATUSES.has(existing.status);
  const becameEnded = Boolean(result.endedAt && !existing.endedAt);

  if (becameTerminal || becameEnded) {
    await releaseOutboundEntityForCall(result);
  }

  return result;
}

export async function appendTranscriptSegment(
  callId: string,
  segment: { speaker: string; text: string; at?: string },
): Promise<Call | null> {
  const existing = await callsRepo.getCallById(callId);
  if (!existing) {
    return null;
  }

  const next = {
    speaker: segment.speaker,
    text: segment.text,
    at: segment.at ?? new Date().toISOString(),
  };
  const transcript = [...existing.transcript, next];

  return callsRepo.setTranscript(callId, transcript);
}

export async function finalizeCallForAppointment(
  appointmentId: string,
  opts: { outcome: string; declineReason?: string },
): Promise<Call | null> {
  const call = await callsRepo.getCallByAppointmentId(appointmentId);
  if (!call || call.status === "COMPLETED") {
    return call;
  }

  const endedAt = new Date();
  const durationSeconds = computeDurationSeconds(
    call.startedAt,
    call.patientJoinedAt,
    endedAt,
  );

  const declineReason = opts.declineReason ?? call.declineReason;
  return updateCall(call.callId, {
    status: "COMPLETED",
    outcome: opts.outcome,
    ...(declineReason != null ? { declineReason } : {}),
    endedAt,
    durationSeconds,
  });
}

export async function finalizeCallForLead(
  leadId: string,
  opts: { outcome: string },
): Promise<Call | null> {
  const call = await callsRepo.getCallByLeadId(leadId);
  if (!call || call.status === "COMPLETED") {
    return call;
  }
  const endedAt = new Date();
  const durationSeconds = computeDurationSeconds(
    call.startedAt,
    call.patientJoinedAt,
    endedAt,
  );
  return updateCall(call.callId, {
    status: "COMPLETED",
    outcome: opts.outcome,
    endedAt,
    durationSeconds,
  });
}

export async function markCallAbandoned(callId: string): Promise<Call | null> {
  const call = await callsRepo.getCallById(callId);
  if (!call || CALL_TERMINAL_STATUSES.has(call.status)) {
    if (call) {
      await releaseOutboundEntityForCall(call);
    }
    return call;
  }

  const endedAt = new Date();
  return updateCall(callId, {
    status: "ABANDONED",
    endedAt,
    durationSeconds: computeDurationSeconds(
      call.startedAt,
      call.patientJoinedAt,
      endedAt,
    ),
  });
}

export async function requeueUnansweredCalling(
  maxAgeSeconds = 300,
): Promise<{
  appointments: { appointmentId: string }[];
  leads: { leadId: string }[];
}> {
  const age = Math.max(0, Number(maxAgeSeconds) || 0);
  const cutoff = new Date(Date.now() - age * 1000).toISOString();

  await callsRepo.markStaleCallsNoAnswer(cutoff);
  const appointments = await callsRepo.requeueStaleCallingAppointments(cutoff);
  const leads = await callsRepo.requeueStaleCallingLeads(cutoff);

  return { appointments, leads };
}

export async function listCalls() {
  return callsRepo.listCalls();
}

export async function getCallById(callId: string) {
  return callsRepo.getCallById(callId);
}

export async function getCallStats() {
  return callsRepo.getCallStats();
}

export async function getCallByAppointmentId(appointmentId: string) {
  return callsRepo.getCallByAppointmentId(appointmentId);
}

export async function getCallByLeadId(leadId: string) {
  return callsRepo.getCallByLeadId(leadId);
}

export async function createCall(
  input: Parameters<typeof callsRepo.createCall>[0],
) {
  return callsRepo.createCall(input);
}

export async function createLeadCall(
  input: Parameters<typeof callsRepo.createLeadCall>[0],
) {
  return callsRepo.createLeadCall(input);
}
