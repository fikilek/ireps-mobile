import { normalizeNoAccessReasonCode } from "../meters/noAccessAppointmentPolicy.js";
export const QA_WORK_BLOCKS = { METER_DISCOVERY: "discovery", METER_INSTALLATION: "installation", METER_COMMISSIONING: "commissioning", METER_DISCONNECTION: "disconnection", METER_RECONNECTION: "reconnection", METER_REMOVAL: "removal", METER_READING: "meterReading", METER_INSPECTION: "inspection" };
const clone = value => JSON.parse(JSON.stringify(value));
const immutable = /^(astId|astNo|meterNo|premiseId|erfId|trnId|sourceAstId|replacedAstId|replacementAstId|followUp|previous.*|baseline|lastKnown|comparison|executionOutcome|completedAt|readingAt|capturedAt|inspectedAt|metadata|created|updated)$/;
function preserveCapturedFacts(original, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = { ...(original || {}), ...value };
  for (const key of Object.keys(result)) {
    if (immutable.test(key)) {
      if (original?.[key] === undefined) delete result[key]; else result[key] = clone(original[key]);
    } else if (value[key] && typeof value[key] === "object" && !Array.isArray(value[key])) result[key] = preserveCapturedFacts(original?.[key], value[key]);
  }
  return result;
}
export function correctionSeed(snapshot) {
  const seed = clone(snapshot);
  if (seed.meterType === "water" && seed.ast && ["METER_DISCOVERY", "METER_INSTALLATION"].includes(seed.accessData?.trnType)) {
    seed.ast.meterReading ??= seed.mreadings?.[0]?.reading || "";
    seed.ast.tokenReading ??= seed.treadings?.[0]?.tokenReading || "";
  }
  return seed;
}

// Send only the form fields. Metadata, ownership, identity, assignment and the
// completed visit remain under server control. No new capture is originated.
export function amendmentFields(snapshot, values) {
  const fields = { media: clone(values.media || []) };
  if (snapshot.accessData?.access?.hasAccess === "no") {
    const input = values.accessData.access;
    const other = String(input.reasonCode).trim().toUpperCase() === "OTHER";
    const reasonCode = other ? "OTHER" : normalizeNoAccessReasonCode(input.reasonCode);
    fields.accessData = { ...snapshot.accessData, access: { ...snapshot.accessData.access,
      reasonCode, reasonOther: other ? String(input.reasonOther || "").trim() : "NAv",
      reason: other ? String(input.reasonOther || "").trim() : reasonCode } };
    return fields;
  }
  for (const key of ["ast", "fieldComment", QA_WORK_BLOCKS[snapshot.accessData?.trnType]]) {
    if (key && values[key] !== undefined) fields[key] = preserveCapturedFacts(snapshot[key], clone(values[key]));
  }
  if (["METER_DISCOVERY", "METER_INSTALLATION"].includes(snapshot.accessData?.trnType) && snapshot.meterType === "water") {
    for (const [key, formKey, valueKey] of [["mreadings", "meterReading", "reading"], ["treadings", "tokenReading", "tokenReading"]]) {
      if (snapshot[key]?.length && values.ast?.[formKey] !== undefined) fields[key] = snapshot[key].map((row, index) => index ? clone(row) : { ...row, [valueKey]: String(values.ast[formKey]).trim() });
      if (!(formKey in (snapshot.ast || {}))) delete fields.ast?.[formKey];
    }
  }
  return fields;
}

export function correctionParams(context) {
  const trn = context.snapshot;
  const astId = trn.ast?.astData?.astId || trn.id;
  return { trnId: trn.id, astId, sourceAstId: astId, premiseId: trn.accessData?.premise?.id || "",
    instructionTrnId: trn.origin?.channel === "OFFICE" ? trn.id : "",
    action: JSON.stringify({ ...trn, raw: trn, access: trn.accessData?.access?.hasAccess, meterType: trn.meterType, sourceAstId: astId }) };
}

export function savedMeter(context) {
  const trn = context.snapshot;
  const outcome = trn.executionOutcome || {};
  return { ...trn, id: trn.ast?.astData?.astId || trn.id,
    // Inspection's reference is its preserved last-known snapshot, not today's meter.
    ...(trn.inspection?.lastKnown || {}), ast: trn.inspection?.lastKnown?.ast || trn.ast,
    ...(trn.accessData?.trnType === "METER_READING" ? { mreadings: outcome.previousReading == null ? [] : [{ reading: String(outcome.previousReading), readingAt: outcome.previousReadingAt,
      trnId: outcome.previousReadingTrnId, source: "ORIGINAL_BASELINE" }] } : {}) };
}
