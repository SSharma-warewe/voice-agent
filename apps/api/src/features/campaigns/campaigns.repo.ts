import { sql } from "../../shared/db/client.ts";
import type { Campaign } from "../../shared/types.ts";

export async function saveCampaign(campaign: {
  campaignId: string;
  name: string | null;
  script: string;
}): Promise<Campaign> {
  const rows = await sql`
    INSERT INTO campaigns (campaign_id, name, script)
    VALUES (${campaign.campaignId}, ${campaign.name ?? null}, ${campaign.script})
    RETURNING
      campaign_id AS "campaignId",
      name,
      script,
      created_at AS "createdAt"
  `;
  return rows[0] as Campaign;
}

export async function getCampaignById(
  campaignId: string,
): Promise<Campaign | null> {
  const rows = await sql`
    SELECT
      campaign_id AS "campaignId",
      name,
      script,
      created_at AS "createdAt"
    FROM campaigns
    WHERE campaign_id = ${campaignId}
    LIMIT 1
  `;
  return (rows[0] as Campaign | undefined) ?? null;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const rows = await sql`
    SELECT
      campaign_id AS "campaignId",
      name,
      script,
      created_at AS "createdAt"
    FROM campaigns
    ORDER BY created_at DESC
  `;
  return rows as Campaign[];
}

export async function getCampaignScript(
  campaignId: string | null | undefined,
): Promise<string | null> {
  if (!campaignId) return null;
  const rows = await sql`
    SELECT script FROM campaigns WHERE campaign_id = ${campaignId} LIMIT 1
  `;
  return (rows[0] as { script: string } | undefined)?.script ?? null;
}
