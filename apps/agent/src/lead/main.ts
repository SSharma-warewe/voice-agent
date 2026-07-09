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
import { ApiLeadStore } from "./api-store.ts";
import { LeadOutreachAgent } from "./agent.ts";
import { CallLogger } from "../shared/call-logger.ts";
import { parseLeadMetadata } from "./parse.ts";
import type { LeadDetails } from "../shared/types.ts";
import { waitForCaller } from "../shared/wait-for-participant.ts";
import { createCalendarClient } from "../shared/calendar-client.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const calendar = createCalendarClient();

function resolveLead(ctx: {
  job: { metadata?: string | undefined };
  room: { metadata?: string | undefined };
}): LeadDetails {
  const lead =
    parseLeadMetadata(ctx.job.metadata) ??
    parseLeadMetadata(ctx.room.metadata);

  if (!lead) {
    throw new Error(
      "Missing lead metadata on job/room. Real queue metadata is required (demo placeholders removed).",
    );
  }

  return lead;
}

function countOtherAgents(room: {
  localParticipant?: { identity: string };
  remoteParticipants: Map<string, { identity: string }>;
}): number {
  const localIdentity = room.localParticipant?.identity;
  let count = 0;
  for (const p of room.remoteParticipants.values()) {
    if (p.identity.startsWith("patient-")) continue;
    if (p.identity !== localIdentity) count += 1;
  }
  return count;
}

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

    if (countOtherAgents(ctx.room) > 0) {
      console.log(`Another agent already in room ${ctx.room.name}. Skipping.`);
      return;
    }

    const lead = resolveLead(ctx);
    const apiUrl = process.env.API_URL ?? "http://localhost:6080";
    const callId = ctx.room.name;
    if (!callId) {
      console.error("Room name missing");
      return;
    }

    const callLogger = new CallLogger(apiUrl);
    const store = new ApiLeadStore(apiUrl, {
      ...lead,
      status: "PENDING",
    } as any);

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
        void callLogger.appendTranscript(callId, { speaker: "user", text: ev.transcript.trim() });
      }
    });

    session.on(AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      if (ev.item.type !== "message") return;
      const msg = ev.item;
      if (msg.role === "assistant") {
        const text = msg.textContent?.trim();
        if (text) void callLogger.appendTranscript(callId, { speaker: "agent", text });
      }
    });

    session.on(AgentSessionEventTypes.Close, () => {
      void callLogger.finalize(callId);
    });

    await callLogger.markWaiting(callId);

    console.log(
      `[lead] Agent in room ${ctx.room.name} for ${lead.name}. Waiting for lead…`,
    );

    try {
      const participant = await waitForCaller(ctx);
      console.log(
        `[lead] Lead joined: ${participant.identity}. Starting outbound outreach call.`,
      );
    } catch (e) {
      console.error("[lead] Lead did not join:", e);
      await callLogger.markNoAnswer(callId);
      return;
    }

    await session.start({
      agent: new LeadOutreachAgent(lead, store, calendar),
      room: ctx.room,
    });

    await callLogger.markInProgress(callId);

    const scriptHint = lead.script
      ? ` Follow this guidance: ${lead.script.slice(0, 180)}`
      : "";
    session.generateReply({
      instructions: `Begin the outbound lead outreach call. Introduce, verify the person, explain you are calling to book an appointment.${scriptHint}`,
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "lead-outreach-agent",
    // Allow multiple agents in one container (Railway free-plan packing).
    port: Number(process.env.LIVEKIT_AGENT_PORT ?? 8082),
  }),
);