import {
  AgentDispatchClient,
  RoomServiceClient,
} from "livekit-server-sdk";

import type { AgentKind, LiveKitCredentials } from "./types.ts";

export const AGENT_NAMES = {
  CONFIRMATION: "appointment-confirmation-agent",
  LEAD: "lead-outreach-agent",
  BOOKING: "inbound-booking-agent",
} as const;

function getLiveKitHost(): string {
  const url = process.env.LIVEKIT_URL;
  if (!url) {
    throw new Error("LIVEKIT_URL is required");
  }
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export function getCredentials(): LiveKitCredentials {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required");
  }

  return { apiKey, apiSecret };
}

export function getRoomServiceClient(): RoomServiceClient {
  const { apiKey, apiSecret } = getCredentials();
  return new RoomServiceClient(getLiveKitHost(), apiKey, apiSecret);
}

export function getAgentDispatchClient(): AgentDispatchClient {
  const { apiKey, apiSecret } = getCredentials();
  return new AgentDispatchClient(getLiveKitHost(), apiKey, apiSecret);
}

export function getLiveKitWsUrl(): string {
  const url = process.env.LIVEKIT_URL;
  if (!url) {
    throw new Error("LIVEKIT_URL is required");
  }
  return url;
}

export function getAgentName(
  type: AgentKind | string = "confirmation",
): string {
  if (type === "lead" || type === AGENT_NAMES.LEAD) {
    return AGENT_NAMES.LEAD;
  }
  if (type === "booking" || type === AGENT_NAMES.BOOKING) {
    return AGENT_NAMES.BOOKING;
  }
  return AGENT_NAMES.CONFIRMATION;
}

export function buildRoomName(id: string): string {
  return `call-${id}`;
}
