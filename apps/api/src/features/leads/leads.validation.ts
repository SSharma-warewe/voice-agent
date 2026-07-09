export const LEAD_BATCH_MAX = 100;

export type LeadValidationResult =
  | { valid: true; lead: { name: string; phone: string } }
  | { valid: false; errorMessage: string };

export type LeadsBatchValidationResult =
  | { valid: true; leads: unknown[] }
  | { valid: false; errorMessage: string };

export type CampaignValidationResult =
  | {
      valid: true;
      campaign: { name: string | null; script: string };
      leads: unknown[];
    }
  | { valid: false; errorMessage: string };

export function validateLead(body: unknown): LeadValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errorMessage: "lead must be an object" };
  }

  const record = body as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const phone = typeof record.phone === "string" ? record.phone.trim() : "";

  if (!name) {
    return { valid: false, errorMessage: "name is required" };
  }
  if (!phone) {
    return { valid: false, errorMessage: "phone is required" };
  }

  return {
    valid: true,
    lead: { name, phone },
  };
}

export function validateLeadsBatch(leads: unknown): LeadsBatchValidationResult {
  if (!Array.isArray(leads)) {
    return { valid: false, errorMessage: "leads must be an array" };
  }
  if (leads.length === 0) {
    return { valid: false, errorMessage: "leads must contain at least 1 item" };
  }
  if (leads.length > LEAD_BATCH_MAX) {
    return {
      valid: false,
      errorMessage: `leads must contain at most ${LEAD_BATCH_MAX} items`,
    };
  }
  return { valid: true, leads };
}

export function validateCampaignRequest(body: unknown): CampaignValidationResult {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const { name, script, leads } = record;

  if (typeof script !== "string" || script.trim().length === 0) {
    return { valid: false, errorMessage: "script is required" };
  }

  const batch = validateLeadsBatch(leads);
  if (!batch.valid) {
    return batch;
  }

  return {
    valid: true,
    campaign: {
      name: typeof name === "string" && name.trim() ? name.trim() : null,
      script: script.trim(),
    },
    leads: batch.leads,
  };
}
