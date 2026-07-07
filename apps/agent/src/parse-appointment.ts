import type { AppointmentDetails } from "./types.ts";

const REQUIRED_FIELDS = [
  "appointmentId",
  "patientName",
  "doctorName",
  "appointmentDate",
  "appointmentTime",
] as const;

function hasRequiredFields(
  value: Record<string, unknown>,
): value is Record<(typeof REQUIRED_FIELDS)[number], string> {
  return REQUIRED_FIELDS.every(
    (field) => typeof value[field] === "string" && value[field].trim() !== "",
  );
}

export function parseAppointmentMetadata(
  metadata: string | undefined,
): AppointmentDetails | null {
  if (!metadata?.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (!hasRequiredFields(record)) {
      return null;
    }

    const appointment: AppointmentDetails = {
      appointmentId: record.appointmentId,
      patientName: record.patientName,
      doctorName: record.doctorName,
      appointmentDate: record.appointmentDate,
      appointmentTime: record.appointmentTime,
    };

    const phone = (record as Record<string, unknown>).phone;
    if (typeof phone === "string" && phone.trim() !== "") {
      appointment.phone = phone;
    }

    return appointment;
  } catch {
    return null;
  }
}

export function getDemoAppointment(): AppointmentDetails {
  return {
    appointmentId: "apt_demo_001",
    patientName: "Demo Patient",
    doctorName: "Dr. Smith",
    appointmentDate: "2026-07-10",
    appointmentTime: "14:00",
    phone: "+15551234567",
  };
}