import "./load-env.ts";

import { createConfirmationRoom } from "@voice-repo/livekit";

import {
  createCall,
  getAppointmentById,
  getPool,
  updateAppointmentCall,
} from "./db.ts";

const appointmentId = "apt_demo_001";

await getPool().query(
  `
    UPDATE appointments
    SET status = 'PENDING', livekit_room_name = NULL
    WHERE appointment_id = $1
  `,
  [appointmentId],
);

const appointment = await getAppointmentById(appointmentId);
console.log("Reset demo appointment:", appointment);

if (!appointment) {
  throw new Error(`Appointment ${appointmentId} not found`);
}

const roomName = await createConfirmationRoom(appointment);
await updateAppointmentCall(appointmentId, roomName, "CALLING");
await createCall({
  callId: roomName,
  appointmentId,
  roomName,
  status: "INITIATED",
});

const ready = await getAppointmentById(appointmentId);
console.log("Demo call ready:", ready);
process.exit(0);
