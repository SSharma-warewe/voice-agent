import type { BookingConfig, DoctorConfig } from "../../shared/types.ts";

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultBookingConfig(): BookingConfig {
  const timezone = process.env.CALENDAR_TIMEZONE || "Asia/Kolkata";
  const schedule = {
    workingDays: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "17:00",
    blockedDates: [] as string[],
  };

  return {
    timezone,
    workingHours: { start: "09:00", end: "17:00" },
    workingDays: [1, 2, 3, 4, 5],
    blockedDates: [],
    appointmentDuration: 30,
    bufferBetweenAppointments: 0,
    allowSameDayBooking: true,
    maxDaysInAdvance: 30,
    doctors: [
      {
        id: "dr-smith",
        name: "Dr. Smith",
        schedule: { ...schedule, blockedDates: [] },
      },
    ],
  };
}

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value.trim());
}

function normalizeDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days: number[] = [];
  for (const d of value) {
    const n = typeof d === "number" ? d : Number(d);
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    if (!days.includes(n)) days.push(n);
  }
  return days.sort((a, b) => a - b);
}

function normalizeBlockedDates(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const dates: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!DATE_RE.test(trimmed)) return null;
    if (!dates.includes(trimmed)) dates.push(trimmed);
  }
  return dates.sort();
}

function normalizeDoctor(raw: unknown, index: number): DoctorConfig | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return `doctors[${index}] must be an object`;
  }
  const rec = raw as Record<string, unknown>;
  const id =
    typeof rec.id === "string" && rec.id.trim()
      ? rec.id.trim()
      : `doctor-${index + 1}`;
  const name =
    typeof rec.name === "string" && rec.name.trim()
      ? rec.name.trim()
      : null;
  if (!name) return `doctors[${index}].name is required`;

  const scheduleRaw = rec.schedule;
  if (!scheduleRaw || typeof scheduleRaw !== "object" || Array.isArray(scheduleRaw)) {
    return `doctors[${index}].schedule is required`;
  }
  const s = scheduleRaw as Record<string, unknown>;
  const workingDays = normalizeDays(s.workingDays);
  if (!workingDays || workingDays.length === 0) {
    return `doctors[${index}].schedule.workingDays must be a non-empty array of 0–6`;
  }
  if (!isTimeString(s.start) || !isTimeString(s.end)) {
    return `doctors[${index}].schedule start/end must be HH:MM`;
  }
  const blockedDates = normalizeBlockedDates(s.blockedDates ?? []);
  if (!blockedDates) {
    return `doctors[${index}].schedule.blockedDates must be YYYY-MM-DD strings`;
  }

  return {
    id,
    name,
    schedule: {
      workingDays,
      start: String(s.start).trim(),
      end: String(s.end).trim(),
      blockedDates,
    },
  };
}

export type BookingConfigValidation =
  | { valid: true; config: BookingConfig }
  | { valid: false; errorMessage: string };

export function validateBookingConfig(body: unknown): BookingConfigValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errorMessage: "config must be an object" };
  }

  // Allow either { config: {...} } or the config object itself
  const root = body as Record<string, unknown>;
  const source =
    root.config && typeof root.config === "object" && !Array.isArray(root.config)
      ? (root.config as Record<string, unknown>)
      : root;

  const timezone =
    typeof source.timezone === "string" && source.timezone.trim()
      ? source.timezone.trim()
      : null;
  if (!timezone) {
    return { valid: false, errorMessage: "timezone is required" };
  }

  const wh = source.workingHours;
  if (!wh || typeof wh !== "object" || Array.isArray(wh)) {
    return { valid: false, errorMessage: "workingHours is required" };
  }
  const whRec = wh as Record<string, unknown>;
  if (!isTimeString(whRec.start) || !isTimeString(whRec.end)) {
    return { valid: false, errorMessage: "workingHours.start/end must be HH:MM" };
  }

  const workingDays = normalizeDays(source.workingDays);
  if (!workingDays || workingDays.length === 0) {
    return {
      valid: false,
      errorMessage: "workingDays must be a non-empty array of 0–6 (Sun–Sat)",
    };
  }

  const blockedDates = normalizeBlockedDates(source.blockedDates ?? []);
  if (!blockedDates) {
    return {
      valid: false,
      errorMessage: "blockedDates must be an array of YYYY-MM-DD strings",
    };
  }

  const appointmentDuration = Number(source.appointmentDuration);
  if (!Number.isFinite(appointmentDuration) || appointmentDuration <= 0) {
    return {
      valid: false,
      errorMessage: "appointmentDuration must be a positive number (minutes)",
    };
  }

  const bufferBetweenAppointments = Number(source.bufferBetweenAppointments ?? 0);
  if (!Number.isFinite(bufferBetweenAppointments) || bufferBetweenAppointments < 0) {
    return {
      valid: false,
      errorMessage: "bufferBetweenAppointments must be >= 0",
    };
  }

  if (typeof source.allowSameDayBooking !== "boolean") {
    return {
      valid: false,
      errorMessage: "allowSameDayBooking must be a boolean",
    };
  }

  const maxDaysInAdvance = Number(source.maxDaysInAdvance);
  if (!Number.isInteger(maxDaysInAdvance) || maxDaysInAdvance < 0) {
    return {
      valid: false,
      errorMessage: "maxDaysInAdvance must be an integer >= 0",
    };
  }

  if (!Array.isArray(source.doctors) || source.doctors.length === 0) {
    return { valid: false, errorMessage: "doctors must be a non-empty array" };
  }

  const doctors: DoctorConfig[] = [];
  for (let i = 0; i < source.doctors.length; i++) {
    const result = normalizeDoctor(source.doctors[i], i);
    if (typeof result === "string") {
      return { valid: false, errorMessage: result };
    }
    doctors.push(result);
  }

  return {
    valid: true,
    config: {
      timezone,
      workingHours: {
        start: String(whRec.start).trim(),
        end: String(whRec.end).trim(),
      },
      workingDays,
      blockedDates,
      appointmentDuration: Math.round(appointmentDuration),
      bufferBetweenAppointments: Math.round(bufferBetweenAppointments),
      allowSameDayBooking: source.allowSameDayBooking,
      maxDaysInAdvance,
      doctors,
    },
  };
}
