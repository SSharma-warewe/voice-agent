import { useCallback, useEffect, useState } from "react";
import CallRoom from "./CallRoom";
import CallResult from "./CallResult";
import CallDashboard from "./CallDashboard";
import CallDetail from "./CallDetail";
import {
  fetchAppointmentOutcome,
  fetchAppointments,
  fetchCallByAppointment,
  fetchCalls,
  fetchCallStats,
  joinAppointment,
  fetchLeads,
  fetchCampaigns,
  joinLead,
  fetchLeadCall,
  startInboundBooking,
  startConfirmationQueue,
  startLeadQueue,
  uploadCampaign,
  type Appointment,
  type CallLog,
  type CallStats,
  type JoinResponse,
  type Lead,
  type Campaign,
} from "./api";

export default function AgentDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [activeJoin, setActiveJoin] = useState<JoinResponse | null>(null);
  const [callResult, setCallResult] = useState<{
    appointment: Appointment;
    call: CallLog | null;
  } | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const [rows, callRows, callStats, leadRows, campRows] = await Promise.all([
        fetchAppointments(),
        fetchCalls(),
        fetchCallStats(),
        fetchLeads().catch(() => [] as Lead[]),
        fetchCampaigns().catch(() => [] as Campaign[]),
      ]);
      setAppointments(rows);
      setCalls(callRows);
      setStats(callStats);
      setLeads(leadRows);
      setCampaigns(campRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const interval = setInterval(() => {
      if (!activeJoin && !callResult && !selectedCall) {
        void loadDashboard();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loadDashboard, activeJoin, callResult, selectedCall]);

  async function handleJoin(appointmentId: string) {
    try {
      setJoiningId(appointmentId);
      setError(null);
      const join = await joinAppointment(appointmentId);
      setActiveJoin(join);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join call");
    } finally {
      setJoiningId(null);
    }
  }

  async function handleJoinLead(leadId: string) {
    try {
      setJoiningId(leadId);
      setError(null);
      const join = await joinLead(leadId);
      setActiveJoin(join);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join lead call");
    } finally {
      setJoiningId(null);
    }
  }

  async function handleStartBooking() {
    try {
      setJoiningId("booking");
      setError(null);
      const join = await startInboundBooking();
      setActiveJoin(join);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start booking call");
    } finally {
      setJoiningId(null);
    }
  }

  async function handleStartConfirmationQueue() {
    try {
      setError(null);
      const result = await startConfirmationQueue();
      if (!result.started) {
        setError(result.message || result.reason || "Could not start confirmation queue");
      } else {
        setError(null);
      }
      void loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start confirmation queue");
    }
  }

  async function handleStartLeadQueue() {
    try {
      setError(null);
      const result = await startLeadQueue();
      if (!result.started) {
        setError(result.message || result.reason || "Could not start lead queue");
      } else {
        setError(null);
      }
      void loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start lead queue");
    }
  }

  async function handleLeaveCall(appointmentIdOrRoom?: string) {
    setActiveJoin(null);
    setLoadingResult(true);
    setError(null);
    try {
      // Booking / lead / failed connect: skip fake result page.
      const isRealAppointment =
        appointmentIdOrRoom &&
        !appointmentIdOrRoom.startsWith("demo-") &&
        !appointmentIdOrRoom.includes("booking") &&
        !appointmentIdOrRoom.startsWith("call-lead") &&
        !appointmentIdOrRoom.startsWith("call-book");

      if (isRealAppointment) {
        const [appointment, call] = await Promise.all([
          fetchAppointmentOutcome(appointmentIdOrRoom).catch(() => null as any),
          fetchCallByAppointment(appointmentIdOrRoom).catch(() => null),
        ]);
        // Only show result when something actually resolved (or call ended).
        // Avoid jumping to a stale "confirmed" page when join never connected.
        const terminalAppt = appointment && ["CONFIRMED", "DECLINED", "RESCHEDULED", "ABANDONED"].includes(appointment.status);
        const terminalCall =
          call &&
          ["COMPLETED", "ABANDONED", "NO_ANSWER", "FAILED"].includes(call.status);
        if (appointment && (terminalAppt || terminalCall)) {
          setCallResult({ appointment, call });
        }
      }
      void loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load call result");
      void loadDashboard();
    } finally {
      setLoadingResult(false);
    }
  }

  if (loadingResult) {
    return (
      <main className="app">
        <p className="muted">Loading call result…</p>
      </main>
    );
  }

  if (callResult) {
    return (
      <CallResult
        appointment={callResult.appointment}
        call={callResult.call}
        onDone={() => {
          setCallResult(null);
          void loadDashboard();
        }}
      />
    );
  }

  if (selectedCall) {
    const appointment = appointments.find(
      (row) => row.appointmentId === selectedCall.appointmentId,
    );
    return (
      <CallDetail
        call={selectedCall}
        appointment={appointment}
        onBack={() => setSelectedCall(null)}
      />
    );
  }

  if (activeJoin) {
    const leaveId = activeJoin.appointment?.appointmentId || activeJoin.roomName;
    return (
      <CallRoom
        join={activeJoin}
        onLeave={() => void handleLeaveCall(leaveId)}
      />
    );
  }

  return (
    <CallDashboard
      appointments={appointments}
      calls={calls}
      stats={stats}
      leads={leads}
      campaigns={campaigns}
      loading={loading}
      error={error}
      joiningId={joiningId}
      onJoin={(appointmentId) => void handleJoin(appointmentId)}
      onJoinLead={(leadId) => void handleJoinLead(leadId)}
      onStartBooking={() => void handleStartBooking()}
      onStartConfirmationQueue={() => void handleStartConfirmationQueue()}
      onStartLeadQueue={() => void handleStartLeadQueue()}
      onSelectCall={setSelectedCall}
      onUploadCampaign={async (p) => {
        await uploadCampaign(p);
        void loadDashboard();
      }}
    />
  );
}