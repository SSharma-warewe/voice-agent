import { voice } from "@livekit/agents";
import type { LeadStore } from "./store.ts";
import { buildLeadInstructions } from "./prompt.ts";
import { createLeadTools } from "./tools.ts";
import type { LeadDetails } from "../shared/types.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";

export class LeadOutreachAgent extends voice.Agent {
  readonly lead: LeadDetails;
  readonly store: LeadStore;

  constructor(lead: LeadDetails, store: LeadStore, calendar?: CalendarClient | null) {
    super({
      instructions: buildLeadInstructions(lead),
      tools: createLeadTools(store, calendar ?? undefined),
    });
    this.lead = lead;
    this.store = store;
  }
}