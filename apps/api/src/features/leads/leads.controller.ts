import type { Request, Response } from "express";
import * as leadsService from "./leads.service.ts";

export async function listLeads(_req: Request, res: Response): Promise<void> {
  try {
    const leads = await leadsService.listLeads();
    res.json({ leads });
  } catch (error) {
    console.error("Failed to list leads:", error);
    res.status(500).json({ errorMessage: "Failed to list leads" });
  }
}

export async function getLeadStats(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const stats = await leadsService.getLeadStats();
    res.json({ stats });
  } catch (error) {
    console.error("Failed to get lead stats:", error);
    res.status(500).json({ errorMessage: "Failed to get lead stats" });
  }
}

export async function getLead(req: Request, res: Response): Promise<void> {
  try {
    const lead = await leadsService.getLeadById(req.params.leadId as string);
    if (!lead) {
      res.status(404).json({ errorMessage: "Lead not found" });
      return;
    }
    res.json({ lead });
  } catch (error) {
    console.error("Failed to get lead:", error);
    res.status(500).json({ errorMessage: "Failed to get lead" });
  }
}

export async function updateLeadStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { status, outcome } = req.body as {
      status?: string;
      outcome?: string;
    };
    const lead = await leadsService.updateStatus(req.params.leadId as string, {
      ...(status !== undefined ? { status } : {}),
      ...(outcome !== undefined ? { outcome } : {}),
    });
    if (!lead) {
      res.status(404).json({ errorMessage: "Lead not found" });
      return;
    }
    res.json({ lead });
  } catch (error) {
    console.error("Failed to update lead:", error);
    res.status(500).json({ errorMessage: "Failed to update lead" });
  }
}

export async function joinLead(req: Request, res: Response): Promise<void> {
  try {
    const result = await leadsService.joinLead(req.params.leadId as string);
    if (!result.ok) {
      res.status(result.statusCode).json({ errorMessage: result.errorMessage });
      return;
    }
    res.json({ ...result.join, lead: result.lead });
  } catch (error) {
    console.error("Failed to create lead join token:", error);
    res.status(500).json({ errorMessage: "Failed to create join token" });
  }
}

export async function getLeadCall(req: Request, res: Response): Promise<void> {
  try {
    const call = await leadsService.getLeadCall(req.params.leadId as string);
    if (!call) {
      res.status(404).json({ errorMessage: "Call not found for lead" });
      return;
    }
    res.json({ call });
  } catch (error) {
    console.error("Failed to get lead call:", error);
    res.status(500).json({ errorMessage: "Failed to get lead call" });
  }
}
