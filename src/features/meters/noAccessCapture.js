import { isAppointmentInFuture } from "./noAccessAppointment.js";
import { NO_ACCESS_REASONS } from "./noAccessReasons.js";

const text = (value) => String(value ?? "").trim();
const reference = (value) => text(value) && text(value).toUpperCase() !== "NAV" ? text(value) : "";

export function validateNoAccessCapture(value = {}, media = [], {
  now = Date.now(), originalAppointment = null,
} = {}) {
  const errors = {};
  const reason = text(value.reasonCode);
  if (!NO_ACCESS_REASONS.some((entry) => entry.toUpperCase() === reason.toUpperCase())) {
    errors.reason = "Choose why you could not touch the meter.";
  }
  if (reason.toUpperCase() === "OTHER" && !reference(value.reasonOther)) {
    errors.reasonOther = "Type what stopped you reaching the meter.";
  }
  if (!media.some((item) => item?.tag === "noAccessPhoto" && text(item.url || item.uri))) {
    errors.media = "A No Access needs one photograph.";
  }
  // A queued appointment is the agreement made on the original visit, even after it passes.
  const unchanged = originalAppointment?.at && value.appointment?.at === originalAppointment.at;
  if (value.appointment && !unchanged && !isAppointmentInFuture(value.appointment.at, now)) {
    errors.appointment = "Choose an appointment in the future, or remove it.";
  }
  return errors;
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
        reasonCode: other ? "OTHER" : text(value.reasonCode),
        reasonOther: other ? text(value.reasonOther) : "NAv",
        reason: other ? text(value.reasonOther) : text(value.reasonCode),
        appointment: value.appointment || null,
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
