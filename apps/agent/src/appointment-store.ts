import type {
  AppointmentDetails,
  AppointmentRecord,
  AppointmentStatus,
} from "./types.ts";

export interface AppointmentStore {
  confirm(appointmentId: string): Promise<string>;
  deny(appointmentId: string, reason?: string): Promise<string>;
  reschedule(
    appointmentId: string,
    newDate: string,
    newTime: string,
  ): Promise<string>;
  get(appointmentId: string): AppointmentRecord | undefined;
}

export class InMemoryAppointmentStore implements AppointmentStore {
  private readonly records = new Map<string, AppointmentRecord>();

  constructor(initialAppointments: AppointmentDetails[] = []) {
    for (const appointment of initialAppointments) {
      this.records.set(appointment.appointmentId, {
        ...appointment,
        status: "PENDING",
      });
    }
  }

  get(appointmentId: string): AppointmentRecord | undefined {
    return this.records.get(appointmentId);
  }

  async confirm(appointmentId: string): Promise<string> {
    const record = this.requireRecord(appointmentId);
    record.status = "CONFIRMED";
    return "Appointment confirmed.";
  }

  async deny(appointmentId: string, reason?: string): Promise<string> {
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
    const record = this.requireRecord(appointmentId);
    record.appointmentDate = newDate;
    record.appointmentTime = newTime;
    record.status = "RESCHEDULED";
    return "Appointment successfully rescheduled.";
  }

  private requireRecord(appointmentId: string): AppointmentRecord {
    const record = this.records.get(appointmentId);
    if (!record) {
      throw new Error(`Appointment not found: ${appointmentId}`);
    }
    return record;
  }
}

export function getAppointmentStatus(
  store: AppointmentStore,
  appointmentId: string,
): AppointmentStatus | undefined {
  return store.get(appointmentId)?.status;
}