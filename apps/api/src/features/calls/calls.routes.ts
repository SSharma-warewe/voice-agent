import { Router } from "express";
import { asyncHandler } from "../../shared/http.ts";
import * as controller from "./calls.controller.ts";

export const callsRouter = Router();

callsRouter.get("/calls", asyncHandler(controller.listCalls));
// Must be before /calls/:callId
callsRouter.get("/calls/stats", asyncHandler(controller.getCallStats));
callsRouter.get("/calls/:callId", asyncHandler(controller.getCall));
callsRouter.patch("/calls/:callId", asyncHandler(controller.updateCall));
callsRouter.post(
  "/calls/:callId/transcript",
  asyncHandler(controller.appendTranscript),
);
callsRouter.post(
  "/calls/:callId/abandon",
  asyncHandler(controller.abandonCall),
);
