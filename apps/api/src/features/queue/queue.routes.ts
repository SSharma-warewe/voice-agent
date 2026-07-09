import { Router } from "express";
import { asyncHandler } from "../../shared/http.ts";
import * as controller from "./queue.controller.ts";

export const queueRouter = Router();

queueRouter.post(
  "/queue/confirmation/start",
  asyncHandler(controller.startConfirmation),
);
queueRouter.post("/queue/leads/start", asyncHandler(controller.startLeads));
