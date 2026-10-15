// A deleted job is not on the worker's phone, and work taken off him does not
// cost him his photographs. `DR-R001` 5.5, 5.6.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isDeletedWork, withoutDeletedWork } from "./deletedWork.js";
import {
  instructionState,
  isLifecycleInstructionLocked,
} from "../workOrders/instructionLock.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the bin is read from the transaction and from the meter's marker", () => {
  // A cached record may carry one and not the other, and either saying so is
  // enough to keep it off his screen.
  assert.equal(isDeletedWork({ workflow: { state: "DELETED" } }), true);
  assert.equal(isDeletedWork({ workflowState: "deleted" }), true);
  assert.equal(isDeletedWork({ trnActiveLifecycle: { workflowState: "DELETED" } }), true);

  for (const live of ["ISSUED", "ACCEPTED", "COMPLETED", "CREATED", "REJECTED", ""]) {
    assert.equal(isDeletedWork({ workflow: { state: live } }), false, live);
  }

  assert.equal(isDeletedWork(null), false);
  assert.equal(isDeletedWork({}), false, "a field capture has no workflow at all");
});

test("a created job is NOT hidden from the TRNs tab", () => {
  // Deliberate. It is nobody's WORK - `myWorkItems.js` keeps it off his cards
  // for that reason - but it is a real transaction on that meter, and the
  // TRNs tab is the record of what has happened to a meter.
  assert.equal(isDeletedWork({ workflow: { state: "CREATED" } }), false);
});

test("the ward's transactions arrive without the bin", () => {
  const list = [
    { id: "a", workflow: { state: "ISSUED" } },
    { id: "b", workflow: { state: "DELETED" } },
    { id: "c" },
  ];

  assert.deepEqual(
    withoutDeletedWork(list).map((trn) => trn.id),
    ["a", "c"],
  );
  assert.deepEqual(withoutDeletedWork(null), []);
});

test("the exclusion is at the warehouse, where one query feeds nine screens", async () => {
  // The TRNs tab, the premise and asset lists, the TRN filter and stats and
  // all five admin dashboards read `all.trns`. Filtering in each would be
  // nine chances to forget one - and a forgotten one shows as a dashboard
  // total that no box adds up to, the fault the owner found on his own phone.
  const source = await read("../../context/WarehouseContext.js");

  assert.match(source, /withoutDeletedWork\(cloudTrns\)/);
  assert.match(source, /from "\.\.\/features\/trns\/deletedWork"/);
});

test("the work-order stream excludes the bin BY NAME, not by accident", async () => {
  // Today DELETED is absent from WMS_WORKFLOW_STATES and so never drawn - but
  // that list still names four words which stopped being states, and
  // `isListedWorkOrder` defaults an unrecognised state to "always listed,
  // whatever its age". The first person to widen it would ship deleted work
  // to a worker permanently.
  const source = await read("../../redux/lifecycleInstructionApi.js");

  assert.match(source, /function isBinnedWorkOrder/);
  assert.match(source, /\.filter\(\(trn\) => !isBinnedWorkOrder\(trn\)\)/);

  // And it is the FIRST filter in the chain, so nothing downstream can
  // reinstate it.
  const chain = source.slice(source.indexOf("const items = mergeWorkOrderStreams([trns])"));

  assert.ok(
    chain.indexOf("isBinnedWorkOrder") < chain.indexOf("WMS_LCT_TYPES"),
    "the bin test leads the chain",
  );
});

test("HIS PHOTOGRAPHS SURVIVE when the office takes the job back", async () => {
  // The defect this closes: the server refuses a submission whose
  // instruction is not ACCEPTED, that refusal is thrown, the queue treated it
  // as terminal and DELETED HIS UPLOADED EVIDENCE - while the transaction was
  // alive and waiting in the pool, quite possibly to be given back to him.
  //
  // The override (5.5) and the three-day expiry (5.6) both produce exactly
  // this state, so it went from rare to ordinary the day they landed.
  const source = await read("../../services/processSubmissionQueue.js");
  const list = source.slice(
    source.indexOf("REFUSALS_WITH_A_SURVIVING_TRANSACTION = ["),
    source.indexOf("];", source.indexOf("REFUSALS_WITH_A_SURVIVING_TRANSACTION = [")),
  );

  assert.match(list, /"INSTRUCTION_NOT_ACCEPTED"/);
  assert.match(list, /"INSTRUCTION_NOT_ASSIGNED"/);
  assert.match(list, /"TRN_ALREADY_EXISTS"/, "the ones already there stay");
  assert.match(list, /"REGISTRATION_INCOMPLETE"/);
});

test("and he is told the truth, not to do something he cannot", async () => {
  // It used to say "Accept the instruction before recording the visit". By
  // the time the server says this, the work is not his to accept.
  const source = await read("../meters/noAccessSubmitMessages.js");
  const line = source
    .split("\n")
    .find((row) => row.includes('code: "INSTRUCTION_NOT_ACCEPTED"'));

  assert.ok(line, "the message exists");
  assert.doesNotMatch(line, /Accept the instruction before/);
  assert.match(line, /no longer yours/);
  assert.match(line, /Nothing you captured is lost/);
});

test("one locked-form well, read by all four forms", async () => {
  // Four identical copies of the same list, all four naming the retired
  // words. These are the forms a worker is standing at a meter with.
  for (const form of [
    "../../../app/(tabs)/asts/disconnection.jsx",
    "../../../app/(tabs)/asts/reconnection.jsx",
    "../../../app/(tabs)/asts/removal.jsx",
    "../../../app/(tabs)/asts/meter-reading.js",
  ]) {
    const source = await read(form);

    assert.match(source, /workOrders\/instructionLock/, form);
    assert.doesNotMatch(source, /function isLifecycleInstructionLocked/, form);
    assert.doesNotMatch(source, /function getInstructionWorkflowState/, form);
  }
});

test("a job in the bin or in the pool locks the form too", () => {
  // Before this they were held only by the accidental `Boolean(trnId)`
  // clause: the worker could open the form for a job that was no longer his,
  // locked, with nothing saying why.
  for (const state of ["ISSUED", "ACCEPTED", "CREATED", "DELETED", "COMPLETED"]) {
    assert.equal(
      isLifecycleInstructionLocked({ workflowState: state }),
      true,
      state,
    );
  }

  // His own find, started at the meter, is not locked to anything.
  assert.equal(isLifecycleInstructionLocked({}), false);
  assert.equal(isLifecycleInstructionLocked({ workflowState: "SOMETHING_NEW" }), false);
});

test("the locked well places an old word before it tests it", () => {
  assert.equal(instructionState({ workflowState: "REASSIGNED" }), "ISSUED");
  assert.equal(instructionState({ workflowState: "IN_PROGRESS" }), "ACCEPTED");
  assert.equal(instructionState({ workflowState: "REJECTED" }), "CREATED");
  assert.equal(instructionState({ workflowState: "WAITING_BATCH_ACCEPTANCE" }), "");
});

test("the office's own source of truth still locks it", () => {
  // The four clauses that were there before are unchanged.
  assert.equal(isLifecycleInstructionLocked({ source: "WMS" }), true);
  assert.equal(isLifecycleInstructionLocked({ instructionTrnId: "T" }), true);
  assert.equal(isLifecycleInstructionLocked({ trnId: "T" }), true);
  assert.equal(isLifecycleInstructionLocked({ id: "T" }), true);
});
