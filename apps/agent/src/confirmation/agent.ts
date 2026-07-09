import { voice } from "@livekit/agents";
import type { AppointmentStore } from "./appointment-store.ts";
import { buildInstructions } from "./prompt.ts";
import { createAppointmentTools } from "./tools.ts";
import type { AppointmentDetails } from "../shared/types.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";

export class AppointmentConfirmationAgent extends voice.Agent {
  readonly appointment: AppointmentDetails;
  readonly store: AppointmentStore;

  constructor(
    appointment: AppointmentDetails,
    store: AppointmentStore,
    calendar?: CalendarClient | null,
  ) {
    super({
      instructions: buildInstructions(appointment),
      tools: createAppointmentTools(store, calendar ?? undefined),
    });

    this.appointment = appointment;
    this.store = store;
  }
}