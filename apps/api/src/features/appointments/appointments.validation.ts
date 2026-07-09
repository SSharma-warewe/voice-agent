import type { CreateAppointmentInput } from "../../shared/types.ts";

export const BATCH_MAX_SIZE = 10;

/** Phone is optional (inbound callers may not give one); empty becomes a sentinel. */
export const REQUIRED_FIELDS = [
  "appointmentId",
  "patientName",
  "appointmentDate",
  "appointmentTime",
] as const;

export type AppointmentValidationResult =
  | { valid: true; appointment: CreateAppointmentInput }
  | {
      valid: false;
      field?: string;
      appointmentId?: string;
      errorMessage: string;
    };

export type BatchValidationResult =
  | { valid: true; appointments: unknown[] }
  | { valid: false; errorMessage: string };

export function normalizeAppointment(body: Record<string, unknown>): CreateAppointmentInput {
  const phoneRaw = body.phone;
  const phone =
    typeof phoneRaw === "string" && phoneRaw.trim() !== ""
      ? phoneRaw.trim()
      : "not-provided";

  const statusRaw = body.status;
  const status =
    typeof statusRaw === "string" && statusRaw.trim() !== ""
      ? statusRaw.trim()
      : undefined;

  return {
    appointmentId: String(body.appointmentId),
    patientName: String(body.patientName),
    phone,
    doctorName:
      typeof body.doctorName === "string" ? body.doctorName : "Dr. Smith",
    appointmentDate: String(body.appointmentDate),
    appointmentTime: String(body.appointmentTime),
    ...(status ? { status } : {}),
  };
}

export function validateAppointment(body: unknown): AppointmentValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      errorMessage: "appointment must be an object",
    };
  }

  const record = body as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.trim() === "") {
      return {
        valid: false,
        field,
        ...(typeof record.appointmentId === "string"
          ? { appointmentId: record.appointmentId }
          : {}),
        errorMessage: `${field} is required`,
      };
    }
  }

  return {
    valid: true,
    appointment: normalizeAppointment(record),
  };
}

export function validateBatchRequest(body: unknown): BatchValidationResult {
  const appointments =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { appointments?: unknown }).appointments
      : undefined;

  if (!Array.isArray(appointments)) {
    return {
      valid: false,
      errorMessage: "appointments must be an array",
    };
  }

  if (appointments.length === 0) {
    return {
      valid: false,
      errorMessage: "appointments must contain at least 1 item",
    };
  }

  if (appointments.length > BATCH_MAX_SIZE) {
    return {
      valid: false,
      errorMessage: `appointments must contain at most ${BATCH_MAX_SIZE} items`,
    };
  }

  return { valid: true, appointments };
}
