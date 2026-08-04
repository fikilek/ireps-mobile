import test from "node:test";
import assert from "node:assert/strict";
import { appendUniqueTargetedBatchRows, getTargetedBatchRowActionState, snapshotTargetedBatchRefs, targetedBatchRefsMatch, TARGETED_BATCH_INTENTS } from "./targetedBatchActions.js";

const row = (refs = {}, count = 0, status = "OK") => ({ refs, erfNo: "1138", noAccessCount: count, noAccessSourceStatus: status });

test("State A exposes row values and disables AST/NA", () => {
  const state = getTargetedBatchRowActionState(row());
  assert.equal(state.premise.value, 0); assert.equal(state.ast.value, 0);
  assert.equal(state.ast.disabled, true); assert.equal(state.ast.helperText, "PREMISE REQUIRED");
  assert.equal(state.noAccess.value, 0); assert.equal(state.noAccess.disabled, true);
});

test("State B enables discovery for the exact linked premise", () => {
  const state = getTargetedBatchRowActionState(row({ premiseId: "P1" }, 2));
  assert.equal(state.premise.value, 1); assert.equal(state.ast.value, 0);
  assert.equal(state.ast.disabled, false); assert.equal(state.ast.helperText, "DISCOVER");
  assert.equal(state.ast.intent, TARGETED_BATCH_INTENTS.START_METER_DISCOVERY);
  assert.equal(state.noAccess.value, 2);
});

test("State C opens AST and marks NA discovery complete", () => {
  const state = getTargetedBatchRowActionState(row({ premiseId: "P1", meterId: "A1" }, 2));
  assert.equal(state.ast.value, 1); assert.equal(state.ast.intent, TARGETED_BATCH_INTENTS.OPEN_AST);
  assert.equal(state.noAccess.helperText, "DISCOVERY COMPLETE"); assert.equal(state.noAccess.disabled, true);
});

test("State D reports invalid linkage without inventing a premise", () => {
  const state = getTargetedBatchRowActionState(row({ meterId: "A1" }));
  assert.equal(state.invalidLinkage, true); assert.equal(state.premise.value, 0);
  assert.equal(state.ast.helperText, "LINKAGE ISSUE"); assert.equal(state.noAccess.disabled, true);
});

test("integrity failures display dash semantics and never zero", () => {
  for (const status of ["SALES_DOCUMENT_MISSING", "SALES_DOCUMENT_ID_MISSING", "TB_REFERENCE_MISSING", "FIELDWORK_INVALID"]) {
    const state = getTargetedBatchRowActionState(row({}, null, status));
    assert.equal(state.noAccess.value, null); assert.equal(state.noAccess.helperText, "DATA ISSUE");
  }
});

test("paging appends stably and removes duplicate and invalid IDs", () => {
  assert.deepEqual(appendUniqueTargetedBatchRows([{ id: "1" }, { id: "2" }], [{ id: "2" }, { id: "3" }, {}]).map((item) => item.id), ["1", "2", "3"]);
});

test("reference snapshots detect stale row changes", () => {
  const original = row({ erfId: "E1", premiseId: "P1", meterId: "" });
  const snapshot = snapshotTargetedBatchRefs(original);
  assert.equal(targetedBatchRefsMatch(original, snapshot), true);
  assert.equal(targetedBatchRefsMatch(row({ erfId: "E1", premiseId: "P1", meterId: "A1" }), snapshot), false);
});

