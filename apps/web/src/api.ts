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

export interface Lead {
  leadId: string;
  name: string;
  phone: string;
  campaignId?: string | null;
  status: string;
  livekitRoomName?: string | null;
  outcome?: string | null;
  createdAt: string;
  script?: string | null;
}

export interface Campaign {
  campaignId: string;
  name: string | null;
  script: string;
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
  leadId?: string | null;
}

export interface CallStats {
  activeCount: number;
  completedToday: number;
  avgDurationSeconds: number;
}

const TERMINAL_STATUSES = new Set([
  "CONFIRMED",
  "DECLINED",
  "RESCHEDULED",
  "ABANDONED",
]);
const HISTORY_STATUSES = new Set(["COMPLETED", "ABANDONED", "NO_ANSWER", "FAILED"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function isHistoryCall(call: CallLog): boolean {
  return HISTORY_STATUSES.has((call.status || "") as any) || !!call.outcome;
}

export function isJoinableAppointment(a: Appointment): boolean {
  return !!a.livekitRoomName && a.status === "CALLING";
}

export function isJoinableLead(l: Lead): boolean {
  return !!l.livekitRoomName && l.status === "CALLING";
}

export async function startConfirmationQueue(): Promise<{
  started: boolean;
  reason?: string;
  message?: string;
  appointmentId?: string;
  roomName?: string;
}> {
  return fetchJson(`${API_BASE}/queue/confirmation/start`, { method: "POST" });
}

export async function startLeadQueue(): Promise<{
  started: boolean;
  reason?: string;
  message?: string;
  leadId?: string;
  roomName?: string;
}> {
  return fetchJson(`${API_BASE}/queue/leads/start`, { method: "POST" });
}

export interface JoinResponse {
  token: string;
  serverUrl: string;
  roomName: string;
  appointment?: Appointment;
  lead?: Lead;
  booking?: { sessionId: string };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { errorMessage?: string };
    throw new Error(err?.errorMessage || `Request failed: ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAppointments(): Promise<Appointment[]> {
  const data = await fetchJson<{ appointments: Appointment[] }>(`${API_BASE}/appointments`);
  return data.appointments ?? [];
}

export async function fetchAppointment(appointmentId: string): Promise<Appointment> {
  const data = await fetchJson<{ appointment: Appointment }>(
    `${API_BASE}/appointments/${appointmentId}`,
  );
  return data.appointment;
}

export async function fetchAppointmentOutcome(appointmentId: string): Promise<Appointment> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const appointment = await fetchAppointment(appointmentId);
    if (TERMINAL_STATUSES.has(appointment.status)) return appointment;
    await sleep(1000);
  }
  return fetchAppointment(appointmentId);
}

export async function fetchCalls(): Promise<CallLog[]> {
  const data = await fetchJson<{ calls: CallLog[] }>(`${API_BASE}/calls`);
  return data.calls ?? [];
}

export async function fetchCallStats(): Promise<CallStats> {
  const data = await fetchJson<{ stats: CallStats }>(`${API_BASE}/calls/stats`);
  return (
    data.stats ?? {
      activeCount: 0,
      completedToday: 0,
      avgDurationSeconds: 0,
    }
  );
}

export async function fetchCallByAppointment(appointmentId: string): Promise<CallLog | null> {
  try {
    const data = await fetchJson<{ call: CallLog }>(
      `${API_BASE}/appointments/${appointmentId}/call`,
    );
    return data.call ?? null;
  } catch {
    return null;
  }
}

export async function markCallAbandoned(callId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/calls/${callId}/abandon`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errorMessage?: string } | null;
    throw new Error(body?.errorMessage ?? "Failed to mark abandoned");
  }
}

export async function joinAppointment(appointmentId: string): Promise<JoinResponse> {
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

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetchJson<{ campaigns: Campaign[] }>(`${API_BASE}/campaigns`);
  return res.campaigns ?? [];
}

export async function uploadCampaign(payload: {
  name?: string | null;
  script: string;
  leads: Array<{ name: string; phone: string }>;
}): Promise<unknown> {
  const res = await fetch(`${API_BASE}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { errorMessage?: string };
    throw new Error(body?.errorMessage || "Failed to upload campaign");
  }
  return res.json();
}

export async function fetchLeads(): Promise<Lead[]> {
  const res = await fetchJson<{ leads: Lead[] }>(`${API_BASE}/leads`);
  return res.leads ?? [];
}

export async function joinLead(leadId: string): Promise<JoinResponse> {
  const res = await fetch(`${API_BASE}/leads/${leadId}/join`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errorMessage?: string } | null;
    throw new Error(body?.errorMessage ?? "Failed to join lead call");
  }
  return res.json() as Promise<JoinResponse>;
}

export async function startInboundBooking(): Promise<JoinResponse> {
  const res = await fetch(`${API_BASE}/booking/start`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errorMessage?: string } | null;
    throw new Error(body?.errorMessage ?? "Failed to start booking call");
  }
  const join = (await res.json()) as JoinResponse;
  if (!join.token || !join.serverUrl || join.serverUrl.includes("demo.livekit")) {
    throw new Error("Invalid LiveKit join payload from API");
  }
  return join;
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

export async function fetchBookingConfig(): Promise<BookingConfig> {
  const res = await fetchJson<{ config: BookingConfig }>(`${API_BASE}/booking/config`);
  return res.config;
}

export async function saveBookingConfig(config: BookingConfig): Promise<BookingConfig> {
  const res = await fetchJson<{ config: BookingConfig }>(`${API_BASE}/booking/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return res.config;
}

export async function fetchLeadCall(leadId: string): Promise<CallLog | null> {
  try {
    const res = await fetchJson<{ call: CallLog }>(`${API_BASE}/leads/${leadId}/call`);
    return res.call ?? null;
  } catch {
    return null;
  }
}
