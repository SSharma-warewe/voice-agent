import type { BookingStore } from "./store.ts";
import type { AppointmentRecord } from "../shared/types.ts";

export class ApiBookingStore implements BookingStore {
  private readonly records = new Map<string, AppointmentRecord>();
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  get(appointmentId: string): AppointmentRecord | undefined {
    return this.records.get(appointmentId);
  }

  async createAppointment(details: {
    patientName: string;
    phone?: string;
    doctorName?: string;
    appointmentDate: string;
    appointmentTime: string;
    reason?: string;
  }): Promise<string> {
    const appointmentId = `booked_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // CONFIRMED = already booked via inbound agent; must NOT re-enter outbound
    // confirmation queue (worker/API only drain status = PENDING).
    const body = {
      appointmentId,
      patientName: details.patientName,
      phone: details.phone?.trim() || "not-provided",
      doctorName: details.doctorName || "Dr. Smith",
      appointmentDate: details.appointmentDate,
      appointmentTime: details.appointmentTime,
      status: "CONFIRMED",
    };

    const resp = await fetch(`${this.apiUrl}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(
        (err as { errorMessage?: string })?.errorMessage ||
          "Failed to create appointment via API",
      );
    }

    const record: AppointmentRecord = {
      appointmentId,
      patientName: details.patientName,
      doctorName: details.doctorName || "Dr. Smith",
      appointmentDate: details.appointmentDate,
      appointmentTime: details.appointmentTime,
      ...(details.phone ? { phone: details.phone } : {}),
      status: "CONFIRMED",
    };
    this.records.set(appointmentId, record);

    const reasonNote = details.reason ? ` (${details.reason})` : "";
    return `Appointment booked for ${details.patientName} on ${details.appointmentDate} at ${details.appointmentTime}. ID: ${appointmentId}${reasonNote}`;
  }
}
