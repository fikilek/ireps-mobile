import { RETURN_VISIT_REASON, isReturnVisitReason } from "./noAccessAppointmentPolicy.js";

export const NO_ACCESS_REASONS = Object.freeze([
  "Property Locked",
  "Access Refused by Occupant",
  "Unsafe / Dangerous Environment",
  "Meter Box Inaccessible",
  "Meter Obstructed",
  "Property Demolished",
  "Property Vacant",
  RETURN_VISIT_REASON,
  "Other",
]);

// No evidence is requested until the reason is known. A return visit needs an agreement.
export function requiresNoAccessPhoto(reasonCode) {
  return NO_ACCESS_REASONS.some((reason) => reason.toUpperCase() === String(reasonCode || "").trim().toUpperCase()) &&
    !isReturnVisitReason(reasonCode);
}

export function isCompleteNoAccessReason(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const code = String(value?.code || value?.label || "").trim();

    if (!code) return false;
    if (code.toUpperCase() !== "OTHER") return true;

    return Boolean(String(value?.otherText || "").trim());
  }

  const text = String(value || "").trim();

  if (!text) return false;
  if (/^other(?:\s*:)?\s*$/i.test(text)) return false;

  return true;
}

// No Access rules NA-R003 (1.2.0) — the ONE list of transaction types that can end in a no
// access. Adding another is one line here and nothing else, which is the test the design has
// to pass.
//
// There is no transaction type called "Targeted Batch No Access". A targeted batch is the
// route that takes a worker to an ERF; after that the work is an ordinary Meter Discovery.
// Meter Commissioning is not here either: it always records access.
export const NO_ACCESS_TRN_TYPES = Object.freeze([
  "METER_DISCOVERY",
  "METER_INSTALLATION",
  "METER_INSPECTION",
  "METER_DISCONNECTION",
  "METER_RECONNECTION",
  "METER_READING",
  "METER_REMOVAL",
]);

export function canEndInNoAccess(trnType) {
  return NO_ACCESS_TRN_TYPES.includes(String(trnType || "").trim().toUpperCase());
}

/**
 * NA-R010 — a return visit needs an appointment; every other reason needs a photograph.
 */
export function isCompleteNoAccess(value = {}, media = []) {
  const code = String(value?.reasonCode || "").trim();
  if (!code) return false;

  if (code.toUpperCase() === "OTHER" && !String(value?.reasonOther || "").trim()) {
    return false;
  }

  if (isReturnVisitReason(code)) return Boolean(value.appointment?.at);
  if (!requiresNoAccessPhoto(code) || value.appointment) return false;

  return (Array.isArray(media) ? media : []).some(
    (item) => item?.tag === "noAccessPhoto" && String(item?.url || item?.uri || "").trim(),
  );
}
