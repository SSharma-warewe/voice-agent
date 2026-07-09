import { Router } from "express";
import { asyncHandler } from "../../shared/http.ts";
import * as controller from "./appointments.controller.ts";

export const appointmentsRouter = Router();

appointmentsRouter.get(
  "/appointments",
  asyncHandler(controller.listAppointments),
);
appointmentsRouter.post(
  "/appointments/batch",
  asyncHandler(controller.createAppointmentsBatch),
);
appointmentsRouter.post(
  "/appointments",
  asyncHandler(controller.createAppointment),
);
appointmentsRouter.get(
  "/appointments/:appointmentId",
  asyncHandler(controller.getAppointment),
);
appointmentsRouter.patch(
  "/appointments/:appointmentId/status",
  asyncHandler(controller.updateAppointmentStatus),
);
appointmentsRouter.post(
  "/appointments/:appointmentId/join",
  asyncHandler(controller.joinAppointment),
);
appointmentsRouter.get(
  "/appointments/:appointmentId/call",
  asyncHandler(controller.getAppointmentCall),
);
