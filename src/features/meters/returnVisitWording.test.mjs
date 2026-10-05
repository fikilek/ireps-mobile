import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNoAccessReasonCode, sameNoAccessAgreement, changeNoAccessReason } from "./noAccessAppointmentPolicy.js";
import { validateNoAccessCapture, buildNoAccessPayload } from "./noAccessCapture.js";

test("renaming a saved reason preserves an unchanged late appointment and original capture", () => {
  const original = { reasonCode: "Occupant requested a return visit", appointment: { at: "2026-10-05T13:00:00Z", madeAt: "2026-10-05T11:00:00Z", madeByUid: "U1", madeByUser: "Worker" } };
  const value = { ...original, reasonCode: normalizeNoAccessReasonCode(original.reasonCode) };
  assert.equal(value.reasonCode, "Return visit requested");
  assert.ok(sameNoAccessAgreement(value, original));
  assert.deepEqual(validateNoAccessCapture(value, [], { now: Date.parse("2026-10-06T15:00:00Z"), originalAccess: original }), {});
  assert.deepEqual(changeNoAccessReason(original, value.reasonCode).appointment, original.appointment);
  const payload = buildNoAccessPayload({ value: original, media: [], previousMetadata: { createdOnDevice: "2026-10-05T11:05:00Z" } });
  assert.equal(payload.accessData.access.reason, "Return visit requested");
  assert.equal(payload.accessData.access.reasonCode, "Return visit requested");
  assert.deepEqual(payload.accessData.access.appointment, original.appointment);
  assert.equal(payload.metadata.createdOnDevice, "2026-10-05T11:05:00Z");
});
