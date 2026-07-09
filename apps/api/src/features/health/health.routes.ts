import { Router } from "express";
import { asyncHandler } from "../../shared/http.ts";
import { getHealth, getReady } from "./health.controller.ts";

export const healthRouter = Router();

healthRouter.get("/health", getHealth);
healthRouter.get("/ready", asyncHandler(getReady));
