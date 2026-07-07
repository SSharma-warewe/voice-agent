export type AppointmentStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "RESCHEDULED";

export interface AppointmentDetails {
  appointmentId: string;
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  phone?: string;
}

export interface AppointmentRecord extends AppointmentDetails {
  status: AppointmentStatus;
  declineReason?: string;
}