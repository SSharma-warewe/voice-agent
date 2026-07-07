const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export interface Appointment {
  appointmentId: string;
  patientName: string;
  phone: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  livekitRoomName: string | null;
  declineReason?: string | null;
  createdAt: string;
}

export interface TranscriptSegment {
  speaker: "user" | "agent";
  text: string;
  at: string;
}

export interface CallLog {
  callId: string;
  appointmentId: string;
  livekitRoomName: string;
  status: string;
  outcome: string | null;
  startedAt: string;
  patientJoinedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  transcript: TranscriptSegment[];
  declineReason: string | null;
}

export interface CallStats {
  activeCount: number;
  completedToday: number;
  avgDurationSeconds: number;
}

const TERMINAL_STATUSES = new Set(["CONFIRMED", "DECLINED", "RESCHEDULED"]);
const HISTORY_STATUSES = new Set(["COMPLETED", "ABANDONED", "NO_ANSWER", "FAILED"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface JoinResponse {
  token: string;
  serverUrl: string;
  roomName: string;
  appointment: Appointment;
}

export async function fetchAppointments(): Promise<Appointment[]> {
  const response = await fetch(`${API_BASE}/appointments`);
  if (!response.ok) {
    throw new Error("Failed to load appointments");
  }
  const data = (await response.json()) as { appointments: Appointment[] };
  return data.appointments;
}

export async function fetchAppointment(
  appointmentId: string,
): Promise<Appointment> {
  const response = await fetch(`${API_BASE}/appointments/${appointmentId}`);
  if (!response.ok) {
    throw new Error("Failed to load appointment");
  }
  const data = (await response.json()) as { appointment: Appointment };
  return data.appointment;
}

export async function fetchAppointmentOutcome(
  appointmentId: string,
): Promise<Appointment> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const appointment = await fetchAppointment(appointmentId);
    if (TERMINAL_STATUSES.has(appointment.status)) {
      return appointment;
    }
    await sleep(1000);
  }
  return fetchAppointment(appointmentId);
}

export async function fetchCalls(): Promise<CallLog[]> {
  const response = await fetch(`${API_BASE}/calls`);
  if (!response.ok) {
    throw new Error("Failed to load calls");
  }
  const data = (await response.json()) as { calls: CallLog[] };
  return data.calls;
}

export async function fetchCallStats(): Promise<CallStats> {
  const response = await fetch(`${API_BASE}/calls/stats`);
  if (!response.ok) {
    throw new Error("Failed to load call stats");
  }
  const data = (await response.json()) as { stats: CallStats };
  return data.stats;
}

export async function fetchCallByAppointment(
  appointmentId: string,
): Promise<CallLog | null> {
  const response = await fetch(`${API_BASE}/appointments/${appointmentId}/call`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to load call for appointment");
  }
  const data = (await response.json()) as { call: CallLog };
  return data.call;
}

export async function markCallAbandoned(callId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/calls/${callId}/abandon`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to mark call abandoned");
  }
}

export async function joinAppointment(
  appointmentId: string,
): Promise<JoinResponse> {
  const response = await fetch(`${API_BASE}/appointments/${appointmentId}/join`, {
    method: "POST",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      errorMessage?: string;
    } | null;
    throw new Error(body?.errorMessage ?? "Failed to join appointment call");
  }
  return response.json() as Promise<JoinResponse>;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) {
    return "—";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function isJoinableAppointment(appointment: Appointment): boolean {
  return appointment.status === "CALLING" && !!appointment.livekitRoomName;
}

export function isHistoryCall(call: CallLog): boolean {
  return HISTORY_STATUSES.has(call.status);
}