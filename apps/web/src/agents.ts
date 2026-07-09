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
  {
    slug: "lead-outreach-agent",
    name: "Lead Outreach & Booking",
    description:
      "Upload a list of leads (name + phone) and a conversation script. The agent calls leads to book new appointments and saves results to the database.",
    tagline: "Leads to appointments",
    status: "active",
  },
  {
    slug: "inbound-booking-agent",
    name: "Inbound Booking",
    description:
      "Answers inbound calls from patients. Introduces itself and helps book a new appointment using live calendar availability checks and instant confirmation.",
    tagline: "Pick up & book",
    status: "active",
  },
];

export function getAgentBySlug(slug: string): AgentInfo | undefined {
  return AGENTS.find((agent) => agent.slug === slug);
}