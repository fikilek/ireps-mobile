import test from "node:test";
import assert from "node:assert/strict";
import { amendmentFields, correctionSeed, savedMeter, QA_WORK_BLOCKS } from "./amendmentModel.js";

test("reopening a saved water discovery restores readings without inventing capture metadata", () => {
  const snapshot = { id: "original", meterType: "water", accessData: { trnType: "METER_DISCOVERY", access: { hasAccess: "yes" } },
    ast: { astData: { astNo: "123" } }, mreadings: [{ reading: "12", readingAt: "2026-09-01", trnId: "original", source: "AST_CREATION" }], media: [] };
  const values = correctionSeed(snapshot);
  assert.equal(values.ast.meterReading, "12"); values.ast.meterReading = "13";
  values.metadata = { createdAt: "today" }; values.id = "bad-new-id";
  const fields = amendmentFields(snapshot, values);
  assert.deepEqual(fields.mreadings, [{ ...snapshot.mreadings[0], reading: "13" }]);
  assert.equal(fields.ast.meterReading, undefined); assert.equal(fields.metadata, undefined); assert.equal(fields.id, undefined);
  assert.equal(snapshot.mreadings[0].reading, "12");
});
for (const [type, block] of Object.entries(QA_WORK_BLOCKS)) {
  test(`${type}: only the matching form and common evidence are sent`, () => {
    const snapshot = { accessData: { trnType: type, access: { hasAccess: "yes" } }, ast: { astData: { astNo: "123" } } };
    const fields = amendmentFields(snapshot, { ...snapshot, [block]: { notes: "corrected" }, unknown: { bad: true }, metadata: { createdAt: "today" }, status: { state: "REMOVED" }, media: [{ url: "https://example.invalid/photo" }], fieldComment: { text: "amended" } });
    assert.equal(fields[block].notes, "corrected"); assert.equal(fields.status, undefined); assert.equal(fields.metadata, undefined); assert.equal(fields.unknown, undefined);
  });
}
test("No Access correction normalizes Other and preserves the original appointment and property", () => {
  const access = { hasAccess: "no", reasonCode: "Property Locked", reason: "Property Locked", appointment: null, appointmentRuleVersion: 1 };
  const snapshot = { accessData: { premise: { id: "premise" }, access }, media: [] };
  const result = amendmentFields(snapshot, { media: [], accessData: { premise: { id: "changed" }, access: { reasonCode: "Other", reasonOther: "Dog at gate", appointment: { at: "new-time" } } } });
  assert.equal(result.accessData.premise.id, "premise"); assert.equal(result.accessData.access.reasonCode, "OTHER");
  assert.equal(result.accessData.access.reason, "Dog at gate"); assert.equal(result.accessData.access.appointment, null);
});
test("inspection reference comes from that visit, never the current meter", () => {
  const original = { astData: { astNo: "123", meter: { type: "conventional" } } };
  const context = { meter: { ast: { astData: { astNo: "new" } } }, snapshot: { id: "trn", ast: original,
    inspection: { lastKnown: { ast: original } } } };
  assert.deepEqual(savedMeter(context).ast, original);
});
