import type { LeadDetails } from "../shared/types.ts";

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Parse lead outreach room/job metadata.
 * Accepts `name` (preferred) or legacy `patientName`.
 * Returns null when required fields are missing — callers must not invent demo data.
 */
export function parseLeadMetadata(metadata: string | undefined): LeadDetails | null {
  if (!metadata?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;

    const leadId = asNonEmptyString(record.leadId) ?? asNonEmptyString(record.id);
    const name =
      asNonEmptyString(record.name) ?? asNonEmptyString(record.patientName);
    const phone = asNonEmptyString(record.phone);

    if (!leadId || !name || !phone) return null;

    const lead: LeadDetails = {
      leadId,
      name,
      phone,
    };

    const campaignId = asNonEmptyString(record.campaignId);
    const script = asNonEmptyString(record.script);
    if (campaignId) lead.campaignId = campaignId;
    if (script) lead.script = script;

    return lead;
  } catch {
    return null;
  }
}