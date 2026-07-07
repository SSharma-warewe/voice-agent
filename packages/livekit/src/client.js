import {
  AgentDispatchClient,
  RoomServiceClient,
} from "livekit-server-sdk";

const AGENT_NAME = "appointment-confirmation-agent";

function getLiveKitHost() {
  const url = process.env.LIVEKIT_URL;
  if (!url) {
    throw new Error("LIVEKIT_URL is required");
  }
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export function getCredentials() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required");
  }

  return { apiKey, apiSecret };
}

export function getRoomServiceClient() {
  const { apiKey, apiSecret } = getCredentials();
  return new RoomServiceClient(getLiveKitHost(), apiKey, apiSecret);
}

export function getAgentDispatchClient() {
  const { apiKey, apiSecret } = getCredentials();
  return new AgentDispatchClient(getLiveKitHost(), apiKey, apiSecret);
}

export function getLiveKitWsUrl() {
  const url = process.env.LIVEKIT_URL;
  if (!url) {
    throw new Error("LIVEKIT_URL is required");
  }
  return url;
}

export function getAgentName() {
  return AGENT_NAME;
}

export function buildRoomName(appointmentId) {
  return `call-${appointmentId}`;
}