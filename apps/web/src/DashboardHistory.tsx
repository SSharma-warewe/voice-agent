import { useMemo, useState } from "react";
import type { Appointment, CallLog } from "./api";
import CallHistoryCard from "./CallHistoryCard";
import {
  computeDashboardMetrics,
  filterHistoryCalls,
  type HistoryFilter,
} from "./dashboardMetrics";

interface DashboardHistoryProps {
  appointments: Appointment[];
  calls: CallLog[];
  loading: boolean;
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

export default function DashboardHistory({
  appointments,
  calls,
  loading,
  onSelectCall,
}: DashboardHistoryProps) {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const metrics = useMemo(
    () => computeDashboardMetrics(appointments, calls),
    [appointments, calls],
  );
  const appointmentById = new Map(appointments.map((row) => [row.appointmentId, row]));
  const filteredHistory = useMemo(
    () => filterHistoryCalls(calls, historyFilter),
    [calls, historyFilter],
  );

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <h2>Call history</h2>
        <p className="page-subtitle">
          Browse completed calls, transcripts, and outcomes.
        </p>
      </header>

      <section className="dashboard-panel history-panel">
        <div className="panel-head">
          <h3>All calls</h3>
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
    </div>
  );
}