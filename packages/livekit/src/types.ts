/** Shapes used by LiveKit room metadata and token helpers. */

export type AgentKind = "confirmation" | "lead" | "booking";

export interface LiveKitCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface ConfirmationAppointment {
  appointmentId: string;
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  phone: string;
}

export interface LeadOutreachInput {
  leadId?: string;
  id?: string;
  name: string;
  phone: string;
  script?: string | null;
  campaignId?: string | null;
}

export interface BookingRoomContext {
  sessionId?: string;
  callerName?: string;
  phone?: string;
}

export interface ParticipantTokenOptions {
  roomName: string;
  identity: string;
  name: string;
}

export interface ParticipantTokenResult {
  token: string;
  serverUrl: string;
  roomName: string;
}
