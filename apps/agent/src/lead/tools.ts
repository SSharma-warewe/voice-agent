import { tool } from "@livekit/agents";
import { z } from "zod";
import type { LeadStore } from "./store.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";
import type { AppointmentDetails } from "../shared/types.ts";

export function createLeadTools(store: LeadStore, calendar?: CalendarClient) {
  const bookAppointment = tool({
    name: "bookAppointment",
    description: "Book a new appointment after the lead agrees on a specific day and time. The time will be validated against the doctor's calendar if available. Also creates the event in the calendar.",
    parameters: z.object({
      leadId: z.string(),
      patientName: z.string().describe("Lead's name"),
      date: z.string().describe("Preferred date e.g. 2026-07-15 or 'next Friday'"),
      time: z.string().describe("Preferred time e.g. 14:00 or '2pm'"),
      doctorName: z.string().optional(),
    }),
    execute: async ({ leadId, patientName, date, time, doctorName = "Dr. Smith" }) => {
      if (calendar) {
        const available = await calendar.isSlotAvailable(date, time);
        if (!available) {
          return "That time slot is not available on the doctor's calendar. Please choose a different day or time.";
        }
      }

      const result = await store.bookAppointment(leadId, patientName, date, time, doctorName);

      if (calendar) {
        // Extract the generated appointment ID from the store result
        const idMatch = result.match(/ID: (.*)$/);
        const appointmentId = (idMatch && idMatch[1]) ? idMatch[1] : `booked_${leadId}_${Date.now()}`;

        const leadRec = store.get(leadId);
        const apptDetails: AppointmentDetails = {
          appointmentId,
          patientName,
          doctorName,
          appointmentDate: date,
          appointmentTime: time,
          ...(leadRec?.phone ? { phone: leadRec.phone } : {}),
        };

        const syncResult = await calendar.createEvent(apptDetails);
        return `${result} ${syncResult}`.trim();
      }

      return result;
    },
  });

  const markDeclined = tool({
    name: "markLeadDeclined",
    description: "Mark the lead as declined / not interested.",
    parameters: z.object({
      leadId: z.string(),
      reason: z.string().optional(),
    }),
    execute: async ({ leadId, reason }) => store.updateStatus(leadId, "DECLINED", reason || "declined"),
  });

  const markNoAnswerOrBusy = tool({
    name: "markNoAnswer",
    description: "Mark when the lead cannot be reached or conversation ends without booking.",
    parameters: z.object({ leadId: z.string() }),
    execute: async ({ leadId }) => store.updateStatus(leadId, "NO_ANSWER"),
  });

  const checkAvailability = tool({
    name: "checkAvailability",
    description:
      "Check if a proposed date and time (or just date) is available on the doctor's Google Calendar. Use this before suggesting or accepting any booking time.",
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
      return `Some available slots: ${sample}. Ask the person which one works.`;
    },
  });

  return [bookAppointment, markDeclined, markNoAnswerOrBusy, checkAvailability];
}