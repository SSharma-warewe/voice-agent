import { initializeLogger, voice } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import { ApiAppointmentStore } from "./api-appointment-store.ts";
import { AppointmentConfirmationAgent } from "./agent.ts";
import {
  fetchAppointment,
  isApiReachable,
  resetAppointment,
  seedAppointment,
} from "./test/api-helpers.ts";
import { resolveNextFriday } from "./test/date-helpers.ts";
import type { AppointmentDetails } from "../shared/types.ts";

initializeLogger({ pretty: false, level: "silent" });

const REFERENCE_DATE = new Date("2026-07-07T12:00:00.000Z");
const NEXT_FRIDAY = resolveNextFriday(REFERENCE_DATE);

const baseAppointment: AppointmentDetails & { phone: string } = {
  appointmentId: "apt_int_placeholder",
  patientName: "Integration Patient",
  doctorName: "Dr. Patel",
  appointmentDate: "2026-07-12",
  appointmentTime: "10:30",
  phone: "+15559876543",
};

const canRunIntegration =
  !!process.env.DATABASE_URL && (await isApiReachable());
const describeIntegration = canRunIntegration ? describe : describe.skip;

function createUniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

async function runAgentSession(
  appointment: AppointmentDetails,
  llm: voice.testing.FakeLLM,
  runs: Array<{ userInput: string }>,
): Promise<void> {
  const store = new ApiAppointmentStore(process.env.API_URL ?? "http://localhost:6080", {
    ...appointment,
    status: "PENDING",
  });
  const agent = new AppointmentConfirmationAgent(appointment, store);
  const session = new voice.AgentSession({ llm });

  await session.start({ agent });

  try {
    for (const run of runs) {
      const result = session.run({ userInput: run.userInput });
      await result.wait();
    }
  } finally {
    await session.close();
  }
}

describeIntegration("AppointmentConfirmationAgent integration", () => {
  it("confirms an appointment and persists CONFIRMED to the database", async () => {
    const appointmentId = createUniqueId("apt_int_confirm");
    const appointment = { ...baseAppointment, appointmentId };

    await seedAppointment(appointment);

    try {
      const llm = new voice.testing.FakeLLM([
        {
          input: "Yes, I'll be there",
          toolCalls: [
            {
              name: "confirmAppointment",
              args: { appointmentId },
            },
          ],
        },
      ]);

      await runAgentSession(appointment, llm, [
        { userInput: "Yes, I'll be there" },
      ]);

      const persisted = await fetchAppointment(appointmentId);
      expect(persisted?.status).toBe("CONFIRMED");
    } finally {
      await resetAppointment(appointmentId, {
        status: "PENDING",
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
      });
    }
  });

  it("reschedules from natural language with date and time in one turn", async () => {
    const appointmentId = createUniqueId("apt_int_reschedule");
    const appointment = { ...baseAppointment, appointmentId };
    const userInput = "Can you reschedule to next Friday at 2pm";

    await seedAppointment(appointment);

    try {
      const llm = new voice.testing.FakeLLM([
        {
          input: userInput,
          toolCalls: [
            {
              name: "updateAppointmentTime",
              args: {
                appointmentId,
                newDate: NEXT_FRIDAY,
                newTime: "14:00",
              },
            },
          ],
        },
      ]);

      await runAgentSession(appointment, llm, [{ userInput }]);

      const persisted = await fetchAppointment(appointmentId);
      expect(persisted).toMatchObject({
        status: "RESCHEDULED",
        appointmentDate: NEXT_FRIDAY,
        appointmentTime: "14:00",
      });
    } finally {
      await resetAppointment(appointmentId, {
        status: "PENDING",
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
      });
    }
  });

  it("reschedules from natural language across multiple turns when time is omitted", async () => {
    const appointmentId = createUniqueId("apt_int_reschedule_multi");
    const appointment = { ...baseAppointment, appointmentId };
    const dayInput = "I need to reschedule to next Friday";
    const timeInput = "2pm works";

    await seedAppointment(appointment);

    try {
      const llm = new voice.testing.FakeLLM([
        {
          input: dayInput,
          content: "What time works best for you on Friday?",
        },
        {
          input: timeInput,
          toolCalls: [
            {
              name: "updateAppointmentTime",
              args: {
                appointmentId,
                newDate: NEXT_FRIDAY,
                newTime: "14:00",
              },
            },
          ],
        },
      ]);

      await runAgentSession(appointment, llm, [
        { userInput: dayInput },
        { userInput: timeInput },
      ]);

      const persisted = await fetchAppointment(appointmentId);
      expect(persisted).toMatchObject({
        status: "RESCHEDULED",
        appointmentDate: NEXT_FRIDAY,
        appointmentTime: "14:00",
      });
    } finally {
      await resetAppointment(appointmentId, {
        status: "PENDING",
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
      });
    }
  });
});