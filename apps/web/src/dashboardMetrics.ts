import type { Appointment, CallLog } from "./api";
import { isHistoryCall } from "./api";

export interface OutcomeBreakdown {
  confirmed: number;
  declined: number;
  rescheduled: number;
  abandoned: number;
  noAnswer: number;
  failed: number;
  other: number;
}

export interface PipelineCounts {
  pending: number;
  calling: number;
  confirmed: number;
  declined: number;
  rescheduled: number;
}

export interface DashboardMetrics {
  pipeline: PipelineCounts;
  outcomes: OutcomeBreakdown;
  totalAppointments: number;
  totalCalls: number;
  historyCount: number;
  callsToday: number;
  confirmationRate: number | null;
  totalTalkTimeSeconds: number;
  avgHistoryDurationSeconds: number | null;
  withTranscript: number;
  lastCallAt: string | null;
}

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function computeDashboardMetrics(
  appointments: Appointment[],
  calls: CallLog[],
): DashboardMetrics {
  const pipeline: PipelineCounts = {
    pending: 0,
    calling: 0,
    confirmed: 0,
    declined: 0,
    rescheduled: 0,
  };

  for (const row of appointments) {
    switch (row.status) {
      case "PENDING":
        pipeline.pending += 1;
        break;
      case "CALLING":
        pipeline.calling += 1;
        break;
      case "CONFIRMED":
        pipeline.confirmed += 1;
        break;
      case "DECLINED":
        pipeline.declined += 1;
        break;
      case "RESCHEDULED":
        pipeline.rescheduled += 1;
        break;
      default:
        break;
    }
  }

  const outcomes: OutcomeBreakdown = {
    confirmed: 0,
    declined: 0,
    rescheduled: 0,
    abandoned: 0,
    noAnswer: 0,
    failed: 0,
    other: 0,
  };

  const historyCalls = calls.filter(isHistoryCall);
  let totalTalkTimeSeconds = 0;
  let durationCount = 0;
  let withTranscript = 0;
  let callsToday = 0;
  let resolvedWithOutcome = 0;

  for (const call of calls) {
    if (isToday(call.startedAt)) {
      callsToday += 1;
    }
    if (call.transcript.length > 0) {
      withTranscript += 1;
    }
    if (call.durationSeconds != null) {
      totalTalkTimeSeconds += call.durationSeconds;
      durationCount += 1;
    }

    const key = (call.outcome ?? call.status).toUpperCase();
    switch (key) {
      case "CONFIRMED":
        outcomes.confirmed += 1;
        resolvedWithOutcome += 1;
        break;
      case "DECLINED":
        outcomes.declined += 1;
        resolvedWithOutcome += 1;
        break;
      case "RESCHEDULED":
        outcomes.rescheduled += 1;
        resolvedWithOutcome += 1;
        break;
      case "ABANDONED":
        outcomes.abandoned += 1;
        break;
      case "NO_ANSWER":
        outcomes.noAnswer += 1;
        break;
      case "FAILED":
        outcomes.failed += 1;
        break;
      default:
        outcomes.other += 1;
        break;
    }
  }

  const confirmationRate =
    resolvedWithOutcome > 0
      ? Math.round((outcomes.confirmed / resolvedWithOutcome) * 100)
      : null;

  const sortedByStart = [...calls].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return {
    pipeline,
    outcomes,
    totalAppointments: appointments.length,
    totalCalls: calls.length,
    historyCount: historyCalls.length,
    callsToday,
    confirmationRate,
    totalTalkTimeSeconds,
    avgHistoryDurationSeconds:
      durationCount > 0 ? Math.round(totalTalkTimeSeconds / durationCount) : null,
    withTranscript,
    lastCallAt: sortedByStart[0]?.startedAt ?? null,
  };
}

export type HistoryFilter =
  | "all"
  | "confirmed"
  | "declined"
  | "rescheduled"
  | "abandoned"
  | "no_answer"
  | "failed";

export function filterHistoryCalls(
  calls: CallLog[],
  filter: HistoryFilter,
): CallLog[] {
  const history = calls.filter(isHistoryCall);
  if (filter === "all") {
    return history;
  }
  return history.filter((call) => {
    const key = (call.outcome ?? call.status).toLowerCase();
    return key === filter;
  });
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTalkTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}