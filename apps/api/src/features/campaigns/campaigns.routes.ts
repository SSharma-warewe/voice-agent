import { Router } from "express";
import { asyncHandler } from "../../shared/http.ts";
import * as controller from "./campaigns.controller.ts";

export const campaignsRouter = Router();

campaignsRouter.get("/campaigns", asyncHandler(controller.listCampaigns));
campaignsRouter.post("/campaigns", asyncHandler(controller.createCampaign));
