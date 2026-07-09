import pg from "pg";

import type {
  AppointmentIdRow,
  AppointmentRow,
  CallIdRow,
  ClaimedLead,
  CreateCallInput,
  CreateLeadCallInput,
  LeadIdRow,
  LeadRow,
  RequeueResult,
} from "./types.ts";

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }

    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  return pool;
}

const APPOINTMENT_COLUMNS = `
  appointment_id AS "appointmentId",
  patient_name AS "patientName",
  phone,
  doctor_name AS "doctorName",
  appointment_date AS "appointmentDate",
  appointment_time AS "appointmentTime",
  status,
  livekit_room_name AS "livekitRoomName",
  created_at AS "createdAt"
`;

export async function fetchAppointments(): Promise<AppointmentRow[]> {
  const result = await getPool().query<AppointmentRow>(`
    SELECT ${APPOINTMENT_COLUMNS}
    FROM appointments
    ORDER BY created_at DESC
  `);

  return result.rows;
}

export async function fetchPendingAppointmentsWithoutRoom(): Promise<
  AppointmentRow[]
> {
  const result = await getPool().query<AppointmentRow>(`
    SELECT ${APPOINTMENT_COLUMNS}
    FROM appointments
    WHERE livekit_room_name IS NULL
      AND status = 'PENDING'
    ORDER BY created_at ASC
  `);

  return result.rows;
}

export async function countActiveCalls(): Promise<number> {
  // Only counts OUTBOUND active calls (appointments + leads).
  // Inbound booking calls (pure /booking/start) are deliberately excluded
  // so the queue limit does not affect or stick the inbound agent.
  const result = await getPool().query<{ count: number }>(`
    SELECT (
      (SELECT COUNT(*)::int FROM appointments WHERE status = 'CALLING' AND livekit_room_name IS NOT NULL) +
      (SELECT COUNT(*)::int FROM leads WHERE status = 'CALLING' AND livekit_room_name IS NOT NULL)
    ) AS count
  `);

  return result.rows[0]?.count ?? 0;
}

/** Active confirmation (appointment) outbound calls holding a queue slot. */
export async function countActiveConfirmationCalls(): Promise<number> {
  const result = await getPool().query<{ count: number }>(`
    SELECT COUNT(*)::int AS count
    FROM appointments
    WHERE status = 'CALLING'
      AND livekit_room_name IS NOT NULL
  `);
  return result.rows[0]?.count ?? 0;
}

/** Active lead-outreach outbound calls holding a queue slot. */
export async function countActiveLeadCalls(): Promise<number> {
  const result = await getPool().query<{ count: number }>(`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE status = 'CALLING'
      AND livekit_room_name IS NOT NULL
  `);
  return result.rows[0]?.count ?? 0;
}

export async function releaseStuckAppointments(): Promise<AppointmentIdRow[]> {
  // Claimed but room never created → back to PENDING for retry.
  const noRoom = await getPool().query<AppointmentIdRow>(`
    UPDATE appointments
    SET status = 'PENDING', created_at = NOW()
    WHERE status = 'CALLING'
      AND livekit_room_name IS NULL
    RETURNING appointment_id AS "appointmentId"
  `);

  // Room exists but call already terminal without a real joined session → requeue
  // (NO_ANSWER / never-joined), not permanent ABANDONED.
  const orphanedNoAnswer = await getPool().query<AppointmentIdRow>(`
    UPDATE appointments a
    SET status = 'PENDING', livekit_room_name = NULL, created_at = NOW()
    WHERE a.status = 'CALLING'
      AND a.livekit_room_name IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM calls c
        WHERE (c.appointment_id = a.appointment_id OR c.livekit_room_name = a.livekit_room_name)
          AND c.status IN ('NO_ANSWER', 'FAILED')
          AND c.patient_joined_at IS NULL
      )
    RETURNING a.appointment_id AS "appointmentId"
  `);

  // True abandon/completed leftover slot: clear room; keep off queue if COMPLETED/ABANDONED after join.
  const orphanedTerminal = await getPool().query<AppointmentIdRow>(`
    UPDATE appointments a
    SET status = CASE
          WHEN EXISTS (
            SELECT 1 FROM calls c
            WHERE (c.appointment_id = a.appointment_id OR c.livekit_room_name = a.livekit_room_name)
              AND c.status = 'COMPLETED'
          ) THEN 'ABANDONED'
          ELSE 'ABANDONED'
        END,
        livekit_room_name = NULL
    WHERE a.status = 'CALLING'
      AND a.livekit_room_name IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM calls c
        WHERE (c.appointment_id = a.appointment_id OR c.livekit_room_name = a.livekit_room_name)
          AND c.status IN ('COMPLETED', 'ABANDONED')
      )
    RETURNING a.appointment_id AS "appointmentId"
  `);

  return [...noRoom.rows, ...orphanedNoAnswer.rows, ...orphanedTerminal.rows];
}

export async function releaseStuckLeads(): Promise<LeadIdRow[]> {
  const noRoom = await getPool().query<LeadIdRow>(`
    UPDATE leads
    SET status = 'PENDING', livekit_room_name = NULL, created_at = NOW()
    WHERE status = 'CALLING'
      AND livekit_room_name IS NULL
    RETURNING lead_id AS "leadId"
  `);

  // Never-joined terminal call → back of queue (not FAILED).
  const orphanedNoAnswer = await getPool().query<LeadIdRow>(`
    UPDATE leads l
    SET status = 'PENDING', livekit_room_name = NULL, outcome = NULL, created_at = NOW()
    WHERE l.status = 'CALLING'
      AND l.livekit_room_name IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM calls c
        WHERE (c.lead_id = l.lead_id OR c.livekit_room_name = l.livekit_room_name)
          AND c.status IN ('NO_ANSWER', 'FAILED')
          AND c.patient_joined_at IS NULL
      )
    RETURNING l.lead_id AS "leadId"
  `);

  const orphanedTerminal = await getPool().query<LeadIdRow>(`
    UPDATE leads l
    SET status = 'FAILED', livekit_room_name = NULL, outcome = COALESCE(l.outcome, 'FAILED')
    WHERE l.status = 'CALLING'
      AND l.livekit_room_name IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM calls c
        WHERE (c.lead_id = l.lead_id OR c.livekit_room_name = l.livekit_room_name)
          AND c.status IN ('COMPLETED', 'ABANDONED')
      )
    RETURNING l.lead_id AS "leadId"
  `);

  return [...noRoom.rows, ...orphanedNoAnswer.rows, ...orphanedTerminal.rows];
}

/**
 * After ROOM_REQUEUE_SECONDS (default 5 min), unanswered CALLING rooms go back
 * to PENDING at the end of the FIFO queue (created_at bumped). Frees the slot
 * so the next pending item can start. Does not permanently abandon.
 */
export async function requeueStaleCallingRooms(
  maxAgeSeconds = 300,
): Promise<RequeueResult> {
  const age = Math.max(30, Number(maxAgeSeconds) || 300);
  const ageParam = [String(age)];

  // Close never-joined call rows still open past the window.
  const closedCalls = await getPool().query<CallIdRow>(
    `
      UPDATE calls c
      SET
        status = 'NO_ANSWER',
        ended_at = COALESCE(c.ended_at, NOW()),
        outcome = COALESCE(c.outcome, 'NO_ANSWER')
      WHERE c.status IN ('INITIATED', 'WAITING')
        AND c.patient_joined_at IS NULL
        AND c.started_at < NOW() - ($1::text || ' seconds')::interval
      RETURNING c.call_id AS "callId"
    `,
    ageParam,
  );

  // Requeue appointments: CALLING + room + never joined + call older than window.
  const appointments = await getPool().query<AppointmentIdRow>(
    `
      UPDATE appointments a
      SET
        status = 'PENDING',
        livekit_room_name = NULL,
        created_at = NOW()
      WHERE a.status = 'CALLING'
        AND a.livekit_room_name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM calls c
          WHERE (c.appointment_id = a.appointment_id OR c.livekit_room_name = a.livekit_room_name)
            AND c.patient_joined_at IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM calls c
          WHERE (c.appointment_id = a.appointment_id OR c.livekit_room_name = a.livekit_room_name)
            AND c.started_at < NOW() - ($1::text || ' seconds')::interval
            AND c.status IN ('INITIATED', 'WAITING', 'NO_ANSWER')
        )
      RETURNING a.appointment_id AS "appointmentId"
    `,
    ageParam,
  );

  const leads = await getPool().query<LeadIdRow>(
    `
      UPDATE leads l
      SET
        status = 'PENDING',
        livekit_room_name = NULL,
        outcome = NULL,
        created_at = NOW()
      WHERE l.status = 'CALLING'
        AND l.livekit_room_name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM calls c
          WHERE (c.lead_id = l.lead_id OR c.livekit_room_name = l.livekit_room_name)
            AND c.patient_joined_at IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM calls c
          WHERE (c.lead_id = l.lead_id OR c.livekit_room_name = l.livekit_room_name)
            AND c.started_at < NOW() - ($1::text || ' seconds')::interval
            AND c.status IN ('INITIATED', 'WAITING', 'NO_ANSWER')
        )
      RETURNING l.lead_id AS "leadId"
    `,
    ageParam,
  );

  return {
    calls: closedCalls.rows,
    appointments: appointments.rows,
    leads: leads.rows,
  };
}

export async function getAppointmentById(
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const result = await getPool().query<AppointmentRow>(
    `
      SELECT ${APPOINTMENT_COLUMNS}
      FROM appointments
      WHERE appointment_id = $1
      LIMIT 1
    `,
    [appointmentId],
  );

  return result.rows[0] ?? null;
}

export async function claimAppointmentForCall(
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const claimed = await getPool().query<AppointmentRow>(
    `
      UPDATE appointments
      SET status = 'CALLING'
      WHERE appointment_id = $1
        AND status = 'PENDING'
        AND livekit_room_name IS NULL
      RETURNING ${APPOINTMENT_COLUMNS}
    `,
    [appointmentId],
  );

  if (claimed.rows[0]) {
    return claimed.rows[0];
  }

  const stuck = await getPool().query<AppointmentRow>(
    `
      SELECT ${APPOINTMENT_COLUMNS}
      FROM appointments
      WHERE appointment_id = $1
        AND status = 'CALLING'
        AND livekit_room_name IS NULL
      LIMIT 1
    `,
    [appointmentId],
  );

  return stuck.rows[0] ?? null;
}

export async function updateAppointmentCall(
  appointmentId: string,
  livekitRoomName: string,
  status: string,
): Promise<AppointmentRow | null> {
  const result = await getPool().query<AppointmentRow>(
    `
      UPDATE appointments
      SET livekit_room_name = $2, status = $3
      WHERE appointment_id = $1
      RETURNING ${APPOINTMENT_COLUMNS}
    `,
    [appointmentId, livekitRoomName, status],
  );

  return result.rows[0] ?? null;
}

export async function createCall({
  callId,
  appointmentId,
  roomName,
  status = "INITIATED",
}: CreateCallInput): Promise<CallIdRow | null> {
  const result = await getPool().query<CallIdRow>(
    `
      INSERT INTO calls (
        call_id,
        appointment_id,
        livekit_room_name,
        status
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (call_id) DO UPDATE
      SET status = EXCLUDED.status
      RETURNING call_id AS "callId"
    `,
    [callId, appointmentId, roomName, status],
  );

  return result.rows[0] ?? null;
}

export async function createLeadCall({
  callId,
  leadId,
  roomName,
  status = "INITIATED",
}: CreateLeadCallInput): Promise<CallIdRow | null> {
  const result = await getPool().query<CallIdRow>(
    `
      INSERT INTO calls (
        call_id,
        lead_id,
        livekit_room_name,
        status
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (call_id) DO UPDATE
      SET status = EXCLUDED.status
      RETURNING call_id AS "callId"
    `,
    [callId, leadId, roomName, status],
  );

  return result.rows[0] ?? null;
}

// Lead support (mirrors appointment queries)

export async function fetchPendingLeadsWithoutRoom(): Promise<LeadRow[]> {
  const result = await getPool().query<LeadRow>(`
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
  `);
  return result.rows;
}

export async function claimLeadForCall(
  leadId: string,
): Promise<ClaimedLead | null> {
  const claimed = await getPool().query<ClaimedLead>(
    `
      UPDATE leads
      SET status = 'CALLING'
      WHERE lead_id = $1
        AND status = 'PENDING'
        AND livekit_room_name IS NULL
      RETURNING lead_id AS "leadId", campaign_id AS "campaignId", name, phone
    `,
    [leadId],
  );

  if (claimed.rows[0]) {
    return claimed.rows[0];
  }

  const stuck = await getPool().query<ClaimedLead>(
    `
      SELECT lead_id AS "leadId", campaign_id AS "campaignId", name, phone
      FROM leads
      WHERE lead_id = $1
        AND status = 'CALLING'
        AND livekit_room_name IS NULL
      LIMIT 1
    `,
    [leadId],
  );

  return stuck.rows[0] ?? null;
}

export async function updateLeadCall(
  leadId: string,
  livekitRoomName: string,
  status: string,
): Promise<Pick<LeadRow, "leadId" | "status" | "livekitRoomName"> | null> {
  const result = await getPool().query<
    Pick<LeadRow, "leadId" | "status" | "livekitRoomName">
  >(
    `
      UPDATE leads
      SET livekit_room_name = $2, status = $3
      WHERE lead_id = $1
      RETURNING lead_id AS "leadId", status, livekit_room_name AS "livekitRoomName"
    `,
    [leadId, livekitRoomName, status],
  );

  return result.rows[0] ?? null;
}

export async function getLeadById(leadId: string): Promise<LeadRow | null> {
  const result = await getPool().query<LeadRow>(
    `
      SELECT lead_id AS "leadId", campaign_id AS "campaignId", name, phone, status
      FROM leads
      WHERE lead_id = $1
      LIMIT 1
    `,
    [leadId],
  );
  return result.rows[0] ?? null;
}

export async function getCampaignScript(
  campaignId: string | null | undefined,
): Promise<string | null> {
  if (!campaignId) return null;
  const result = await getPool().query<{ script: string }>(
    `SELECT script FROM campaigns WHERE campaign_id = $1 LIMIT 1`,
    [campaignId],
  );
  return result.rows[0]?.script ?? null;
}
