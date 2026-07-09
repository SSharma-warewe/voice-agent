import { sql } from "../../shared/db/client.ts";
import type { Lead, UpdateLeadStatusInput } from "../../shared/types.ts";
import { LEAD_TERMINAL_STATUSES } from "../../shared/types.ts";

export async function saveLead(lead: {
  leadId: string;
  campaignId: string | null;
  name: string;
  phone: string;
}): Promise<Lead> {
  const rows = await sql`
    INSERT INTO leads (lead_id, campaign_id, name, phone)
    VALUES (${lead.leadId}, ${lead.campaignId ?? null}, ${lead.name}, ${lead.phone})
    RETURNING
      lead_id AS "leadId",
      campaign_id AS "campaignId",
      name,
      phone,
      status,
      livekit_room_name AS "livekitRoomName",
      outcome,
      created_at AS "createdAt"
  `;
  return rows[0] as Lead;
}

export async function listLeads(): Promise<Lead[]> {
  const rows = await sql`
    SELECT
      l.lead_id AS "leadId",
      l.campaign_id AS "campaignId",
      l.name,
      l.phone,
      l.status,
      l.livekit_room_name AS "livekitRoomName",
      l.outcome,
      l.created_at AS "createdAt",
      c.script AS "script"
    FROM leads l
    LEFT JOIN campaigns c ON c.campaign_id = l.campaign_id
    ORDER BY l.created_at DESC
  `;
  return rows as Lead[];
}

export async function getLeadById(leadId: string): Promise<Lead | null> {
  const rows = await sql`
    SELECT
      l.lead_id AS "leadId",
      l.campaign_id AS "campaignId",
      l.name,
      l.phone,
      l.status,
      l.livekit_room_name AS "livekitRoomName",
      l.outcome,
      l.created_at AS "createdAt",
      c.script AS "script"
    FROM leads l
    LEFT JOIN campaigns c ON c.campaign_id = l.campaign_id
    WHERE l.lead_id = ${leadId}
    LIMIT 1
  `;
  return (rows[0] as Lead | undefined) ?? null;
}

/** Pure SQL status update (no call finalization). */
export async function updateLeadStatusFields(
  leadId: string,
  update: UpdateLeadStatusInput,
): Promise<Lead | null> {
  const { status, livekitRoomName, outcome, clearRoom } = update;

  const shouldClearRoom =
    clearRoom === true ||
    (status != null && LEAD_TERMINAL_STATUSES.has(status));

  let rows;
  if (shouldClearRoom) {
    rows = await sql`
      UPDATE leads
      SET
        status = COALESCE(${status ?? null}, status),
        livekit_room_name = NULL,
        outcome = COALESCE(${outcome ?? null}, outcome)
      WHERE lead_id = ${leadId}
      RETURNING
        lead_id AS "leadId",
        campaign_id AS "campaignId",
        name,
        phone,
        status,
        livekit_room_name AS "livekitRoomName",
        outcome,
        created_at AS "createdAt"
    `;
  } else {
    rows = await sql`
      UPDATE leads
      SET
        status = COALESCE(${status ?? null}, status),
        livekit_room_name = COALESCE(${livekitRoomName ?? null}, livekit_room_name),
        outcome = COALESCE(${outcome ?? null}, outcome)
      WHERE lead_id = ${leadId}
      RETURNING
        lead_id AS "leadId",
        campaign_id AS "campaignId",
        name,
        phone,
        status,
        livekit_room_name AS "livekitRoomName",
        outcome,
        created_at AS "createdAt"
    `;
  }

  return (rows[0] as Lead | undefined) ?? null;
}

export async function fetchPendingLeadsWithoutRoom(): Promise<Lead[]> {
  const rows = await sql`
    SELECT
      lead_id AS "leadId",
      campaign_id AS "campaignId",
      name,
      phone,
      status,
      livekit_room_name AS "livekitRoomName"
    FROM leads
    WHERE livekit_room_name IS NULL
      AND status = 'PENDING'
    ORDER BY created_at ASC
  `;
  return rows as Lead[];
}

export async function claimLeadForCall(leadId: string): Promise<Lead | null> {
  const claimed = await sql`
    UPDATE leads
    SET status = 'CALLING'
    WHERE lead_id = ${leadId}
      AND status = 'PENDING'
      AND livekit_room_name IS NULL
    RETURNING
      lead_id AS "leadId",
      campaign_id AS "campaignId",
      name,
      phone
  `;
  if (claimed[0]) return claimed[0] as Lead;

  const stuck = await sql`
    SELECT lead_id AS "leadId", campaign_id AS "campaignId", name, phone
    FROM leads
    WHERE lead_id = ${leadId}
      AND status = 'CALLING'
      AND livekit_room_name IS NULL
    LIMIT 1
  `;
  return (stuck[0] as Lead | undefined) ?? null;
}

export async function updateLeadCall(
  leadId: string,
  livekitRoomName: string,
  status: string,
): Promise<{ leadId: string; status: string; livekitRoomName: string } | null> {
  const result = await sql`
    UPDATE leads
    SET livekit_room_name = ${livekitRoomName}, status = ${status}
    WHERE lead_id = ${leadId}
    RETURNING lead_id AS "leadId", status, livekit_room_name AS "livekitRoomName"
  `;
  return (
    (result[0] as
      | { leadId: string; status: string; livekitRoomName: string }
      | undefined) ?? null
  );
}

export async function countActiveLeadCalls(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE status = 'CALLING' AND livekit_room_name IS NOT NULL
  `;
  return (rows[0] as { count: number } | undefined)?.count ?? 0;
}

export async function requeueLead(leadId: string): Promise<Lead | null> {
  const rows = await sql`
    UPDATE leads
    SET
      status = 'PENDING',
      livekit_room_name = NULL,
      outcome = NULL,
      created_at = NOW()
    WHERE lead_id = ${leadId}
      AND status IN ('CALLING', 'PENDING')
    RETURNING
      lead_id AS "leadId",
      campaign_id AS "campaignId",
      name,
      phone,
      status,
      livekit_room_name AS "livekitRoomName",
      outcome,
      created_at AS "createdAt"
  `;
  return (rows[0] as Lead | undefined) ?? null;
}
