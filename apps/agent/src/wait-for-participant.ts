const PARTICIPANT_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const PATIENT_IDENTITY_PREFIX = "patient-";

interface RemoteParticipant {
  identity: string;
}

interface WaitableRoom {
  remoteParticipants: Map<string, RemoteParticipant>;
  on(event: "participantConnected", handler: (participant: RemoteParticipant) => void): void;
  off(event: "participantConnected", handler: (participant: RemoteParticipant) => void): void;
}

function isPatientParticipant(participant: RemoteParticipant): boolean {
  return participant.identity.startsWith(PATIENT_IDENTITY_PREFIX);
}

function findPatientParticipant(room: WaitableRoom): RemoteParticipant | undefined {
  for (const participant of room.remoteParticipants.values()) {
    if (isPatientParticipant(participant)) {
      return participant;
    }
  }
  return undefined;
}

export function waitForRemoteParticipant(
  room: WaitableRoom,
  timeoutMs = PARTICIPANT_WAIT_TIMEOUT_MS,
): Promise<RemoteParticipant> {
  const existing = findPatientParticipant(room);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for patient to join the room"));
    }, timeoutMs);

    const onConnected = (participant: RemoteParticipant) => {
      if (!isPatientParticipant(participant)) {
        return;
      }
      cleanup();
      resolve(participant);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      room.off("participantConnected", onConnected);
    };

    room.on("participantConnected", onConnected);
  });
}