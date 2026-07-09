import type { LeadStore } from "./store.ts";
import type { LeadRecord } from "../shared/types.ts";

type LeadUpdate = {
  status?: string;
  outcome?: string;
};

export class ApiLeadStore implements LeadStore {
  private readonly records = new Map<string, LeadRecord>();
  private readonly apiUrl: string;

  constructor(apiUrl: string, initial: LeadRecord) {
    this.apiUrl = apiUrl;
    this.records.set(initial.leadId, { ...initial });
  }

  get(leadId: string): LeadRecord | undefined {
    return this.records.get(leadId);
  }

  async updateStatus(leadId: string, status: string, outcome?: string): Promise<string> {
    await this.patchLead(leadId, { status, ...(outcome ? { outcome } : {}) });
    const rec = this.require(leadId);
    rec.status = status as any;
    if (outcome) rec.outcome = outcome;
    return `Lead ${leadId} updated to ${status}.`;
  }

  async bookAppointment(leadId: string, patientName: string, date: string, time: string, doctorName = "Dr. Smith"): Promise<string> {
    const apptId = `booked_${leadId}_${Date.now()}`;
    // CONFIRMED so this row never re-enters outbound confirmation queue.
    const body = {
      appointmentId: apptId,
      patientName,
      phone: this.require(leadId).phone || "not-provided",
      doctorName,
      appointmentDate: date,
      appointmentTime: time,
      status: "CONFIRMED",
    };

    const resp = await fetch(`${this.apiUrl}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any)?.errorMessage || "Failed to book appointment via API");
    }

    // mark lead booked
    await this.patchLead(leadId, { status: "BOOKED", outcome: "BOOKED" });
    const rec = this.require(leadId);
    rec.status = "BOOKED";
    rec.outcome = "BOOKED";

    return `Appointment booked for ${patientName} on ${date} at ${time}. ID: ${apptId}`;
  }

  private async patchLead(leadId: string, update: LeadUpdate) {
    const resp = await fetch(`${this.apiUrl}/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!resp.ok) {
      const b = await resp.json().catch(() => null);
      throw new Error((b as any)?.errorMessage || "Failed to update lead");
    }
  }

  private require(leadId: string): LeadRecord {
    const r = this.records.get(leadId);
    if (!r) throw new Error(`Lead not found: ${leadId}`);
    return r;
  }
}