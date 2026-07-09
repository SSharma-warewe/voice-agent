import { neon } from "@neondatabase/serverless";
import { getConfig } from "../../config/env.ts";

const { databaseUrl } = getConfig();

const rawSql = neon(databaseUrl);

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 120;

function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as {
    message?: string;
    code?: string | number;
    cause?: unknown;
  };
  const msg = String(err.message ?? error).toLowerCase();
  const causeMsg =
    err.cause && typeof err.cause === "object" && "message" in err.cause
      ? String((err.cause as { message?: string }).message ?? "").toLowerCase()
      : "";
  const code = String(err.code ?? "");
  const combined = `${msg} ${causeMsg}`;

  return (
    combined.includes("fetch failed") ||
    combined.includes("network") ||
    combined.includes("econnreset") ||
    combined.includes("econnrefused") ||
    combined.includes("etimedout") ||
    combined.includes("socket hang up") ||
    combined.includes("connection terminated") ||
    combined.includes("connection reset") ||
    combined.includes("server closed the connection") ||
    combined.includes("too many connections") ||
    combined.includes("remaining connection slots") ||
    combined.includes("cannot connect now") ||
    combined.includes("timeout") ||
    combined.includes("temporar") ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET" ||
    // Postgres SQLSTATE for connection problems
    code === "08000" ||
    code === "08001" ||
    code === "08003" ||
    code === "08004" ||
    code === "08006" ||
    code === "57P01" ||
    code === "57P03"
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS || !isTransientDbError(error)) {
        throw error;
      }

      const delay =
        BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 80);
      console.warn(
        `[db] transient error (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Neon serverless SQL client (tagged-template queries) with retries for
 * cold-start / network flakiness common on Neon HTTP connections.
 */
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  withRetry(() =>
    (rawSql as (...args: unknown[]) => Promise<unknown>)(strings, ...values),
  )) as typeof rawSql;
