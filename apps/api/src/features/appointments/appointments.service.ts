import { isPgUniqueViolation } from "../../shared/errors.ts";
import {
  APPOINTMENT_TERMINAL_STATUSES,
  type CreateAppointmentInput,
  type UpdateAppointmentStatusInput,
} from "../../shared/types.ts";
import {
  createParticipantToken,
} from "../../shared/livekit.ts";
import * as callsService from "../calls/calls.service.ts";
import * as appointmentsRepo from "./appointments.repo.ts";

export async function listAppointments() {
  return appointmentsRepo.listAppointments();
}

export async function getAppointmentById(appointmentId: string) {
  return appointmentsRepo.getAppointmentById(appointmentId);
}

export async function createAppointment(appointment: CreateAppointmentInput) {
  try {
    return { ok: true as const, appointment: await appointmentsRepo.saveAppointment(appointment) };
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      return {
        ok: false as const,
        conflict: true as const,
        errorMessage: "An appointment with this ID already exists",
      };
    }
    throw error;
  }
}

export type BatchItemResult =
  | {
      index: number;
      status: "saved";
      appointment: Awaited<ReturnType<typeof appointmentsRepo.saveAppointment>>;
    }
  | {
      index: number;
      status: "failed";
      appointmentId?: string;
      errorMessage: string;
    };

export async function createAppointmentsBatch(
  items: CreateAppointmentInput[],
): Promise<{
  results: BatchItemResult[];
  saved: number;
  failed: number;
}> {
  const seenIds = new Set<string>();
  const results: BatchItemResult[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const appointment = items[index]!;
    const { appointmentId } = appointment;

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
      const saved = await appointmentsRepo.saveAppointment(appointment);
      results.push({ index, status: "saved", appointment: saved });
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

  const saved = results.filter((r) => r.status === "saved").length;
  return { results, saved, failed: results.length - saved };
}

export async function updateStatus(
  appointmentId: string,
  update: UpdateAppointmentStatusInput,
) {
  if (!APPOINTMENT_TERMINAL_STATUSES.has(update.status)) {
    return {
      ok: false as const,
      statusCode: 400 as const,
      errorMessage:
        "status must be CONFIRMED, DECLINED, RESCHEDULED, or ABANDONED",
    };
  }

  if (
    update.status === "RESCHEDULED" &&
    (typeof update.appointmentDate !== "string" ||
      typeof update.appointmentTime !== "string")
  ) {
    return {
      ok: false as const,
      statusCode: 400 as const,
      errorMessage:
        "appointmentDate and appointmentTime are required for RESCHEDULED",
    };
  }

  const appointment = await appointmentsRepo.updateAppointmentStatus(
    appointmentId,
    update,
  );

  if (!appointment) {
    return {
      ok: false as const,
      statusCode: 404 as const,
      errorMessage: "Appointment not found",
    };
  }

  await callsService.finalizeCallForAppointment(appointmentId, {
    outcome: update.status,
    ...(update.declineReason !== undefined
      ? { declineReason: update.declineReason }
      : {}),
  });

  return { ok: true as const, appointment };
}

export async function joinAppointment(appointmentId: string) {
  const appointment = await appointmentsRepo.getAppointmentById(appointmentId);

  if (!appointment) {
    return {
      ok: false as const,
      statusCode: 404 as const,
      errorMessage: "Appointment not found",
    };
  }

  if (appointment.status !== "CALLING" || !appointment.livekitRoomName) {
    return {
      ok: false as const,
      statusCode: 409 as const,
      errorMessage:
        "No active call room. Start the confirmation queue, or wait if this call was requeued after the join window.",
    };
  }

  const join = (await createParticipantToken({
    roomName: appointment.livekitRoomName,
    identity: `patient-${appointment.appointmentId}`,
    name: appointment.patientName,
  })) as {
    token: string;
    serverUrl: string;
    roomName: string;
  };

  await callsService.updateCall(appointment.livekitRoomName, {
    status: "IN_PROGRESS",
    patientJoinedAt: new Date().toISOString(),
  });

  return { ok: true as const, join, appointment };
}

export async function getAppointmentCall(appointmentId: string) {
  return callsService.getCallByAppointmentId(appointmentId);
}
