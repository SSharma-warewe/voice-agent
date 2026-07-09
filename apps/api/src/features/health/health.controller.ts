import type { Request, Response } from "express";
import { sql } from "../../shared/db/client.ts";

/** Liveness — process is up (used by boot probes / load balancers). */
export function getHealth(_req: Request, res: Response): void {
  res.json({ status: "ok" });
}

/**
 * Readiness — can reach the database. Useful for debugging intermittent
 * Neon cold-start / connection issues without hammering product endpoints.
 */
export async function getReady(_req: Request, res: Response): Promise<void> {
  try {
    await sql`SELECT 1 AS ok`;
    res.json({ status: "ready", database: "ok" });
  } catch (error) {
    console.error(
      "Readiness check failed:",
      error instanceof Error ? error.message : error,
    );
    res.status(503).json({
      status: "not_ready",
      database: "error",
      errorMessage:
        error instanceof Error ? error.message : "Database unreachable",
    });
  }
}
