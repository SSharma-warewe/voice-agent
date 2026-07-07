import { tool } from "@livekit/agents";
import { z } from "zod";
import type { AppointmentStore } from "./appointment-store.ts";

export function createAppointmentTools(store: AppointmentStore) {
  const confirmAppointment = tool({
    name: "confirmAppointment",
    description:
      "Mark the appointment as confirmed when the patient clearly agrees to attend.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment identifier"),
    }),
    execute: async ({ appointmentId }) => store.confirm(appointmentId),
  });

  const denyAppointment = tool({
    name: "denyAppointment",
    description:
      "Mark the appointment as declined when the patient cancels or cannot attend.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment identifier"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason the patient gave for declining"),
    }),
    execute: async ({ appointmentId, reason }) =>
      store.deny(appointmentId, reason),
  });

  const updateAppointmentTime = tool({
    name: "updateAppointmentTime",
    description:
      "Reschedule the appointment after collecting both a preferred day and time.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment identifier"),
      newDate: z.string().describe("The patient's preferred date"),
      newTime: z.string().describe("The patient's preferred time"),
    }),
    execute: async ({ appointmentId, newDate, newTime }) =>
      store.reschedule(appointmentId, newDate, newTime),
  });

  return [confirmAppointment, denyAppointment, updateAppointmentTime];
}