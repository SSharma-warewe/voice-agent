import type { LeadRecord } from "../shared/types.ts";

export interface LeadStore {
  get(leadId: string): LeadRecord | undefined;
  updateStatus(leadId: string, status: string, outcome?: string): Promise<string>;
  bookAppointment(leadId: string, patientName: string, date: string, time: string, doctorName?: string): Promise<string>;
}