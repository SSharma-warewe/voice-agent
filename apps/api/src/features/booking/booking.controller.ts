import type { Request, Response } from "express";
import * as bookingService from "./booking.service.ts";

export async function startBooking(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await bookingService.startBooking();
    res.json(result);
  } catch (error) {
    console.error("Failed to start inbound booking call:", error);
    const detail = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      errorMessage: `Failed to start booking call: ${detail}`,
    });
  }
}

export async function getBookingConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const config = await bookingService.getBookingConfig();
  res.json({ config });
}

export async function putBookingConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const config = await bookingService.saveBookingConfig(req.body);
  res.json({ config });
}
