// Owner, 11 October 2026. His phone showed a Disconnections card reading 7
// above boxes that read 3, 1, 0 and 1. The records said why: two of his
// disconnections were REJECTED, a state the badge counted and no box drew.
//
// His rule: "even here we exclude REJECTED . Thats the right thing to do
// cause the rejected can end up being allocated somewhere else."
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  WORK_HE_NO_LONGER_HOLDS,
  WORK_HE_STILL_HOLDS,
  countMyWork,
  drawnTotal,
  isInChosenWard,
  isStillHisWork,
} from "./myWorkItems.js";

const item = (workflowState, trnType = "METER_DISCONNECTION") => ({
  workflowState,
  trnType,
  scopeBucket: "MY_WORK",
});

test("QA states count distinct original TRNs when visibility scopes overlap", () => {
  const rows = ["COMPLETED", "QA FAIL", "QA PASS"].map((workflowState, id) => ({ ...item(workflowState), id: String(id) }));
  const counts = countMyWork([...rows, ...rows]);
  assert.equal(counts.total, 3);
  assert.equal(counts.completed, 1);
  assert.equal(counts.qaFail, 1);
  assert.equal(counts.qaPass, 1);
  assert.equal(drawnTotal(counts), counts.total);
});

// Kaiser's own disconnections on DEV at 11 October, 01:50, read from trns.
const kaiser = [
  item("ISSUED"),
  item("ISSUED"),
  item("ISSUED"),
  item("ACCEPTED"),
  item("REJECTED"),
  item("REJECTED"),
  item("COMPLETED"),
];

test("a rejected job is not his work, so it is not counted", () => {
  assert.equal(isStillHisWork(item("REJECTED")), false);
  assert.equal(isStillHisWork(item("ISSUED")), true);
});

test("a cancelled job is not his work either - the office withdrew it", () => {
  assert.equal(isStillHisWork(item("CANCELLED")), false);
  // CREATED and DELETED joined on 11 October 2026 with the state machine:
  // a job in the pool is with nobody, and one in the bin is nobody's.
  assert.deepEqual(WORK_HE_NO_LONGER_HOLDS, ["REJECTED", "CANCELLED", "CREATED", "DELETED"]);
});

test("the owner's own card: 7 becomes 5, and 5 is what the boxes say", () => {
  const counts = countMyWork(kaiser);

  assert.equal(counts.total, 5, "the badge");
  assert.equal(counts.issued, 3);
  assert.equal(counts.accepted, 1);
  assert.equal(counts.inProgress, 0);
  assert.equal(counts.completed, 1);
  assert.equal(drawnTotal(counts), 5, "and the boxes add up to it");
});

test("the badge equals its boxes for EVERY state, not only this card", () => {
  // The property that broke. A state that reaches the list without a box of
  // its own fails here, by name, instead of on a worker's phone.
  for (const state of [...WORK_HE_STILL_HOLDS, ...WORK_HE_NO_LONGER_HOLDS]) {
    const counts = countMyWork([item(state), item(state), item("ISSUED")]);

    assert.equal(
      counts.total,
      drawnTotal(counts),
      `${state} is counted in the total and drawn in no box`,
    );
  }
});

test("a reassigned job is work awaiting acceptance, so it counts as issued", () => {
  // The server returns a reassign to ISSUED under the new worker's name, so
  // nothing should rest here - but it still accepts work from this state, so
  // if one ever does it must be drawn rather than silently counted.
  const counts = countMyWork([item("REASSIGNED"), item("ISSUED")]);

  assert.equal(counts.issued, 2);
  assert.equal(counts.total, 2);
  assert.equal(drawnTotal(counts), 2);
});

test("an empty or missing list counts as nothing, not as a crash", () => {
  for (const input of [[], null, undefined, "not a list"]) {
    const counts = countMyWork(input);
    assert.equal(counts.total, 0);
    assert.equal(drawnTotal(counts), 0);
  }
});

test("the screen reads the one well, and offers no chip that can never fill", async () => {
  const screen = await readFile(
    new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url),
    "utf8",
  );

  // Both numbers come off one filtered list, so the bucket card, the group
  // badge, the four boxes and the list behind the tap cannot disagree.
  assert.match(screen, /isStillHisWork\(item\)/, "the set is filtered, not just the number");
  assert.match(screen, /countMyWork\(items\)/, "and counted by the shared counter");

  // The chips one level down read the same list. Leaving Rejected and
  // Cancelled there would show a worker a 0 where the truth is "not here".
  const chips = screen.slice(screen.indexOf("const STATE_FILTERS"), screen.indexOf("const EXECUTION_ROUTES"));

  assert.doesNotMatch(chips, /REJECTED/);
  assert.doesNotMatch(chips, /CANCELLED/);
  assert.match(chips, /ISSUED/);
});

test("a job in the pool or in the bin is not his, and is not drawn", () => {
  // DR-R001 5.5, owner 11 October 2026: "DELETED must not show in FWRs
  // devices. It will confuse them." CREATED is the same case for a different
  // reason - a job waiting to be given out is with nobody.
  for (const notHis of ["CREATED", "DELETED"]) {
    assert.equal(isStillHisWork({ workflowState: notHis }), false, notHis);
  }

  // And the three that are his, or were.
  for (const his of ["ISSUED", "ACCEPTED", "COMPLETED"]) {
    assert.equal(isStillHisWork({ workflowState: his }), true, his);
  }
});

test("a job refused or taken back leaves his phone even with stale targets", () => {
  // It can be unallocated or deleted while his phone still has it cached, so
  // the filter is on the STATE, not on whether his name is still on it.
  const stale = { workflowState: "CREATED", assignment: { targets: [{ type: "USER", id: "him" }] } };

  assert.equal(isStillHisWork(stale), false);
  assert.equal(countMyWork([stale]).total, 0);
});

test("his completed work stays on his phone", () => {
  // Corrected on 11 October 2026: the rule first said the phone showed only
  // Issued and Accepted. The owner never said that - his card has a working
  // Completed box, and his bucket counts the work he finished.
  assert.equal(countMyWork([{ workflowState: "COMPLETED" }]).completed, 1);
});

// ---------------------------------------------------------------------------
// Owner, 13 October 2026: "we cant use different counting systems in 1 app",
// then "will u please fix your counting". Siya's phone counted a job from
// municipality ZA7423 under a header reading Endumeni / W6.
// ---------------------------------------------------------------------------

test("a job in another ward is not his ward's work", () => {
  const here = { wardPcode: "ZA5241006", lmPcode: "ZA5241" };
  const elsewhere = { wardPcode: "ZA7423006", lmPcode: "ZA7423" };

  assert.equal(isInChosenWard(here, "ZA5241006", "ZA5241"), true);
  assert.equal(isInChosenWard(elsewhere, "ZA5241006", "ZA5241"), false);
});

test("Siya's own case: four inspections become three", () => {
  // The exact records. The fourth is TRN_MINSP_..._ELC_ZA7423006_5550.
  const siya = [
    { workflowState: "ISSUED", wardPcode: "ZA5241006", lmPcode: "ZA5241" },
    { workflowState: "ACCEPTED", wardPcode: "ZA5241006", lmPcode: "ZA5241" },
    { workflowState: "ACCEPTED", wardPcode: "ZA5241006", lmPcode: "ZA5241" },
    { workflowState: "COMPLETED", wardPcode: "ZA7423006", lmPcode: "ZA7423" },
  ];

  const inWard = siya.filter((i) => isInChosenWard(i, "ZA5241006", "ZA5241"));

  assert.equal(inWard.length, 3, "the office's three, not the phone's four");
  assert.equal(countMyWork(inWard).total, 3);
  assert.equal(drawnTotal(countMyWork(inWard)), 3, "and the boxes still add up");
});

test("the same ward in a different municipality is not the same place", () => {
  // Ward codes are unique in practice, but a record is placed by BOTH.
  const other = { wardPcode: "ZA5241006", lmPcode: "ZA9471" };

  assert.equal(isInChosenWard(other, "ZA5241006", "ZA5241"), false);
});

test("a record with no ward is KEPT, and shown as the gap it is", () => {
  // UI-R008: a gap is shown, not tidied away. Dropping it would hide a
  // defective record from the only person who can see the meter.
  const noWard = { workflowState: "ISSUED" };

  assert.equal(isInChosenWard(noWard, "ZA5241006", "ZA5241"), true);
});

test("before a ward is chosen, nothing is excluded", () => {
  const anywhere = { wardPcode: "ZA7423006", lmPcode: "ZA7423" };

  assert.equal(isInChosenWard(anywhere, ""), true);
  assert.equal(isInChosenWard(anywhere, null), true);
});

test("a job whose municipality is unknown is judged on its ward alone", () => {
  // Half a fact is not a reason to hide the job.
  const noLm = { wardPcode: "ZA5241006" };

  assert.equal(isInChosenWard(noLm, "ZA5241006", "ZA5241"), true);
});
