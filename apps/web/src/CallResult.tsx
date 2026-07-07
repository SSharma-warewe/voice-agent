import type { Appointment, CallLog } from "./api";
import { formatDuration } from "./api";

interface CallResultProps {
  appointment: Appointment;
  call: CallLog | null;
  onDone: () => void;
}

const OUTCOME_COPY: Record<string, { title: string; description: string }> = {
  CONFIRMED: {
    title: "Appointment confirmed",
    description: "The patient confirmed they will attend.",
  },
  DECLINED: {
    title: "Appointment declined",
    description: "The patient will not attend this appointment.",
  },
  RESCHEDULED: {
    title: "Appointment rescheduled",
    description: "The appointment was moved to a new date and time.",
  },
};

function transcriptSnippet(call: CallLog | null): string | null {
  if (!call || call.transcript.length === 0) {
    return null;
  }
  const last = call.transcript.slice(-3);
  return last
    .map((segment) => `${segment.speaker === "agent" ? "Agent" : "Patient"}: ${segment.text}`)
    .join("\n");
}

export default function CallResult({ appointment, call, onDone }: CallResultProps) {
  const outcome = OUTCOME_COPY[appointment.status];
  const isTerminal = !!outcome;
  const snippet = transcriptSnippet(call);

  return (
    <main className="app">
      <section className={`result-card result-${appointment.status.toLowerCase()}`}>
        <p className="result-eyebrow">Call complete</p>
        <h1>{isTerminal ? outcome.title : "Call ended"}</h1>
        <p className="result-copy">
          {isTerminal
            ? outcome.description
            : "The call ended before a final outcome was recorded."}
        </p>

        <dl className="result-details">
          <div>
            <dt>Patient</dt>
            <dd>{appointment.patientName}</dd>
          </div>
          <div>
            <dt>Doctor</dt>
            <dd>{appointment.doctorName}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{appointment.appointmentDate}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{appointment.appointmentTime}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className="result-status">{appointment.status}</dd>
          </div>
          {call && (
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(call.durationSeconds)}</dd>
            </div>
          )}
          {appointment.declineReason && (
            <div>
              <dt>Reason</dt>
              <dd>{appointment.declineReason}</dd>
            </div>
          )}
        </dl>

        {snippet && (
          <>
            <h2 className="detail-section-title">Transcript</h2>
            <pre className="transcript-snippet">{snippet}</pre>
          </>
        )}

        <button type="button" className="result-done-button" onClick={onDone}>
          Back to dashboard
        </button>
      </section>
    </main>
  );
}