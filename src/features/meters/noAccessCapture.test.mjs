import test from "node:test";
import assert from "node:assert/strict";
import { buildNoAccessPayload, validateNoAccessCapture, noAccessContextFromQueue } from "./noAccessCapture.js";

const value = { reasonCode: "Property Locked", appointment: { at: "2026-10-05T12:00:00.000Z" } };
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
  assert.deepEqual(validateNoAccessCapture(value, media, { now, originalAppointment: value.appointment }), {});
  assert.deepEqual(validateNoAccessCapture({ ...value, appointment: null }, media, { now }), {});
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
  assert.ok(validateNoAccessCapture(pastValue, media, { now, originalAppointment: value.appointment }).appointment);
  assert.deepEqual(validateNoAccessCapture(pastValue, media, { now, originalAppointment: pastAppointment }), {});
  assert.deepEqual(validateNoAccessCapture({ ...value, appointment: null }, media, { now }), {});
});
