import type { Request, Response } from "express";
import { isPgUniqueViolation } from "../../shared/errors.ts";
import * as appointmentsRepo from "./appointments.repo.ts";
import * as appointmentsService from "./appointments.service.ts";
import {
  validateAppointment,
  validateBatchRequest,
} from "./appointments.validation.ts";

export async function listAppointments(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const appointments = await appointmentsService.listAppointments();
    res.json({ appointments });
  } catch (error) {
    console.error("Failed to list appointments:", error);
    res.status(500).json({ errorMessage: "Failed to list appointments" });
  }
}

export async function createAppointment(
  req: Request,
  res: Response,
): Promise<void> {
  const validation = validateAppointment(req.body);

  if (!validation.valid) {
    res.status(400).json({ errorMessage: validation.errorMessage });
    return;
  }

  try {
    const result = await appointmentsService.createAppointment(
      validation.appointment,
    );
    if (!result.ok) {
      res.status(409).json({ errorMessage: result.errorMessage });
      return;
    }
    console.log("Appointment saved:", result.appointment);
    res.status(201).json({ received: true, appointment: result.appointment });
  } catch (error) {
    console.error("Failed to save appointment:", error);
    res.status(500).json({ errorMessage: "Failed to save appointment" });
  }
}

export async function createAppointmentsBatch(
  req: Request,
  res: Response,
): Promise<void> {
  const batchValidation = validateBatchRequest(req.body);

  if (!batchValidation.valid) {
    res.status(400).json({ errorMessage: batchValidation.errorMessage });
    return;
  }

  const seenIds = new Set<string>();
  const results: Array<
    | {
        index: number;
        status: "saved";
        appointment: Awaited<
          ReturnType<typeof appointmentsRepo.saveAppointment>
        >;
      }
    | {
        index: number;
        status: "failed";
        appointmentId?: string;
        errorMessage: string;
      }
  > = [];

  for (let index = 0; index < batchValidation.appointments.length; index += 1) {
    const item = batchValidation.appointments[index];
    const validation = validateAppointment(item);

    if (!validation.valid) {
      results.push({
        index,
        status: "failed",
        ...(validation.appointmentId
          ? { appointmentId: validation.appointmentId }
          : {}),
        errorMessage: validation.errorMessage,
      });
      continue;
    }

    const { appointmentId } = validation.appointment;

    if (seenIds.has(appointmentId)) {
      results.push({
        index,
        status: "failed",
        appointmentId,
        errorMessage: "duplicate appointmentId in batch",
      });
      continue;
    }

    seenIds.add(appointmentId);

    try {
      const saved = await appointmentsRepo.saveAppointment(
        validation.appointment,
      );
      results.push({
        index,
        status: "saved",
        appointment: saved,
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        results.push({
          index,
          status: "failed",
          appointmentId,
          errorMessage: "An appointment with this ID already exists",
        });
        continue;
      }

      console.error(`Failed to save appointment at index ${index}:`, error);
      results.push({
        index,
        status: "failed",
        appointmentId,
        errorMessage: "Failed to save appointment",
      });
    }
  }

  const saved = results.filter((result) => result.status === "saved").length;
  const failed = results.length - saved;

  console.log(
    `Batch appointments processed: ${saved} saved, ${failed} failed`,
  );

  res.status(failed === 0 ? 201 : 200).json({
    received: true,
    count: results.length,
    saved,
    failed,
    results,
  });
}

export async function getAppointment(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const appointment = await appointmentsService.getAppointmentById(
      req.params.appointmentId as string,
    );

    if (!appointment) {
      res.status(404).json({ errorMessage: "Appointment not found" });
      return;
    }

    res.json({ appointment });
  } catch (error) {
    console.error("Failed to get appointment:", error);
    res.status(500).json({ errorMessage: "Failed to get appointment" });
  }
}

export async function updateAppointmentStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { status, appointmentDate, appointmentTime, declineReason } =
      req.body as {
        status?: string;
        appointmentDate?: string;
        appointmentTime?: string;
        declineReason?: string;
      };

    const result = await appointmentsService.updateStatus(
      req.params.appointmentId as string,
      {
        status: status as string,
        ...(appointmentDate !== undefined ? { appointmentDate } : {}),
        ...(appointmentTime !== undefined ? { appointmentTime } : {}),
        ...(declineReason !== undefined ? { declineReason } : {}),
      },
    );

    if (!result.ok) {
      res.status(result.statusCode).json({ errorMessage: result.errorMessage });
      return;
    }

    console.log("Appointment status updated:", result.appointment);
    res.json({ appointment: result.appointment });
  } catch (error) {
    console.error("Failed to update appointment status:", error);
    res
      .status(500)
      .json({ errorMessage: "Failed to update appointment status" });
  }
}

export async function joinAppointment(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await appointmentsService.joinAppointment(
      req.params.appointmentId as string,
    );

    if (!result.ok) {
      res.status(result.statusCode).json({ errorMessage: result.errorMessage });
      return;
    }

    res.json({
      ...result.join,
      appointment: result.appointment,
    });
  } catch (error) {
    console.error("Failed to create join token:", error);
    res.status(500).json({ errorMessage: "Failed to create join token" });
  }
}

export async function getAppointmentCall(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const call = await appointmentsService.getAppointmentCall(
      req.params.appointmentId as string,
    );

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found for appointment" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to get appointment call:", error);
    res.status(500).json({ errorMessage: "Failed to get appointment call" });
  }
}
