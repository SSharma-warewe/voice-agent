import { Navigate, Route, Routes, useParams } from "react-router-dom";
import AgentDashboard from "./AgentDashboard";
import LandingPage from "./LandingPage";
import { getAgentBySlug } from "./agents";
import "./App.css";

function AgentRoute() {
  const { agentName } = useParams<{ agentName: string }>();
  const agent = agentName ? getAgentBySlug(agentName) : undefined;

  if (!agent) {
    return <Navigate to="/" replace />;
  }

  return <AgentDashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/:agentName/*" element={<AgentRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}