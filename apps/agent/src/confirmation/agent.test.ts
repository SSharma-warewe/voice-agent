import { initializeLogger, voice } from "@livekit/agents";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryAppointmentStore,
  getAppointmentStatus,
} from "./appointment-store.ts";
import { AppointmentConfirmationAgent } from "./agent.ts";
import { buildInstructions } from "./prompt.ts";
import type { AppointmentDetails } from "../shared/types.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";
import type { LeadDetails } from "../shared/types.ts";
import type { LeadStore } from "../lead/store.ts";
import { LeadOutreachAgent } from "../lead/agent.ts";
import { buildLeadInstructions } from "../lead/prompt.ts";

const appointment: AppointmentDetails = {
  appointmentId: "apt_test_001",
  patientName: "Jane Doe",
  doctorName: "Dr. Patel",
  appointmentDate: "2026-07-12",
  appointmentTime: "10:30",
};

initializeLogger({ pretty: false, level: "silent" });

describe("AppointmentConfirmationAgent", () => {
  it("builds instructions with appointment details and state machine rules", () => {
    const instructions = buildInstructions(appointment);

    expect(instructions).toContain("Jane Doe");
    expect(instructions).toContain("Dr. Patel");
    expect(instructions).toContain("2026-07-12");
    expect(instructions).toContain("10:30");
    expect(instructions).toContain("confirmAppointment");
    expect(instructions).toContain("denyAppointment");
    expect(instructions).toContain("updateAppointmentTime");
    expect(instructions).toContain("checkAvailability");
    expect(instructions).toContain("Never call more than one terminal tool");
  });

  it("registers the business tools (including calendar check)", () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const tools = agent.toolCtx.functionTools;

    const keys = Object.keys(tools).sort();
    expect(keys).toContain("confirmAppointment");
    expect(keys).toContain("denyAppointment");
    expect(keys).toContain("updateAppointmentTime");
    expect(keys).toContain("checkAvailability");
  });

  it("confirms an appointment", async () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const confirmTool = agent.toolCtx.getFunctionTool("confirmAppointment")!;

    const result = await confirmTool.execute(
      { appointmentId: appointment.appointmentId },
      {} as never,
    );

    expect(result).toBe("Appointment confirmed.");
    expect(getAppointmentStatus(store, appointment.appointmentId)).toBe(
      "CONFIRMED",
    );
  });

  it("declines an appointment with an optional reason", async () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const denyTool = agent.toolCtx.getFunctionTool("denyAppointment")!;

    const result = await denyTool.execute(
      {
        appointmentId: appointment.appointmentId,
        reason: "Travel conflict",
      },
      {} as never,
    );

    expect(result).toBe("Appointment declined.");
    expect(store.get(appointment.appointmentId)?.status).toBe("DECLINED");
    expect(store.get(appointment.appointmentId)?.declineReason).toBe(
      "Travel conflict",
    );
  });

  it("reschedules an appointment", async () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const updateTool = agent.toolCtx.getFunctionTool("updateAppointmentTime")!;

    const result = await updateTool.execute(
      {
        appointmentId: appointment.appointmentId,
        newDate: "2026-07-15",
        newTime: "09:00",
      },
      {} as never,
    );

    expect(result).toBe("Appointment successfully rescheduled.");
    expect(store.get(appointment.appointmentId)).toMatchObject({
      appointmentDate: "2026-07-15",
      appointmentTime: "09:00",
      status: "RESCHEDULED",
    });
  });

  it("runs a confirm flow through AgentSession", async () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const llm = new voice.testing.FakeLLM([
      {
        input: "Yes, I'll be there",
        toolCalls: [
          {
            name: "confirmAppointment",
            args: { appointmentId: appointment.appointmentId },
          },
        ],
      },
    ]);

    const session = new voice.AgentSession({ llm });
    await session.start({ agent });

    try {
      const result = session.run({ userInput: "Yes, I'll be there" });
      await result.wait();

      result.expect.containsFunctionCall({ name: "confirmAppointment" });
      result.expect.containsFunctionCallOutput({ isError: false });
      expect(getAppointmentStatus(store, appointment.appointmentId)).toBe(
        "CONFIRMED",
      );
    } finally {
      await session.close();
    }
  });

  it("runs a reschedule flow through AgentSession", async () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const llm = new voice.testing.FakeLLM([
      {
        input: "Friday at 3pm works for me",
        toolCalls: [
          {
            name: "updateAppointmentTime",
            args: {
              appointmentId: appointment.appointmentId,
              newDate: "2026-07-17",
              newTime: "15:00",
            },
          },
        ],
      },
    ]);

    const session = new voice.AgentSession({ llm });
    await session.start({ agent });

    try {
      const result = session.run({
        userInput: "Friday at 3pm works for me",
      });
      await result.wait();

      result.expect.containsFunctionCall({ name: "updateAppointmentTime" });
      expect(store.get(appointment.appointmentId)).toMatchObject({
        appointmentDate: "2026-07-17",
        appointmentTime: "15:00",
        status: "RESCHEDULED",
      });
    } finally {
      await session.close();
    }
  });

  it("runs a decline flow through AgentSession", async () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const llm = new voice.testing.FakeLLM([
      {
        input: "No, cancel it please",
        toolCalls: [
          {
            name: "denyAppointment",
            args: { appointmentId: appointment.appointmentId },
          },
        ],
      },
    ]);

    const session = new voice.AgentSession({ llm });
    await session.start({ agent });

    try {
      const result = session.run({ userInput: "No, cancel it please" });
      await result.wait();

      result.expect.containsFunctionCall({ name: "denyAppointment" });
      expect(getAppointmentStatus(store, appointment.appointmentId)).toBe(
        "DECLINED",
      );
    } finally {
      await session.close();
    }
  });

  it("runs a confirm flow with calendar sync (mocked conversation)", async () => {
    const store = new InMemoryAppointmentStore([appointment]);

    // Mock calendar client to capture the "add calendar event" call
    const mockCreateEvent = vi.fn().mockResolvedValue("Calendar event created (mock-evt-123)");
    const mockCalendar: CalendarClient = {
      createEvent: mockCreateEvent,
      isSlotAvailable: vi.fn().mockResolvedValue(true),
      findFreeSlots: vi.fn().mockResolvedValue([]),
      updateEventForAppointment: vi.fn().mockResolvedValue("updated"),
      cancelEventForAppointment: vi.fn(),
      getGrantId: vi.fn().mockReturnValue("grant-mock"),
      getPrimaryCalendarId: vi.fn().mockReturnValue("cal-mock"),
    };

    const agent = new AppointmentConfirmationAgent(appointment, store, mockCalendar);

    const llm = new voice.testing.FakeLLM([
      {
        input: "Yes, I'll be there",
        toolCalls: [
          {
            name: "confirmAppointment",
            args: { appointmentId: appointment.appointmentId },
          },
        ],
      },
    ]);

    const session = new voice.AgentSession({ llm });
    await session.start({ agent });

    try {
      const result = session.run({ userInput: "Yes, I'll be there" });
      await result.wait();

      result.expect.containsFunctionCall({ name: "confirmAppointment" });
      result.expect.containsFunctionCallOutput({ isError: false });

      // DB updated
      expect(getAppointmentStatus(store, appointment.appointmentId)).toBe("CONFIRMED");

      // Calendar event creation was triggered (full path of adding calendar event)
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: appointment.appointmentId,
          patientName: appointment.patientName,
          doctorName: appointment.doctorName,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
        })
      );
    } finally {
      await session.close();
    }
  });
});

describe("LeadOutreachAgent with calendar", () => {
  const lead: LeadDetails = {
    leadId: "lead_test_001",
    name: "Test Lead",
    phone: "+15559876543",
  };

  it("runs a book flow with calendar sync (mocked conversation)", async () => {
    // Mock LeadStore - bookAppointment succeeds and returns string with ID
    const mockBook = vi.fn().mockResolvedValue(
      "Appointment booked for Test Lead on 2026-07-09 at 17:00. ID: booked_lead_test_001_123"
    );
    const mockStore: LeadStore = {
      get: vi.fn().mockReturnValue({ ...lead, status: "PENDING" }),
      updateStatus: vi.fn().mockResolvedValue("updated"),
      bookAppointment: mockBook,
    };

    // Mock calendar client
    const mockCreateEvent = vi.fn().mockResolvedValue("Calendar event created (mock-lead-evt)");
    const mockCalendar: CalendarClient = {
      createEvent: mockCreateEvent,
      isSlotAvailable: vi.fn().mockResolvedValue(true),
      findFreeSlots: vi.fn().mockResolvedValue([]),
      updateEventForAppointment: vi.fn(),
      cancelEventForAppointment: vi.fn(),
      getGrantId: vi.fn(),
      getPrimaryCalendarId: vi.fn(),
    };

    const agent = new LeadOutreachAgent(lead, mockStore, mockCalendar);

    const llm = new voice.testing.FakeLLM([
      {
        input: "Yes, tomorrow at 5pm works for me",
        toolCalls: [
          {
            name: "bookAppointment",
            args: {
              leadId: lead.leadId,
              patientName: lead.name,
              date: "2026-07-09",
              time: "17:00",
            },
          },
        ],
      },
    ]);

    const session = new voice.AgentSession({ llm });
    await session.start({ agent });

    try {
      const result = session.run({ userInput: "Yes, tomorrow at 5pm works for me" });
      await result.wait();

      result.expect.containsFunctionCall({ name: "bookAppointment" });
      result.expect.containsFunctionCallOutput({ isError: false });

      // Store was called
      expect(mockBook).toHaveBeenCalledWith(lead.leadId, lead.name, "2026-07-09", "17:00", "Dr. Smith");

      // Calendar event creation was triggered (full path of adding calendar event)
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: "booked_lead_test_001_123",
          patientName: lead.name,
          appointmentDate: "2026-07-09",
          appointmentTime: "17:00",
        })
      );
    } finally {
      await session.close();
    }
  });

  it("rejects booking for unavailable slot", async () => {
    const mockStore: LeadStore = {
      get: vi.fn(),
      updateStatus: vi.fn(),
      bookAppointment: vi.fn(),
    };

    const mockCalendar: CalendarClient = {
      createEvent: vi.fn(),
      isSlotAvailable: vi.fn().mockResolvedValue(false), // unavailable
      findFreeSlots: vi.fn(),
      updateEventForAppointment: vi.fn(),
      cancelEventForAppointment: vi.fn(),
      getGrantId: vi.fn(),
      getPrimaryCalendarId: vi.fn(),
    };

    const agent = new LeadOutreachAgent(lead, mockStore, mockCalendar);

    const llm = new voice.testing.FakeLLM([
      {
        input: "Book it for tomorrow at 5pm",
        toolCalls: [
          {
            name: "bookAppointment",
            args: {
              leadId: lead.leadId,
              patientName: lead.name,
              date: "2026-07-09",
              time: "17:00",
            },
          },
        ],
      },
    ]);

    const session = new voice.AgentSession({ llm });
    await session.start({ agent });

    try {
      const result = session.run({ userInput: "Book it for tomorrow at 5pm" });
      await result.wait();

      result.expect.containsFunctionCall({ name: "bookAppointment" });
      // Should return the unavailable message, not call the real book
      result.expect.containsFunctionCallOutput({ isError: false });
      expect(mockStore.bookAppointment).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });
});