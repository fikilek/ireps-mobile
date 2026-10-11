// What counts as a worker's own work on My Workorders.
//
// Owner, 11 October 2026, looking at a card that said 7 above four boxes
// adding up to 5: "even here we exclude REJECTED . Thats the right thing to
// do cause the rejected can end up being allocated somewhere else."
//
// So this is not a missing box. A job the worker no longer holds is not his
// work, and is neither counted nor listed:
//
//   REJECTED   he handed it back.
//   CANCELLED  the office withdrew it - the same thing from the other end.
//
// REASSIGNED needs no exclusion. The server returns a reassigned job to
// ISSUED under the new worker's name (functions/meterLifecycle/
// manageInstructionCallable.js: "reassigned and returned to ISSUED"), so it
// leaves the old worker's list by itself and nothing rests in that state.
// But the server still accepts work FROM it, so if one ever does rest there
// it is work awaiting his acceptance - counted as issued, rather than
// counted in the total and drawn in no box, which is the fault this fixes.
export const WORK_HE_NO_LONGER_HOLDS = ["REJECTED", "CANCELLED"];

// Every state a job in his list can be in. The four boxes cover all of them,
// which is what makes the total above them equal to their sum.
export const WORK_HE_STILL_HOLDS = [
  "ISSUED",
  "REASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
];

function stateOf(item) {
  return String(item?.workflowState || "").toUpperCase();
}

export function isStillHisWork(item) {
  return !WORK_HE_NO_LONGER_HOLDS.includes(stateOf(item));
}

// The total and the four numbers beneath it, built together from one list so
// they cannot disagree. The badge used to be the list's length over seven
// states while the boxes drew four, so two rejected jobs were counted and
// shown nowhere, and nothing said why the numbers would not add up.
export function countMyWork(items) {
  const list = Array.isArray(items) ? items.filter(isStillHisWork) : [];

  const counts = {
    issued: 0,
    accepted: 0,
    inProgress: 0,
    completed: 0,
    total: list.length,
  };

  for (const item of list) {
    const state = stateOf(item);

    if (state === "ISSUED" || state === "REASSIGNED") counts.issued += 1;
    else if (state === "ACCEPTED") counts.accepted += 1;
    else if (state === "IN_PROGRESS") counts.inProgress += 1;
    else if (state === "COMPLETED") counts.completed += 1;
  }

  return counts;
}

// The sum the card draws. A state that reaches the list without a box of its
// own makes this disagree with the total, and the test says so by name
// rather than leaving it to be noticed on a worker's phone.
export function drawnTotal(counts) {
  return (
    Number(counts?.issued || 0) +
    Number(counts?.accepted || 0) +
    Number(counts?.inProgress || 0) +
    Number(counts?.completed || 0)
  );
}
