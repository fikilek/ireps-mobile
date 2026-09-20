import test from "node:test";
import assert from "node:assert/strict";
import { appendUniqueTargetedBatchRows, getTargetedBatchRowActionState, isTargetedBatchFoundMeterIntent, isTargetedBatchWorkIntent, snapshotTargetedBatchRefs, targetedBatchRefsMatch, TARGETED_BATCH_INTENTS } from "./targetedBatchActions.js";

const row = (refs = {}, count = 0, fieldWorkMeterId = null) => ({ id: "ROW1", salesDocId: "SALE1", allocationStatus: "ALLOCATED", executionStatus: "NOT_STARTED", refs: { erfId: "ERF1", ...refs }, erfNo: "1138", noAccessCount: count, fieldWorkMeterId });

test("State A exposes row values, disables AST, and enables pre-premise NA", () => {
  const state = getTargetedBatchRowActionState(row());
  assert.equal(state.premise.value, 0); assert.equal(state.ast.value, 0);
  assert.equal(state.ast.disabled, true); assert.equal(state.ast.helperText, "PREMISE REQUIRED");
  assert.equal(state.noAccess.value, 0); assert.equal(state.noAccess.disabled, false);
});

test("State B enables discovery for the exact linked premise", () => {
  const state = getTargetedBatchRowActionState(row({ premiseId: "P1" }, 2));
  assert.equal(state.premise.value, 1); assert.equal(state.ast.value, 0);
  assert.equal(state.ast.disabled, false); assert.equal(state.ast.helperText, "DISCOVER");
  assert.equal(state.ast.intent, TARGETED_BATCH_INTENTS.START_METER_DISCOVERY);
  assert.equal(state.noAccess.value, 2);
  assert.equal(state.noAccess.disabled, false);
});

test("State C opens AST without disabling NA when Sales fieldWork meterId is null", () => {
  const state = getTargetedBatchRowActionState(row({ premiseId: "P1", meterId: "A1" }, 2));
  assert.equal(state.ast.value, 1); assert.equal(state.ast.intent, TARGETED_BATCH_INTENTS.OPEN_AST);
  assert.equal(state.noAccess.helperText, null); assert.equal(state.noAccess.disabled, false);
});

test("State D reports invalid row linkage without changing the NA rule", () => {
  const state = getTargetedBatchRowActionState(row({ meterId: "A1" }));
  assert.equal(state.invalidLinkage, true); assert.equal(state.premise.value, 0);
  assert.equal(state.ast.helperText, "LINKAGE ISSUE"); assert.equal(state.noAccess.disabled, false);
});

test("NA is disabled only when Sales fieldWork meterId has a value", () => {
  for (const fieldWorkMeterId of [null, undefined, "", "   "]) {
    const state = getTargetedBatchRowActionState(row({}, 3, fieldWorkMeterId));
    assert.equal(state.noAccess.value, 3);
    assert.equal(state.noAccess.disabled, false);
    assert.equal(state.noAccess.helperText, null);
  }

  const linked = getTargetedBatchRowActionState(row({}, 3, "AST_001"));
  assert.equal(linked.noAccess.value, 3);
  assert.equal(linked.noAccess.disabled, true);
  assert.equal(linked.noAccess.helperText, "DISCOVERY COMPLETE");
});

test("NA reads fieldWork meterId from the normalized row raw fallback", () => {
  const state = getTargetedBatchRowActionState({
    ...row({}, 2),
    fieldWorkMeterId: undefined,
    raw: { fieldWorkMeterId: "AST_RAW_001" },
  });
  assert.equal(state.noAccess.value, 2);
  assert.equal(state.noAccess.disabled, true);
  assert.equal(state.noAccess.helperText, "DISCOVERY COMPLETE");
});

test("NA count defaults safely to zero", () => {
  for (const count of [null, undefined, "not-a-number", -4]) {
    const state = getTargetedBatchRowActionState(row({}, count));
    assert.equal(state.noAccess.value, 0);
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

test("TB-R051 1.3.42 a Completed meter opens its meter, premise and ERF, but No Access stays disabled", () => {
  for (const refs of [{}, { premiseId: "P1" }, { premiseId: "P1", meterId: "A1" }, { meterId: "A1" }]) {
    const state = getTargetedBatchRowActionState({ ...row(refs, 2, null), displayStatus: "COMPLETED" });
    assert.equal(state.completed, true);
    assert.equal(state.premise.disabled, false);
    assert.equal(state.ast.disabled, false);
    assert.equal(state.erf.disabled, false);
    assert.equal(state.noAccess.disabled, true);
    assert.equal(state.noAccess.helperText, "COMPLETED");
    assert.equal(state.ast.helperText, "OPEN AST");
    assert.equal(state.premise.value, refs.premiseId ? 1 : 0);
    assert.equal(state.ast.value, refs.meterId ? 1 : 0);
    assert.equal(state.noAccess.value, 2);
    assert.equal(state.erf.value, "1138");
    // A linked meter or premise opens directly; with none linked, the meter is looked up by its meter number.
    assert.equal(state.ast.intent, refs.meterId ? TARGETED_BATCH_INTENTS.OPEN_AST : TARGETED_BATCH_INTENTS.OPEN_FOUND_METER);
    assert.equal(state.premise.intent, refs.premiseId ? TARGETED_BATCH_INTENTS.OPEN_PREMISE : TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE);
    // Nothing on a Completed meter starts work.
    for (const tile of [state.premise, state.ast, state.erf]) assert.equal(isTargetedBatchWorkIntent(tile.intent), false);
  }
  // A Completed row without its ERF link cannot open the ERF, like any row.
  const noErf = getTargetedBatchRowActionState({ ...row(), refs: {}, displayStatus: "COMPLETED" });
  assert.equal(noErf.erf.disabled, true);
});

test("TB-R051 1.3.42 a VISIBLE meter whose row is not completed is Completed through its display status", () => {
  const state = getTargetedBatchRowActionState({ ...row({ premiseId: "P1" }), executionStatus: "IN_PROGRESS", salesVisibility: "VISIBLE", displayStatus: "COMPLETED" });
  assert.equal(state.completed, true);
  assert.equal(state.ast.disabled, false);
  assert.equal(state.ast.intent, TARGETED_BATCH_INTENTS.OPEN_FOUND_METER);
  assert.equal(state.noAccess.disabled, true);
});

test("TB-R051 1.3.42 work intents and found-meter intents", () => {
  assert.equal(isTargetedBatchWorkIntent(TARGETED_BATCH_INTENTS.START_METER_DISCOVERY), true);
  assert.equal(isTargetedBatchWorkIntent(TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS), true);
  for (const intent of ["OPEN_AST", "OPEN_PREMISE", "OPEN_ERF", "OPEN_FOUND_METER", "OPEN_FOUND_METER_PREMISE"]) {
    assert.equal(isTargetedBatchWorkIntent(intent), false, intent);
  }
  assert.equal(isTargetedBatchFoundMeterIntent(TARGETED_BATCH_INTENTS.OPEN_FOUND_METER), true);
  assert.equal(isTargetedBatchFoundMeterIntent(TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE), true);
  assert.equal(isTargetedBatchFoundMeterIntent(TARGETED_BATCH_INTENTS.OPEN_AST), false);
});

test("TB-R051 open meters keep the existing button rules and are not locked", () => {
  for (const displayStatus of [undefined, null, "", "NOT_STARTED", "IN_PROGRESS"]) {
    const state = getTargetedBatchRowActionState({ ...row({ premiseId: "P1" }, 1), displayStatus });
    assert.equal(state.completed, false);
    assert.equal(state.premise.disabled, false);
    assert.equal(state.premise.helperText, undefined);
    assert.equal(state.ast.disabled, false);
    assert.equal(state.ast.helperText, "DISCOVER");
    assert.equal(state.noAccess.disabled, false);
    assert.equal(state.noAccess.helperText, null);
    assert.equal(state.erf.disabled, false);
    assert.equal(state.erf.helperText, undefined);
  }
  // Only the display status locks; a raw executionStatus alone does not (the row API derives displayStatus).
  assert.equal(getTargetedBatchRowActionState({ ...row(), executionStatus: "COMPLETED" }).completed, false);
});
