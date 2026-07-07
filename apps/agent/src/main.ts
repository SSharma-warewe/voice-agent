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
import { ApiAppointmentStore } from "./api-appointment-store.ts";
import { AppointmentConfirmationAgent } from "./agent.ts";
import { CallLogger } from "./call-logger.ts";
import {
  getDemoAppointment,
  parseAppointmentMetadata,
} from "./parse-appointment.ts";
import type { AppointmentDetails } from "./types.ts";
import { waitForRemoteParticipant } from "./wait-for-participant.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

function resolveAppointment(ctx: {
  job: { metadata?: string | undefined };
  room: { metadata?: string | undefined };
}): AppointmentDetails {
  return (
    parseAppointmentMetadata(ctx.job.metadata) ??
    parseAppointmentMetadata(ctx.room.metadata) ??
    getDemoAppointment()
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

    const appointment = resolveAppointment(ctx);
    const apiUrl = process.env.API_URL ?? "http://localhost:6080";
    const callId = ctx.room.name;
    if (!callId) {
      console.error("Room name is missing; cannot log call.");
      return;
    }
    const callLogger = new CallLogger(apiUrl);
    const store = new ApiAppointmentStore(apiUrl, {
      ...appointment,
      status: "PENDING",
    });

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
      `Agent connected to room ${ctx.room.name}. Waiting for patient to join…`,
    );

    try {
      await waitForRemoteParticipant(ctx.room);
    } catch (error) {
      console.error("Patient did not join:", error);
      await callLogger.markNoAnswer(callId);
      return;
    }

    await session.start({
      agent: new AppointmentConfirmationAgent(appointment, store),
      room: ctx.room,
    });

    await callLogger.markInProgress(callId);
    console.log("Patient joined. Starting confirmation call.");

    session.generateReply({
      instructions:
        "Begin the outbound call. Introduce yourself, verify you are speaking to the patient, explain why you are calling, mention the doctor, date, and time, then ask whether they will attend.",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "appointment-confirmation-agent",
  }),
);