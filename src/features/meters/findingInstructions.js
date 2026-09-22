// MN-R001 1.2.0: work that follows a finding (a Meter Inspection or a Meter
// Discovery) carries the finding's instruction, filled in and locked, with the
// form it came from. Kept free of app imports so it can be tested on its own.

export const REPLACE_METER_STEP_1 = Object.freeze({
  code: "REPLACE_METER_STEP_1",
  text: "Replace meter – step 1: remove",
});

const FINDING_FORM_NAMES = Object.freeze({
  METER_INSPECTION: "Meter Inspection",
  METER_DISCOVERY: "Meter Discovery",
});

// The instruction each kind of follow-on work carries when a finding started it.
const FINDING_INSTRUCTIONS = Object.freeze({
  METER_DISCONNECTION: Object.freeze({
    code: "ILLEGAL_CONNECTION",
    text: "Illegal Connection",
  }),
  METER_REMOVAL: REPLACE_METER_STEP_1,
});

// "Meter Inspection" / "Meter Discovery", or "" when the parent is not a finding.
export function findingFormName(parentTrnType) {
  return FINDING_FORM_NAMES[String(parentTrnType || "").trim().toUpperCase()] || "";
}

// The locked instruction for work that follows a finding, in the shape the
// forms use for an office instruction.
export function findingInstruction(workTrnType) {
  const base = FINDING_INSTRUCTIONS[String(workTrnType || "").trim().toUpperCase()];
  if (!base) return null;
  return { code: base.code, text: base.text, notes: "", mediaRequired: false };
}

// Replace meter, from any channel: the installation follows the removal.
export function isReplaceMeterInstruction(instruction = {}) {
  if (String(instruction?.code || "").trim().toUpperCase() === REPLACE_METER_STEP_1.code) {
    return true;
  }
  return /^replace meter\b/i.test(String(instruction?.text || "").trim());
}
