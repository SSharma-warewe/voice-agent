import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAgentBySlug } from "./agents";
import { useMockAuth } from "./auth";

export type DashboardView = "overview" | "agent-config" | "history" | "stats";

const BASE_NAV_ITEMS: { id: DashboardView; label: string; description: string }[] = [
  { id: "overview", label: "Overview", description: "Live metrics & queue" },
  { id: "history", label: "Call history", description: "Completed calls" },
  { id: "stats", label: "Agent stats", description: "Outcomes & pipeline" },
];

const AGENT_CONFIG_NAV: { id: DashboardView; label: string; description: string } = {
  id: "agent-config",
  label: "Agent Config",
  description: "Hours, doctors & rules",
};

interface DashboardLayoutProps {
  agentSlug: string;
  activeView: DashboardView;
  onNavigate: (view: DashboardView) => void;
  lastRefresh: Date;
  children: ReactNode;
}

export default function DashboardLayout({
  agentSlug,
  activeView,
  onNavigate,
  lastRefresh,
  children,
}: DashboardLayoutProps) {
  const agent = getAgentBySlug(agentSlug);
  const { logout } = useMockAuth();
  const navigate = useNavigate();

  const isInbound = agentSlug === "inbound-booking-agent";
  const navItems = isInbound
    ? [
        BASE_NAV_ITEMS[0]!,
        AGENT_CONFIG_NAV,
        ...BASE_NAV_ITEMS.slice(1),
      ]
    : BASE_NAV_ITEMS;

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <Link to="/" className="sidebar-back">
            ← Agents
          </Link>
          <p className="sidebar-eyebrow">{agent?.tagline ?? "Voice ops"}</p>
          <h1 className="sidebar-title">{agent?.name ?? "Dashboard"}</h1>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard sections">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-link${activeView === item.id ? " is-active" : ""}`}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="sidebar-link-label">{item.label}</span>
              <span className="sidebar-link-desc">{item.description}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="live-badge">
            <span className="live-pulse" />
            Live
          </span>
          <span className="refresh-note">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              marginTop: 10,
              fontSize: 12,
              fontWeight: 500,
              color: "#737373",
              background: "transparent",
              border: "1px solid #e5e5e5",
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="dashboard-content">{children}</div>
    </div>
  );
}
