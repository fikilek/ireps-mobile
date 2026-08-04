import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTargetedBatchNoAccessContext,
  buildTargetedBatchNoAccessPayload,
  buildTargetedBatchNoAccessTrnId,
  validateTargetedBatchNoAccessPayload,
} from "./targetedBatchNoAccess.js";

const base = () => buildTargetedBatchNoAccessContext({
  bucket: { id: "TB1", scope: { lmPcode: "LM1", wardPcode: "W1" } },
  row: { id: "R1", salesAllMeterId: "S1", meterNo: "M1", erfNo: "10", refs: { erfId: "E1" } },
});
const evidence = { reason: "LOCKED_GATE", media: [{ tag: "noAccessPhoto", uri: "file://photo.jpg" }], location: { gps: { lat: -26.2, lng: 28.0 }, accuracyM: 5 } };

test("context preserves only required correlation and null premise", () => {
  assert.deepEqual(base(), { sourceModule: "SALES_TARGETED_BATCH", tbId: "TB1", rowId: "R1", salesDocId: "S1", erfId: "E1", premiseId: null, targetedMeterNo: "M1", erfNo: "10", wardPcode: "W1", lmPcode: "LM1", noAccessCount: 0, returnTo: "/(tabs)/admin/operations/my-workorders" });
});
test("context preserves linked premise and rejects missing IDs", () => {
  const context = buildTargetedBatchNoAccessContext({ bucket: { id: "TB1", scope: { lmPcode: "LM1", wardPcode: "W1" } }, row: { id: "R1", salesAllMeterId: "S1", refs: { erfId: "E1", premiseId: "P1" } } });
  assert.equal(context.premiseId, "P1");
  assert.throws(() => buildTargetedBatchNoAccessContext({}), /tbId/);
});
test("TRN IDs use canonical prefix and each explicit attempt is stable", () => {
  const id = buildTargetedBatchNoAccessTrnId({ now: 10, random: 0.5 });
  assert.match(id, /^TRN_MDIS_10_NA_/); assert.equal(id, buildTargetedBatchNoAccessTrnId({ now: 10, random: 0.5 }));
  assert.notEqual(id, buildTargetedBatchNoAccessTrnId({ now: 11, random: 0.5 }));
});
test("validation blocks missing reason, photo and GPS", () => {
  const payload = buildTargetedBatchNoAccessPayload({ context: base(), trnId: "TRN_MDIS_1", capturedAt: "2026-08-04T10:00:00Z", reason: "", media: [], location: null });
  const result = validateTargetedBatchNoAccessPayload(payload);
  assert.equal(result.valid, false); assert.ok(result.errors.reason); assert.ok(result.errors.media); assert.ok(result.errors.location);
});
test("valid pre-premise and premise-linked payloads pass exact contract", () => {
  for (const premiseId of [null, "P1"]) {
    const context = { ...base(), premiseId };
    const payload = buildTargetedBatchNoAccessPayload({ context, trnId: "TRN_MDIS_1", capturedAt: "2026-08-04T10:00:00Z", ...evidence });
    assert.equal(validateTargetedBatchNoAccessPayload(payload).valid, true); assert.equal(payload.premiseId, premiseId);
    assert.deepEqual(Object.keys(payload), ["trnId", "sourceModule", "tbId", "rowId", "salesDocId", "erfId", "premiseId", "capturedAt", "reason", "media", "location"]);
  }
});
