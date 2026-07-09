import type { AppointmentDetails } from "./types.ts";

const NYLAS_BASE = "https://api.us.nylas.com/v3";
const DEFAULT_TZ: string = process.env.CALENDAR_TIMEZONE || "Asia/Kolkata";
const DEFAULT_DURATION_MIN = 30;

export interface NylasGrant {
  id: string;
  provider: string;
  email?: string;
  grant_email?: string;
}

export interface NylasCalendar {
  id: string;
  name: string;
  is_primary?: boolean;
  read_only?: boolean;
}

export interface NylasEvent {
  id: string;
  title?: string;
  when?: {
    start_time?: number;
    end_time?: number;
    start_date?: string;
    end_date?: string;
  };
  calendar_id?: string;
}

/** Optional schedule constraints for free-slot generation (from BookingConfig). */
export interface SlotScheduleOptions {
  /** Working hours start HH:MM (default 09:00) */
  start?: string;
  /** Working hours end HH:MM (default 17:00) */
  end?: string;
  /** 0=Sun … 6=Sat; if set, only these days are offered */
  workingDays?: number[];
  /** YYYY-MM-DD dates to skip */
  blockedDates?: string[];
  /** Step between candidate slots in minutes (default durationMins) */
  slotIntervalMins?: number;
  /** Extra buffer after appointment when checking busy overlap (minutes) */
  bufferMins?: number;
}

export interface CalendarClient {
  isSlotAvailable(
    date: string,
    time: string,
    durationMins?: number,
    options?: SlotScheduleOptions,
  ): Promise<boolean>;
  findFreeSlots(
    startDate: string,
    days?: number,
    durationMins?: number,
    options?: SlotScheduleOptions,
  ): Promise<Array<{ date: string; time: string }>>;
  createEvent(appointment: AppointmentDetails, durationMins?: number): Promise<string>;
  updateEventForAppointment(appointment: AppointmentDetails, previousDate?: string, previousTime?: string): Promise<string>;
  cancelEventForAppointment(appointment: AppointmentDetails): Promise<void>;
  getGrantId(): string | null;
  getPrimaryCalendarId(): string | null;
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function dayOfWeekUtc(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

interface NylasWhen {
  start_time: number;
  end_time: number;
  start_timezone?: string;
  end_timezone?: string;
}

function toUnixSeconds(dateStr: string, timeStr: string, tz?: string): number {
  // Parse YYYY-MM-DD and HH:MM (assume 24h). Convert to unix seconds using the given TZ offset.
  const dateParts = dateStr.split("-").map(Number);
  const timeParts = timeStr.split(":").map(Number);
  const year = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 1;
  const day = dateParts[2] ?? 1;
  const hour = timeParts[0] ?? 0;
  const minute = timeParts[1] ?? 0;

  const tzSafe = String(tz || DEFAULT_TZ);

  // Get offset hours for the tz (fallback to +5.5 for IST)
  let offsetHours = 5.5;
  const tzLower = tzSafe.toLowerCase();
  if (tzLower.includes("kolkata") || tzSafe === "Asia/Kolkata") {
    offsetHours = 5.5;
  } else if (tzSafe.includes("+")) {
    const m = tzSafe.match(/([+-]?\d+(\.\d+)?)/);
    if (m) offsetHours = parseFloat(m[1]!);
  } else if (tzSafe.includes("-")) {
    const m = tzSafe.match(/([+-]?\d+(\.\d+)?)/);
    if (m) offsetHours = parseFloat(m[1]!);
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Subtract the local offset to get true unix (since we built as if local was UTC)
  const unix = Math.floor(date.getTime() / 1000) - Math.round(offsetHours * 3600);
  return unix;
}

function buildNylasWhen(date: string, time: string, durationMins: number = DEFAULT_DURATION_MIN): NylasWhen {
  const start = toUnixSeconds(date, time);
  const end = start + durationMins * 60;
  return {
    start_time: start,
    end_time: end,
    start_timezone: DEFAULT_TZ,
    end_timezone: DEFAULT_TZ,
  };
}

function buildTitle(appointment: AppointmentDetails): string {
  return `${appointment.patientName} — ${appointment.doctorName}`;
}

export function createCalendarClient(token: string | undefined = process.env.CALENDAR_URL): CalendarClient | null {
  if (!token) {
    return null;
  }

  let cachedGrantId: string | null = null;
  let cachedCalendarId: string | null = null;

  async function discoverGrantAndCalendar(): Promise<{ grantId: string; calendarId: string } | null> {
    if (cachedGrantId && cachedCalendarId) {
      return { grantId: cachedGrantId, calendarId: cachedCalendarId };
    }

    try {
      // Discover Google grant
      const grantsRes = await fetch(`${NYLAS_BASE}/grants`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!grantsRes.ok) {
        console.warn("[calendar] Failed to list grants:", grantsRes.status);
        return null;
      }

      const grantsData = await grantsRes.json();
      const grants: NylasGrant[] = grantsData?.data || [];
      const googleGrant = grants.find((g) => g.provider === "google");

      if (!googleGrant) {
        console.warn("[calendar] No Google grant found");
        return null;
      }

      cachedGrantId = googleGrant.id;

      // Discover primary writable calendar
      const calRes = await fetch(`${NYLAS_BASE}/grants/${cachedGrantId}/calendars`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!calRes.ok) {
        console.warn("[calendar] Failed to list calendars:", calRes.status);
        // Fallback to email-style id
        cachedCalendarId = googleGrant.email || googleGrant.grant_email || "primary";
        return { grantId: cachedGrantId, calendarId: cachedCalendarId };
      }

      const calData = await calRes.json();
      const calendars: NylasCalendar[] = calData?.data || [];

      const primary = calendars.find((c) => c.is_primary && !c.read_only) ||
                      calendars.find((c) => !c.read_only) ||
                      calendars[0];

      cachedCalendarId = primary?.id || googleGrant.email || googleGrant.grant_email || "primary";

      console.log(`[calendar] Using grant=${cachedGrantId} calendar=${cachedCalendarId}`);
      return { grantId: cachedGrantId, calendarId: cachedCalendarId };
    } catch (err) {
      console.warn("[calendar] Discovery error:", err);
      return null;
    }
  }

  async function listEventsInRange(startDate: string, days: number = 5): Promise<NylasEvent[]> {
    const discovery = await discoverGrantAndCalendar();
    if (!discovery) return [];

    const { grantId, calendarId } = discovery;

    // Build a time window
    const startUnix = toUnixSeconds(startDate, "00:00");
    const endUnix = startUnix + days * 24 * 3600;

    try {
      const url = new URL(`${NYLAS_BASE}/grants/${grantId}/events`);
      url.searchParams.set("calendar_id", calendarId);
      url.searchParams.set("start_time", String(startUnix));
      url.searchParams.set("end_time", String(endUnix));
      url.searchParams.set("limit", "100");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        console.warn("[calendar] listEvents failed:", res.status);
        return [];
      }

      const data = await res.json();
      return data?.data || [];
    } catch (err) {
      console.warn("[calendar] listEvents error:", err);
      return [];
    }
  }

  async function isSlotAvailable(
    date: string,
    time: string,
    durationMins: number = DEFAULT_DURATION_MIN,
    options?: SlotScheduleOptions,
  ): Promise<boolean> {
    const bufferMins = options?.bufferMins ?? 0;
    const occupiedMins = durationMins + bufferMins;
    const events = await listEventsInRange(date, 1);
    const slotStart = toUnixSeconds(date, time);
    const slotEnd = slotStart + occupiedMins * 60;

    for (const ev of events) {
      const w = ev.when;
      if (!w) continue;

      const evStart = w.start_time ?? (w.start_date ? toUnixSeconds(w.start_date!, "00:00") : 0);
      const evEnd = w.end_time ?? (w.end_date ? toUnixSeconds(w.end_date!, "23:59") : evStart + 3600);

      // Overlap check
      if (Math.max(slotStart, evStart) < Math.min(slotEnd, evEnd)) {
        return false;
      }
    }
    return true;
  }

  async function findFreeSlots(
    startDate: string,
    days: number = 5,
    durationMins: number = DEFAULT_DURATION_MIN,
    options?: SlotScheduleOptions,
  ): Promise<Array<{ date: string; time: string }>> {
    const slots: Array<{ date: string; time: string }> = [];
    const events = await listEventsInRange(startDate, days);

    const dayStartMins = parseTimeToMinutes(options?.start ?? "09:00");
    const dayEndMins = parseTimeToMinutes(options?.end ?? "17:00");
    const interval = Math.max(
      5,
      options?.slotIntervalMins ?? durationMins ?? 30,
    );
    const bufferMins = options?.bufferMins ?? 0;
    const occupiedMins = durationMins + bufferMins;
    const workingDays = options?.workingDays
      ? new Set(options.workingDays)
      : null;
    const blocked = new Set(options?.blockedDates ?? []);

    for (let d = 0; d < days; d++) {
      const current = new Date(`${startDate}T12:00:00Z`);
      current.setUTCDate(current.getUTCDate() + d);
      const dateStr = current.toISOString().slice(0, 10);

      if (blocked.has(dateStr)) continue;
      if (workingDays && !workingDays.has(dayOfWeekUtc(dateStr))) continue;

      for (let mins = dayStartMins; mins + durationMins <= dayEndMins; mins += interval) {
        const timeStr = formatMinutes(mins);
        const start = toUnixSeconds(dateStr, timeStr);
        const end = start + occupiedMins * 60;

        const busy = events.some((ev) => {
          const w = ev.when;
          if (!w) return false;
          const evStart = w.start_time ?? 0;
          const evEnd = w.end_time ?? evStart + 3600;
          return Math.max(start, evStart) < Math.min(end, evEnd);
        });

        if (!busy) {
          slots.push({ date: dateStr, time: timeStr });
        }
      }
    }

    return slots;
  }

  async function createEvent(appointment: AppointmentDetails, durationMins?: number): Promise<string> {
    const discovery = await discoverGrantAndCalendar();
    if (!discovery) return "Calendar unavailable";

    const { grantId, calendarId } = discovery;
    const when = buildNylasWhen(appointment.appointmentDate, appointment.appointmentTime, durationMins);

    try {
      const res = await fetch(`${NYLAS_BASE}/grants/${grantId}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          calendar_id: calendarId,
          title: buildTitle(appointment),
          when,
          description: `Appointment ID: ${appointment.appointmentId}`,
          participants: appointment.phone
            ? [{ email: "patient@example.com", name: appointment.patientName }]
            : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        console.warn("[calendar] createEvent failed:", res.status, err);
        return "Failed to create calendar event";
      }

      const data = await res.json();
      const eventId = data?.data?.id || "created";
      console.log(`[calendar] Created event ${eventId} for ${appointment.appointmentId}`);
      return `Calendar event created (${eventId})`;
    } catch (err) {
      console.warn("[calendar] createEvent error:", err);
      return "Calendar sync error";
    }
  }

  async function updateEventForAppointment(appointment: AppointmentDetails, previousDate?: string, previousTime?: string): Promise<string> {
    // Best-effort: try to find an existing event around previous time and update it.
    // If not found, fall back to create.
    const discovery = await discoverGrantAndCalendar();
    if (!discovery) return "Calendar unavailable";

    const { grantId, calendarId } = discovery;

    let targetEventId: string | undefined;

    if (previousDate && previousTime) {
      const events = await listEventsInRange(previousDate, 1);
      const prevStart = toUnixSeconds(previousDate, previousTime);
      for (const ev of events) {
        const w = ev.when;
        if (w?.start_time && Math.abs(w.start_time - prevStart) < 3600) {
          targetEventId = ev.id;
          break;
        }
      }
    }

    if (!targetEventId) {
      // No previous event found — just create a new one
      return createEvent(appointment);
    }

    const when = buildNylasWhen(appointment.appointmentDate, appointment.appointmentTime);

    try {
      const res = await fetch(`${NYLAS_BASE}/grants/${grantId}/events/${targetEventId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          calendar_id: calendarId,
          title: buildTitle(appointment),
          when,
        }),
      });

      if (!res.ok) {
        console.warn("[calendar] updateEvent failed:", res.status);
        return createEvent(appointment); // fallback
      }

      console.log(`[calendar] Updated event ${targetEventId} for ${appointment.appointmentId}`);
      return `Calendar event updated`;
    } catch (err) {
      console.warn("[calendar] updateEvent error:", err);
      return createEvent(appointment);
    }
  }

  async function cancelEventForAppointment(appointment: AppointmentDetails): Promise<void> {
    const discovery = await discoverGrantAndCalendar();
    if (!discovery) return;

    const { grantId } = discovery;
    // Try to find a recent event for this appointment by patient name + time window
    const events = await listEventsInRange(appointment.appointmentDate, 2);

    const target = events.find((ev) =>
      (ev.title || "").includes(appointment.patientName) ||
      (ev.title || "").includes(appointment.appointmentId)
    );

    if (!target) {
      console.log("[calendar] No matching event found to cancel for", appointment.appointmentId);
      return;
    }

    try {
      await fetch(`${NYLAS_BASE}/grants/${grantId}/events/${target.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`[calendar] Cancelled event ${target.id}`);
    } catch (err) {
      console.warn("[calendar] cancelEvent error:", err);
    }
  }

  return {
    async isSlotAvailable(date: string, time: string, durationMins?: number) {
      return isSlotAvailable(date, time, durationMins);
    },
    async findFreeSlots(startDate: string, days?: number, durationMins?: number) {
      return findFreeSlots(startDate, days, durationMins);
    },
    async createEvent(appointment: AppointmentDetails, durationMins?: number) {
      return createEvent(appointment, durationMins);
    },
    async updateEventForAppointment(appointment: AppointmentDetails, previousDate?: string, previousTime?: string) {
      return updateEventForAppointment(appointment, previousDate, previousTime);
    },
    async cancelEventForAppointment(appointment: AppointmentDetails) {
      return cancelEventForAppointment(appointment);
    },
    getGrantId() {
      return cachedGrantId;
    },
    getPrimaryCalendarId() {
      return cachedCalendarId;
    },
  };
}
