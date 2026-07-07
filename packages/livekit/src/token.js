import { AccessToken } from "livekit-server-sdk";
import { getCredentials, getLiveKitWsUrl } from "./client.js";

export async function createParticipantToken({
  roomName,
  identity,
  name,
}) {
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