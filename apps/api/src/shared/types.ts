/** Domain types for the API (aligned with web + agent consumers). */

export type AppointmentStatus =
  | "PENDING"
  | "CALLING"
  | "CONFIRMED"
  | "DECLINED"
  | "RESCHEDULED"
  | "ABANDONED";

export type AppointmentTerminalStatus =
  | "CONFIRMED"
  | "DECLINED"
  | "RESCHEDULED"
  | "ABANDONED";

export type LeadStatus =
  | "PENDING"
  | "CALLING"
  | "BOOKED"
  | "DECLINED"
  | "NO_ANSWER"
  | "FAILED";

export type LeadTerminalStatus = "BOOKED" | "DECLINED" | "NO_ANSWER" | "FAILED";

export type CallStatus =
  | "INITIATED"
  | "WAITING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ABANDONED"
  | "NO_ANSWER"
  | "FAILED"
  | string;

export type CallTerminalStatus = "COMPLETED" | "ABANDONED" | "NO_ANSWER" | "FAILED";

export interface Appointment {
  appointmentId: string;
  patientName: string;
  phone: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  status: AppointmentStatus | string;
  livekitRoomName: string | null;
  declineReason?: string | null;
  createdAt?: string | Date;
}

export interface CreateAppointmentInput {
  appointmentId: string;
  patientName: string;
  phone: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  /**
   * Optional initial status. Use CONFIRMED for inbound/lead bookings so they
   * never re-enter the outbound confirmation queue (which only drains PENDING).
   */
  status?: AppointmentStatus | string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  at: string;
}

export interface Call {
  callId: string;
  appointmentId: string | null;
  leadId: string | null;
  livekitRoomName: string;
  status: CallStatus;
  outcome: string | null;
  startedAt: string | Date;
  patientJoinedAt: string | Date | null;
  endedAt: string | Date | null;
  durationSeconds: number | null;
  transcript: TranscriptSegment[];
  declineReason: string | null;
}

export interface CallStats {
  activeCount: number;
  completedToday: number;
  avgDurationSeconds: number;
}

export interface Campaign {
  campaignId: string;
  name: string | null;
  script: string;
  createdAt?: string | Date;
}

export interface Lead {
  leadId: string;
  campaignId: string | null;
  name: string;
  phone: string;
  status: LeadStatus | string;
  livekitRoomName: string | null;
  outcome: string | null;
  createdAt?: string | Date;
  script?: string | null;
}

export interface CreateCallInput {
  callId: string;
  appointmentId?: string | null;
  leadId?: string | null;
  roomName: string;
  status?: string;
}

export interface UpdateCallInput {
  status?: string;
  outcome?: string | null;
  declineReason?: string | null;
  patientJoinedAt?: string | Date | null;
  endedAt?: string | Date | null;
  durationSeconds?: number | null;
}

export interface UpdateAppointmentStatusInput {
  status: AppointmentTerminalStatus | string;
  appointmentDate?: string;
  appointmentTime?: string;
  declineReason?: string;
}

export interface UpdateLeadStatusInput {
  status?: string;
  livekitRoomName?: string | null;
  outcome?: string | null;
  clearRoom?: boolean;
}

export const APPOINTMENT_TERMINAL_STATUSES = new Set<string>([
  "CONFIRMED",
  "DECLINED",
  "RESCHEDULED",
  "ABANDONED",
]);

export const LEAD_TERMINAL_STATUSES = new Set<string>([
  "BOOKED",
  "DECLINED",
  "NO_ANSWER",
  "FAILED",
]);

export const CALL_TERMINAL_STATUSES = new Set<string>([
  "COMPLETED",
  "ABANDONED",
  "NO_ANSWER",
  "FAILED",
]);

/** Inbound booking agent schedule / policy config (single clinic-wide row). */
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
