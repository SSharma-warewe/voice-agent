import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentDispatchClient,
  RoomServiceClient,
} from "livekit-server-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

function getHost() {
  return LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

async function checkRoomApi() {
  const client = new RoomServiceClient(getHost(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const rooms = await client.listRooms();
  const dispatches = [];

  for (const room of rooms.slice(0, 10)) {
    const dispatchClient = new AgentDispatchClient(getHost(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    try {
      const roomDispatches = await dispatchClient.listDispatch(room.name);
      dispatches.push({
        room: room.name,
        numParticipants: room.numParticipants,
        dispatches: roomDispatches.length,
      });
    } catch (error) {
      dispatches.push({ room: room.name, error: error.message });
    }
  }

  return {
    ok: true,
    roomCount: rooms.length,
    sample: dispatches,
    rooms: rooms.map((r) => ({ name: r.name, participants: r.numParticipants })),
  };
}

async function checkInferenceGateway() {
  const gatewayUrl = "https://agent-gateway.livekit.cloud/v1";
  const response = await fetch(gatewayUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  return {
    gatewayUrl,
    status: response.status,
    statusText: response.statusText,
    retryAfter: response.headers.get("retry-after"),
  };
}

async function checkWsReachability() {
  const host = getHost().replace(/^https?:\/\//, "");
  const response = await fetch(`https://${host}`, { method: "HEAD" });
  return { host, status: response.status, reachable: response.status < 500 };
}

console.log("=== LiveKit Diagnostics ===\n");
console.log(`Project host: ${getHost()}`);
console.log(`API key: ${LIVEKIT_API_KEY?.slice(0, 6)}...`);

try {
  console.log("\n[1] Cloud host reachability:", await checkWsReachability());
} catch (error) {
  console.log("\n[1] Cloud host reachability: FAILED", error.message);
}

try {
  console.log("\n[2] Room API:", JSON.stringify(await checkRoomApi(), null, 2));
} catch (error) {
  console.log("\n[2] Room API: FAILED", error.message);
}

try {
  console.log("\n[3] Inference gateway:", await checkInferenceGateway());
} catch (error) {
  console.log("\n[3] Inference gateway: FAILED", error.message);
}

console.log("\n=== Notes ===");
console.log("- HTTP 429 on agent-gateway = rate limit or exhausted inference credits");
console.log("- Free plan: 5 concurrent STT/TTS connections, $2.50 inference credits/month");
console.log("- Check usage at https://cloud.livekit.io → Settings → Project");