import { Router } from "express";
import { asyncHandler } from "../../shared/http.ts";
import * as controller from "./booking.controller.ts";

export const bookingRouter = Router();

bookingRouter.post("/booking/start", asyncHandler(controller.startBooking));
bookingRouter.get("/booking/config", asyncHandler(controller.getBookingConfig));
bookingRouter.put("/booking/config", asyncHandler(controller.putBookingConfig));
