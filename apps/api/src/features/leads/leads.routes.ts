import { Router } from "express";
import { asyncHandler } from "../../shared/http.ts";
import * as controller from "./leads.controller.ts";

export const leadsRouter = Router();

leadsRouter.get("/leads", asyncHandler(controller.listLeads));
// Must be registered before /leads/:leadId so "stats" is not parsed as an id.
leadsRouter.get("/leads/stats", asyncHandler(controller.getLeadStats));
leadsRouter.get("/leads/:leadId", asyncHandler(controller.getLead));
leadsRouter.patch(
  "/leads/:leadId/status",
  asyncHandler(controller.updateLeadStatus),
);
leadsRouter.post("/leads/:leadId/join", asyncHandler(controller.joinLead));
leadsRouter.get("/leads/:leadId/call", asyncHandler(controller.getLeadCall));
