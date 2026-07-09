import type { Request, Response } from "express";
import * as callsService from "./calls.service.ts";
import { validateTranscriptSegment } from "./calls.validation.ts";

export async function listCalls(_req: Request, res: Response): Promise<void> {
  try {
    const calls = await callsService.listCalls();
    res.json({ calls });
  } catch (error) {
    console.error("Failed to list calls:", error);
    res.status(500).json({ errorMessage: "Failed to list calls" });
  }
}

export async function getCallStats(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const stats = await callsService.getCallStats();
    res.json({ stats });
  } catch (error) {
    console.error("Failed to get call stats:", error);
    res.status(500).json({ errorMessage: "Failed to get call stats" });
  }
}

export async function getCall(req: Request, res: Response): Promise<void> {
  try {
    const call = await callsService.getCallById(req.params.callId as string);

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to get call:", error);
    res.status(500).json({ errorMessage: "Failed to get call" });
  }
}

export async function updateCall(req: Request, res: Response): Promise<void> {
  try {
    const {
      status,
      outcome,
      declineReason,
      patientJoinedAt,
      endedAt,
      durationSeconds,
    } = req.body as {
      status?: string;
      outcome?: string | null;
      declineReason?: string | null;
      patientJoinedAt?: string | null;
      endedAt?: string | Date | null;
      durationSeconds?: number | null;
    };

    const call = await callsService.updateCall(req.params.callId as string, {
      ...(status !== undefined ? { status } : {}),
      ...(outcome !== undefined ? { outcome } : {}),
      ...(declineReason !== undefined ? { declineReason } : {}),
      ...(patientJoinedAt !== undefined ? { patientJoinedAt } : {}),
      ...(endedAt !== undefined ? { endedAt } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    });

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to update call:", error);
    res.status(500).json({ errorMessage: "Failed to update call" });
  }
}

export async function appendTranscript(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const validation = validateTranscriptSegment(req.body);
    if (!validation.valid) {
      res.status(400).json({ errorMessage: validation.errorMessage });
      return;
    }

    const call = await callsService.appendTranscriptSegment(
      req.params.callId as string,
      {
        speaker: validation.speaker,
        text: validation.text,
        ...(validation.at !== undefined ? { at: validation.at } : {}),
      },
    );

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to append transcript:", error);
    res.status(500).json({ errorMessage: "Failed to append transcript" });
  }
}

export async function abandonCall(req: Request, res: Response): Promise<void> {
  try {
    const call = await callsService.markCallAbandoned(
      req.params.callId as string,
    );

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to mark call abandoned:", error);
    res.status(500).json({ errorMessage: "Failed to mark call abandoned" });
  }
}
