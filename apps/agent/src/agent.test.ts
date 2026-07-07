import { initializeLogger, voice } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import {
  InMemoryAppointmentStore,
  getAppointmentStatus,
} from "./appointment-store.ts";
import { AppointmentConfirmationAgent } from "./agent.ts";
import { buildInstructions } from "./prompt.ts";
import type { AppointmentDetails } from "./types.ts";

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
    expect(instructions).toContain("Never call more than one terminal tool");
  });

  it("registers the three business tools", () => {
    const store = new InMemoryAppointmentStore([appointment]);
    const agent = new AppointmentConfirmationAgent(appointment, store);
    const tools = agent.toolCtx.functionTools;

    expect(Object.keys(tools).sort()).toEqual([
      "confirmAppointment",
      "denyAppointment",
      "updateAppointmentTime",
    ]);
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
});