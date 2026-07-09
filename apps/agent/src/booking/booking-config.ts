import type { BookingConfig, DoctorConfig } from "../shared/types.ts";

export function defaultBookingConfig(): BookingConfig {
  const timezone = process.env.CALENDAR_TIMEZONE || "Asia/Kolkata";
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
        schedule: {
          workingDays: [1, 2, 3, 4, 5],
          start: "09:00",
          end: "17:00",
          blockedDates: [],
        },
      },
    ],
  };
}

export async function fetchBookingConfig(apiUrl: string): Promise<BookingConfig> {
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/booking/config`);
    if (!res.ok) {
      console.warn("[booking-config] GET failed:", res.status);
      return defaultBookingConfig();
    }
    const data = (await res.json()) as { config?: BookingConfig };
    if (!data?.config || !Array.isArray(data.config.doctors)) {
      return defaultBookingConfig();
    }
    return {
      ...defaultBookingConfig(),
      ...data.config,
      workingHours: {
        ...defaultBookingConfig().workingHours,
        ...data.config.workingHours,
      },
      doctors: data.config.doctors.length
        ? data.config.doctors
        : defaultBookingConfig().doctors,
    };
  } catch (err) {
    console.warn(
      "[booking-config] fetch error, using defaults:",
      err instanceof Error ? err.message : err,
    );
    return defaultBookingConfig();
  }
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

function todayInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function dayOfWeek(dateStr: string): number {
  // Use noon UTC to avoid DST edge issues for pure calendar dates
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.getUTCDay();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function findDoctor(
  config: BookingConfig,
  doctorName?: string,
): DoctorConfig | undefined {
  if (!config.doctors.length) return undefined;
  if (!doctorName?.trim()) return config.doctors[0];
  const needle = doctorName.trim().toLowerCase();
  return (
    config.doctors.find((d) => d.name.toLowerCase() === needle) ??
    config.doctors.find((d) => d.name.toLowerCase().includes(needle)) ??
    config.doctors.find((d) => d.id.toLowerCase() === needle)
  );
}

export type SlotPolicyViolation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate a proposed date/time against clinic + optional doctor schedule.
 * Does not check calendar free/busy.
 */
export function validateSlotAgainstConfig(
  config: BookingConfig,
  date: string,
  time?: string,
  doctorName?: string,
): SlotPolicyViolation {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: "Date must be YYYY-MM-DD." };
  }

  const today = todayInTimezone(config.timezone);
  if (!config.allowSameDayBooking && date === today) {
    return { ok: false, reason: "Same-day booking is not allowed." };
  }
  if (date < today) {
    return { ok: false, reason: "Cannot book a date in the past." };
  }

  const maxDate = addDays(today, config.maxDaysInAdvance);
  if (date > maxDate) {
    return {
      ok: false,
      reason: `Bookings can only be made up to ${config.maxDaysInAdvance} days in advance.`,
    };
  }

  const doctor = findDoctor(config, doctorName);
  const clinicBlocked = new Set(config.blockedDates);
  const doctorBlocked = new Set(doctor?.schedule.blockedDates ?? []);
  if (clinicBlocked.has(date) || doctorBlocked.has(date)) {
    return { ok: false, reason: `${date} is a blocked date.` };
  }

  const dow = dayOfWeek(date);
  const clinicDays = new Set(config.workingDays);
  const doctorDays = new Set(doctor?.schedule.workingDays ?? config.workingDays);
  if (!clinicDays.has(dow) || !doctorDays.has(dow)) {
    return { ok: false, reason: `${date} is not a working day for the clinic/doctor.` };
  }

  if (time) {
    const mins = parseTimeToMinutes(time);
    const clinicStart = parseTimeToMinutes(config.workingHours.start);
    const clinicEnd = parseTimeToMinutes(config.workingHours.end);
    const docStart = parseTimeToMinutes(doctor?.schedule.start ?? config.workingHours.start);
    const docEnd = parseTimeToMinutes(doctor?.schedule.end ?? config.workingHours.end);
    const start = Math.max(clinicStart, docStart);
    const end = Math.min(clinicEnd, docEnd);
    const duration = config.appointmentDuration;

    if (mins < start || mins + duration > end) {
      return {
        ok: false,
        reason: `Time must fall within working hours (${formatMins(start)}–${formatMins(end)}), duration ${duration} min.`,
      };
    }
  }

  return { ok: true };
}

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Effective hours/days for free-slot generation (clinic ∩ doctor). */
export function effectiveSchedule(
  config: BookingConfig,
  doctorName?: string,
): {
  start: string;
  end: string;
  workingDays: number[];
  blockedDates: string[];
  durationMins: number;
  bufferMins: number;
  allowSameDayBooking: boolean;
  maxDaysInAdvance: number;
  timezone: string;
} {
  const doctor = findDoctor(config, doctorName);
  const clinicDays = new Set(config.workingDays);
  const doctorDays = doctor?.schedule.workingDays ?? config.workingDays;
  const workingDays = doctorDays.filter((d) => clinicDays.has(d));

  const clinicStart = parseTimeToMinutes(config.workingHours.start);
  const clinicEnd = parseTimeToMinutes(config.workingHours.end);
  const docStart = parseTimeToMinutes(doctor?.schedule.start ?? config.workingHours.start);
  const docEnd = parseTimeToMinutes(doctor?.schedule.end ?? config.workingHours.end);
  const startMins = Math.max(clinicStart, docStart);
  const endMins = Math.min(clinicEnd, docEnd);

  const blocked = [
    ...new Set([
      ...config.blockedDates,
      ...(doctor?.schedule.blockedDates ?? []),
    ]),
  ];

  return {
    start: formatMins(startMins),
    end: formatMins(endMins),
    workingDays,
    blockedDates: blocked,
    durationMins: config.appointmentDuration,
    bufferMins: config.bufferBetweenAppointments,
    allowSameDayBooking: config.allowSameDayBooking,
    maxDaysInAdvance: config.maxDaysInAdvance,
    timezone: config.timezone,
  };
}
