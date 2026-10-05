import { readAppointmentParts } from "./noAccessAppointment.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value) => String(value).padStart(2, "0");

const TRANSACTION_LABELS = Object.freeze({
  METER_DISCOVERY: { label: "Meter discovery", icon: "compass-outline" },
  METER_INSTALLATION: { label: "Meter installation", icon: "plus-circle-outline" },
  METER_INSPECTION: { label: "Meter inspection", icon: "clipboard-search-outline" },
  METER_DISCONNECTION: { label: "Meter disconnection", icon: "power-plug-off-outline" },
  METER_RECONNECTION: { label: "Meter reconnection", icon: "power-plug-outline" },
  METER_REMOVAL: { label: "Meter removal", icon: "delete-outline" },
  METER_READING: { label: "Meter reading", icon: "counter" },
  METER_COMMISSIONING: { label: "Meter commissioning", icon: "check-decagram-outline" },
});

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
  const transactionType = String(transaction?.accessData?.trnType || "").trim().toUpperCase();
  const transactionDisplay = TRANSACTION_LABELS[transactionType];

  return {
    transactionLabel: transactionDisplay?.label || "Unknown transaction",
    transactionIcon: transactionDisplay?.icon || "help-circle-outline",
    visitDate: visit?.date || "NAv",
    visitTime: visit?.time || "NAv",
    worker: metadata.createdOnDeviceByUser || metadata.createdByUser || metadata.updatedByUser || "NAv",
    appointment: appointment == null
      ? "No appointment"
      : `Appointment: ${agreed ? `${agreed.date}, ${agreed.time}` : "NAv"}`,
  };
}
