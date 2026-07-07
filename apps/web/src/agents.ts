export interface AgentInfo {
  slug: string;
  name: string;
  description: string;
  tagline: string;
  status: "active" | "coming_soon";
}

export const AGENTS: AgentInfo[] = [
  {
    slug: "appointment-confirmation-agent",
    name: "Appointment Confirmation",
    description:
      "Calls patients to confirm, reschedule, or cancel clinic appointments — with live transcripts and outcome tracking.",
    tagline: "Voice confirmation ops",
    status: "active",
  },
];

export function getAgentBySlug(slug: string): AgentInfo | undefined {
  return AGENTS.find((agent) => agent.slug === slug);
}