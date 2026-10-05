import { readAppointmentParts } from "./noAccessAppointment.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value) => String(value).padStart(2, "0");

function ledgerDateTime(iso) {
  // Canonical capture/appointment values are ISO strings; null must not become 1970.
  if (typeof iso !== "string" || !iso.trim()) return null;
  const parts = readAppointmentParts(iso);
  if (!parts) return null;
  return {
    date: `${pad(parts.day)} ${MONTHS[parts.month - 1]} ${parts.year}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

export function noAccessLedgerDetails(transaction) {
  const metadata = transaction?.metadata || {};
  const visit = ledgerDateTime(metadata.createdOnDevice);
  const appointment = transaction?.accessData?.access?.appointment;
  const agreed = ledgerDateTime(appointment?.at);

  return {
    visitDate: visit?.date || "NAv",
    visitTime: visit?.time || "NAv",
    worker: metadata.createdOnDeviceByUser || metadata.createdByUser || metadata.updatedByUser || "NAv",
    appointment: appointment == null
      ? "No appointment"
      : `Appointment: ${agreed ? `${agreed.date}, ${agreed.time}` : "NAv"}`,
  };
}
