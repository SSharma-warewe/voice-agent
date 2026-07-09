import type { AppointmentRecord } from "../shared/types.ts";

export interface BookingStore {
  createAppointment(details: {
    patientName: string;
    phone?: string;
    doctorName?: string;
    appointmentDate: string;
    appointmentTime: string;
    reason?: string;
  }): Promise<string>;
  get(appointmentId: string): AppointmentRecord | undefined;
}