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
export const WORK_HE_NO_LONGER_HOLDS = ["REJECTED", "CANCELLED", "CREATED", "DELETED"];

// Every state a job in his list can be in. The four boxes cover all of them,
// which is what makes the total above them equal to their sum.
//
// CREATED and DELETED joined the list above on 11 October 2026, when the
// state machine of `DR-R001` 5 landed. The owner: "DELETED must not show in
// FWRs devices. It will confuse them." CREATED is the same case for a
// different reason - a job in the pool is with nobody, so it is not his.
//
// They are excluded by STATE, not only by whether his name is on the
// assignment, because a job can be unallocated or deleted while his phone
// still holds it cached. A record that reaches him with stale targets must
// not be drawn.
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

/**
 * Is this job in the ward the worker has chosen?
 *
 * Owner, 13 October 2026, looking at Siya on TEST: **"we cant use different
 * counting systems in 1 app"**, then **"will u please fix your counting"**.
 *
 * His card said four inspections under a header reading *Endumeni / W6*. The
 * office's ward-scoped screen said three, and the office was right: the
 * fourth was `TRN_MINSP_1783504345513_ELC_ZA7423006_5550` - ward `ZA7423006`,
 * municipality `ZA7423`. **A different municipality entirely**, drawn on a
 * screen that says Endumeni at the top.
 *
 * These lists carried NO geography filter at all. The ward chip in the header
 * was decoration, so a worker who had ever worked anywhere else saw that work
 * mixed into his ward's numbers for ever, and no two screens in iREPS could
 * agree about him.
 *
 * It is scoped on the WARD, and the municipality is checked too where both
 * are known: ward codes are unique in practice, but a record is only properly
 * placed by both (owner, 3 October 2026 - every record carries its
 * municipality and its ward).
 *
 * A job with NO ward on it is KEPT, deliberately. Dropping it would hide a
 * defective record from the only person who can see the meter, which is the
 * opposite of what `UI-R008` asks: a gap is shown, not tidied away. It will
 * read `NAv` and be a job to fix.
 */
export function isInChosenWard(item, wardPcode, lmPcode = "") {
  const want = String(wardPcode ?? "").trim().toUpperCase();

  // No ward chosen yet: nothing is excluded, because nothing has been asked.
  if (!want) return true;

  const itemWard = String(item?.wardPcode ?? "").trim().toUpperCase();

  // A record that does not say where it is stays visible, and says NAv.
  if (!itemWard) return true;

  if (itemWard !== want) return false;

  const wantLm = String(lmPcode ?? "").trim().toUpperCase();
  const itemLm = String(item?.lmPcode ?? "").trim().toUpperCase();

  if (!wantLm || !itemLm) return true;

  return itemLm === wantLm;
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
