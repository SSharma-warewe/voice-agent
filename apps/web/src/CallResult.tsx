import type { Appointment, CallLog } from "./api";
import { formatDuration } from "./api";

const TERMINAL_STATUSES = new Set([
  "CONFIRMED",
  "DECLINED",
  "RESCHEDULED",
  "ABANDONED",
]);

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
    title: "Appointment canceled",
    description: "The patient will not attend this appointment.",
  },
  RESCHEDULED: {
    title: "Appointment rescheduled",
    description: "The appointment was moved to a new date and time.",
  },
  ABANDONED: {
    title: "Call abandoned",
    description: "The call ended without a confirmed outcome and was taken off the queue.",
  },
  NO_ANSWER: {
    title: "No answer",
    description: "The patient did not join. The slot was freed for the next call.",
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
  // Prefer appointment terminal status. Only use call.outcome when the call
  // actually completed — never a stale COMPLETED/CONFIRMED from an older mock
  // or prior attempt while the appointment is still CALLING/PENDING.
  let effectiveStatus = appointment.status;
  if (TERMINAL_STATUSES.has(appointment.status as any)) {
    effectiveStatus = appointment.status;
  } else if (call?.status === "COMPLETED" && call.outcome) {
    effectiveStatus = call.outcome;
  } else if (
    call?.status === "ABANDONED" ||
    call?.status === "NO_ANSWER" ||
    call?.status === "FAILED"
  ) {
    effectiveStatus = call.status;
  }

  const outcome = OUTCOME_COPY[effectiveStatus] || OUTCOME_COPY[appointment.status];
  const isTerminal = !!OUTCOME_COPY[effectiveStatus];
  const snippet = transcriptSnippet(call);

  const displayStatus = effectiveStatus || appointment.status;
  return (
    <main className="app">
      <section className={`result-card result-${displayStatus.toLowerCase()}`}>
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
            <dd className="result-status">{effectiveStatus}</dd>
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