import cors from "cors";
import express from "express";
import { errorHandler } from "./shared/http.ts";
import { appointmentsRouter } from "./features/appointments/appointments.routes.ts";
import { bookingRouter } from "./features/booking/booking.routes.ts";
import { callsRouter } from "./features/calls/calls.routes.ts";
import { campaignsRouter } from "./features/campaigns/campaigns.routes.ts";
import { healthRouter } from "./features/health/health.routes.ts";
import { leadsRouter } from "./features/leads/leads.routes.ts";
import { queueRouter } from "./features/queue/queue.routes.ts";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(healthRouter);
  app.use(appointmentsRouter);
  app.use(callsRouter);
  app.use(campaignsRouter);
  app.use(leadsRouter);
  app.use(queueRouter);
  app.use(bookingRouter);

  app.use(errorHandler);

  return app;
}
