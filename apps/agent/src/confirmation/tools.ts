import { tool } from "@livekit/agents";
import { z } from "zod";
import type { AppointmentStore } from "./appointment-store.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";
import type { AppointmentDetails } from "../shared/types.ts";

export function createAppointmentTools(
  store: AppointmentStore,
  calendar?: CalendarClient,
) {
  const confirmAppointment = tool({
    name: "confirmAppointment",
    description:
      "Mark the appointment as confirmed when the patient clearly agrees to attend. Also syncs to the doctor's Google Calendar.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment identifier"),
    }),
    execute: async ({ appointmentId }) => {
      const result = await store.confirm(appointmentId);
      if (calendar) {
        const record = store.get(appointmentId);
        if (record) {
          const syncResult = await calendar.createEvent(record);
          return `${result} ${syncResult}`.trim();
        }
      }
      return result;
    },
  });

  const denyAppointment = tool({
    name: "denyAppointment",
    description:
      "Mark the appointment as declined when the patient cancels or cannot attend. Also updates the doctor's Google Calendar.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment identifier"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason the patient gave for declining"),
    }),
    execute: async ({ appointmentId, reason }) => {
      const result = await store.deny(appointmentId, reason);
      if (calendar) {
        const record = store.get(appointmentId);
        if (record) {
          await calendar.cancelEventForAppointment(record);
        }
      }
      return result;
    },
  });

  const updateAppointmentTime = tool({
    name: "updateAppointmentTime",
    description:
      "Reschedule the appointment after collecting both a preferred day and time. The time will be validated against the doctor's calendar if available.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment identifier"),
      newDate: z.string().describe("The patient's preferred date"),
      newTime: z.string().describe("The patient's preferred time"),
    }),
    execute: async ({ appointmentId, newDate, newTime }) => {
      if (calendar) {
        const available = await calendar.isSlotAvailable(newDate, newTime);
        if (!available) {
          return "That time slot is not available on the doctor's calendar. Please choose a different day or time.";
        }
      }

      const recordBefore = store.get(appointmentId);
      const prevDate = recordBefore?.appointmentDate;
      const prevTime = recordBefore?.appointmentTime;

      const result = await store.reschedule(appointmentId, newDate, newTime);

      if (calendar) {
        const record = store.get(appointmentId);
        if (record) {
          const syncResult = await calendar.updateEventForAppointment(
            record,
            prevDate,
            prevTime,
          );
          return `${result} ${syncResult}`.trim();
        }
      }

      return result;
    },
  });

  const checkAvailability = tool({
    name: "checkAvailability",
    description:
      "Check if a proposed date and time (or just date) is available on the doctor's Google Calendar. Use this before suggesting or accepting any new appointment time.",
    parameters: z.object({
      date: z.string().describe("Date in YYYY-MM-DD format"),
      time: z
        .string()
        .optional()
        .describe("Optional specific time in HH:MM (24h) format. If omitted, returns some free slots for the day."),
    }),
    execute: async ({ date, time }) => {
      if (!calendar) {
        return "Calendar integration is not available.";
      }

      if (time) {
        const available = await calendar.isSlotAvailable(date, time);
        if (available) {
          return `The slot on ${date} at ${time} appears to be available.`;
        } else {
          return `The slot on ${date} at ${time} is NOT available. Please choose a different time.`;
        }
      }

      // No specific time — return a few free slots
      const slots = await calendar.findFreeSlots(date, 3);
      if (slots.length === 0) {
        return `No free slots found around ${date}.`;
      }
      const sample = slots.slice(0, 4).map((s) => `${s.date} ${s.time}`).join(", ");
      return `Some available slots: ${sample}. Ask the patient which one works.`;
    },
  });

  return [confirmAppointment, denyAppointment, updateAppointmentTime, checkAvailability];
}