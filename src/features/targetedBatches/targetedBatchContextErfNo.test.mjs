// No Access rules NA-R043 — the batch row knows its ERF, and the record carries both parts.
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTargetedBatchContextFromRow,
  normalizeTargetedBatchContext,
} from "../premises/targetedBatchPremiseContext.js";

const ROW = {
  id: "TBR_20260809_030009_WFIL_000001",
  tbId: "TGB_20260809_030009_WFIL",
  salesDocId: "07027981971",
  erfId: "K241N0GT030900000654000000",
  erfNo: "5214",
  meterNo: "04297750491",
  refs: { premiseId: null },
};

test("NA-R043: a row hands over its ERF id and its ERF number", () => {
  const context = buildTargetedBatchContextFromRow({ row: ROW, bucket: { id: ROW.tbId } });
  assert.equal(context.erfId, "K241N0GT030900000654000000");
  assert.equal(context.erfNo, "5214");
});

test("a row with no premise yet hands over no premise, and that is correct", () => {
  const context = buildTargetedBatchContextFromRow({ row: ROW, bucket: { id: ROW.tbId } });
  assert.equal(context.premiseId, null);
});

test("the ERF number survives being carried through the normaliser", () => {
  const context = buildTargetedBatchContextFromRow({ row: ROW, bucket: { id: ROW.tbId } });
  assert.equal(normalizeTargetedBatchContext(context).erfNo, "5214");
});

test("a row with no ERF number still hands over its ERF id, which is the requirement", () => {
  const context = buildTargetedBatchContextFromRow({
    row: { ...ROW, erfNo: undefined },
    bucket: { id: ROW.tbId },
  });
  assert.equal(context.erfId, "K241N0GT030900000654000000");
  assert.equal(context.erfNo, null);
});
