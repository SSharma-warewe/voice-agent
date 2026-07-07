import type { Appointment, CallLog } from "./api";
import { formatDuration } from "./api";
import { formatRelativeTime } from "./dashboardMetrics";

interface CallHistoryCardProps {
  call: CallLog;
  appointment?: Appointment;
  onSelect: (call: CallLog) => void;
}

function statusLabel(call: CallLog): string {
  if (call.outcome) {
    return call.outcome.charAt(0) + call.outcome.slice(1).toLowerCase();
  }
  return call.status.charAt(0) + call.status.slice(1).toLowerCase().replace("_", " ");
}

function transcriptPreview(call: CallLog): string {
  const segments = call.transcript.slice(-2);
  if (segments.length === 0) {
    return "No transcript recorded";
  }
  return segments
    .map((segment) => `${segment.speaker === "agent" ? "Agent" : "Patient"}: ${segment.text}`)
    .join(" · ");
}

export default function CallHistoryCard({
  call,
  appointment,
  onSelect,
}: CallHistoryCardProps) {
  const pillClass = call.outcome
    ? `status-${call.outcome.toLowerCase()}`
    : `status-${call.status.toLowerCase()}`;

  const segmentCount = call.transcript.length;
  const startedLabel = new Date(call.startedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="history-card">
      <button type="button" className="history-card-button" onClick={() => onSelect(call)}>
        <div className="history-card-main">
          <div className="history-card-top">
            <h3>{appointment?.patientName ?? call.appointmentId}</h3>
            <time className="history-timestamp" dateTime={call.startedAt}>
              {startedLabel}
              <span className="history-relative"> · {formatRelativeTime(call.startedAt)}</span>
            </time>
          </div>
          <p className="muted">
            {appointment?.doctorName ?? "Unknown doctor"} ·{" "}
            {appointment?.appointmentDate ?? "—"} at{" "}
            {appointment?.appointmentTime ?? "—"}
          </p>
          <p className="transcript-preview">{transcriptPreview(call)}</p>
          <div className="history-card-tags">
            {segmentCount > 0 && (
              <span className="meta-tag">{segmentCount} transcript lines</span>
            )}
            {call.patientJoinedAt && (
              <span className="meta-tag meta-tag-joined">Patient joined</span>
            )}
            {call.declineReason && (
              <span className="meta-tag meta-tag-decline" title={call.declineReason}>
                Decline noted
              </span>
            )}
          </div>
        </div>
        <div className="history-card-meta">
          <span className="duration-badge">{formatDuration(call.durationSeconds)}</span>
          <span className={`status-pill ${pillClass}`}>{statusLabel(call)}</span>
        </div>
      </button>
    </li>
  );
}