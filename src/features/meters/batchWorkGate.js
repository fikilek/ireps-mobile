// TB-R059 / TB-R062 (1.3.91) — THE FRONT GATE, on the phone.
//
// The owner, 3 October 2026: "The field worker that is doing the work should never be allowed
// to even open the form if the work is not theirs… the user must not waste his or her time
// submitting work that's going to be refused. Why don't you tell the user up front?"
//
// He proved the cost himself on ERF 5212. He opened the access gate, picked a reason, took a
// photograph and set an appointment — twice — and only at submit did anyone tell him the ERF
// belonged to Simo Team. Two visits' worth of work for nothing, and the phone then told him
// both were saved.
//
// WHAT THIS IS, AND WHAT IT IS NOT. It is a courtesy to the worker's time. It can be stale, it
// can be offline, it can be skipped. **It never decides whether work is written** — the submit
// path asks the server again and that answer is the binding one.
//
// ONE WELL. It asks the server, which runs the SAME checkBatchWork the submit path runs. The
// phone does not carry its own copy of the rule, because a front gate that says yes where the
// back gate says no is worse than no front gate at all: the worker would be told twice, and
// believe the first one.

import { getFunctions, httpsCallable } from "firebase/functions";

/** The worker is stopped. The reason is the server's own sentence, shown word for word. */
export const BATCH_WORK_BLOCKED = "BLOCKED";
/** The work is theirs to do. */
export const BATCH_WORK_ALLOWED = "ALLOWED";
/** Nobody could be asked — no signal, or the check failed. The form opens; the server decides. */
export const BATCH_WORK_UNCHECKED = "UNCHECKED";

// The owner's own words for the stop. It names what the worker should do next, because "you
// cannot do this" with nothing after it leaves them standing at a gate.
export const BATCH_WORK_BLOCKED_TITLE = "This work is not yours";
export const BATCH_WORK_BLOCKED_FOOTER =
  "Nothing is wrong with the property or the meter. Ask the office if you believe this should be yours.";

/**
 * Ask the office whose work this ERF is, before a form opens.
 *
 * Returns { state, message } and NEVER throws: a front gate that can crash a screen would stop
 * work the worker is entitled to do, which is the opposite of its job.
 *
 * `state` is BLOCKED, ALLOWED or UNCHECKED. **UNCHECKED opens the form** (owner's decision,
 * 3 October): blocking a worker who has no signal would stop legitimate work in a dead spot,
 * which is most of the field. The server still refuses on arrival if the ERF is not theirs.
 */
export async function checkBatchWorkBeforeForm({
  erfId,
  premiseId,
  meterNo,
} = {}) {
  const erf = String(erfId || "").trim();
  const premise = String(premiseId || "").trim();
  const meter = String(meterNo || "").trim();

  if (!erf && !premise && !meter) {
    // Nothing to ask about. The submit path still checks, so this is not a way through.
    return { state: BATCH_WORK_UNCHECKED, message: "" };
  }

  try {
    const callable = httpsCallable(getFunctions(), "checkBatchWorkCallable");
    const response = await callable({
      erfId: erf,
      premiseId: premise,
      meterNo: meter,
    });
    const result = response?.data || {};

    if (result?.allowed === true) {
      return {
        state: BATCH_WORK_ALLOWED,
        message: "",
        code: result?.code || "NAv",
      };
    }

    return {
      state: BATCH_WORK_BLOCKED,
      // The server's sentence, word for word. The phone never writes its own version: the
      // server is the one that knows the batch, the geofence, the team and the date.
      message:
        String(result?.message || "").trim() || BATCH_WORK_BLOCKED_FOOTER,
      code: result?.code || "NAv",
    };
  } catch (error) {
    console.log(
      "checkBatchWorkBeforeForm -- could not ask, the form opens",
      error?.message,
    );
    return { state: BATCH_WORK_UNCHECKED, message: "", code: "NAv" };
  }
}
