// Meter visibility rules MV-R001 section 8 (ireps-rules/logic-rules/meter-visibility-rules.md).
// The same cleaning rule runs on the phone, the back end and the Sales pipeline, so the same
// meter always has the same number.

export const METER_NUMBER_PATTERN = /^[A-Z0-9]+$/;

export const METER_NUMBER_INVALID_MESSAGE =
  "Meter number may only contain letters and digits. Remove dashes, slashes, dots or other symbols.";

// Every space removed (start, middle and end) and capital letters. Any other character is
// kept so the worker sees it and the form refuses it with a message.
export function cleanMeterNumberInput(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function isValidMeterNumber(value) {
  return METER_NUMBER_PATTERN.test(cleanMeterNumberInput(value));
}
