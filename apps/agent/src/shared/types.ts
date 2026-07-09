export type AppointmentStatus =
  | "PENDING"
  | "CALLING"
  | "CONFIRMED"
  | "DECLINED"
  | "RESCHEDULED"
  | "ABANDONED";

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

export type LeadStatus = "PENDING" | "CALLING" | "BOOKED" | "DECLINED" | "NO_ANSWER" | "FAILED";

export interface LeadDetails {
  leadId: string;
  name: string;
  phone: string;
  campaignId?: string | null;
  script?: string;
}

export interface LeadRecord extends LeadDetails {
  status: LeadStatus;
  livekitRoomName?: string | null;
  outcome?: string | null;
}

export interface BookingContext {
  sessionId?: string;
  callerName?: string;
  phone?: string;
}

/** Inbound booking agent schedule / policy config. */
export interface DoctorSchedule {
  workingDays: number[];
  start: string;
  end: string;
  blockedDates: string[];
}

export interface DoctorConfig {
  id: string;
  name: string;
  schedule: DoctorSchedule;
}

export interface BookingConfig {
  timezone: string;
  workingHours: {
    start: string;
    end: string;
  };
  workingDays: number[];
  blockedDates: string[];
  appointmentDuration: number;
  bufferBetweenAppointments: number;
  allowSameDayBooking: boolean;
  maxDaysInAdvance: number;
  doctors: DoctorConfig[];
}