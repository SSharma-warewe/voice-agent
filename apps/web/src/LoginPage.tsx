import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMockAuth } from "./auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useMockAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);

    // Mock login: always succeed after short delay
    await new Promise((r) => setTimeout(r, 650));

    login();
    setSubmitting(false);
    setLoggedIn(true);

    // Brief success view then redirect to landing (or first dashboard)
    setTimeout(() => {
      navigate("/", { replace: true });
    }, 1100);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        fontFamily: '"Libre Franklin", sans-serif',
      }}
    >
      {/* LEFT: brand panel */}
      <div
        style={{
          background: "#0a0a0a",
          padding: "56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
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

        <div style={{ maxWidth: 420 }}>
          <p
            style={{
              margin: "0 0 16px",
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
              margin: "0 0 18px",
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 36,
              lineHeight: 1.15,
              color: "#ffffff",
            }}
          >
            Log in to run your call operations.
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.65,
              color: "rgba(255,255,255,.65)",
            }}
          >
            Monitor live calls, review outcomes, and manage appointment
            confirmation and lead outreach agents from one dashboard.
          </p>
        </div>

        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
            color: "rgba(255,255,255,.6)",
            textDecoration: "none",
          }}
        >
          ← Back to Callwave
        </Link>
      </div>

      {/* RIGHT: form */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 56,
          background: "#ffffff",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 380,
            animation: "cw-rise 0.4s ease both",
          }}
        >
          {loggedIn ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  fontSize: 24,
                  color: "#166534",
                }}
              >
                ✓
              </div>
              <h2
                style={{
                  margin: "0 0 10px",
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 22,
                  color: "#0a0a0a",
                }}
              >
                Welcome back
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "#525252" }}>
                Signed in as {email || "you@company.com"}. Redirecting to your
                dashboard…
              </p>
            </div>
          ) : (
            <div>
              <h2
                style={{
                  margin: "0 0 8px",
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 26,
                  color: "#0a0a0a",
                }}
              >
                Log in
              </h2>
              <p style={{ margin: "0 0 32px", fontSize: 14, color: "#737373" }}>
                Use your Callwave operator account.
              </p>

              <form
                onSubmit={handleSubmit}
                style={{ display: "grid", gap: 16 }}
              >
                <label style={{ display: "grid", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0a0a0a",
                    }}
                  >
                    Email
                  </span>
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage(null);
                    }}
                    style={{
                      padding: "12px 14px",
                      fontSize: 14.5,
                      border: "1px solid #d4d4d4",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      color: "#0a0a0a",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0a0a0a",
                    }}
                  >
                    Password
                  </span>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    style={{
                      padding: "12px 14px",
                      fontSize: 14.5,
                      border: "1px solid #d4d4d4",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      color: "#0a0a0a",
                    }}
                  />
                </label>

                {errorMessage && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      color: "#991b1b",
                      fontSize: 13,
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    marginTop: 6,
                    padding: "13px 20px",
                    border: "none",
                    borderRadius: 8,
                    background: "#0a0a0a",
                    color: "#ffffff",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting && (
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,.35)",
                        borderTopColor: "#ffffff",
                        animation: "cw-spin 0.7s linear infinite",
                        display: "inline-block",
                      }}
                    />
                  )}
                  {submitting ? "Logging in…" : "Log in"}
                </button>
              </form>

              <p
                style={{
                  margin: "22px 0 0",
                  fontSize: 13,
                  color: "#737373",
                  textAlign: "center",
                }}
              >
                Don't have an account?{" "}
                <a
                  href="#"
                  style={{ fontWeight: 600, textDecoration: "none" }}
                  onClick={(e) => {
                    e.preventDefault();
                    alert(
                      "Contact your admin to create an account."
                    );
                  }}
                >
                  Contact your admin
                </a>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* keyframes for animations (scoped via style tag in real would be css) */}
      <style>{`
        @keyframes cw-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cw-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
