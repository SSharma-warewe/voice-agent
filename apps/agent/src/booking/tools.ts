import { tool } from "@livekit/agents";
import { z } from "zod";
import type { BookingStore } from "./store.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";
import type { AppointmentDetails, BookingConfig } from "../shared/types.ts";
import type { CallLogger } from "../shared/call-logger.ts";
import {
  defaultBookingConfig,
  effectiveSchedule,
  findDoctor,
  validateSlotAgainstConfig,
} from "./booking-config.ts";

export function createBookingTools(
  store: BookingStore,
  calendar?: CalendarClient,
  callLogger?: CallLogger,
  callId?: string,
  bookingConfig?: BookingConfig,
) {
  const config = bookingConfig ?? defaultBookingConfig();
  const defaultDoctorName = config.doctors[0]?.name ?? "Dr. Smith";

  const bookNewAppointment = tool({
    name: "bookNewAppointment",
    description:
      "Book a brand new appointment after the caller agrees on a specific day and time. Validates against clinic schedule and the doctor's real calendar if available and creates the event. Call only after explicit agreement and concrete date + time.",
    parameters: z.object({
      patientName: z.string().describe("Caller's full name"),
      date: z.string().describe("Preferred date in YYYY-MM-DD or natural like 'next Tuesday'"),
      time: z.string().describe("Preferred time e.g. 14:00 or 2:30pm"),
      phone: z
        .string()
        .optional()
        .describe("Caller's phone number if provided"),
      doctorName: z
        .string()
        .optional()
        .describe(`Preferred doctor. Available: ${config.doctors.map((d) => d.name).join(", ") || defaultDoctorName}`),
      reason: z
        .string()
        .optional()
        .describe("Brief reason for the visit (optional)"),
    }),
    execute: async ({ patientName, date, time, phone, doctorName, reason }) => {
      const resolvedDoctor = findDoctor(config, doctorName);
      if (doctorName?.trim() && !resolvedDoctor) {
        const names = config.doctors.map((d) => d.name).join(", ");
        return `Unknown doctor "${doctorName}". Available doctors: ${names || defaultDoctorName}.`;
      }
      const doctor = resolvedDoctor?.name ?? defaultDoctorName;

      const policy = validateSlotAgainstConfig(config, date, time, doctor);
      if (!policy.ok) {
        return `Cannot book that slot: ${policy.reason}`;
      }

      const schedule = effectiveSchedule(config, doctor);
      if (calendar) {
        const available = await calendar.isSlotAvailable(
          date,
          time,
          config.appointmentDuration,
          {
            start: schedule.start,
            end: schedule.end,
            workingDays: schedule.workingDays,
            blockedDates: schedule.blockedDates,
            bufferMins: config.bufferBetweenAppointments,
          },
        );
        if (!available) {
          return "That time slot is not available on the doctor's calendar. Please choose a different day or time.";
        }
      }

      const result = await store.createAppointment({
        patientName,
        ...(phone ? { phone } : {}),
        doctorName: doctor,
        appointmentDate: date,
        appointmentTime: time,
        ...(reason ? { reason } : {}),
      });

      // Mark inbound call completed — do not leave it to ABANDONED on session close.
      if (callLogger && callId) {
        await callLogger.markCompleted(callId, "BOOKED");
      }

      if (calendar) {
        const idMatch = result.match(/ID: ([A-Za-z0-9_-]+)/);
        const appointmentId =
          idMatch && idMatch[1] ? idMatch[1] : `booked_${Date.now()}`;

        const apptDetails: AppointmentDetails = {
          appointmentId,
          patientName,
          doctorName: doctor,
          appointmentDate: date,
          appointmentTime: time,
          ...(phone ? { phone } : {}),
        };

        const syncResult = await calendar.createEvent(
          apptDetails,
          config.appointmentDuration,
        );
        return `${result} ${syncResult}`.trim();
      }

      return result;
    },
  });

  const checkAvailability = tool({
    name: "checkAvailability",
    description:
      "Check if a proposed date and time (or just date) is available given clinic hours, doctor schedule, and the doctor's Google Calendar. Use this before suggesting or accepting any booking time.",
    parameters: z.object({
      date: z.string().describe("Date in YYYY-MM-DD format"),
      time: z
        .string()
        .optional()
        .describe("Optional specific time in HH:MM (24h) format. If omitted, returns some free slots for the day."),
      doctorName: z
        .string()
        .optional()
        .describe("Optional doctor name to check that doctor's schedule"),
    }),
    execute: async ({ date, time, doctorName }) => {
      const doctor = findDoctor(config, doctorName)?.name ?? defaultDoctorName;
      const policy = validateSlotAgainstConfig(config, date, time, doctor);
      if (!policy.ok) {
        return `That request is not bookable: ${policy.reason}`;
      }

      const schedule = effectiveSchedule(config, doctor);
      const slotOpts = {
        start: schedule.start,
        end: schedule.end,
        workingDays: schedule.workingDays,
        blockedDates: schedule.blockedDates,
        bufferMins: config.bufferBetweenAppointments,
        slotIntervalMins: config.appointmentDuration,
      };

      if (!calendar) {
        if (time) {
          return `Calendar integration is not available. The requested time ${date} at ${time} is within clinic hours and may be bookable.`;
        }
        return "Calendar integration is not available. I can still try to book your requested time within clinic hours.";
      }

      if (time) {
        const available = await calendar.isSlotAvailable(
          date,
          time,
          config.appointmentDuration,
          slotOpts,
        );
        if (available) {
          return `The slot on ${date} at ${time} with ${doctor} appears to be available (${config.appointmentDuration} min).`;
        }
        return `The slot on ${date} at ${time} is NOT available. Please choose a different time.`;
      }

      const slots = await calendar.findFreeSlots(
        date,
        Math.min(3, Math.max(1, config.maxDaysInAdvance)),
        config.appointmentDuration,
        slotOpts,
      );
      if (slots.length === 0) {
        return `No free slots found around ${date} within configured working hours.`;
      }
      const sample = slots
        .slice(0, 4)
        .map((s) => `${s.date} ${s.time}`)
        .join(", ");
      return `Some available slots with ${doctor}: ${sample}. Ask the caller which one works best.`;
    },
  });

  const markNoAnswer = tool({
    name: "markNoAnswer",
    description: "Mark the inbound call as no-answer or ended without a booking.",
    parameters: z.object({}),
    execute: async () => {
      if (callLogger && callId) {
        await callLogger.markNoAnswer(callId);
      }
      return "Call noted as no booking made.";
    },
  });

  return [bookNewAppointment, checkAvailability, markNoAnswer];
}
