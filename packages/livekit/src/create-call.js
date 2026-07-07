import {
  buildRoomName,
  getAgentDispatchClient,
  getAgentName,
  getRoomServiceClient,
} from "./client.js";

export function toRoomMetadata(appointment) {
  return JSON.stringify({
    appointmentId: appointment.appointmentId,
    patientName: appointment.patientName,
    doctorName: appointment.doctorName,
    appointmentDate: appointment.appointmentDate,
    appointmentTime: appointment.appointmentTime,
    phone: appointment.phone,
  });
}

async function clearAgentDispatches(dispatchClient, roomName, agentName) {
  try {
    const existingDispatches = await dispatchClient.listDispatch(roomName);
    await Promise.all(
      existingDispatches
        .filter((dispatch) => dispatch.agentName === agentName)
        .map((dispatch) => dispatchClient.deleteDispatch(dispatch.id, roomName)),
    );
  } catch {
    // Room may not exist yet; stale dispatches are cleared on the next attempt.
  }
}

export async function createConfirmationRoom(appointment) {
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

  await roomClient.createRoom({
    name: roomName,
    metadata,
    emptyTimeout: 300,
    departureTimeout: 20,
  });

  await dispatchClient.createDispatch(roomName, agentName, {
    metadata,
  });

  return roomName;
}