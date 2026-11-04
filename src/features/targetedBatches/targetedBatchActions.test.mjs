import test from "node:test";
import assert from "node:assert/strict";
import { appendUniqueTargetedBatchRows, blockedTargetedBatchReason, getTargetedBatchRowActionState, isTargetedBatchFoundMeterIntent, isTargetedBatchWorkIntent, QA_NAV_BADGE, snapshotTargetedBatchRefs, targetedBatchRefsMatch, TARGETED_BATCH_INTENTS } from "./targetedBatchActions.js";

const row = (refs = {}, count = 0, fieldWorkMeterId = null) => ({ id: "ROW1", salesDocId: "SALE1", allocationStatus: "ALLOCATED", executionStatus: "NOT_STARTED", refs: { erfId: "ERF1", ...refs }, erfNo: "1138", noAccessCount: count, fieldWorkMeterId });

const ACTION_WORDS = ["OPEN AST", "DISCOVER", "PREMISE REQUIRED", "LINKAGE ISSUE", "COMPLETED", "DISCOVERY COMPLETE"];

// TB-R051 (1.3.95): the bottom slot of PREMISE and AST is the QA badge and nothing else.
test("1.3.95 the PREMISE and AST bottom slot is always a QA badge, never an action word", () => {
  const cases = [
    row(),
    row({ premiseId: "P1" }, 2),
    row({ premiseId: "P1", meterId: "A1" }, 2),
    row({ meterId: "A1" }),
    { ...row({ premiseId: "P1", meterId: "A1" }), displayStatus: "COMPLETED" },
    { ...row(), displayStatus: "COMPLETED" },
  ];
  for (const input of cases) {
    const state = getTargetedBatchRowActionState(input);
    for (const tile of [state.premise, state.ast]) {
      assert.ok(["QA NAv", "QA PENDING", "QA PASS", "QA FAIL"].includes(tile.helperText), tile.helperText);
      assert.equal(ACTION_WORDS.includes(tile.helperText), false);
    }
    // NA and ERF are out of QA: no badge at all.
    assert.equal(state.noAccess.helperText, undefined);
    assert.equal(state.erf.helperText, undefined);
  }
});

test("1.3.95 a missing component, or a missing status, reads QA NAv", () => {
  const none = getTargetedBatchRowActionState(row());
  assert.equal(none.premise.helperText, QA_NAV_BADGE);
  assert.equal(none.ast.helperText, QA_NAV_BADGE);

  // A premise and meter linked, but the server has not projected QA yet (ERF 1481 on DEV, 2026-11-04).
  const unprojected = getTargetedBatchRowActionState({ ...row({ premiseId: "P1", meterId: "A1" }), displayStatus: "COMPLETED" });
  assert.equal(unprojected.premise.helperText, QA_NAV_BADGE);
  assert.equal(unprojected.ast.helperText, QA_NAV_BADGE);

  // A status left on a row whose component is not linked is not shown.
  const stale = getTargetedBatchRowActionState({ ...row(), qa: { premiseStatus: "QA_PASS", meterStatus: "QA_FAIL" } });
  assert.equal(stale.premise.helperText, QA_NAV_BADGE);
  assert.equal(stale.ast.helperText, QA_NAV_BADGE);
});

test("1.3.95 PREMISE: 0 captures, QA FAIL corrects, otherwise opens the Premises screen", () => {
  assert.equal(getTargetedBatchRowActionState(row()).premise.intent, TARGETED_BATCH_INTENTS.OPEN_PREMISE);
  assert.equal(getTargetedBatchRowActionState(row()).premise.value, 0);

  for (const [status, badge, intent, tone] of [
    ["QA_PENDING", "QA PENDING", TARGETED_BATCH_INTENTS.OPEN_PREMISE, undefined],
    ["QA_PASS", "QA PASS", TARGETED_BATCH_INTENTS.OPEN_PREMISE, undefined],
    ["QA_FAIL", "QA FAIL", TARGETED_BATCH_INTENTS.CORRECT_PREMISE, "issue"],
  ]) {
    for (const displayStatus of ["IN_PROGRESS", "COMPLETED"]) {
      const state = getTargetedBatchRowActionState({ ...row({ premiseId: "P1" }), displayStatus, qa: { premiseStatus: status } });
      assert.equal(state.premise.value, 1);
      assert.equal(state.premise.helperText, badge);
      assert.equal(state.premise.intent, intent);
      assert.equal(state.premise.tone, tone);
      assert.equal(state.premise.disabled, false);
    }
  }
});

test("1.3.95 AST: 0 starts Meter Discovery (premise first), QA FAIL corrects, otherwise opens the ASTs screen", () => {
  const noPremise = getTargetedBatchRowActionState(row());
  assert.equal(noPremise.ast.value, 0);
  assert.equal(noPremise.ast.intent, TARGETED_BATCH_INTENTS.START_METER_DISCOVERY);
  assert.equal(noPremise.ast.disabled, false);
  assert.equal(noPremise.ast.blocked.title, "Premise first");
  assert.equal(blockedTargetedBatchReason(noPremise, TARGETED_BATCH_INTENTS.START_METER_DISCOVERY).title, "Premise first");

  const withPremise = getTargetedBatchRowActionState(row({ premiseId: "P1" }));
  assert.equal(withPremise.ast.intent, TARGETED_BATCH_INTENTS.START_METER_DISCOVERY);
  assert.equal(withPremise.ast.blocked, null);

  for (const [status, badge, intent, tone] of [
    [undefined, "QA NAv", TARGETED_BATCH_INTENTS.OPEN_AST, undefined],
    ["QA_PENDING", "QA PENDING", TARGETED_BATCH_INTENTS.OPEN_AST, undefined],
    ["QA_PASS", "QA PASS", TARGETED_BATCH_INTENTS.OPEN_AST, undefined],
    ["QA_FAIL", "QA FAIL", TARGETED_BATCH_INTENTS.CORRECT_AST, "issue"],
  ]) {
    const state = getTargetedBatchRowActionState({ ...row({ premiseId: "P1", meterId: "A1" }), displayStatus: "COMPLETED", qa: { meterStatus: status } });
    assert.equal(state.ast.value, 1);
    assert.equal(state.ast.helperText, badge);
    assert.equal(state.ast.intent, intent);
    assert.equal(state.ast.tone, tone);
    assert.equal(state.ast.blocked, null);
  }
});

test("1.3.95 NA is out of QA: available until the meter is Completed, premise first", () => {
  const noPremise = getTargetedBatchRowActionState(row({}, 0));
  assert.equal(noPremise.noAccess.disabled, false);
  assert.equal(noPremise.noAccess.blocked.title, "Premise first");

  for (const displayStatus of ["NOT_STARTED", "IN_PROGRESS"]) {
    const state = getTargetedBatchRowActionState({ ...row({ premiseId: "P1" }, 2), displayStatus, qa: { noAccessStatus: "QA_FAIL" } });
    assert.equal(state.noAccess.value, 2);
    assert.equal(state.noAccess.disabled, false);
    assert.equal(state.noAccess.blocked, null);
    assert.equal(state.noAccess.helperText, undefined);
    assert.equal(state.noAccess.tone, undefined);
  }

  const completed = getTargetedBatchRowActionState({ ...row({ premiseId: "P1", meterId: "A1" }, 2), displayStatus: "COMPLETED" });
  assert.equal(completed.noAccess.disabled, true);
  assert.equal(completed.noAccess.blocked, null);

  // A meter already linked in Sales field work also closes NA.
  assert.equal(getTargetedBatchRowActionState(row({ premiseId: "P1" }, 1, "AST_1")).noAccess.disabled, true);
  assert.equal(getTargetedBatchRowActionState({ ...row({}, 1), fieldWorkMeterId: undefined, raw: { fieldWorkMeterId: "AST_RAW" } }).noAccess.disabled, true);
});

test("NA count defaults safely to zero", () => {
  for (const count of [null, undefined, "not-a-number", -4]) {
    assert.equal(getTargetedBatchRowActionState(row({}, count)).noAccess.value, 0);
  }
});

test("invalid linkage (meter without premise) is flagged and still opens the meter", () => {
  const state = getTargetedBatchRowActionState(row({ meterId: "A1" }));
  assert.equal(state.invalidLinkage, true);
  assert.equal(state.ast.tone, "issue");
  assert.equal(state.ast.intent, TARGETED_BATCH_INTENTS.OPEN_AST);
});

test("TB-R051 1.3.68 a row with no ERF answers the ERF tap instead of doing nothing", () => {
  for (const displayStatus of ["NOT_STARTED", "COMPLETED"]) {
    const state = getTargetedBatchRowActionState({ ...row(), refs: {}, displayStatus });
    assert.equal(state.erf.disabled, false);
    assert.equal(state.erf.blocked.title, "No ERF on this row");
  }
  assert.equal(blockedTargetedBatchReason(null, TARGETED_BATCH_INTENTS.OPEN_ERF), null);
  assert.equal(blockedTargetedBatchReason(getTargetedBatchRowActionState(row()), null), null);
});

test("TB-R051 1.3.42 a Completed meter starts nothing; with nothing linked it is looked up by number", () => {
  for (const refs of [{}, { premiseId: "P1" }, { premiseId: "P1", meterId: "A1" }, { meterId: "A1" }]) {
    const state = getTargetedBatchRowActionState({ ...row(refs, 2, null), displayStatus: "COMPLETED" });
    assert.equal(state.completed, true);
    assert.equal(state.noAccess.disabled, true);
    assert.equal(state.ast.intent, refs.meterId ? TARGETED_BATCH_INTENTS.OPEN_AST : TARGETED_BATCH_INTENTS.OPEN_FOUND_METER);
    assert.equal(state.premise.intent, refs.premiseId ? TARGETED_BATCH_INTENTS.OPEN_PREMISE : TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE);
    for (const tile of [state.premise, state.ast, state.erf]) assert.equal(isTargetedBatchWorkIntent(tile.intent), false);
  }
  // Only the display status completes a row.
  assert.equal(getTargetedBatchRowActionState({ ...row(), executionStatus: "COMPLETED" }).completed, false);
});

test("TB-R051 work intents and found-meter intents", () => {
  assert.equal(isTargetedBatchWorkIntent(TARGETED_BATCH_INTENTS.START_METER_DISCOVERY), true);
  assert.equal(isTargetedBatchWorkIntent(TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS), true);
  for (const intent of ["OPEN_AST", "OPEN_PREMISE", "CORRECT_AST", "CORRECT_PREMISE", "OPEN_ERF", "OPEN_FOUND_METER", "OPEN_FOUND_METER_PREMISE"]) {
    assert.equal(isTargetedBatchWorkIntent(intent), false, intent);
  }
  assert.equal(isTargetedBatchFoundMeterIntent(TARGETED_BATCH_INTENTS.OPEN_FOUND_METER), true);
  assert.equal(isTargetedBatchFoundMeterIntent(TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE), true);
  assert.equal(isTargetedBatchFoundMeterIntent(TARGETED_BATCH_INTENTS.OPEN_AST), false);
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
