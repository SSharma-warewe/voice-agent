export const BATCH_MAX_SIZE = 10;

export const REQUIRED_FIELDS = [
  "appointmentId",
  "patientName",
  "phone",
  "appointmentDate",
  "appointmentTime",
];

export function normalizeAppointment(body) {
  return {
    appointmentId: body.appointmentId,
    patientName: body.patientName,
    phone: body.phone,
    doctorName:
      typeof body.doctorName === "string" ? body.doctorName : "Dr. Smith",
    appointmentDate: body.appointmentDate,
    appointmentTime: body.appointmentTime,
  };
}

export function validateAppointment(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      errorMessage: "appointment must be an object",
    };
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof body[field] !== "string" || body[field].trim() === "") {
      return {
        valid: false,
        field,
        appointmentId:
          typeof body.appointmentId === "string" ? body.appointmentId : undefined,
        errorMessage: `${field} is required`,
      };
    }
  }

  return {
    valid: true,
    appointment: normalizeAppointment(body),
  };
}

export function validateBatchRequest(body) {
  const { appointments } = body ?? {};

  if (!Array.isArray(appointments)) {
    return {
      valid: false,
      errorMessage: "appointments must be an array",
    };
  }

  if (appointments.length === 0) {
    return {
      valid: false,
      errorMessage: "appointments must contain at least 1 item",
    };
  }

  if (appointments.length > BATCH_MAX_SIZE) {
    return {
      valid: false,
      errorMessage: `appointments must contain at most ${BATCH_MAX_SIZE} items`,
    };
  }

  return { valid: true, appointments };
}