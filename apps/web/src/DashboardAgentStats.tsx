import { useMemo } from "react";
import type { Appointment, CallLog } from "./api";
import { formatDuration } from "./api";
import {
  computeDashboardMetrics,
  formatRelativeTime,
} from "./dashboardMetrics";

interface DashboardAgentStatsProps {
  appointments: Appointment[];
  calls: CallLog[];
}

function PipelineBar({
  pipeline,
}: {
  pipeline: ReturnType<typeof computeDashboardMetrics>["pipeline"];
}) {
  const total =
    pipeline.pending +
    pipeline.calling +
    pipeline.confirmed +
    pipeline.declined +
    pipeline.rescheduled +
    pipeline.abandoned;

  if (total === 0) {
    return <p className="muted pipeline-empty">No appointments in the system yet.</p>;
  }

  const segments = [
    { key: "pending", count: pipeline.pending, label: "Pending", className: "seg-pending" },
    { key: "calling", count: pipeline.calling, label: "Calling", className: "seg-calling" },
    { key: "confirmed", count: pipeline.confirmed, label: "Confirmed", className: "seg-confirmed" },
    { key: "declined", count: pipeline.declined, label: "Canceled", className: "seg-declined" },
    { key: "rescheduled", count: pipeline.rescheduled, label: "Rescheduled", className: "seg-rescheduled" },
    { key: "abandoned", count: pipeline.abandoned, label: "Abandoned", className: "seg-abandoned" },
  ].filter((seg) => seg.count > 0);

  return (
    <div className="pipeline">
      <div className="pipeline-bar" role="img" aria-label="Appointment status distribution">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`pipeline-segment ${seg.className}`}
            style={{ flexGrow: seg.count }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <ul className="pipeline-legend">
        {segments.map((seg) => (
          <li key={seg.key}>
            <span className={`pipeline-dot ${seg.className}`} />
            <span className="pipeline-legend-label">{seg.label}</span>
            <span className="pipeline-legend-count">{seg.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutcomeChart({
  outcomes,
}: {
  outcomes: ReturnType<typeof computeDashboardMetrics>["outcomes"];
}) {
  const rows = [
    { key: "confirmed", label: "Confirmed", count: outcomes.confirmed, className: "out-confirmed" },
    { key: "declined", label: "Declined", count: outcomes.declined, className: "out-declined" },
    { key: "rescheduled", label: "Rescheduled", count: outcomes.rescheduled, className: "out-rescheduled" },
    { key: "abandoned", label: "Abandoned", count: outcomes.abandoned, className: "out-abandoned" },
    { key: "noAnswer", label: "No answer", count: outcomes.noAnswer, className: "out-no-answer" },
    { key: "failed", label: "Failed", count: outcomes.failed, className: "out-failed" },
    { key: "other", label: "Other", count: outcomes.other, className: "out-other" },
  ].filter((row) => row.key !== "other" || row.count > 0);

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ul className="outcome-chart">
      {rows.map((row) => (
        <li key={row.key} className="outcome-row">
          <span className="outcome-label">{row.label}</span>
          <div className="outcome-track">
            <div
              className={`outcome-fill ${row.className}`}
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
          <span className="outcome-count">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardAgentStats({
  appointments,
  calls,
}: DashboardAgentStatsProps) {
  const metrics = useMemo(
    () => computeDashboardMetrics(appointments, calls),
    [appointments, calls],
  );
  const appointmentById = new Map(appointments.map((row) => [row.appointmentId, row]));

  const recentCalls = useMemo(
    () =>
      [...calls]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 8),
    [calls],
  );

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <h2>Agent stats</h2>
        <p className="page-subtitle">
          Pipeline distribution, outcome breakdown, and recent activity.
        </p>
      </header>

      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value">{metrics.totalAppointments}</span>
          <span className="stats-summary-label">Appointments</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value">{metrics.totalCalls}</span>
          <span className="stats-summary-label">Calls logged</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value">{metrics.withTranscript}</span>
          <span className="stats-summary-label">With transcript</span>
        </div>
        {metrics.lastCallAt && (
          <div className="stats-summary-item">
            <span className="stats-summary-value stats-summary-time">
              {formatRelativeTime(metrics.lastCallAt)}
            </span>
            <span className="stats-summary-label">Last call</span>
          </div>
        )}
      </div>

      <div className="dashboard-columns">
        <section className="dashboard-panel pipeline-panel">
          <div className="panel-head">
            <h3>Appointment pipeline</h3>
            <span className="panel-count">{metrics.totalAppointments} total</span>
          </div>
          <PipelineBar pipeline={metrics.pipeline} />
        </section>

        <section className="dashboard-panel outcome-panel">
          <div className="panel-head">
            <h3>Call outcomes</h3>
            <span className="panel-count">{metrics.totalCalls} calls</span>
          </div>
          <OutcomeChart outcomes={metrics.outcomes} />
        </section>
      </div>

      {recentCalls.length > 0 && (
        <section className="dashboard-panel activity-panel">
          <div className="panel-head">
            <h3>Recent activity</h3>
            <span className="panel-count">Last {recentCalls.length} calls</span>
          </div>
          <ol className="activity-feed">
            {recentCalls.map((call) => {
              const appointment = appointmentById.get(call.appointmentId);
              const outcome = call.outcome ?? call.status;
              return (
                <li key={call.callId} className="activity-item">
                  <span className="activity-time">
                    {new Date(call.startedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="activity-dot" />
                  <div className="activity-body">
                    <span>
                      <strong>{appointment?.patientName ?? call.appointmentId}</strong>
                      {" · "}
                      {formatDuration(call.durationSeconds)}
                    </span>
                    <span className={`status-pill status-${outcome.toLowerCase()}`}>
                      {outcome.charAt(0) + outcome.slice(1).toLowerCase().replace("_", " ")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}