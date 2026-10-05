export const RETURN_VISIT_REASON = "Occupant requested a return visit";
export const NO_ACCESS_APPOINTMENT_RULE_VERSION = 2;

const text = (value) => String(value ?? "").trim();
const code = (value) => text(value).toUpperCase();

export const isReturnVisitReason = (value) => code(value) === code(RETURN_VISIT_REASON);

export function sameNoAccessAgreement(value = {}, original) {
  if (!original || code(value.reasonCode) !== code(original.reasonCode)) return false;
  if (code(value.reasonCode) === "OTHER" && text(value.reasonOther) !== text(original.reasonOther)) return false;
  if (!value.appointment || !original.appointment) return !value.appointment && !original.appointment;
  return ["at", "madeAt", "madeByUid", "madeByUser"].every(
    (key) => value.appointment[key] === original.appointment[key],
  );
}

export function isLegacySavedNoAccess(value, originalAccess) {
  return originalAccess != null && originalAccess.appointmentRuleVersion == null &&
    !isReturnVisitReason(originalAccess.reasonCode) && sameNoAccessAgreement(value, originalAccess);
}

export function changeNoAccessReason(value, reasonCode) {
  return {
    ...value,
    reasonCode,
    reasonOther: code(reasonCode) === "OTHER" ? value.reasonOther : "",
    appointment: code(reasonCode) === code(value.reasonCode) ? value.appointment : null,
  };
}
