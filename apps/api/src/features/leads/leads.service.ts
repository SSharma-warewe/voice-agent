import { createParticipantToken } from "../../shared/livekit.ts";
import * as callsRepo from "../calls/calls.repo.ts";
import * as callsService from "../calls/calls.service.ts";
import * as leadsRepo from "./leads.repo.ts";

export async function listLeads() {
  return leadsRepo.listLeads();
}

export async function getLeadById(leadId: string) {
  return leadsRepo.getLeadById(leadId);
}

export async function getLeadStats() {
  return callsRepo.getLeadCallStats();
}

export async function updateStatus(
  leadId: string,
  update: { status?: string; outcome?: string },
) {
  const lead = await leadsRepo.updateLeadStatusFields(leadId, update);
  if (!lead) {
    return null;
  }

  // Keep call row in sync when lead is resolved via tools (booked/declined).
  if (update.status === "BOOKED" || update.status === "DECLINED") {
    try {
      await callsService.finalizeCallForLead(leadId, {
        outcome: update.outcome || update.status,
      });
    } catch {
      // best effort
    }
  }

  return lead;
}

export async function joinLead(leadId: string) {
  const lead = await leadsRepo.getLeadById(leadId);
  if (!lead) {
    return {
      ok: false as const,
      statusCode: 404 as const,
      errorMessage: "Lead not found",
    };
  }
  if (lead.status !== "CALLING" || !lead.livekitRoomName) {
    return {
      ok: false as const,
      statusCode: 409 as const,
      errorMessage:
        "No active call room. Start the lead queue, or wait if this call was requeued after the join window.",
    };
  }

  const join = (await createParticipantToken({
    roomName: lead.livekitRoomName,
    identity: `patient-${lead.leadId}`,
    name: lead.name,
  })) as {
    token: string;
    serverUrl: string;
    roomName: string;
  };

  await callsService.updateCall(lead.livekitRoomName, {
    status: "IN_PROGRESS",
    patientJoinedAt: new Date().toISOString(),
  });

  return { ok: true as const, join, lead };
}

export async function getLeadCall(leadId: string) {
  return callsService.getCallByLeadId(leadId);
}
