import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load monorepo root .env as soon as this module is imported (before DB client).
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface ApiConfig {
  databaseUrl: string;
  serverPort: number;
  maxConcurrentCalls: number;
  maxConfirmationCalls: number;
  maxLeadCalls: number;
  roomRequeueSeconds: number;
}

export function getConfig(): ApiConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    databaseUrl,
    // Multi-service Railway: listen on PORT. All-in-one: set SERVER_PORT=6080.
    serverPort: numEnv("SERVER_PORT", numEnv("PORT", 6080)),
    maxConcurrentCalls: numEnv("MAX_CONCURRENT_CALLS", 2),
    maxConfirmationCalls: numEnv("MAX_CONFIRMATION_CALLS", 1),
    maxLeadCalls: numEnv("MAX_LEAD_CALLS", 1),
    roomRequeueSeconds: numEnv("ROOM_REQUEUE_SECONDS", 300),
  };
}
