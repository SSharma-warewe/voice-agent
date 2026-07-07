import type { AppointmentStore } from "./appointment-store.ts";
import type {
  AppointmentRecord,
  AppointmentStatus,
} from "./types.ts";

type StatusUpdate = {
  status: AppointmentStatus;
  appointmentDate?: string;
  appointmentTime?: string;
  declineReason?: string;
};

export class ApiAppointmentStore implements AppointmentStore {
  private readonly records = new Map<string, AppointmentRecord>();
  private readonly apiUrl: string;

  constructor(apiUrl: string, initial: AppointmentRecord) {
    this.apiUrl = apiUrl;
    this.records.set(initial.appointmentId, { ...initial });
  }

  get(appointmentId: string): AppointmentRecord | undefined {
    return this.records.get(appointmentId);
  }

  async confirm(appointmentId: string): Promise<string> {
    await this.patchStatus(appointmentId, { status: "CONFIRMED" });
    const record = this.requireRecord(appointmentId);
    record.status = "CONFIRMED";
    return "Appointment confirmed.";
  }

  async deny(appointmentId: string, reason?: string): Promise<string> {
    await this.patchStatus(appointmentId, {
      status: "DECLINED",
      ...(reason ? { declineReason: reason } : {}),
    });
    const record = this.requireRecord(appointmentId);
    record.status = "DECLINED";
    if (reason) {
      record.declineReason = reason;
    }
    return "Appointment declined.";
  }

  async reschedule(
    appointmentId: string,
    newDate: string,
    newTime: string,
  ): Promise<string> {
    await this.patchStatus(appointmentId, {
      status: "RESCHEDULED",
      appointmentDate: newDate,
      appointmentTime: newTime,
    });
    const record = this.requireRecord(appointmentId);
    record.appointmentDate = newDate;
    record.appointmentTime = newTime;
    record.status = "RESCHEDULED";
    return "Appointment successfully rescheduled.";
  }

  private async patchStatus(
    appointmentId: string,
    update: StatusUpdate,
  ): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/appointments/${appointmentId}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        errorMessage?: string;
      } | null;
      throw new Error(body?.errorMessage ?? "Failed to update appointment status");
    }
  }

  private requireRecord(appointmentId: string): AppointmentRecord {
    const record = this.records.get(appointmentId);
    if (!record) {
      throw new Error(`Appointment not found: ${appointmentId}`);
    }
    return record;
  }
}