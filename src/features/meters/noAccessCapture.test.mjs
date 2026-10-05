import test from "node:test";
import assert from "node:assert/strict";
import { buildNoAccessPayload, validateNoAccessCapture, noAccessContextFromQueue } from "./noAccessCapture.js";
import { RETURN_VISIT_REASON, changeNoAccessReason } from "./noAccessAppointmentPolicy.js";
import { NO_ACCESS_REASONS } from "./noAccessReasons.js";

const value = { reasonCode: RETURN_VISIT_REASON, appointment: { at: "2026-10-05T12:00:00.000Z", madeAt: "2026-10-04T10:00:00.000Z" } };
const media = [{ tag: "noAccessPhoto", uri: "file:///durable/photo.jpg" }];
const context = { trnType: "METER_INSPECTION", astId: "AST_1", premiseId: "PRM_1", erfId: "ERF_1", lmPcode: "LM_1", wardPcode: "WARD_1" };
const capturedAt = "2026-10-04T10:00:00.000Z";

test("the actual shared-form payload preserves field inspection identity and appointment", () => {
  const payload = buildNoAccessPayload({ context, trnId: "TRN_MINSP_NA", capturedAt, value, media, actor: { uid: "FWR1", name: "Worker" } });
  assert.equal(payload.id, "TRN_MINSP_NA");
  assert.equal(payload.astId, "AST_1");
  assert.deepEqual(payload.accessData.access.appointment, value.appointment);
  assert.equal(payload.metadata.createdOnDevice, capturedAt);
  assert.deepEqual(payload.assignment, {});
  assert.equal(payload.origin.channel, "FIELD");
  assert.equal(payload.instructionTrnId, undefined);
});

test("office no access completes its original instruction and retains office provenance", () => {
  const assignment = { instruction: { code: "METER_INSPECTION", text: "Inspect" } };
  const payload = buildNoAccessPayload({ context: { ...context, instructionTrnId: "OFFICE_1", assignment }, trnId: "unused", capturedAt, value, media });
  assert.equal(payload.id, "OFFICE_1");
  assert.equal(payload.instructionTrnId, "OFFICE_1");
  assert.equal(payload.origin.channel, "OFFICE");
  assert.deepEqual(payload.assignment, assignment);
  assert.equal(noAccessContextFromQueue({ payload }).instructionTrnId, "OFFICE_1");
});

test("a past appointment is refused at capture, but the original queued agreement survives", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  assert.ok(validateNoAccessCapture(value, media, { now }).appointment);
  assert.deepEqual(validateNoAccessCapture(value, media, { now, originalAccess: { ...value, appointmentRuleVersion: 2 } }), {});
  assert.ok(validateNoAccessCapture({ ...value, appointment: null }, media, { now }).appointment);
});

test("Other requires words and photo evidence is required", () => {
  const errors = validateNoAccessCapture({ reasonCode: "OTHER" }, [], { now: 0 });
  assert.ok(errors.reasonOther);
  assert.ok(errors.media);
});

test("U03: today's 02:00 is refused for a new capture and cannot replace a queued agreement", () => {
  const now = Date.parse("2026-10-05T06:45:00.000Z"); // 08:45 SAST
  const pastAppointment = { at: "2026-10-05T00:00:00.000Z" }; // 02:00 SAST
  const pastValue = { ...value, appointment: pastAppointment };
  assert.ok(validateNoAccessCapture(pastValue, media, { now }).appointment);
  assert.ok(validateNoAccessCapture(pastValue, media, { now, originalAccess: value }).appointment);
  assert.deepEqual(validateNoAccessCapture(pastValue, media, { now, originalAccess: pastValue }), {});
  assert.deepEqual(validateNoAccessCapture({ reasonCode: "Property Locked", appointment: null }, media, { now }), {});
});

const build = (draft, originalAccess = null) => buildNoAccessPayload({ context, trnId: "T", capturedAt, value: draft, originalAccess, media });

test("the dedicated return reason occurs once and every other reason submits without an appointment", () => {
  assert.equal(NO_ACCESS_REASONS.filter((reason) => reason === RETURN_VISIT_REASON).length, 1);
  for (const reasonCode of NO_ACCESS_REASONS.filter((reason) => reason !== RETURN_VISIT_REASON)) {
    const draft = { reasonCode, reasonOther: "Dogs at the gate", appointment: null };
    assert.deepEqual(validateNoAccessCapture(draft, media), {});
    assert.equal(build(draft).accessData.access.appointmentRuleVersion, 2);
    assert.equal(build(draft).accessData.access.appointment, null);
    assert.ok(validateNoAccessCapture({ ...draft, appointment: value.appointment }, media, { now: 0 }).appointment);
  }
});

test("changing reason clears an appointment; switching back requires a fresh choice", () => {
  const locked = changeNoAccessReason(value, "Property Locked");
  assert.equal(locked.appointment, null);
  const again = changeNoAccessReason(locked, RETURN_VISIT_REASON);
  assert.equal(again.appointment, null);
  assert.ok(validateNoAccessCapture(again, media).appointment);
  assert.deepEqual(changeNoAccessReason(value, RETURN_VISIT_REASON), { ...value, reasonOther: "" });
});

test("an incompatible saved appointment stays available for correction and cannot bypass the current rule", () => {
  const legacy = { ...value, reasonCode: "Property Locked" };
  const now = Date.parse("2026-10-10T12:00:00Z");
  assert.ok(validateNoAccessCapture(legacy, media, { now, originalAccess: legacy }).appointment);
  assert.equal(legacy.appointment, value.appointment);
  const noAppointment = { reasonCode: "OTHER", reasonOther: "Call tomorrow", appointment: null };
  assert.equal(build(noAppointment, noAppointment).accessData.access.appointmentRuleVersion, 2);
});

test("editing a legacy agreement adopts the current rule without losing the capture identity or original timestamp", () => {
  const legacy = { ...value, reasonCode: "Property Locked" };
  const changed = changeNoAccessReason(legacy, RETURN_VISIT_REASON);
  assert.ok(validateNoAccessCapture(changed, media, { originalAccess: legacy }).appointment);
  const payload = buildNoAccessPayload({ context, trnId: "SAVED_T", capturedAt, previousMetadata: { createdOnDevice: "2026-10-01T06:00:00Z" }, value: { ...changed, appointment: value.appointment }, originalAccess: legacy, media });
  assert.equal(payload.id, "SAVED_T");
  assert.equal(payload.metadata.createdOnDevice, "2026-10-01T06:00:00Z");
  assert.equal(payload.accessData.access.appointmentRuleVersion, 2);
  const originalOther = { reasonCode: "OTHER", reasonOther: "Dogs", appointment: null };
  assert.equal(build({ ...originalOther, reasonOther: "Locked gate" }, originalOther).accessData.access.appointmentRuleVersion, 2);
});

test("a newly selected time that expires before SEND is rejected by a fresh validation", () => {
  const at = Date.parse(value.appointment.at);
  assert.deepEqual(validateNoAccessCapture(value, media, { now: at - 1 }), {});
  assert.ok(validateNoAccessCapture(value, media, { now: at }).appointment);
});
