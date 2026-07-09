import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Appointment, CallLog, CallStats, Lead, Campaign } from "./api";
import DashboardLayout, { type DashboardView } from "./DashboardLayout";
import DashboardOverview from "./DashboardOverview";
import DashboardHistory from "./DashboardHistory";
import DashboardAgentStats from "./DashboardAgentStats";
import DashboardAgentConfig from "./DashboardAgentConfig";

interface CallDashboardProps {
  appointments: Appointment[];
  calls: CallLog[];
  stats: CallStats | null;
  leads?: Lead[];
  campaigns?: Campaign[];
  loading: boolean;
  error: string | null;
  joiningId: string | null;
  onJoin: (appointmentId: string) => void;
  onJoinLead?: (leadId: string) => void;
  onStartBooking?: () => void;
  onStartConfirmationQueue?: () => void;
  onStartLeadQueue?: () => void;
  onSelectCall: (call: CallLog) => void;
  onUploadCampaign?: (payload: { name?: string | null; script: string; leads: Array<{ name: string; phone: string }> }) => Promise<void>;
}

export default function CallDashboard({
  appointments,
  calls,
  stats,
  leads = [],
  campaigns = [],
  loading,
  error,
  joiningId,
  onJoin,
  onJoinLead,
  onStartBooking,
  onStartConfirmationQueue,
  onStartLeadQueue,
  onSelectCall,
  onUploadCampaign,
}: CallDashboardProps) {
  const { agentName = "appointment-confirmation-agent" } = useParams<{
    agentName: string;
  }>();
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    if (!loading) {
      setLastRefresh(new Date());
    }
  }, [loading, appointments, calls, stats]);

  return (
    <DashboardLayout
      agentSlug={agentName}
      activeView={activeView}
      onNavigate={setActiveView}
      lastRefresh={lastRefresh}
    >
      {error && <p className="error-banner">{error}</p>}

      {activeView === "overview" && (
        <DashboardOverview
          agentSlug={agentName}
          appointments={appointments}
          calls={calls}
          stats={stats}
          leads={leads}
          campaigns={campaigns}
          loading={loading}
          joiningId={joiningId}
          onJoin={onJoin}
          onJoinLead={onJoinLead}
          onStartBooking={onStartBooking}
          onStartConfirmationQueue={onStartConfirmationQueue}
          onStartLeadQueue={onStartLeadQueue}
          onUploadCampaign={onUploadCampaign}
        />
      )}

      {activeView === "agent-config" && agentName === "inbound-booking-agent" && (
        <DashboardAgentConfig />
      )}

      {activeView === "history" && (
        <DashboardHistory
          appointments={appointments}
          calls={calls}
          loading={loading}
          onSelectCall={onSelectCall}
        />
      )}

      {activeView === "stats" && (
        <DashboardAgentStats appointments={appointments} calls={calls} />
      )}
    </DashboardLayout>
  );
}