import { getConfig } from "../../config/env.ts";
import {
  createConfirmationRoom,
  createLeadOutreachRoom,
} from "../../shared/livekit.ts";
import * as appointmentsRepo from "../appointments/appointments.repo.ts";
import * as campaignsRepo from "../campaigns/campaigns.repo.ts";
import * as callsService from "../calls/calls.service.ts";
import * as leadsRepo from "../leads/leads.repo.ts";

export async function startConfirmationQueue() {
  const config = getConfig();
  await callsService.requeueUnansweredCalling(config.roomRequeueSeconds);

  const activeConf = await appointmentsRepo.countActiveConfirmationCalls();
  const activeLead = await leadsRepo.countActiveLeadCalls();
  const activeTotal = activeConf + activeLead;
  const slots = Math.min(
    Math.max(0, config.maxConfirmationCalls - activeConf),
    Math.max(0, config.maxConcurrentCalls - activeTotal),
  );

  if (slots <= 0) {
    return {
      started: false as const,
      reason: "slots_full" as const,
      message: `Confirmation slot full (${activeConf}/${config.maxConfirmationCalls}). Wait for join window or requeue.`,
      activeConfirmation: activeConf,
      activeTotal,
    };
  }

  const pending = await appointmentsRepo.fetchPendingAppointmentsWithoutRoom();
  if (pending.length === 0) {
    return {
      started: false as const,
      reason: "empty_queue" as const,
      message: "No pending appointments in the queue.",
    };
  }

  const claimed = await appointmentsRepo.claimAppointmentForCall(
    pending[0]!.appointmentId,
  );
  if (!claimed) {
    return {
      started: false as const,
      reason: "claim_failed" as const,
      message: "Could not claim next appointment (already claimed).",
    };
  }

  try {
    const roomName = (await createConfirmationRoom(claimed)) as string;
    await appointmentsRepo.updateAppointmentCall(
      claimed.appointmentId,
      roomName,
      "CALLING",
    );
    await callsService.createCall({
      callId: roomName,
      appointmentId: claimed.appointmentId,
      roomName,
      status: "INITIATED",
    });

    return {
      started: true as const,
      appointmentId: claimed.appointmentId,
      roomName,
      message: `Room ready for ${claimed.patientName}. Join within ${config.roomRequeueSeconds / 60} minutes or it returns to the end of the queue.`,
    };
  } catch (error) {
    await callsService
      .requeueOutboundEntityForCall({
        appointmentId: claimed.appointmentId,
        leadId: null,
      })
      .catch(() => undefined);
    throw error;
  }
}

export async function startLeadQueue() {
  const config = getConfig();
  await callsService.requeueUnansweredCalling(config.roomRequeueSeconds);

  const activeLead = await leadsRepo.countActiveLeadCalls();
  const activeConf = await appointmentsRepo.countActiveConfirmationCalls();
  const activeTotal = activeConf + activeLead;
  const slots = Math.min(
    Math.max(0, config.maxLeadCalls - activeLead),
    Math.max(0, config.maxConcurrentCalls - activeTotal),
  );

  if (slots <= 0) {
    return {
      started: false as const,
      reason: "slots_full" as const,
      message: `Lead slot full (${activeLead}/${config.maxLeadCalls}). Wait for join window or requeue.`,
      activeLead,
      activeTotal,
    };
  }

  const pending = await leadsRepo.fetchPendingLeadsWithoutRoom();
  if (pending.length === 0) {
    return {
      started: false as const,
      reason: "empty_queue" as const,
      message: "No pending leads in the queue.",
    };
  }

  const claimed = await leadsRepo.claimLeadForCall(pending[0]!.leadId);
  if (!claimed) {
    return {
      started: false as const,
      reason: "claim_failed" as const,
      message: "Could not claim next lead (already claimed).",
    };
  }

  try {
    const script = claimed.campaignId
      ? await campaignsRepo.getCampaignScript(claimed.campaignId)
      : null;
    const roomName = (await createLeadOutreachRoom(
      claimed,
      script || "",
    )) as string;
    await leadsRepo.updateLeadCall(claimed.leadId, roomName, "CALLING");
    await callsService.createLeadCall({
      callId: roomName,
      leadId: claimed.leadId,
      roomName,
      status: "INITIATED",
    });

    return {
      started: true as const,
      leadId: claimed.leadId,
      roomName,
      message: `Room ready for ${claimed.name}. Join within ${config.roomRequeueSeconds / 60} minutes or it returns to the end of the queue.`,
    };
  } catch (error) {
    await callsService
      .requeueOutboundEntityForCall({
        appointmentId: null,
        leadId: claimed.leadId,
      })
      .catch(() => undefined);
    throw error;
  }
}
