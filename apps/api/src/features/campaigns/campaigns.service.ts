import { isPgUniqueViolation } from "../../shared/errors.ts";
import * as campaignsRepo from "./campaigns.repo.ts";
import * as leadsRepo from "../leads/leads.repo.ts";
import { validateLead } from "../leads/leads.validation.ts";

export async function listCampaigns() {
  return campaignsRepo.listCampaigns();
}

export async function createCampaignWithLeads(input: {
  campaign: { name: string | null; script: string };
  leads: unknown[];
}) {
  const campaignId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const savedCampaign = await campaignsRepo.saveCampaign({
    campaignId,
    name: input.campaign.name,
    script: input.campaign.script,
  });

  const leadResults: Array<
    | { index: number; status: "saved"; lead: Awaited<ReturnType<typeof leadsRepo.saveLead>> }
    | { index: number; status: "failed"; errorMessage: string }
  > = [];

  for (let i = 0; i < input.leads.length; i += 1) {
    const item = input.leads[i];
    const leadValidation = validateLead(item);
    if (!leadValidation.valid) {
      leadResults.push({
        index: i,
        status: "failed",
        errorMessage: leadValidation.errorMessage,
      });
      continue;
    }

    const leadId = `lead_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      const saved = await leadsRepo.saveLead({
        leadId,
        campaignId,
        name: leadValidation.lead.name,
        phone: leadValidation.lead.phone,
      });
      leadResults.push({ index: i, status: "saved", lead: saved });
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        leadResults.push({
          index: i,
          status: "failed",
          errorMessage: "duplicate lead",
        });
      } else {
        leadResults.push({
          index: i,
          status: "failed",
          errorMessage: "save failed",
        });
      }
    }
  }

  const savedCount = leadResults.filter((r) => r.status === "saved").length;
  console.log(`Campaign ${campaignId} created with ${savedCount} leads`);

  return { campaign: savedCampaign, leads: leadResults };
}
