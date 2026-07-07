import { useEffect, useMemo, useState } from "react";
import type { Appointment, CallLog, CallStats } from "./api";
import { formatDuration, isJoinableAppointment } from "./api";
import CallHistoryCard from "./CallHistoryCard";
import {
  computeDashboardMetrics,
  filterHistoryCalls,
  formatRelativeTime,
  formatTalkTime,
  type HistoryFilter,
} from "./dashboardMetrics";

interface CallDashboardProps {
  appointments: Appointment[];
  calls: CallLog[];
  stats: CallStats | null;
  loading: boolean;
  error: string | null;
  joiningId: string | null;
  onJoin: (appointmentId: string) => void;
  onSelectCall: (call: CallLog) => void;
}

const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "declined", label: "Declined" },
  { id: "rescheduled", label: "Rescheduled" },
  { id: "abandoned", label: "Abandoned" },
  { id: "no_answer", label: "No answer" },
  { id: "failed", label: "Failed" },
];

function statusLabel(status: string, hasRoom: boolean): string {
  const TERMINAL = new Set(["CONFIRMED", "DECLINED", "RESCHEDULED"]);
  if (TERMINAL.has(status)) {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }
  if (status === "CALLING" && hasRoom) {
    return "Ready to join";
  }
  if (status === "PENDING") {
    return "Waiting for call room";
  }
  return status;
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
    pipeline.rescheduled;

  if (total === 0) {
    return <p className="muted pipeline-empty">No appointments in the system yet.</p>;
  }

  const segments = [
    { key: "pending", count: pipeline.pending, label: "Pending", className: "seg-pending" },
    { key: "calling", count: pipeline.calling, label: "Calling", className: "seg-calling" },
    { key: "confirmed", count: pipeline.confirmed, label: "Confirmed", className: "seg-confirmed" },
    { key: "declined", count: pipeline.declined, label: "Declined", className: "seg-declined" },
    { key: "rescheduled", count: pipeline.rescheduled, label: "Rescheduled", className: "seg-rescheduled" },
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

export default function CallDashboard({
  appointments,
  calls,
  stats,
  loading,
  error,
  joiningId,
  onJoin,
  onSelectCall,
}: CallDashboardProps) {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    if (!loading) {
      setLastRefresh(new Date());
    }
  }, [loading, appointments, calls, stats]);

  const metrics = useMemo(
    () => computeDashboardMetrics(appointments, calls),
    [appointments, calls],
  );

  const joinable = appointments.filter(isJoinableAppointment);
  const pending = appointments.filter((row) => row.status === "PENDING");
  const appointmentById = new Map(appointments.map((row) => [row.appointmentId, row]));
  const filteredHistory = useMemo(
    () => filterHistoryCalls(calls, historyFilter),
    [calls, historyFilter],
  );

  const recentCalls = useMemo(
    () =>
      [...calls]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 5),
    [calls],
  );

  return (
    <main className="app dashboard">
      <div className="dashboard-grain" aria-hidden="true" />

      <header className="dashboard-header">
        <div className="dashboard-header-copy">
          <p className="dashboard-eyebrow">Voice confirmation ops</p>
          <h1>Call command center</h1>
          <p className="dashboard-subtitle">
            Monitor live confirmation calls, track outcomes, and review transcripts.
          </p>
        </div>
        <div className="dashboard-header-meta">
          <span className="live-badge">
            <span className="live-pulse" />
            Live
          </span>
          <span className="refresh-note">
            Auto-refresh · updated {lastRefresh.toLocaleTimeString()}
          </span>
          {metrics.lastCallAt && (
            <span className="last-activity">
              Last call {formatRelativeTime(metrics.lastCallAt)}
            </span>
          )}
        </div>
      </header>

      {stats && (
        <section className="kpi-grid" aria-label="Key metrics">
          <article className="kpi-card kpi-highlight">
            <span className="kpi-value">{joinable.length}</span>
            <span className="kpi-label">Ready to join</span>
            <span className="kpi-hint">Rooms open now</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-value">{stats.activeCount}</span>
            <span className="kpi-label">Active calls</span>
            <span className="kpi-hint">In progress</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-value">{stats.completedToday}</span>
            <span className="kpi-label">Completed today</span>
            <span className="kpi-hint">{metrics.callsToday} started today</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-value">
              {metrics.confirmationRate != null ? `${metrics.confirmationRate}%` : "—"}
            </span>
            <span className="kpi-label">Confirmation rate</span>
            <span className="kpi-hint">Of resolved outcomes</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-value">{formatDuration(stats.avgDurationSeconds)}</span>
            <span className="kpi-label">Avg call length</span>
            <span className="kpi-hint">
              {metrics.avgHistoryDurationSeconds != null
                ? `All-time ${formatDuration(metrics.avgHistoryDurationSeconds)}`
                : "No completed calls"}
            </span>
          </article>
          <article className="kpi-card">
            <span className="kpi-value">{formatTalkTime(metrics.totalTalkTimeSeconds)}</span>
            <span className="kpi-label">Total talk time</span>
            <span className="kpi-hint">{metrics.withTranscript} with transcript</span>
          </article>
        </section>
      )}

      {error && <p className="error-banner">{error}</p>}

      <div className="dashboard-columns">
        <section className="dashboard-panel pipeline-panel">
          <div className="panel-head">
            <h2>Appointment pipeline</h2>
            <span className="panel-count">{metrics.totalAppointments} total</span>
          </div>
          <PipelineBar pipeline={metrics.pipeline} />
        </section>

        <section className="dashboard-panel outcome-panel">
          <div className="panel-head">
            <h2>Call outcomes</h2>
            <span className="panel-count">{metrics.totalCalls} calls logged</span>
          </div>
          <OutcomeChart outcomes={metrics.outcomes} />
        </section>
      </div>

      <div className="dashboard-columns">
        <section className="dashboard-panel">
          <div className="panel-head">
            <h2>Join active calls</h2>
            <span className="panel-count">{joinable.length} available</span>
          </div>
          {loading ? (
            <p className="muted panel-empty">Loading…</p>
          ) : joinable.length === 0 ? (
            <p className="muted panel-empty">
              No rooms ready. The worker provisions LiveKit rooms for pending appointments.
            </p>
          ) : (
            <ul className="appointment-list compact-list">
              {joinable.map((appointment) => (
                <li key={appointment.appointmentId} className="appointment-card active-call-card">
                  <div className="appointment-card-body">
                    <div className="appointment-card-top">
                      <h3>{appointment.patientName}</h3>
                      <span className="wave-indicator" aria-hidden="true">
                        <span /><span /><span /><span />
                      </span>
                    </div>
                    <p>
                      {appointment.doctorName} · {appointment.appointmentDate} at{" "}
                      {appointment.appointmentTime}
                    </p>
                    <p className="muted mono-text">Room {appointment.livekitRoomName}</p>
                  </div>
                  <div className="appointment-actions">
                    <span className="status-pill status-calling">
                      {statusLabel(appointment.status, !!appointment.livekitRoomName)}
                    </span>
                    <button
                      type="button"
                      disabled={joiningId === appointment.appointmentId}
                      onClick={() => onJoin(appointment.appointmentId)}
                    >
                      {joiningId === appointment.appointmentId ? "Joining…" : "Join call"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="panel-head">
            <h2>Pending queue</h2>
            <span className="panel-count">{pending.length} waiting</span>
          </div>
          {loading ? (
            <p className="muted panel-empty">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="muted panel-empty">No appointments awaiting outbound calls.</p>
          ) : (
            <ul className="queue-list">
              {pending.map((appointment) => (
                <li key={appointment.appointmentId} className="queue-item">
                  <div>
                    <strong>{appointment.patientName}</strong>
                    <p className="muted">
                      {appointment.doctorName} · {appointment.appointmentDate}{" "}
                      {appointment.appointmentTime}
                    </p>
                  </div>
                  <span className="status-pill status-pending">Pending</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {recentCalls.length > 0 && (
        <section className="dashboard-panel activity-panel">
          <div className="panel-head">
            <h2>Recent activity</h2>
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

      <section className="dashboard-panel history-panel">
        <div className="panel-head">
          <h2>Call history</h2>
          <span className="panel-count">{metrics.historyCount} completed</span>
        </div>

        <div className="history-filters" role="tablist" aria-label="Filter call history">
          {HISTORY_FILTERS.map((filter) => {
            const count =
              filter.id === "all"
                ? metrics.historyCount
                : filterHistoryCalls(calls, filter.id).length;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={historyFilter === filter.id}
                className={`filter-chip${historyFilter === filter.id ? " is-active" : ""}`}
                onClick={() => setHistoryFilter(filter.id)}
              >
                {filter.label}
                <span className="filter-count">{count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="muted panel-empty">Loading call history…</p>
        ) : filteredHistory.length === 0 ? (
          <p className="muted panel-empty">
            {historyFilter === "all"
              ? "No completed calls yet."
              : `No ${HISTORY_FILTERS.find((f) => f.id === historyFilter)?.label.toLowerCase()} calls.`}
          </p>
        ) : (
          <ul className="history-list">
            {filteredHistory.map((call) => (
              <CallHistoryCard
                key={call.callId}
                call={call}
                appointment={appointmentById.get(call.appointmentId)}
                onSelect={onSelectCall}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}