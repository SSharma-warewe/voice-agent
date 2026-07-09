import { useCallback, useEffect, useState } from "react";
import {
  fetchBookingConfig,
  saveBookingConfig,
  type BookingConfig,
  type DoctorConfig,
} from "./api";

const DAY_LABELS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function emptyDoctor(index: number): DoctorConfig {
  return {
    id: `doctor-${Date.now()}-${index}`,
    name: "",
    schedule: {
      workingDays: [1, 2, 3, 4, 5],
      start: "09:00",
      end: "17:00",
      blockedDates: [],
    },
  };
}

function toggleDay(days: number[], day: number): number[] {
  if (days.includes(day)) {
    return days.filter((d) => d !== day).sort((a, b) => a - b);
  }
  return [...days, day].sort((a, b) => a - b);
}

function parseDateList(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDateList(dates: string[]): string {
  return dates.join(", ");
}

export default function DashboardAgentConfig() {
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const next = await fetchBookingConfig();
      setConfig(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!config) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const saved = await saveBookingConfig(config);
      setConfig(saved);
      setSuccess("Configuration saved. Inbound booking will use these rules on the next call.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <header className="page-header">
          <h2>Agent Config</h2>
          <p className="page-subtitle">Loading booking configuration…</p>
        </header>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="dashboard-page">
        <header className="page-header">
          <h2>Agent Config</h2>
          <p className="page-subtitle">{error ?? "Could not load configuration."}</p>
        </header>
        <button type="button" className="config-btn-primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="page-header config-header">
        <div>
          <h2>Agent Config</h2>
          <p className="page-subtitle">
            Working hours, doctors, and booking rules for the inbound booking agent.
          </p>
        </div>
        <button
          type="button"
          className="config-btn-primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {success && <p className="config-success">{success}</p>}

      <section className="dashboard-panel config-section">
        <div className="panel-head">
          <h3>Clinic schedule</h3>
        </div>

        <div className="config-grid">
          <label className="config-field">
            <span>Timezone</span>
            <input
              type="text"
              value={config.timezone}
              onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
              placeholder="Asia/Kolkata"
            />
          </label>

          <label className="config-field">
            <span>Hours start</span>
            <input
              type="time"
              value={config.workingHours.start}
              onChange={(e) =>
                setConfig({
                  ...config,
                  workingHours: { ...config.workingHours, start: e.target.value },
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Hours end</span>
            <input
              type="time"
              value={config.workingHours.end}
              onChange={(e) =>
                setConfig({
                  ...config,
                  workingHours: { ...config.workingHours, end: e.target.value },
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Appointment duration (min)</span>
            <input
              type="number"
              min={5}
              step={5}
              value={config.appointmentDuration}
              onChange={(e) =>
                setConfig({
                  ...config,
                  appointmentDuration: Number(e.target.value) || 30,
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Buffer between appointments (min)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={config.bufferBetweenAppointments}
              onChange={(e) =>
                setConfig({
                  ...config,
                  bufferBetweenAppointments: Number(e.target.value) || 0,
                })
              }
            />
          </label>

          <label className="config-field">
            <span>Max days in advance</span>
            <input
              type="number"
              min={0}
              value={config.maxDaysInAdvance}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maxDaysInAdvance: Number(e.target.value) || 0,
                })
              }
            />
          </label>
        </div>

        <div className="config-field config-field-full">
          <span>Working days</span>
          <div className="day-chips" role="group" aria-label="Working days">
            {DAY_LABELS.map((day) => {
              const active = config.workingDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  className={`day-chip${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    setConfig({
                      ...config,
                      workingDays: toggleDay(config.workingDays, day.value),
                    })
                  }
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="config-field config-field-full">
          <span>Blocked dates (YYYY-MM-DD, comma-separated)</span>
          <input
            type="text"
            value={formatDateList(config.blockedDates)}
            onChange={(e) =>
              setConfig({
                ...config,
                blockedDates: parseDateList(e.target.value),
              })
            }
            placeholder="2026-12-25, 2026-01-01"
          />
        </label>

        <label className="config-toggle">
          <input
            type="checkbox"
            checked={config.allowSameDayBooking}
            onChange={(e) =>
              setConfig({ ...config, allowSameDayBooking: e.target.checked })
            }
          />
          <span>Allow same-day booking</span>
        </label>
      </section>

      <section className="dashboard-panel config-section">
        <div className="panel-head">
          <h3>Doctors</h3>
          <button
            type="button"
            className="config-btn-secondary"
            onClick={() =>
              setConfig({
                ...config,
                doctors: [...config.doctors, emptyDoctor(config.doctors.length)],
              })
            }
          >
            + Add doctor
          </button>
        </div>

        {config.doctors.length === 0 && (
          <p className="panel-empty">Add at least one doctor for the agent to offer.</p>
        )}

        <div className="doctor-list">
          {config.doctors.map((doctor, index) => (
            <div key={doctor.id} className="doctor-card">
              <div className="doctor-card-head">
                <h4>Doctor {index + 1}</h4>
                {config.doctors.length > 1 && (
                  <button
                    type="button"
                    className="config-btn-ghost"
                    onClick={() =>
                      setConfig({
                        ...config,
                        doctors: config.doctors.filter((d) => d.id !== doctor.id),
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="config-grid">
                <label className="config-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={doctor.name}
                    onChange={(e) => {
                      const doctors = config.doctors.map((d) =>
                        d.id === doctor.id ? { ...d, name: e.target.value } : d,
                      );
                      setConfig({ ...config, doctors });
                    }}
                    placeholder="Dr. Smith"
                  />
                </label>
                <label className="config-field">
                  <span>Start</span>
                  <input
                    type="time"
                    value={doctor.schedule.start}
                    onChange={(e) => {
                      const doctors = config.doctors.map((d) =>
                        d.id === doctor.id
                          ? {
                              ...d,
                              schedule: { ...d.schedule, start: e.target.value },
                            }
                          : d,
                      );
                      setConfig({ ...config, doctors });
                    }}
                  />
                </label>
                <label className="config-field">
                  <span>End</span>
                  <input
                    type="time"
                    value={doctor.schedule.end}
                    onChange={(e) => {
                      const doctors = config.doctors.map((d) =>
                        d.id === doctor.id
                          ? {
                              ...d,
                              schedule: { ...d.schedule, end: e.target.value },
                            }
                          : d,
                      );
                      setConfig({ ...config, doctors });
                    }}
                  />
                </label>
              </div>

              <div className="config-field config-field-full">
                <span>Working days</span>
                <div className="day-chips" role="group" aria-label={`${doctor.name || "Doctor"} working days`}>
                  {DAY_LABELS.map((day) => {
                    const active = doctor.schedule.workingDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        className={`day-chip${active ? " is-active" : ""}`}
                        aria-pressed={active}
                        onClick={() => {
                          const doctors = config.doctors.map((d) =>
                            d.id === doctor.id
                              ? {
                                  ...d,
                                  schedule: {
                                    ...d.schedule,
                                    workingDays: toggleDay(d.schedule.workingDays, day.value),
                                  },
                                }
                              : d,
                          );
                          setConfig({ ...config, doctors });
                        }}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="config-field config-field-full">
                <span>Blocked dates</span>
                <input
                  type="text"
                  value={formatDateList(doctor.schedule.blockedDates)}
                  onChange={(e) => {
                    const doctors = config.doctors.map((d) =>
                      d.id === doctor.id
                        ? {
                            ...d,
                            schedule: {
                              ...d.schedule,
                              blockedDates: parseDateList(e.target.value),
                            },
                          }
                        : d,
                    );
                    setConfig({ ...config, doctors });
                  }}
                  placeholder="2026-12-25"
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="config-footer-actions">
        <button
          type="button"
          className="config-btn-primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}
