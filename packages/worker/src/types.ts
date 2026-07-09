/** Row and job shapes used by the outbound call worker. */

export interface AppointmentRow {
  appointmentId: string;
  patientName: string;
  phone: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  livekitRoomName: string | null;
  createdAt?: string | Date;
}

export interface LeadRow {
  leadId: string;
  campaignId: string | null;
  name: string;
  phone: string;
  status?: string;
  livekitRoomName?: string | null;
}

export interface ClaimedLead {
  leadId: string;
  campaignId: string | null;
  name: string;
  phone: string;
}

export interface CallIdRow {
  callId: string;
}

export interface AppointmentIdRow {
  appointmentId: string;
}

export interface LeadIdRow {
  leadId: string;
}

export interface CreateCallInput {
  callId: string;
  appointmentId: string;
  roomName: string;
  status?: string;
}

export interface CreateLeadCallInput {
  callId: string;
  leadId: string;
  roomName: string;
  status?: string;
}

export interface RequeueResult {
  calls: CallIdRow[];
  appointments: AppointmentIdRow[];
  leads: LeadIdRow[];
}

export interface ConfirmationCallJobData {
  appointmentId: string;
}

export interface LeadCallJobData {
  leadId: string;
}

export interface FetchJobData {
  trigger: string;
}
