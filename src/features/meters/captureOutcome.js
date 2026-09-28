// f01: the phone does not say MISSION SUCCESS for a meter that does not exist.
//
// The server taking the capture is not the same as the meter existing. The meter, the meter master,
// the link to the premise, the Sales record and the batch row are all made afterwards, by a step
// behind the server. When that step failed it said nothing, and the worker walked away believing the
// meter was done - so it was sent to somebody again, and the numbers stopped balancing, because a
// transaction with no asset behind it is counted by everything that reads transactions and by
// nothing that reads meters (owner, 2026-09-28).
//
// The server now writes the reason onto the capture at derived.failure. This reads it back.
import { doc, getDoc } from "firebase/firestore";

import { db } from "../../firebase";

// How long the phone waits for the meter to appear before it stops saying nothing.
//
// The wait ends the moment the meter is there, so a good submit costs a second or two. The full
// budget is only ever paid when something has gone wrong, which is when the worker needs to know.
// The follow-on chain uses its own, longer wait for a different job: opening the next form.
export const METER_CONFIRM_WAIT_MS = 9000;

// What the worker is told when the meter has not appeared and nothing says why. It is not a failure
// yet - the step behind the server may still be running - so it does not claim one.
export const METER_NOT_THERE_YET = {
  title: "Meter not confirmed",
  body:
    "The office has your capture, but the meter has not appeared yet. Open this premise before you capture it again, so the meter is not captured twice.",
};

/**
 * Why a capture never became a meter, in words a worker can act on.
 *
 * Returns null when the capture says nothing is wrong — which, while the step behind the server is
 * still running, is the ordinary case. Never throws: a phone that cannot read the reason must still
 * be able to tell the worker that the meter is not there.
 */
export async function readCaptureFailure(trnId) {
  const safeTrnId = String(trnId || "").trim();

  if (!safeTrnId) return null;

  try {
    const snapshot = await getDoc(doc(db, "trns", safeTrnId));

    if (!snapshot.exists()) return null;

    const failure = snapshot.data()?.derived?.failure;

    if (!failure?.code) return null;

    return {
      code: String(failure.code),
      // The sentence is written for a person. Our own message is kept beside it on the capture, and
      // stays there for the office; it is not what the worker is shown.
      reason: String(failure.reason || "").trim() || METER_NOT_THERE_YET.body,
    };
  } catch (error) {
    return null;
  }
}

/**
 * What to tell the worker when the meter did not appear.
 *
 * A recorded reason is a definite answer and says so. Silence is not: the step behind the server may
 * still be running, so the worker is told what is true — the office has the capture, the meter is
 * not there yet, and look before capturing it again.
 */
export function captureFailureMessage(failure) {
  if (!failure?.reason) return METER_NOT_THERE_YET;

  return {
    title: "Meter not created",
    body: `${failure.reason}\n\nThe office has your capture. Do not capture this meter again until this is sorted out.`,
  };
}
