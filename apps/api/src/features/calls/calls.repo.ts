import { sql } from "../../shared/db/client.ts";
import type {
  Call,
  CallStats,
  CreateCallInput,
  TranscriptSegment,
} from "../../shared/types.ts";

function mapCallRow(row: Record<string, unknown> | null | undefined): Call | null {
  if (!row) return null;

  const transcript = Array.isArray(row.transcript)
    ? (row.transcript as TranscriptSegment[])
    : [];

  return {
    callId: row.callId as string,
    appointmentId: (row.appointmentId as string | null) ?? null,
    leadId: (row.leadId as string | null) ?? (row.lead_id as string | null) ?? null,
    livekitRoomName: row.livekitRoomName as string,
    status: row.status as string,
    outcome: (row.outcome as string | null) ?? null,
    startedAt: row.startedAt as string | Date,
    patientJoinedAt: (row.patientJoinedAt as string | Date | null) ?? null,
    endedAt: (row.endedAt as string | Date | null) ?? null,
    durationSeconds: (row.durationSeconds as number | null) ?? null,
    transcript,
    declineReason: (row.declineReason as string | null) ?? null,
  };
}

export async function listCalls(): Promise<Call[]> {
  const rows = await sql`
    SELECT
      call_id AS "callId",
      appointment_id AS "appointmentId",
      lead_id AS "leadId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
    FROM calls
    ORDER BY started_at DESC
  `;

  return rows.map((row) => mapCallRow(row as Record<string, unknown>)!);
}

export async function getCallById(callId: string): Promise<Call | null> {
  const rows = await sql`
    SELECT
      call_id AS "callId",
      appointment_id AS "appointmentId",
      lead_id AS "leadId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
    FROM calls
    WHERE call_id = ${callId}
    LIMIT 1
  `;

  return mapCallRow(rows[0] as Record<string, unknown> | undefined);
}

export async function getCallByAppointmentId(
  appointmentId: string,
): Promise<Call | null> {
  const rows = await sql`
    SELECT
      call_id AS "callId",
      appointment_id AS "appointmentId",
      lead_id AS "leadId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
    FROM calls
    WHERE appointment_id = ${appointmentId}
    ORDER BY started_at DESC
    LIMIT 1
  `;

  return mapCallRow(rows[0] as Record<string, unknown> | undefined);
}

export async function getCallByLeadId(leadId: string): Promise<Call | null> {
  const rows = await sql`
    SELECT
      call_id AS "callId",
      appointment_id AS "appointmentId",
      lead_id AS "leadId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
    FROM calls
    WHERE lead_id = ${leadId}
    ORDER BY started_at DESC
    LIMIT 1
  `;

  return mapCallRow(rows[0] as Record<string, unknown> | undefined);
}

export async function getCallStats(): Promise<CallStats> {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('INITIATED', 'WAITING', 'IN_PROGRESS'))::int AS "activeCount",
      COUNT(*) FILTER (
        WHERE status = 'COMPLETED'
          AND ended_at >= date_trunc('day', NOW())
      )::int AS "completedToday",
      COALESCE(
        ROUND(AVG(duration_seconds) FILTER (
          WHERE status = 'COMPLETED'
            AND duration_seconds IS NOT NULL
        ))::int,
        0
      ) AS "avgDurationSeconds"
    FROM calls
  `;

  return rows[0] as CallStats;
}

export async function getLeadCallStats(): Promise<{
  activeCount: number;
  completedToday: number;
}> {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('INITIATED', 'WAITING', 'IN_PROGRESS'))::int AS "activeCount",
      COUNT(*) FILTER (WHERE status = 'COMPLETED' AND ended_at >= date_trunc('day', NOW()))::int AS "completedToday"
    FROM calls
    WHERE lead_id IS NOT NULL
  `;
  return (
    (rows[0] as { activeCount: number; completedToday: number } | undefined) ?? {
      activeCount: 0,
      completedToday: 0,
    }
  );
}

export async function createCall(input: CreateCallInput): Promise<{ callId: string } | null> {
  const {
    callId,
    appointmentId = null,
    leadId = null,
    roomName,
    status = "INITIATED",
  } = input;

  const result = await sql`
    INSERT INTO calls (
      call_id,
      appointment_id,
      lead_id,
      livekit_room_name,
      status
    )
    VALUES (${callId}, ${appointmentId}, ${leadId}, ${roomName}, ${status})
    ON CONFLICT (call_id) DO UPDATE
    SET status = EXCLUDED.status
    RETURNING call_id AS "callId"
  `;
  return (result[0] as { callId: string } | undefined) ?? null;
}

export async function createLeadCall(input: {
  callId: string;
  leadId: string;
  roomName: string;
  status?: string;
}): Promise<{ callId: string } | null> {
  const { callId, leadId, roomName, status = "INITIATED" } = input;
  const result = await sql`
    INSERT INTO calls (
      call_id,
      lead_id,
      livekit_room_name,
      status
    )
    VALUES (${callId}, ${leadId}, ${roomName}, ${status})
    ON CONFLICT (call_id) DO UPDATE
    SET status = EXCLUDED.status
    RETURNING call_id AS "callId"
  `;
  return (result[0] as { callId: string } | undefined) ?? null;
}

export async function updateCallFields(
  callId: string,
  fields: {
    status: string;
    outcome: string | null;
    declineReason: string | null;
    patientJoinedAt: string | Date | null;
    endedAt: string | Date | null;
    durationSeconds: number | null;
  },
): Promise<Call | null> {
  const rows = await sql`
    UPDATE calls
    SET
      status = ${fields.status},
      outcome = ${fields.outcome},
      decline_reason = ${fields.declineReason},
      patient_joined_at = COALESCE(${fields.patientJoinedAt ?? null}, patient_joined_at),
      ended_at = COALESCE(${fields.endedAt ?? null}, ended_at),
      duration_seconds = COALESCE(${fields.durationSeconds ?? null}, duration_seconds)
    WHERE call_id = ${callId}
    RETURNING
      call_id AS "callId",
      appointment_id AS "appointmentId",
      lead_id AS "leadId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
  `;

  return mapCallRow(rows[0] as Record<string, unknown> | undefined);
}

export async function setTranscript(
  callId: string,
  transcript: TranscriptSegment[],
): Promise<Call | null> {
  const rows = await sql`
    UPDATE calls
    SET transcript = ${JSON.stringify(transcript)}::jsonb
    WHERE call_id = ${callId}
    RETURNING
      call_id AS "callId",
      appointment_id AS "appointmentId",
      lead_id AS "leadId",
      livekit_room_name AS "livekitRoomName",
      status,
      outcome,
      started_at AS "startedAt",
      patient_joined_at AS "patientJoinedAt",
      ended_at AS "endedAt",
      duration_seconds AS "durationSeconds",
      transcript,
      decline_reason AS "declineReason"
  `;

  return mapCallRow(rows[0] as Record<string, unknown> | undefined);
}

export async function markStaleCallsNoAnswer(cutoffIso: string): Promise<void> {
  await sql`
    UPDATE calls
    SET
      status = 'NO_ANSWER',
      ended_at = COALESCE(ended_at, NOW()),
      outcome = COALESCE(outcome, 'NO_ANSWER')
    WHERE status IN ('INITIATED', 'WAITING')
      AND patient_joined_at IS NULL
      AND started_at < ${cutoffIso}::timestamptz
  `;
}

export async function requeueStaleCallingAppointments(
  cutoffIso: string,
): Promise<{ appointmentId: string }[]> {
  const appointments = await sql`
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
          AND c.started_at < ${cutoffIso}::timestamptz
          AND c.status IN ('INITIATED', 'WAITING', 'NO_ANSWER')
      )
    RETURNING a.appointment_id AS "appointmentId"
  `;
  return appointments as { appointmentId: string }[];
}

export async function requeueStaleCallingLeads(
  cutoffIso: string,
): Promise<{ leadId: string }[]> {
  const leads = await sql`
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
          AND c.started_at < ${cutoffIso}::timestamptz
          AND c.status IN ('INITIATED', 'WAITING', 'NO_ANSWER')
      )
    RETURNING l.lead_id AS "leadId"
  `;
  return leads as { leadId: string }[];
}
