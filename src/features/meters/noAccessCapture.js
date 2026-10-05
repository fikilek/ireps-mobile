import { isAppointmentInFuture } from "./noAccessAppointment.js";
import { NO_ACCESS_REASONS, requiresNoAccessPhoto } from "./noAccessReasons.js";
import { NO_ACCESS_APPOINTMENT_RULE_VERSION, isReturnVisitReason, sameNoAccessAgreement, normalizeNoAccessReasonCode } from "./noAccessAppointmentPolicy.js";

const text = (value) => String(value ?? "").trim();
const reference = (value) => text(value) && text(value).toUpperCase() !== "NAV" ? text(value) : "";

export function validateNoAccessCapture(value = {}, media = [], {
  now = Date.now(), originalAccess = null,
} = {}) {
  const errors = {};
  const reason = normalizeNoAccessReasonCode(value.reasonCode);
  if (!NO_ACCESS_REASONS.some((entry) => entry.toUpperCase() === reason.toUpperCase())) {
    errors.reasonCode = "Choose why you could not access the meter.";
  }
  if (reason.toUpperCase() === "OTHER" && !reference(value.reasonOther)) {
    errors.reasonOther = "Type what stopped you reaching the meter.";
  }
  if (requiresNoAccessPhoto(reason) && !(Array.isArray(media) ? media : []).some((item) => item?.tag === "noAccessPhoto" && text(item.url || item.uri))) {
    errors.media = "Take a photograph to support this No Access reason.";
  }
  const returnVisit = isReturnVisitReason(reason);
  if (returnVisit && !value.appointment) {
    errors.appointment = "Choose the date and time agreed for the return visit.";
  }
  if (!returnVisit && value.appointment) {
    errors.appointment = "Only Return visit requested can have an appointment. Change the reason to correct this visit.";
  }
  // An unchanged queued agreement survives late delivery and evidence-only correction.
  const unchanged = sameNoAccessAgreement(value, originalAccess);
  if (returnVisit && value.appointment && !unchanged && !isAppointmentInFuture(value.appointment.at, now)) {
    errors.appointment = "Choose a future date and time for the return visit.";
  }
  return errors;
}

// Keep the picker fresh at minute boundaries and invalidate a new agreement at its exact
// expiry, even with both picker modals closed. Existing saved agreements keep their contract.
export function noAccessValidationDelay(value = {}, originalAccess = null, now = Date.now()) {
  const nextMinute = 60_000 - (now % 60_000);
  const expiry = Date.parse(value.appointment?.at);
  if (!isReturnVisitReason(value.reasonCode) || sameNoAccessAgreement(value, originalAccess) || !Number.isFinite(expiry) || expiry <= now) return nextMinute;
  return Math.min(nextMinute, expiry - now);
}

export function buildNoAccessPayload({ context = {}, trnId, capturedAt, value, media, actor = {}, previousMetadata = {} }) {
  const instructionTrnId = reference(context.instructionTrnId);
  const trnType = text(context.trnType).toUpperCase();
  const other = text(value.reasonCode).toUpperCase() === "OTHER";
  return {
    id: instructionTrnId || trnId,
    ...(instructionTrnId ? { instructionTrnId } : {}),
    meterType: "NA",
    astId: reference(context.astId) || null,
    origin: { ...(context.origin || {}), channel: instructionTrnId ? "OFFICE" : "FIELD" },
    assignment: instructionTrnId ? context.assignment || {} : {},
    media,
    metadata: {
      createdOnDevice: previousMetadata.createdOnDevice || capturedAt,
      createdOnDeviceByUid: previousMetadata.createdOnDeviceByUid || actor.uid || null,
      createdOnDeviceByUser: previousMetadata.createdOnDeviceByUser || actor.name || null,
      updatedOnDevice: capturedAt,
      updatedOnDeviceByUid: actor.uid || null,
      updatedOnDeviceByUser: actor.name || null,
    },
    accessData: {
      trnType,
      erfId: reference(context.erfId),
      erfNo: text(context.erfNo) || "NAv",
      parents: { lmPcode: text(context.lmPcode), wardPcode: text(context.wardPcode) },
      premise: { id: reference(context.premiseId), address: context.premiseAddress || "NAv", propertyType: context.premisePropertyType || "NAv" },
      access: {
        hasAccess: "no",
        reasonCode: other ? "OTHER" : normalizeNoAccessReasonCode(value.reasonCode),
        reasonOther: other ? text(value.reasonOther) : "NAv",
        reason: other ? text(value.reasonOther) : normalizeNoAccessReasonCode(value.reasonCode),
        appointmentRuleVersion: NO_ACCESS_APPOINTMENT_RULE_VERSION,
        appointment: isReturnVisitReason(value.reasonCode) ? value.appointment || null : null,
      },
    },
    ...(context.targetedBatchContext ? { targetedBatchContext: context.targetedBatchContext } : {}),
  };
}

export function noAccessContextFromQueue(item = {}) {
  const payload = item.payload || {};
  const access = payload.accessData || {};
  return {
    trnType: access.trnType || item.formType,
    instructionTrnId: reference(payload.instructionTrnId),
    astId: reference(payload.astId) || reference(payload.ast?.astData?.astId),
    meterNo: item.context?.meterNo || payload.ast?.astData?.astNo || "",
    meterType: item.context?.meterType || payload.meterType,
    erfId: access.erfId,
    erfNo: access.erfNo,
    premiseId: access.premise?.id,
    premiseAddress: access.premise?.address,
    premisePropertyType: access.premise?.propertyType,
    lmPcode: access.parents?.lmPcode,
    wardPcode: access.parents?.wardPcode,
    origin: payload.origin,
    assignment: payload.assignment,
    targetedBatchContext: payload.targetedBatchContext || payload.origin?.targetedBatch,
    returnTo: "/(tabs)/admin/storage/forms-submission-queue",
  };
}
