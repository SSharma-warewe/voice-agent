import "./load-env.js";
import { createConfirmationRoom } from "@voice-repo/livekit";
import { createCall, getAppointmentById, updateAppointmentCall } from "./db.js";

const appointmentId = "apt_demo_001";

const appointment = await getAppointmentById(appointmentId);
if (!appointment) {
  throw new Error("Appointment not found");
}

console.log("Before:", appointment);

try {
  const roomName = await createConfirmationRoom(appointment);
  console.log("Room created:", roomName);
  await updateAppointmentCall(appointmentId, roomName, "CALLING");
  await createCall({ callId: roomName, appointmentId, roomName, status: "INITIATED" });
  const after = await getAppointmentById(appointmentId);
  console.log("After:", after);
} catch (error) {
  console.error("Failed to create room:", error);
  process.exitCode = 1;
}

process.exit(process.exitCode ?? 0);