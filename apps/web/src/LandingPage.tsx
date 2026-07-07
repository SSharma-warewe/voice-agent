import { Link } from "react-router-dom";
import { AGENTS } from "./agents";

export default function LandingPage() {
  return (
    <main className="app landing">
      <div className="dashboard-grain" aria-hidden="true" />

      <header className="landing-header">
        <p className="dashboard-eyebrow">Voice agent platform</p>
        <h1>Select an agent</h1>
        <p className="landing-subtitle">
          Choose a voice agent to open its operations dashboard — monitor calls,
          review outcomes, and join live sessions.
        </p>
      </header>

      <ul className="agent-grid">
        {AGENTS.map((agent, index) => (
          <li
            key={agent.slug}
            className="agent-card-wrap"
            style={{ animationDelay: `${0.08 + index * 0.1}s` }}
          >
            {agent.status === "active" ? (
              <Link to={`/${agent.slug}`} className="agent-card">
                <AgentCardContent agent={agent} />
              </Link>
            ) : (
              <div className="agent-card agent-card-disabled" aria-disabled="true">
                <AgentCardContent agent={agent} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

function AgentCardContent({
  agent,
}: {
  agent: (typeof AGENTS)[number];
}) {
  return (
    <>
      <div className="agent-card-top">
        <span className="agent-card-tag">{agent.tagline}</span>
        {agent.status === "active" ? (
          <span className="agent-status agent-status-active">Active</span>
        ) : (
          <span className="agent-status agent-status-soon">Coming soon</span>
        )}
      </div>
      <h2 className="agent-card-title">{agent.name}</h2>
      <p className="agent-card-description">{agent.description}</p>
      {agent.status === "active" && (
        <span className="agent-card-cta">
          Open dashboard
          <span className="agent-card-arrow" aria-hidden="true">
            →
          </span>
        </span>
      )}
    </>
  );
}