import type { Appointment, CallLog } from "./api";
import { formatDuration } from "./api";

interface CallDetailProps {
  call: CallLog;
  appointment?: Appointment;
  onBack: () => void;
}

function statusLabel(call: CallLog): string {
  if (call.outcome) {
    return call.outcome;
  }
  return call.status;
}

export default function CallDetail({ call, appointment, onBack }: CallDetailProps) {
  return (
    <main className="app">
      <section className="detail-card">
        <button type="button" className="back-button" onClick={onBack}>
          ← Back to dashboard
        </button>

        <p className="result-eyebrow">Call detail</p>
        <h1>{appointment?.patientName ?? call.appointmentId}</h1>

        <dl className="result-details">
          <div>
            <dt>Status</dt>
            <dd className="result-status">{statusLabel(call)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(call.durationSeconds)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{new Date(call.startedAt).toLocaleString()}</dd>
          </div>
          {call.endedAt && (
            <div>
              <dt>Ended</dt>
              <dd>{new Date(call.endedAt).toLocaleString()}</dd>
            </div>
          )}
          {appointment && (
            <>
              <div>
                <dt>Doctor</dt>
                <dd>{appointment.doctorName}</dd>
              </div>
              <div>
                <dt>Appointment</dt>
                <dd>
                  {appointment.appointmentDate} at {appointment.appointmentTime}
                </dd>
              </div>
            </>
          )}
          {call.declineReason && (
            <div>
              <dt>Decline reason</dt>
              <dd>{call.declineReason}</dd>
            </div>
          )}
        </dl>

        <h2 className="detail-section-title">Transcript</h2>
        {call.transcript.length === 0 ? (
          <p className="muted">No transcript segments were captured.</p>
        ) : (
          <ol className="transcript-list">
            {call.transcript.map((segment, index) => (
              <li key={`${segment.at}-${index}`} className={`transcript-line transcript-${segment.speaker}`}>
                <span className="transcript-speaker">
                  {segment.speaker === "agent" ? "Agent" : "Patient"}
                </span>
                <span className="transcript-text">{segment.text}</span>
                <span className="transcript-time">
                  {new Date(segment.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}