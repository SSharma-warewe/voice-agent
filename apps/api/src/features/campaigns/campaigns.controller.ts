import type { Request, Response } from "express";
import { validateCampaignRequest } from "../leads/leads.validation.ts";
import * as campaignsService from "./campaigns.service.ts";

export async function listCampaigns(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const campaigns = await campaignsService.listCampaigns();
    res.json({ campaigns });
  } catch (error) {
    console.error("Failed to list campaigns:", error);
    res.status(500).json({ errorMessage: "Failed to list campaigns" });
  }
}

export async function createCampaign(
  req: Request,
  res: Response,
): Promise<void> {
  const v = validateCampaignRequest(req.body);
  if (!v.valid) {
    res.status(400).json({ errorMessage: v.errorMessage });
    return;
  }

  try {
    const result = await campaignsService.createCampaignWithLeads({
      campaign: v.campaign,
      leads: v.leads,
    });
    res.status(201).json({
      received: true,
      campaign: result.campaign,
      leads: result.leads,
    });
  } catch (error) {
    console.error("Failed to create campaign:", error);
    res.status(500).json({ errorMessage: "Failed to create campaign" });
  }
}
