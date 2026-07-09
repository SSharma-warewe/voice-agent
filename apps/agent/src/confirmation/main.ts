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
import { CallLogger } from "../shared/call-logger.ts";
import { parseAppointmentMetadata } from "./parse-appointment.ts";
import type { AppointmentDetails } from "../shared/types.ts";
import { waitForCaller } from "../shared/wait-for-participant.ts";
import { createCalendarClient } from "../shared/calendar-client.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const calendar = createCalendarClient();

function resolveAppointment(ctx: {
  job: { metadata?: string | undefined };
  room: { metadata?: string | undefined };
}): AppointmentDetails {
  const appointment =
    parseAppointmentMetadata(ctx.job.metadata) ??
    parseAppointmentMetadata(ctx.room.metadata);

  if (!appointment) {
    throw new Error(
      "Missing appointment metadata on job/room. Real queue metadata is required (demo placeholders removed).",
    );
  }

  return appointment;
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
      `[confirmation] Agent in room ${ctx.room.name} for ${appointment.patientName}. Waiting for patient…`,
    );

    try {
      const participant = await waitForCaller(ctx);
      console.log(
        `[confirmation] Patient joined: ${participant.identity}. Starting outbound confirmation call.`,
      );
    } catch (error) {
      console.error("[confirmation] Patient did not join:", error);
      await callLogger.markNoAnswer(callId);
      return;
    }

    await session.start({
      agent: new AppointmentConfirmationAgent(appointment, store, calendar),
      room: ctx.room,
    });

    await callLogger.markInProgress(callId);

    session.generateReply({
      instructions:
        "Begin the outbound appointment confirmation call. Introduce yourself, verify you are speaking to the patient, explain why you are calling, mention the doctor, date, and time, then ask whether they will attend.",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "appointment-confirmation-agent",
    // Allow multiple agents in one container (Railway free-plan packing).
    port: Number(process.env.LIVEKIT_AGENT_PORT ?? 8081),
  }),
);