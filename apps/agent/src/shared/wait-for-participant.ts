/**
 * Wait for a non-agent remote participant using JobContext.waitForParticipant
 * (the LiveKit-supported API). The old string-event helper never resolved on
 * @livekit/rtc-node rooms, so agents stayed stuck forever after the user joined.
 */

export interface ParticipantWaiter {
  waitForParticipant(identity?: string): Promise<{ identity: string }>;
}

// Align with LiveKit emptyTimeout + worker ROOM_REQUEUE_SECONDS (default 5 min).
const DEFAULT_TIMEOUT_MS = Number(
  process.env.ROOM_REQUEUE_SECONDS
    ? Number(process.env.ROOM_REQUEUE_SECONDS) * 1000
    : 5 * 60 * 1000,
);

export async function waitForCaller(
  ctx: ParticipantWaiter,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ identity: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      ctx.waitForParticipant(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Timed out waiting for patient/caller to join the room"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
