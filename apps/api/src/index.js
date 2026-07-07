import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createParticipantToken } from "@voice-repo/livekit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const {
  initDb,
  saveAppointment,
  listAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  listCalls,
  getCallById,
  getCallByAppointmentId,
  getCallStats,
  updateCall,
  appendTranscriptSegment,
  finalizeCallForAppointment,
  markCallAbandoned,
} = await import("./db.js");
const { validateAppointment, validateBatchRequest } = await import(
  "./appointment-validation.js"
);

const TERMINAL_STATUSES = new Set(["CONFIRMED", "DECLINED", "RESCHEDULED"]);

const SERVER_PORT = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 6080);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/appointments", async (_req, res) => {
  try {
    const appointments = await listAppointments();
    res.json({ appointments });
  } catch (error) {
    console.error("Failed to list appointments:", error);
    res.status(500).json({ errorMessage: "Failed to list appointments" });
  }
});

app.post("/appointments/batch", async (req, res) => {
  const batchValidation = validateBatchRequest(req.body);

  if (!batchValidation.valid) {
    res.status(400).json({ errorMessage: batchValidation.errorMessage });
    return;
  }

  const seenIds = new Set();
  const results = [];

  for (let index = 0; index < batchValidation.appointments.length; index += 1) {
    const item = batchValidation.appointments[index];
    const validation = validateAppointment(item);

    if (!validation.valid) {
      results.push({
        index,
        status: "failed",
        appointmentId: validation.appointmentId,
        errorMessage: validation.errorMessage,
      });
      continue;
    }

    const { appointmentId } = validation.appointment;

    if (seenIds.has(appointmentId)) {
      results.push({
        index,
        status: "failed",
        appointmentId,
        errorMessage: "duplicate appointmentId in batch",
      });
      continue;
    }

    seenIds.add(appointmentId);

    try {
      const saved = await saveAppointment(validation.appointment);
      results.push({
        index,
        status: "saved",
        appointment: saved,
      });
    } catch (error) {
      if (error.code === "23505") {
        results.push({
          index,
          status: "failed",
          appointmentId,
          errorMessage: "An appointment with this ID already exists",
        });
        continue;
      }

      console.error(`Failed to save appointment at index ${index}:`, error);
      results.push({
        index,
        status: "failed",
        appointmentId,
        errorMessage: "Failed to save appointment",
      });
    }
  }

  const saved = results.filter((result) => result.status === "saved").length;
  const failed = results.length - saved;

  console.log(`Batch appointments processed: ${saved} saved, ${failed} failed`);

  res.status(failed === 0 ? 201 : 200).json({
    received: true,
    count: results.length,
    saved,
    failed,
    results,
  });
});

app.get("/appointments/:appointmentId", async (req, res) => {
  try {
    const appointment = await getAppointmentById(req.params.appointmentId);

    if (!appointment) {
      res.status(404).json({ errorMessage: "Appointment not found" });
      return;
    }

    res.json({ appointment });
  } catch (error) {
    console.error("Failed to get appointment:", error);
    res.status(500).json({ errorMessage: "Failed to get appointment" });
  }
});

app.patch("/appointments/:appointmentId/status", async (req, res) => {
  try {
    const { status, appointmentDate, appointmentTime, declineReason } = req.body;

    if (!TERMINAL_STATUSES.has(status)) {
      res.status(400).json({
        errorMessage: "status must be CONFIRMED, DECLINED, or RESCHEDULED",
      });
      return;
    }

    if (
      status === "RESCHEDULED" &&
      (typeof appointmentDate !== "string" || typeof appointmentTime !== "string")
    ) {
      res.status(400).json({
        errorMessage: "appointmentDate and appointmentTime are required for RESCHEDULED",
      });
      return;
    }

    const appointment = await updateAppointmentStatus(req.params.appointmentId, {
      status,
      appointmentDate,
      appointmentTime,
      declineReason,
    });

    if (!appointment) {
      res.status(404).json({ errorMessage: "Appointment not found" });
      return;
    }

    await finalizeCallForAppointment(req.params.appointmentId, {
      outcome: status,
      declineReason,
    });

    console.log("Appointment status updated:", appointment);
    res.json({ appointment });
  } catch (error) {
    console.error("Failed to update appointment status:", error);
    res.status(500).json({ errorMessage: "Failed to update appointment status" });
  }
});

app.post("/appointments/:appointmentId/join", async (req, res) => {
  try {
    const appointment = await getAppointmentById(req.params.appointmentId);

    if (!appointment) {
      res.status(404).json({ errorMessage: "Appointment not found" });
      return;
    }

    if (!appointment.livekitRoomName) {
      res.status(409).json({
        errorMessage: "No active call room for this appointment yet",
      });
      return;
    }

    const join = await createParticipantToken({
      roomName: appointment.livekitRoomName,
      identity: `patient-${appointment.appointmentId}`,
      name: appointment.patientName,
    });

    await updateCall(appointment.livekitRoomName, {
      status: "IN_PROGRESS",
      patientJoinedAt: new Date().toISOString(),
    });

    res.json({
      ...join,
      appointment,
    });
  } catch (error) {
    console.error("Failed to create join token:", error);
    res.status(500).json({ errorMessage: "Failed to create join token" });
  }
});

app.get("/calls", async (_req, res) => {
  try {
    const calls = await listCalls();
    res.json({ calls });
  } catch (error) {
    console.error("Failed to list calls:", error);
    res.status(500).json({ errorMessage: "Failed to list calls" });
  }
});

app.get("/calls/stats", async (_req, res) => {
  try {
    const stats = await getCallStats();
    res.json({ stats });
  } catch (error) {
    console.error("Failed to get call stats:", error);
    res.status(500).json({ errorMessage: "Failed to get call stats" });
  }
});

app.get("/calls/:callId", async (req, res) => {
  try {
    const call = await getCallById(req.params.callId);

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to get call:", error);
    res.status(500).json({ errorMessage: "Failed to get call" });
  }
});

app.patch("/calls/:callId", async (req, res) => {
  try {
    const { status, outcome, declineReason, patientJoinedAt, endedAt, durationSeconds } =
      req.body;

    const call = await updateCall(req.params.callId, {
      status,
      outcome,
      declineReason,
      patientJoinedAt,
      endedAt,
      durationSeconds,
    });

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to update call:", error);
    res.status(500).json({ errorMessage: "Failed to update call" });
  }
});

app.post("/calls/:callId/transcript", async (req, res) => {
  try {
    const { speaker, text, at } = req.body;

    if (typeof speaker !== "string" || typeof text !== "string" || text.trim() === "") {
      res.status(400).json({ errorMessage: "speaker and text are required" });
      return;
    }

    const call = await appendTranscriptSegment(req.params.callId, {
      speaker,
      text: text.trim(),
      at,
    });

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to append transcript:", error);
    res.status(500).json({ errorMessage: "Failed to append transcript" });
  }
});

app.post("/calls/:callId/abandon", async (req, res) => {
  try {
    const call = await markCallAbandoned(req.params.callId);

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to mark call abandoned:", error);
    res.status(500).json({ errorMessage: "Failed to mark call abandoned" });
  }
});

app.get("/appointments/:appointmentId/call", async (req, res) => {
  try {
    const call = await getCallByAppointmentId(req.params.appointmentId);

    if (!call) {
      res.status(404).json({ errorMessage: "Call not found for appointment" });
      return;
    }

    res.json({ call });
  } catch (error) {
    console.error("Failed to get appointment call:", error);
    res.status(500).json({ errorMessage: "Failed to get appointment call" });
  }
});

app.post("/appointments", async (req, res) => {
  const validation = validateAppointment(req.body);

  if (!validation.valid) {
    res.status(400).json({
      errorMessage: validation.errorMessage,
    });
    return;
  }

  try {
    const saved = await saveAppointment(validation.appointment);
    console.log("Appointment saved:", saved);
    res.status(201).json({ received: true, appointment: saved });
  } catch (error) {
    if (error.code === "23505") {
      res.status(409).json({
        errorMessage: "An appointment with this ID already exists",
      });
      return;
    }

    console.error("Failed to save appointment:", error);
    res.status(500).json({ errorMessage: "Failed to save appointment" });
  }
});

await initDb();

app.listen(SERVER_PORT, "0.0.0.0", () => {
  console.log(`API server running on http://0.0.0.0:${SERVER_PORT}`);
});