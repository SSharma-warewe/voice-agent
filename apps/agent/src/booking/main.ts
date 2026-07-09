import {
  AgentSessionEventTypes,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  voice,
} from "@livekit/agents";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiBookingStore } from "./api-store.ts";
import { InboundBookingAgent } from "./agent.ts";
import { CallLogger } from "../shared/call-logger.ts";
import { parseBookingMetadata } from "./parse-booking.ts";
import type { BookingContext } from "../shared/types.ts";
import { waitForCaller } from "../shared/wait-for-participant.ts";
import { createCalendarClient } from "../shared/calendar-client.ts";
import { fetchBookingConfig } from "./booking-config.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const calendar = createCalendarClient();

function resolveBookingContext(ctx: {
  job: { metadata?: string | undefined };
  room: { metadata?: string | undefined };
  roomName?: string | undefined;
}): BookingContext {
  const parsed =
    parseBookingMetadata(ctx.job.metadata) ??
    parseBookingMetadata(ctx.room.metadata);

  if (parsed) {
    return parsed;
  }

  // Inbound booking always has a room name (session id). Never invent demo callers.
  const roomName = ctx.roomName?.trim();
  if (roomName) {
    const sessionId = roomName.startsWith("call-")
      ? roomName.slice("call-".length)
      : roomName;
    return { sessionId };
  }

  throw new Error(
    "Missing booking metadata on job/room. Real room context is required (demo placeholders removed).",
  );
}

function countOtherAgents(room: {
  localParticipant?: { identity: string };
  remoteParticipants: Map<string, { identity: string }>;
}): number {
  const localIdentity = room.localParticipant?.identity;
  let count = 0;

  for (const participant of room.remoteParticipants.values()) {
    if (participant.identity.startsWith("patient-")) {
      continue;
    }
    if (participant.identity !== localIdentity) {
      count += 1;
    }
  }

  return count;
}

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

    if (countOtherAgents(ctx.room) > 0) {
      console.log(
        `Another agent is already in room ${ctx.room.name}. Skipping duplicate dispatch.`,
      );
      return;
    }

    const context = resolveBookingContext({
      job: ctx.job,
      room: ctx.room,
      roomName: ctx.room.name,
    });
    const apiUrl = process.env.API_URL ?? "http://localhost:6080";
    const callId = ctx.room.name;
    if (!callId) {
      console.error("Room name is missing; cannot log call.");
      return;
    }

    const callLogger = new CallLogger(apiUrl);
    const store = new ApiBookingStore(apiUrl);
    const bookingConfig = await fetchBookingConfig(apiUrl);
    console.log(
      `[booking] Loaded config: tz=${bookingConfig.timezone}, hours=${bookingConfig.workingHours.start}-${bookingConfig.workingHours.end}, doctors=${bookingConfig.doctors.map((d) => d.name).join("|")}`,
    );

    const session = new voice.AgentSession({
      llm: new inference.LLM({ model: "openai/gpt-4o-mini" }),
      stt: new inference.STT({ model: "deepgram/nova-3", language: "multi" }),
      tts: new inference.TTS({
        model: "cartesia/sonic-3",
        voice: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      }),
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
      },
    });

    session.on(AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.isFinal && ev.transcript.trim()) {
        void callLogger.appendTranscript(callId, {
          speaker: "user",
          text: ev.transcript.trim(),
        });
      }
    });

    session.on(AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      if (ev.item.type !== "message") {
        return;
      }

      const message = ev.item;
      if (message.role === "assistant") {
        const text = message.textContent?.trim();
        if (text) {
          void callLogger.appendTranscript(callId, {
            speaker: "agent",
            text,
          });
        }
      }
    });

    session.on(AgentSessionEventTypes.Close, () => {
      void callLogger.finalize(callId);
    });

    await callLogger.markWaiting(callId);

    console.log(
      `[booking] Inbound agent in room ${ctx.room.name} (session ${context.sessionId ?? "n/a"}). Waiting for caller…`,
    );

    try {
      const participant = await waitForCaller(ctx);
      console.log(
        `[booking] Caller joined: ${participant.identity}. Starting inbound booking (no queue).`,
      );
    } catch (error) {
      console.error("[booking] Caller did not join:", error);
      await callLogger.markNoAnswer(callId);
      return;
    }

    await session.start({
      agent: new InboundBookingAgent(
        context,
        store,
        calendar,
        callLogger,
        callId,
        bookingConfig,
      ),
      room: ctx.room,
    });

    await callLogger.markInProgress(callId);

    const nameHint = context.callerName ? ` for ${context.callerName}` : "";
    session.generateReply({
      instructions: `Begin the inbound booking call (this is NOT outbound confirmation). Introduce yourself warmly as the Callwave booking assistant. Greet the caller, offer to help book a new appointment${nameHint}, and ask for their name if needed. Be friendly and guide them to pick a day and time.`,
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "inbound-booking-agent",
    // Allow multiple agents in one container (Railway free-plan packing).
    port: Number(process.env.LIVEKIT_AGENT_PORT ?? 8083),
  }),
);