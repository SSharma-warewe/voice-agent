import { AccessToken } from "livekit-server-sdk";

import { getCredentials, getLiveKitWsUrl } from "./client.ts";
import type {
  ParticipantTokenOptions,
  ParticipantTokenResult,
} from "./types.ts";

export async function createParticipantToken({
  roomName,
  identity,
  name,
}: ParticipantTokenOptions): Promise<ParticipantTokenResult> {
  const { apiKey, apiSecret } = getCredentials();
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return {
    token: await token.toJwt(),
    serverUrl: getLiveKitWsUrl(),
    roomName,
  };
}
