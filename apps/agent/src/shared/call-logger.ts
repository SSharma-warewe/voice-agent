type TranscriptSpeaker = "user" | "agent";

type CallUpdate = {
  status?: string;
  outcome?: string;
  declineReason?: string;
  patientJoinedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
};

export class CallLogger {
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async updateCall(callId: string, update: CallUpdate): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      if (!response.ok) {
        console.error(`Failed to update call ${callId}:`, response.status);
      }
    } catch (error) {
      console.error(`Failed to update call ${callId}:`, error);
    }
  }

  async appendTranscript(
    callId: string,
    segment: { speaker: TranscriptSpeaker; text: string },
  ): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/calls/${callId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(segment),
      });

      if (!response.ok) {
        console.error(`Failed to append transcript for ${callId}:`, response.status);
      }
    } catch (error) {
      console.error(`Failed to append transcript for ${callId}:`, error);
    }
  }

  async markWaiting(callId: string): Promise<void> {
    await this.updateCall(callId, { status: "WAITING" });
  }

  async markInProgress(callId: string): Promise<void> {
    await this.updateCall(callId, {
      status: "IN_PROGRESS",
      patientJoinedAt: new Date().toISOString(),
    });
  }

  async markNoAnswer(callId: string): Promise<void> {
    await this.updateCall(callId, {
      status: "NO_ANSWER",
      endedAt: new Date().toISOString(),
    });
  }

  /** Successful booking / completed conversation (not abandoned). */
  async markCompleted(
    callId: string,
    outcome: string = "COMPLETED",
  ): Promise<void> {
    await this.updateCall(callId, {
      status: "COMPLETED",
      outcome,
      endedAt: new Date().toISOString(),
    });
  }

  /**
   * End the call. If status is still non-terminal, API will treat a bare
   * endedAt as ABANDONED — pass a terminal status when the outcome is known.
   */
  async finalize(
    callId: string,
    opts?: { status?: string; outcome?: string },
  ): Promise<void> {
    await this.updateCall(callId, {
      endedAt: new Date().toISOString(),
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.outcome ? { outcome: opts.outcome } : {}),
    });
  }
}