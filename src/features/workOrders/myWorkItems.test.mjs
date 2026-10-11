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
  isStillHisWork,
} from "./myWorkItems.js";

const item = (workflowState, trnType = "METER_DISCONNECTION") => ({
  workflowState,
  trnType,
  scopeBucket: "MY_WORK",
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
