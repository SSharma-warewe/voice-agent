import type { Request, Response } from "express";
import * as queueService from "./queue.service.ts";

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startConfirmation(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await queueService.startConfirmationQueue();
    res.json(result);
  } catch (error) {
    console.error("Failed to start confirmation queue:", error);
    res.status(500).json({
      errorMessage: `Failed to start confirmation queue: ${errorDetail(error)}`,
    });
  }
}

export async function startLeads(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await queueService.startLeadQueue();
    res.json(result);
  } catch (error) {
    console.error("Failed to start lead queue:", error);
    res.status(500).json({
      errorMessage: `Failed to start lead queue: ${errorDetail(error)}`,
    });
  }
}
