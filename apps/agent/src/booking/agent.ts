import { voice } from "@livekit/agents";
import type { BookingStore } from "./store.ts";
import { buildInstructions } from "./prompt.ts";
import { createBookingTools } from "./tools.ts";
import type { BookingConfig, BookingContext } from "../shared/types.ts";
import type { CalendarClient } from "../shared/calendar-client.ts";
import type { CallLogger } from "../shared/call-logger.ts";

export class InboundBookingAgent extends voice.Agent {
  readonly context: BookingContext;
  readonly store: BookingStore;
  readonly bookingConfig: BookingConfig | undefined;

  constructor(
    context: BookingContext,
    store: BookingStore,
    calendar?: CalendarClient | null,
    callLogger?: CallLogger,
    callId?: string,
    bookingConfig?: BookingConfig,
  ) {
    super({
      instructions: buildInstructions(context, bookingConfig),
      tools: createBookingTools(
        store,
        calendar ?? undefined,
        callLogger,
        callId,
        bookingConfig,
      ),
    });

    this.context = context;
    this.store = store;
    this.bookingConfig = bookingConfig;
  }
}
