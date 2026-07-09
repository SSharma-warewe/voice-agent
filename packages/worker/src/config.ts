function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export interface WorkerConfig {
  databaseUrl: string;
  pollIntervalMs: number;
  maxConcurrentCalls: number;
  maxConfirmationCalls: number;
  maxLeadCalls: number;
  roomRequeueSeconds: number;
  neonSsl: boolean;
  /**
   * When false (default), worker only runs stuck-call hygiene/requeue.
   * Outbound rooms are started by API:
   *   POST /queue/confirmation/start
   *   POST /queue/leads/start
   * Inbound booking is never handled here (POST /booking/start only).
   */
  autoDispatch: boolean;
}

export function getConfig(): WorkerConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pollIntervalMs = numEnv("WORKER_POLL_INTERVAL_MS", 30_000);
  const maxConcurrentCalls = numEnv("MAX_CONCURRENT_CALLS", 2);
  const maxConfirmationCalls = numEnv("MAX_CONFIRMATION_CALLS", 1);
  const maxLeadCalls = numEnv("MAX_LEAD_CALLS", 1);
  const roomRequeueSeconds = numEnv("ROOM_REQUEUE_SECONDS", 300);
  // Default OFF so UI "Start … queue" is the real outbound control surface.
  const autoDispatch = boolEnv("WORKER_AUTO_DISPATCH", false);

  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 5_000) {
    throw new Error("WORKER_POLL_INTERVAL_MS must be a number >= 5000");
  }

  if (!Number.isFinite(maxConcurrentCalls) || maxConcurrentCalls < 1) {
    throw new Error("MAX_CONCURRENT_CALLS must be a number >= 1");
  }

  if (!Number.isFinite(maxConfirmationCalls) || maxConfirmationCalls < 0) {
    throw new Error("MAX_CONFIRMATION_CALLS must be a number >= 0");
  }

  if (!Number.isFinite(maxLeadCalls) || maxLeadCalls < 0) {
    throw new Error("MAX_LEAD_CALLS must be a number >= 0");
  }

  return {
    databaseUrl,
    pollIntervalMs,
    maxConcurrentCalls,
    maxConfirmationCalls,
    maxLeadCalls,
    roomRequeueSeconds,
    neonSsl: databaseUrl.includes("neon.tech"),
    autoDispatch,
  };
}
