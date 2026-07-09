import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMockAuth } from "./auth";
import { fetchCallStats, formatDuration } from "./api";

interface Stat {
  value: string;
  label: string;
  highlight?: boolean;
}

export default function LandingPage() {
  const { isLoggedIn } = useMockAuth();

  const [stats, setStats] = useState<Stat[]>([
    { value: "—", label: "Active calls right now" },
    { value: "—", label: "Calls completed today", highlight: true },
    { value: "—", label: "Avg call duration" },
    { value: "—", label: "API status" },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const s = await fetchCallStats();
        if (cancelled) return;
        setStats([
          { value: String(s.activeCount ?? 0), label: "Active calls right now" },
          {
            value: String(s.completedToday ?? 0),
            label: "Calls completed today",
            highlight: true,
          },
          {
            value: formatDuration(s.avgDurationSeconds),
            label: "Avg call duration",
          },
          { value: "Live", label: "API status" },
        ]);
      } catch {
        if (cancelled) return;
        setStats([
          { value: "—", label: "Active calls right now" },
          { value: "—", label: "Calls completed today", highlight: true },
          { value: "—", label: "Avg call duration" },
          { value: "Offline", label: "API status" },
        ]);
      }
    }

    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div style={{ background: "#f0eee9", minHeight: "100vh", fontFamily: '"Libre Franklin", sans-serif' }}>
      {/* NAV */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "26px 56px",
          background: "#0a0a0a",
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            textDecoration: "none",
          }}
        >
          Callwave
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a
            href="#how"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,.72)",
              textDecoration: "none",
            }}
          >
            How it works
          </a>
          <a
            href="#agents"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,.72)",
              textDecoration: "none",
            }}
          >
            Agents
          </a>
          <a
            href="#faq"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,.72)",
              textDecoration: "none",
            }}
          >
            FAQ
          </a>
          {isLoggedIn ? (
            <Link
              to="/appointment-confirmation-agent"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#0a0a0a",
                background: "#fde68a",
                padding: "10px 20px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#0a0a0a",
                background: "#fde68a",
                padding: "10px 20px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Log in
            </Link>
          )}
        </div>
      </nav>

      {/* HERO (Dark) */}
      <div
        style={{
          background: "#0a0a0a",
          padding: "88px 56px 96px",
          textAlign: "center",
          animation: "cw-rise 0.5s ease both",
        }}
      >
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#fde68a",
          }}
        >
          Inbound + outbound voice agents
        </p>
        <h1
          style={{
            margin: "0 auto 22px",
            maxWidth: 820,
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 56,
            lineHeight: 1.06,
            letterSpacing: "-0.02em",
            color: "#ffffff",
          }}
        >
          Voice agents that pick up the phone for you.
        </h1>
        <p
          style={{
            margin: "0 auto 36px",
            maxWidth: 600,
            fontSize: 17,
            lineHeight: 1.6,
            color: "rgba(255,255,255,.68)",
          }}
        >
          Callwave places and answers calls for appointment confirmations and lead outreach — with live
          transcripts, real-time outcomes, and zero missed follow-ups.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          {isLoggedIn ? (
            <Link
              to="/appointment-confirmation-agent"
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#0a0a0a",
                background: "#fde68a",
                padding: "15px 30px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Open dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#0a0a0a",
                background: "#fde68a",
                padding: "15px 30px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Log in to your dashboard
            </Link>
          )}
          <a
            href="#how"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#ffffff",
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.22)",
              padding: "15px 30px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            See how it works
          </a>
        </div>
        {isLoggedIn && (
          <p style={{ marginTop: 18, fontSize: 13, color: "rgba(255,255,255,.55)" }}>
            Logged in — pick an agent below or{" "}
            <Link to="/login" style={{ color: "#fde68a", textDecoration: "underline" }}>log out</Link>
          </p>
        )}
      </div>

      {/* LIVE STATS */}
      <div style={{ padding: "44px 56px", background: "#fafafa", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              borderRadius: 999,
              border: "1px solid #fde68a",
              background: "#fef3c7",
              color: "#854d0e",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ca8a04",
                animation: "cw-pulse-live 2s ease infinite",
              }}
            />
            Live from the platform
          </span>
          <span style={{ fontSize: 12, color: "#737373" }}>Updated moments ago</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {stats.map((s, i) => (
            <div
              key={i}
              style={{
                padding: "22px 20px",
                borderRadius: 10,
                border: s.highlight ? "1px solid #fde68a" : "1px solid #e5e5e5",
                background: s.highlight ? "#fef3c7" : "#ffffff",
              }}
            >
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 30,
                  fontWeight: 800,
                  color: "#0a0a0a",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#525252", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how" style={{ padding: "72px 56px", background: "#ffffff" }}>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#737373",
          }}
        >
          How it works
        </p>
        <h2
          style={{
            margin: "0 0 44px",
            fontFamily: "'Syne', sans-serif",
            fontSize: 32,
            fontWeight: 800,
            color: "#0a0a0a",
            maxWidth: 640,
          }}
        >
          One platform, two directions of calling.
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Inbound */}
          <div
            style={{
              padding: "28px 30px",
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              background: "#fafafa",
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#1e3a5f",
                background: "#eef2f7",
                border: "1px solid #cbd8e6",
                padding: "4px 10px",
                borderRadius: 999,
                marginBottom: 14,
              }}
            >
              Outbound
            </span>
            <h3 style={{ margin: "0 0 8px", fontFamily: "'Syne', sans-serif", fontSize: 20, color: "#0a0a0a" }}>
              Appointment Confirmation
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "#525252" }}>
              Calls patients to confirm, reschedule, or cancel clinic appointments — with live transcripts and
              outcome tracking.
            </p>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {[
                "Appointment lands in your system",
                "Agent calls the patient automatically",
                "Confirms, reschedules, or cancels — live",
                "Outcome + transcript sync to your dashboard",
              ].map((step, idx) => (
                <li key={idx} style={{ display: "flex", gap: 10, fontSize: 13.5, color: "#525252" }}>
                  <span style={{ fontWeight: 700, color: "#0a0a0a" }}>{String(idx + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Outbound */}
          <div
            style={{
              padding: "28px 30px",
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              background: "#fafafa",
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#1e3a5f",
                background: "#eef2f7",
                border: "1px solid #cbd8e6",
                padding: "4px 10px",
                borderRadius: 999,
                marginBottom: 14,
              }}
            >
              Outbound
            </span>
            <h3 style={{ margin: "0 0 8px", fontFamily: "'Syne', sans-serif", fontSize: 20, color: "#0a0a0a" }}>
              Lead Outreach &amp; Booking
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "#525252" }}>
              Upload a list of leads and a conversation script. The agent calls each lead to book new appointments.
            </p>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {[
                "Upload leads (name + phone) and a script",
                "Agent dials every lead in the list",
                "Books an appointment or logs the outcome",
                "Results land straight in your dashboard",
              ].map((step, idx) => (
                <li key={idx} style={{ display: "flex", gap: 10, fontSize: 13.5, color: "#525252" }}>
                  <span style={{ fontWeight: 700, color: "#0a0a0a" }}>{String(idx + 1).padStart(2, "0")}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* AGENTS */}
      <div id="agents" style={{ padding: "0 56px 80px", background: "#ffffff" }}>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#737373",
          }}
        >
          Agents
        </p>
        <h2
          style={{
            margin: "0 0 32px",
            fontFamily: "'Syne', sans-serif",
            fontSize: 32,
            fontWeight: 800,
            color: "#0a0a0a",
          }}
        >
          Pick an agent, open its live dashboard.
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <Link
            to="/appointment-confirmation-agent"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "26px 28px",
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              background: "#ffffff",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#854d0e",
                }}
              >
                Voice confirmation ops
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #fde68a",
                  background: "#fef3c7",
                  color: "#854d0e",
                }}
              >
                Active
              </span>
            </div>
            <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: 22, color: "#0a0a0a" }}>
              Appointment Confirmation
            </h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#525252" }}>
              Calls patients to confirm, reschedule, or cancel clinic appointments — with live transcripts and
              outcome tracking.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
                fontSize: 14,
                fontWeight: 600,
                color: "#0a0a0a",
              }}
            >
              Open dashboard →
            </span>
          </Link>

          <Link
            to="/lead-outreach-agent"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "26px 28px",
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              background: "#ffffff",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#854d0e",
                }}
              >
                Leads to appointments
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #fde68a",
                  background: "#fef3c7",
                  color: "#854d0e",
                }}
              >
                Active
              </span>
            </div>
            <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: 22, color: "#0a0a0a" }}>
              Lead Outreach &amp; Booking
            </h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#525252" }}>
              Upload a list of leads (name + phone) and a conversation script. The agent calls leads to book new
              appointments and saves results to the database.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
                fontSize: 14,
                fontWeight: 600,
                color: "#0a0a0a",
              }}
            >
              Open dashboard →
            </span>
          </Link>

          {/* New inbound booking agent card */}
          <Link
            to="/inbound-booking-agent"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "26px 28px",
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              background: "#ffffff",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#1e3a5f",
                  background: "#eef2f7",
                  border: "1px solid #cbd8e6",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                Inbound
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #fde68a",
                  background: "#fef3c7",
                  color: "#854d0e",
                }}
              >
                Active
              </span>
            </div>
            <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: 22, color: "#0a0a0a" }}>
              Inbound Booking
            </h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#525252" }}>
              Patients call in. The agent answers, introduces itself, checks availability on the live calendar, and books the appointment.
            </p>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
                fontSize: 14,
                fontWeight: 600,
                color: "#0a0a0a",
              }}
            >
              Open dashboard →
            </span>
          </Link>
        </div>
      </div>

      {/* TRUSTED BY */}
      <div
        style={{
          padding: "48px 56px",
          background: "#fafafa",
          borderTop: "1px solid #e5e5e5",
          borderBottom: "1px solid #e5e5e5",
        }}
      >
        <p
          style={{
            margin: "0 0 24px",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#737373",
          }}
        >
          Trusted by clinics, agencies, and sales teams nationwide
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 48,
            flexWrap: "wrap",
          }}
        >
          {["Northside Health", "Brightline Dental", "Vantage Realty", "Solstice Clinics", "Harbor Legal"].map(
            (name) => (
              <span
                key={name}
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: 19,
                  color: "#a3a3a3",
                }}
              >
                {name}
              </span>
            )
          )}
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div id="customers" style={{ padding: "72px 56px", background: "#ffffff" }}>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#737373",
          }}
        >
          Customers
        </p>
        <h2
          style={{
            margin: "0 0 40px",
            fontFamily: "'Syne', sans-serif",
            fontSize: 32,
            fontWeight: 800,
            color: "#0a0a0a",
            maxWidth: 640,
          }}
        >
          Teams of every size run their calls through Callwave.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[
            {
              quote:
                "We used to have a front-desk person spend two hours a day on confirmation calls. Now it's automatic, and our no-show rate dropped noticeably in the first month.",
              name: "Dana Whitfield",
              role: "Office Manager, single-location clinic",
            },
            {
              quote:
                "Rolling this out across 40 locations would have been a huge lift with a human team. With Callwave it was the same setup, just pointed at a bigger list.",
              name: "Marcus Reyes",
              role: "Director of Ops, multi-location group",
            },
            {
              quote:
                "The transcripts and live dashboard mean I don't have to guess what happened on a call — I can just look it up.",
              name: "Priya Nandakumar",
              role: "Founder, small business owner",
            },
          ].map((t) => (
            <div
              key={t.name}
              style={{
                padding: "26px",
                borderRadius: 12,
                border: "1px solid #e5e5e5",
                background: "#fafafa",
              }}
            >
              <p style={{ margin: "0 0 20px", fontSize: 14.5, lineHeight: 1.65, color: "#404040" }}>
                “{t.quote}”
              </p>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#0a0a0a" }}>{t.name}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#737373" }}>{t.role}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SECURITY STRIP */}
      <div style={{ padding: "44px 56px", background: "#0a0a0a" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 24,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ffffff", maxWidth: 280 }}>
            Built for regulated industries — from single-location clinics to national call centers.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["HIPAA-ready", "SOC 2 Type II", "256-bit encryption", "99.9% uptime SLA"].map((badge) => (
              <span
                key={badge}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fde68a",
                  background: "rgba(253,230,138,.1)",
                  border: "1px solid rgba(253,230,138,.3)",
                  padding: "8px 14px",
                  borderRadius: 999,
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div id="faq" style={{ padding: "72px 56px", background: "#fafafa" }}>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#737373",
          }}
        >
          FAQ
        </p>
        <h2
          style={{
            margin: "0 0 32px",
            fontFamily: "'Syne', sans-serif",
            fontSize: 32,
            fontWeight: 800,
            color: "#0a0a0a",
          }}
        >
          Common questions.
        </h2>
        <div style={{ display: "grid", gap: 12, maxWidth: 780 }}>
          {[
            {
              q: "Do I need any technical setup to get started?",
              a: "No. Connect your appointment system or upload a lead list, choose a script, and your agent is live — no code required.",
            },
            {
              q: "Can it handle high call volumes for large teams?",
              a: "Yes. The same setup scales from a single-location practice to a national call center running thousands of calls a day.",
            },
            {
              q: "Is customer and patient data secure?",
              a: "Calls and transcripts are encrypted end-to-end, and the platform is built to HIPAA-ready and SOC 2 Type II standards.",
            },
            {
              q: "Does this work for a single small business?",
              a: "Yes — many customers run just one agent for one location, and can add more as they grow.",
            },
          ].map((item) => (
            <details
              key={item.q}
              style={{
                padding: "18px 22px",
                borderRadius: 10,
                border: "1px solid #e5e5e5",
                background: "#ffffff",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 15,
                  color: "#0a0a0a",
                }}
              >
                {item.q}
              </summary>
              <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "#525252" }}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* FINAL CTA */}
      <div style={{ padding: "64px 56px", background: "#fde68a", textAlign: "center" }}>
        <h2
          style={{
            margin: "0 0 14px",
            fontFamily: "'Syne', sans-serif",
            fontSize: 30,
            fontWeight: 800,
            color: "#0a0a0a",
          }}
        >
          Ready to stop missing calls?
        </h2>
        <p style={{ margin: "0 0 28px", fontSize: 15, color: "#78350f" }}>
          Set up your first agent in minutes — no code required.
        </p>
        {isLoggedIn ? (
          <Link
            to="/appointment-confirmation-agent"
            style={{
              display: "inline-block",
              fontSize: 15,
              fontWeight: 600,
              color: "#ffffff",
              background: "#0a0a0a",
              padding: "15px 34px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Open dashboard
          </Link>
        ) : (
          <Link
            to="/login"
            style={{
              display: "inline-block",
              fontSize: 15,
              fontWeight: 600,
              color: "#ffffff",
              background: "#0a0a0a",
              padding: "15px 34px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Log in to get started
          </Link>
        )}
      </div>

      {/* FOOTER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "26px 56px",
          borderTop: "1px solid #e5e5e5",
          background: "#fafafa",
        }}
      >
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 15,
            color: "#0a0a0a",
          }}
        >
          Callwave
        </span>
        <div style={{ display: "flex", gap: 22 }}>
          <a href="#" style={{ fontSize: 13, color: "#737373", textDecoration: "none" }}>
            Privacy
          </a>
          <a href="#" style={{ fontSize: 13, color: "#737373", textDecoration: "none" }}>
            Terms
          </a>
          <Link to="/login" style={{ fontSize: 13, color: "#737373", textDecoration: "none" }}>
            Log in
          </Link>
        </div>
      </div>

      {/* inline keyframes for this page */}
      <style>{`
        @keyframes cw-rise { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
        @keyframes cw-pulse-live { 0%,100%{ opacity:1; } 50%{ opacity:0.45; } }
        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
        details > summary::after { content: '+'; float: right; color: #a3a3a3; font-weight: 500; }
        details[open] > summary::after { content: '–'; }
      `}</style>
    </div>
  );
}
