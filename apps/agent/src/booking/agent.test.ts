import { initializeLogger, voice } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import { InboundBookingAgent } from "./agent.ts";
import { buildInstructions } from "./prompt.ts";
import { ApiBookingStore } from "./api-store.ts";
import type { BookingContext } from "../shared/types.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";

const context: BookingContext = {
  sessionId: "book_test_001",
  callerName: "Test Patient",
};

initializeLogger({ pretty: false, level: "silent" });

describe("InboundBookingAgent", () => {
  it("builds instructions containing key inbound rules and calendar guidance", () => {
    const instructions = buildInstructions(context);

    expect(instructions).toContain("inbound AI booking assistant");
    expect(instructions).toContain("Introduce yourself immediately");
    expect(instructions).toContain("checkAvailability");
    expect(instructions).toContain("bookNewAppointment");
    expect(instructions).toContain("Doctor's Calendar");
    expect(instructions).toContain("Test Patient");
    expect(instructions).toContain("Booking configuration");
    expect(instructions).toContain("Dr. Smith");
    expect(instructions).not.toContain("confirmAppointment"); // different from confirmation agent
  });

  it("registers the booking tools", () => {
    const store = new ApiBookingStore("http://localhost:6080");
    const agent = new InboundBookingAgent(context, store);
    const tools = agent.toolCtx.functionTools;

    const keys = Object.keys(tools).sort();
    expect(keys).toContain("bookNewAppointment");
    expect(keys).toContain("checkAvailability");
    expect(keys).toContain("markNoAnswer");
  });

  it("handles calendar=null path without crashing (tool list)", () => {
    const store = new ApiBookingStore("http://localhost:6080");
    const agent = new InboundBookingAgent(context, store, null as any);
    expect(agent).toBeDefined();
    expect(Object.keys(agent.toolCtx.functionTools).length).toBeGreaterThan(0);
  });
});