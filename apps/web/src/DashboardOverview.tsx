import { useState } from "react";
import type { Appointment, CallLog, CallStats, Lead, Campaign } from "./api";
import { formatDuration, isJoinableAppointment, isJoinableLead } from "./api";
import { AGENTS } from "./agents";
import {
  computeDashboardMetrics,
  formatTalkTime,
} from "./dashboardMetrics";

interface DashboardOverviewProps {
  agentSlug?: string;
  appointments: Appointment[];
  calls: CallLog[];
  stats: CallStats | null;
  leads?: Lead[];
  campaigns?: Campaign[];
  loading: boolean;
  joiningId: string | null;
  onJoin: (appointmentId: string) => void;
  onJoinLead?: (leadId: string) => void;
  onStartBooking?: () => void;
  onStartConfirmationQueue?: () => void;
  onStartLeadQueue?: () => void;
  onUploadCampaign?: (payload: { name?: string | null; script: string; leads: Array<{ name: string; phone: string }> }) => Promise<void>;
}

function parseSimpleCSV(text: string): Array<{ name: string; phone: string }> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  // skip header if looks like header
  let start = 0;
  const first = lines[0].toLowerCase();
  if (first.includes("name") && first.includes("phone")) start = 1;
  const out: Array<{ name: string; phone: string }> = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      out.push({ name: parts[0], phone: parts[1] });
    }
  }
  return out;
}

function statusLabel(status: string, hasRoom: boolean): string {
  const TERMINAL = new Set(["CONFIRMED", "DECLINED", "RESCHEDULED", "ABANDONED"]);
  if (status === "DECLINED") {
    return "Canceled";
  }
  if (status === "ABANDONED") {
    return "Abandoned";
  }
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

export default function DashboardOverview({
  agentSlug = "appointment-confirmation-agent",
  appointments,
  calls,
  stats,
  leads = [],
  campaigns = [],
  loading,
  joiningId,
  onJoin,
  onJoinLead,
  onStartBooking,
  onStartConfirmationQueue,
  onStartLeadQueue,
  onUploadCampaign,
}: DashboardOverviewProps) {
  const [queueBusy, setQueueBusy] = useState(false);

  async function handleStartQueue(kind: "confirmation" | "lead") {
    setQueueBusy(true);
    try {
      if (kind === "confirmation" && onStartConfirmationQueue) {
        await onStartConfirmationQueue();
      } else if (kind === "lead" && onStartLeadQueue) {
        await onStartLeadQueue();
      }
    } finally {
      setQueueBusy(false);
    }
  }
  const isLeadAgent = agentSlug === "lead-outreach-agent";
  const isInboundAgent = agentSlug === "inbound-booking-agent";

  const metrics = computeDashboardMetrics(appointments, calls);
  const joinable = appointments.filter(isJoinableAppointment);
  const pending = appointments.filter((row) => row.status === "PENDING");
  const activeAgents = AGENTS.filter((a) => a.status === "active").length;
  const callsAnswered =
    metrics.outcomes.confirmed +
    metrics.outcomes.declined +
    metrics.outcomes.rescheduled;

  // Lead-specific upload state (local to overview)
  const [script, setScript] = useState("");
  const [csvText, setCsvText] = useState("");
  const [campName, setCampName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const leadJoinable = leads.filter(isJoinableLead);
  const leadPending = leads.filter((l) => l.status === "PENDING" || !l.livekitRoomName);

  async function handleUpload() {
    if (!onUploadCampaign) return;
    const parsed = parseSimpleCSV(csvText);
    if (!script.trim() || parsed.length === 0) {
      setUploadMsg("Provide a script and at least one valid lead (name,phone CSV).");
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    try {
      await onUploadCampaign({
        name: campName.trim() || null,
        script: script.trim(),
        leads: parsed,
      });
      setUploadMsg(
        `Uploaded ${parsed.length} leads. Click “Start lead queue” to open the next call room.`,
      );
      setCsvText("");
      // keep script for reference
    } catch (e: any) {
      setUploadMsg(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(f);
  }

  if (isLeadAgent) {
    return (
      <div className="dashboard-page">
        <header className="page-header">
          <h2>Lead Outreach</h2>
          <p className="page-subtitle">
            Upload leads, start the queue, then Join within 5 minutes — unanswered calls go to the end of the queue.
          </p>
        </header>

        <section className="dashboard-panel" style={{ marginBottom: "1.5rem" }}>
          <div className="panel-head">
            <h3>Queue control</h3>
          </div>
          <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            Starts the next pending lead (1 slot). If nobody joins within 5 minutes, that lead returns to the back of the queue.
          </p>
          <button
            type="button"
            disabled={queueBusy || !!joiningId}
            onClick={() => void handleStartQueue("lead")}
          >
            {queueBusy ? "Starting…" : "Start lead queue"}
          </button>
        </section>

        <section className="dashboard-panel" style={{ marginBottom: "1.5rem" }}>
          <div className="panel-head">
            <h3>Upload leads &amp; script</h3>
          </div>
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: 720 }}>
            <input
              placeholder="Campaign name (optional)"
              value={campName}
              onChange={(e) => setCampName(e.target.value)}
              style={{ padding: "0.5rem", border: "1px solid var(--border)", borderRadius: 6 }}
            />
            <textarea
              className="script-textarea"
              placeholder="Paste conversation script here. Example: 'Be friendly. Goal: book appointment. Ask for preferred day and time...'"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={5}
              style={{ width: "100%", padding: "0.6rem", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "inherit" }}
            />
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>
                Leads CSV (name,phone). First row header optional.
              </label>
              <input type="file" accept=".csv,text/plain" onChange={handleFile} />
              <textarea
                placeholder="Or paste CSV here:&#10;Alice,+15551230001&#10;Bob,+15551230002"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={4}
                style={{ width: "100%", marginTop: 6, padding: "0.5rem", fontFamily: "monospace", border: "1px solid var(--border)", borderRadius: 6 }}
              />
            </div>
            <div>
              <button type="button" disabled={uploading || !script.trim() || !csvText.trim()} onClick={handleUpload}>
                {uploading ? "Uploading…" : "Upload & Start Campaign"}
              </button>
              {uploadMsg && <span style={{ marginLeft: 12, color: "var(--muted)" }}>{uploadMsg}</span>}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              After upload, click “Start lead queue” to open the next outbound room
              (lead-outreach-agent). Inbound booking is a different agent and has no queue.
            </p>
          </div>
        </section>

        <div className="dashboard-columns">
          <section className="dashboard-panel">
            <div className="panel-head">
              <h3>Ready to join (leads)</h3>
              <span className="panel-count">{leadJoinable.length} available</span>
            </div>
            {loading ? (
              <p className="muted panel-empty">Loading…</p>
            ) : leadJoinable.length === 0 ? (
              <p className="muted panel-empty">No lead rooms ready yet. Upload leads, then click “Start lead queue”.</p>
            ) : (
              <ul className="appointment-list compact-list">
                {leadJoinable.map((lead) => (
                  <li key={lead.leadId} className="appointment-card active-call-card">
                    <div className="appointment-card-body">
                      <div className="appointment-card-top">
                        <h4>{lead.name}</h4>
                        <span className="wave-indicator" aria-hidden="true"><span /><span /><span /><span /></span>
                      </div>
                      <p className="muted mono-text">{lead.phone} · Room {lead.livekitRoomName}</p>
                    </div>
                    <div className="appointment-actions">
                      <span className="status-pill status-calling">Ready</span>
                      <button
                        type="button"
                        disabled={joiningId === lead.leadId}
                        onClick={() => onJoinLead && onJoinLead(lead.leadId)}
                      >
                        {joiningId === lead.leadId ? "Joining…" : "Join call"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dashboard-panel">
            <div className="panel-head">
              <h3>Pending leads</h3>
              <span className="panel-count">{leadPending.length} waiting</span>
            </div>
            {loading ? (
              <p className="muted panel-empty">Loading…</p>
            ) : leadPending.length === 0 ? (
              <p className="muted panel-empty">No pending leads. Upload a campaign to begin.</p>
            ) : (
              <ul className="queue-list">
                {leadPending.slice(0, 12).map((lead) => (
                  <li key={lead.leadId} className="queue-item">
                    <div>
                      <strong>{lead.name}</strong>
                      <p className="muted">{lead.phone}</p>
                    </div>
                    <span className="status-pill status-pending">{lead.status || "PENDING"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {campaigns.length > 0 && (
          <section className="dashboard-panel" style={{ marginTop: "1rem" }}>
            <div className="panel-head"><h3>Recent campaigns</h3></div>
            <ul>
              {campaigns.slice(0, 3).map((c) => (
                <li key={c.campaignId} className="muted" style={{ fontSize: 13 }}>
                  {c.name || c.campaignId} — script: {c.script.slice(0, 80)}…
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  } else if (isInboundAgent) {
    return (
      <div className="dashboard-page">
        <header className="page-header">
          <h2>Inbound Booking</h2>
          <p className="page-subtitle">Patients call in. The agent answers, checks live calendar availability, and books appointments instantly.</p>
        </header>

        <section
          className="dashboard-panel"
          style={{
            background: "#0a0a0a",
            color: "#f0eee9",
            border: "1px solid #333",
            padding: "28px 32px",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.65, marginBottom: 6 }}>
              Inbound voice agent
            </div>
            <h3 style={{ margin: "4px 0 12px", fontFamily: "'Syne', sans-serif", fontSize: 22, color: "#fff" }}>
              Start an inbound booking call
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, opacity: 0.85, maxWidth: 620, lineHeight: 1.5 }}>
              Start a live inbound booking call. The agent will introduce itself, collect name and preferred time,
              check calendar availability, and book the appointment. Outcomes and transcripts are saved to the database.
            </p>
            <button
              type="button"
              onClick={() => onStartBooking && onStartBooking()}
              disabled={!!joiningId}
              style={{
                background: "#fde68a",
                color: "#0a0a0a",
                border: "none",
                padding: "14px 26px",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 15,
                cursor: joiningId ? "default" : "pointer",
                minWidth: 260,
              }}
            >
              {joiningId === "booking" ? "Connecting to inbound agent…" : "Call Inbound Booking Agent"}
            </button>
            <p style={{ marginTop: 14, fontSize: 12, opacity: 0.55 }}>
              Separate from the outbound queue — not limited by MAX_CONCURRENT_CALLS.
            </p>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <section className="dashboard-panel">
            <div className="panel-head"><h3>Agent flow</h3></div>
            <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14, color: "#525252", lineHeight: 1.65 }}>
              <li>Agent greets and confirms caller details</li>
              <li>Asks for preferred appointment date/time</li>
              <li>Calls checkAvailability on the calendar</li>
              <li>Books via bookNewAppointment if open slot</li>
              <li>Records outcome + full transcript</li>
            </ol>
          </section>
          <section className="dashboard-panel">
            <div className="panel-head"><h3>Example phrases</h3></div>
            <p style={{ fontSize: 14, color: "#525252", margin: "4px 0 10px" }}>
              Speak naturally. Examples:
            </p>
            <ul style={{ fontSize: 13, color: "#525252", margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>“Tuesday at 3:30 works great”</li>
              <li>“Yes, that time is perfect”</li>
              <li>“Can we do tomorrow morning instead?”</li>
            </ul>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              The agent uses the dedicated inbound path (not the worker queue).
            </p>
          </section>
        </div>
      </div>
    );
  }

  // Default confirmation agent view (existing)
  return (
    <div className="dashboard-page">
      <header className="page-header">
        <h2>Appointment Confirmation</h2>
        <p className="page-subtitle">
          Start the queue, Join within 5 minutes — unanswered calls return to the end of the line.
        </p>
      </header>

      <section className="dashboard-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="panel-head">
          <h3>Queue control</h3>
        </div>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Starts the next pending appointment (1 slot). After 5 minutes without a join, it goes back to the end of the queue.
        </p>
        <button
          type="button"
          disabled={queueBusy || !!joiningId}
          onClick={() => void handleStartQueue("confirmation")}
        >
          {queueBusy ? "Starting…" : "Start confirmation queue"}
        </button>
      </section>

      <section className="kpi-grid kpi-grid-four" aria-label="Key metrics">
        <article className="kpi-card">
          <span className="kpi-value">{activeAgents}</span>
          <span className="kpi-label">Agents</span>
          <span className="kpi-hint">{joinable.length} rooms ready</span>
        </article>
        <article className="kpi-card">
          <span className="kpi-value">{metrics.totalCalls}</span>
          <span className="kpi-label">Total calls</span>
          <span className="kpi-hint">{metrics.callsToday} today</span>
        </article>
        <article className="kpi-card kpi-highlight">
          <span className="kpi-value">{callsAnswered}</span>
          <span className="kpi-label">Calls answered</span>
          <span className="kpi-hint">
            {metrics.confirmationRate != null
              ? `${metrics.confirmationRate}% confirmed`
              : "No resolved outcomes"}
          </span>
        </article>
        <article className="kpi-card">
          <span className="kpi-value">{formatTalkTime(metrics.totalTalkTimeSeconds)}</span>
          <span className="kpi-label">Call time</span>
          <span className="kpi-hint">
            {stats
              ? `Avg ${formatDuration(stats.avgDurationSeconds)}`
              : "No duration data"}
          </span>
        </article>
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-panel">
          <div className="panel-head">
            <h3>Join active calls</h3>
            <span className="panel-count">{joinable.length} available</span>
          </div>
          {loading ? (
            <p className="muted panel-empty">Loading…</p>
          ) : joinable.length === 0 ? (
            <p className="muted panel-empty">
              No rooms ready. Click “Start confirmation queue” to open the next outbound call
              (appointment-confirmation-agent only — not inbound booking).
            </p>
          ) : (
            <ul className="appointment-list compact-list">
              {joinable.map((appointment) => (
                <li key={appointment.appointmentId} className="appointment-card active-call-card">
                  <div className="appointment-card-body">
                    <div className="appointment-card-top">
                      <h4>{appointment.patientName}</h4>
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
            <h3>Pending queue</h3>
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
    </div>
  );
}