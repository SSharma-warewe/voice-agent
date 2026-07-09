import type { AgentDispatchClient } from "livekit-server-sdk";

import {
  buildRoomName,
  getAgentDispatchClient,
  getAgentName,
  getRoomServiceClient,
} from "./client.ts";
import type {
  BookingRoomContext,
  ConfirmationAppointment,
  LeadOutreachInput,
} from "./types.ts";

export function toRoomMetadata(appointment: ConfirmationAppointment): string {
  return JSON.stringify({
    appointmentId: appointment.appointmentId,
    patientName: appointment.patientName,
    doctorName: appointment.doctorName,
    appointmentDate: appointment.appointmentDate,
    appointmentTime: appointment.appointmentTime,
    phone: appointment.phone,
  });
}

export function toLeadRoomMetadata(
  lead: LeadOutreachInput,
  script = "",
): string {
  // Include both `name` (agent parser) and `patientName` (legacy) so agents
  // never fall through to demo placeholders.
  return JSON.stringify({
    leadId: lead.leadId ?? lead.id,
    name: lead.name,
    patientName: lead.name,
    phone: lead.phone,
    script: script || lead.script || "",
    campaignId: lead.campaignId || null,
  });
}

async function clearAgentDispatches(
  dispatchClient: AgentDispatchClient,
  roomName: string,
  agentName: string,
): Promise<void> {
  try {
    const existingDispatches = await dispatchClient.listDispatch(roomName);
    await Promise.all(
      existingDispatches
        .filter((dispatch) => dispatch.agentName === agentName)
        .map((dispatch) =>
          dispatchClient.deleteDispatch(dispatch.id, roomName),
        ),
    );
  } catch {
    // Room may not exist yet; stale dispatches are cleared on the next attempt.
  }
}

function emptyTimeoutSeconds(): number {
  return Number(
    process.env.LIVEKIT_EMPTY_TIMEOUT_SEC ??
      process.env.ROOM_REQUEUE_SECONDS ??
      300,
  );
}

export async function createConfirmationRoom(
  appointment: ConfirmationAppointment,
): Promise<string> {
  const roomName = buildRoomName(appointment.appointmentId);
  const metadata = toRoomMetadata(appointment);
  const roomClient = getRoomServiceClient();
  const dispatchClient = getAgentDispatchClient();
  const agentName = getAgentName();

  await clearAgentDispatches(dispatchClient, roomName, agentName);

  try {
    await roomClient.deleteRoom(roomName);
  } catch {
    // Room may not exist on retry.
  }

  const emptyTimeout = emptyTimeoutSeconds();

  await roomClient.createRoom({
    name: roomName,
    metadata,
    emptyTimeout,
    departureTimeout: 20,
  });

  await dispatchClient.createDispatch(roomName, agentName, {
    metadata,
  });

  return roomName;
}

export async function createLeadOutreachRoom(
  lead: LeadOutreachInput,
  script = "",
): Promise<string> {
  const id = lead.leadId || lead.id;
  if (!id) {
    throw new Error("leadId or id is required to create a lead outreach room");
  }
  const roomName = buildRoomName(id);
  const metadata = toLeadRoomMetadata(lead, script);
  const roomClient = getRoomServiceClient();
  const dispatchClient = getAgentDispatchClient();
  const agentName = getAgentName("lead");

  await clearAgentDispatches(dispatchClient, roomName, agentName);

  try {
    await roomClient.deleteRoom(roomName);
  } catch {
    // ignore
  }

  const emptyTimeout = emptyTimeoutSeconds();

  await roomClient.createRoom({
    name: roomName,
    metadata,
    emptyTimeout,
    departureTimeout: 20,
  });

  await dispatchClient.createDispatch(roomName, agentName, {
    metadata,
  });

  return roomName;
}

export function toBookingRoomMetadata(context?: BookingRoomContext | null): string {
  const c = context ?? {};
  return JSON.stringify({
    type: "booking",
    sessionId: c.sessionId || `book_${Date.now()}`,
    callerName: c.callerName || undefined,
    phone: c.phone || undefined,
  });
}

export async function createBookingRoom(
  sessionId?: string,
): Promise<string> {
  const id = sessionId || `book_${Date.now()}`;
  const roomName = buildRoomName(id);
  const metadata = toBookingRoomMetadata({ sessionId: id });
  const roomClient = getRoomServiceClient();
  const dispatchClient = getAgentDispatchClient();
  const agentName = getAgentName("booking");

  await clearAgentDispatches(dispatchClient, roomName, agentName);

  try {
    await roomClient.deleteRoom(roomName);
  } catch {
    // ignore
  }

  const emptyTimeout = emptyTimeoutSeconds();

  await roomClient.createRoom({
    name: roomName,
    metadata,
    emptyTimeout,
    departureTimeout: 20,
  });

  await dispatchClient.createDispatch(roomName, agentName, {
    metadata,
  });

  return roomName;
}
