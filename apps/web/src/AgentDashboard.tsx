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
  type Appointment,
  type CallLog,
  type CallStats,
  type JoinResponse,
} from "./api";

export default function AgentDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
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
      const [rows, callRows, callStats] = await Promise.all([
        fetchAppointments(),
        fetchCalls(),
        fetchCallStats(),
      ]);
      setAppointments(rows);
      setCalls(callRows);
      setStats(callStats);
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

  async function handleLeaveCall(appointmentId: string) {
    setActiveJoin(null);
    setLoadingResult(true);
    setError(null);
    try {
      const [appointment, call] = await Promise.all([
        fetchAppointmentOutcome(appointmentId),
        fetchCallByAppointment(appointmentId),
      ]);
      setCallResult({ appointment, call });
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
    return (
      <CallRoom
        join={activeJoin}
        onLeave={() => void handleLeaveCall(activeJoin.appointment.appointmentId)}
      />
    );
  }

  return (
    <CallDashboard
      appointments={appointments}
      calls={calls}
      stats={stats}
      loading={loading}
      error={error}
      joiningId={joiningId}
      onJoin={(appointmentId) => void handleJoin(appointmentId)}
      onSelectCall={setSelectedCall}
    />
  );
}