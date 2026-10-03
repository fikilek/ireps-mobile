// No Access rules NA-R061, NA-R062 — one submit path, and the same words every time.
//
// The owner's standard for every submit in iREPS: a confirmation window BEFORE, visible
// progress DURING (never silence), and a result window AFTER.
//
// The words live here, not in each form, for the same reason the form does: seven forms
// writing their own meant seven wordings for one event. These are also the rows of the Error
// Register the No Access form's documentation has to carry (NA-R060), so the register and the
// app can never drift apart — they are generated from the same list.

import { formatAppointment } from "./noAccessAppointment.js";

/**
 * NA-R061 — what the worker is shown before it sends, naming the appointment when there is
 * one, so they see what is about to go before it goes.
 */
export function noAccessConfirmation(value = {}) {
  const lines = [
    `Reason: ${
      String(value?.reasonCode || "").toUpperCase() === "OTHER"
        ? String(value?.reasonOther || "").trim()
        : String(value?.reasonCode || "").trim()
    }`,
  ];

  lines.push(
    value?.appointment?.at
      ? `Appointment: ${formatAppointment(value.appointment.at)}`
      : "Appointment: none",
  );

  return {
    title: "Send this No Access?",
    body: lines.join("\n"),
    confirm: "SEND",
    cancel: "GO BACK",
  };
}

/** NA-R062 — what the worker sees while it is going. Never silence. */
export const NO_ACCESS_PROGRESS = Object.freeze({
  uploading: "Sending the photograph ...",
  recording: "Recording the No Access ...",
  queueing: "Saving on the phone ...",
});

/**
 * NA-R062 and NA-R060 — the result window, and the Error Register.
 *
 * Every row a worker can get after pressing SEND, in words a worker can act on. A code with
 * no row here reaches the worker as the last row, which tells them to call the office rather
 * than leaving them with a developer's message.
 */
export const NO_ACCESS_RESULTS = Object.freeze([
  {
    code: "OK",
    title: "No Access recorded",
    body: "The visit is recorded. You can carry on with the next meter.",
  },
  {
    code: "OK_ALREADY_RECORDED",
    title: "Already recorded",
    body: "This visit was already recorded. Nothing was sent twice.",
  },
  {
    code: "OK_QUEUED",
    title: "Saved on this phone",
    body: "Saved on this phone. It will be sent by itself as soon as there is signal, and sending it again will not create a second record. The appointment keeps the time you set.",
  },
  {
    code: "NO_ACCESS_REASON_REQUIRED",
    title: "Choose a reason",
    body: "Say why you could not touch the meter before sending.",
  },
  {
    code: "NO_ACCESS_REASON_OTHER_REQUIRED",
    title: "Say what the reason was",
    body: "You chose Other. Type what stopped you reaching the meter.",
  },
  {
    code: "NO_ACCESS_PHOTO_REQUIRED",
    title: "Take the photograph",
    body: "A No Access needs one photograph of what stopped you.",
  },
  {
    code: "NO_ACCESS_ERF_REQUIRED",
    title: "This work has no ERF",
    body: "The job did not arrive with an ERF, so the office cannot tell what you could not reach. Call the office — do not try again.",
  },
  {
    code: "LOCATION_INVALID",
    title: "No position yet",
    body: "The phone has not found where you are. Wait a moment outdoors and send again.",
  },
  {
    code: "TARGETED_BATCH_METER_ALREADY_LINKED",
    title: "This meter is already found",
    body: "Someone has already found this meter, so a No Access cannot be recorded on it. Move to the next one.",
  },
  {
    code: "TARGETED_BATCH_EXECUTION_COMPLETED",
    title: "This work is finished",
    body: "This meter is already completed. Move to the next one.",
  },
  {
    code: "TARGETED_BATCH_ROW_NOT_EXECUTABLE",
    title: "This work is not open",
    body: "This meter is not open for work at the moment. Call the office.",
  },
  {
    code: "TARGETED_BATCH_NOT_ASSIGNED_TO_ACTOR",
    title: "Not your batch",
    body: "This meter belongs to another team's batch. Call the office before working it.",
  },
  // The three the batch guard actually sends (batch-work-guard.js). Found missing by the owner
  // on ERF 5212, 3 October: the server refused his No Access twice with
  // METER_IN_ANOTHER_TEAMS_BATCH and there was no entry for it, so the worker would have been
  // shown "Something went wrong" for a refusal the office had explained perfectly.
  //
  // TARGETED_BATCH_NOT_ASSIGNED_TO_ACTOR above is a DIFFERENT code from a different check.
  // Having one of the pair and not the other is exactly how this was missed.
  {
    code: "METER_IN_ANOTHER_TEAMS_BATCH",
    title: "Not your batch",
    body: "This ERF is in another team's batch, so only that team can work it. Nothing is wrong with what you captured. Call the office if you believe it should be yours.",
  },
  {
    code: "METER_IN_AN_UNALLOCATED_BATCH",
    title: "Not given out yet",
    body: "This ERF is in a batch that has not been given to a team yet, so nobody can work it. Call the office.",
  },
  {
    code: "BATCH_CHECK_UNAVAILABLE",
    title: "Could not check the batch",
    body: "The office could not check whose batch this ERF is in, so the visit was not recorded. Try again in a moment, and call the office if it keeps happening.",
  },
  {
    code: "UNAUTHENTICATED",
    title: "Signed out",
    body: "You have been signed out. Sign in and send again — the visit is saved on the phone.",
  },
  // ---------------------------------------------------------------------------------------
  // Everything below was found MISSING by an audit of every refusal code the server can send
  // against this list, 3 October 2026. Each one would have reached the worker as "Something
  // went wrong and the visit was not recorded" - a dead end for a refusal the office had
  // already explained.
  //
  // The owner: "any refusal must carry a proper reason. And that reason must be shown to the
  // user." A list written from memory will always drift behind the server; the test for this
  // file now derives its codes FROM the server, so a new refusal cannot be added without a
  // worker's words.
  // ---------------------------------------------------------------------------------------
  {
    // The one a worker on the SALES PATH hits most: the row says do this through No Access.
    code: "TARGETED_BATCH_USE_NO_ACCESS_FLOW",
    title: "Use the No Access form",
    body: "This batch row records a no access through the No Access form. Open it from the work order and try again.",
  },
  {
    code: "NO_ACCESS_PREMISE_REQUIRED",
    title: "No premise on this work",
    body: "A No Access says which premise you could not get into, and this work has none. Make the premise first, or call the office.",
  },
  {
    code: "NO_ACCESS_LOCATION_UNRESOLVED",
    title: "Nowhere to place this visit",
    body: "Neither the meter nor the premise has a position, so the office cannot place your visit. Report it to the office - this is not something you can fix in the field.",
  },
  {
    code: "NO_ACCESS_REASON_INVALID",
    title: "That reason is not on the list",
    body: "Your app is sending a reason the office does not recognise. Update the app, and call the office if it keeps happening.",
  },
  {
    code: "NO_ACCESS_APPOINTMENT_INVALID",
    title: "The appointment could not be read",
    body: "The date and time did not arrive properly. Set the appointment again, or send without one.",
  },
  {
    code: "TARGETED_BATCH_MEMBERSHIP_CONFLICT",
    title: "This meter has moved batch",
    body: "This meter now belongs to a different batch from the one on your phone. Refresh your work orders, and call the office if it stays.",
  },
  {
    code: "TARGETED_BATCH_NOT_FOUND",
    title: "The batch is gone",
    body: "The batch this work came from no longer exists. Nothing is wrong with what you captured. Call the office.",
  },
  {
    code: "TARGETED_BATCH_ROW_NOT_FOUND",
    title: "The work order is gone",
    body: "This row is no longer in the batch. Refresh your work orders and call the office if it stays.",
  },
  {
    code: "SALES_DOCUMENT_NOT_FOUND",
    title: "The office record is gone",
    body: "The Sales record behind this work no longer exists. Call the office - this is not something you can fix in the field.",
  },
  {
    code: "TARGETED_BATCH_NOT_READY",
    title: "This batch is not open for work",
    body: "The office has changed this batch since you picked it up. Refresh your work orders.",
  },
  {
    code: "TARGETED_BATCH_NOT_ALLOCATED",
    title: "This batch is not given out",
    body: "This batch has been taken back by the office, so nobody can work it. Refresh your work orders.",
  },
  {
    code: "TARGETED_BATCH_NOT_ACCEPTED",
    title: "The batch is not accepted yet",
    body: "Your team has not accepted this batch yet, so work on it cannot be recorded. Ask your supervisor to accept it.",
  },
  {
    code: "TARGETED_BATCH_ROW_NOT_ALLOCATED",
    title: "This work is not given out",
    body: "This row is not allocated for field work. Refresh your work orders and call the office if it stays.",
  },
  {
    code: "TARGETED_BATCH_ROW_NOT_ACCEPTED",
    title: "This work is not accepted yet",
    body: "This row has not been accepted for field work. Ask your supervisor.",
  },
  {
    // Found by the derived test the moment it was written, 3 October 2026.
    code: "MEDIA_INVALID",
    title: "The photograph did not arrive",
    body: "The photograph did not reach the office properly. Take it again and send again.",
  },
  {
    code: "UNKNOWN",
    title: "It did not send",
    body: "Something went wrong and the visit was not recorded. It is saved on the phone. Call the office if it keeps happening.",
  },
]);

const BY_CODE = new Map(NO_ACCESS_RESULTS.map((row) => [row.code, row]));

/**
 * What to tell a worker whose work is STILL WAITING on the phone.
 *
 * "Saved on this phone. It will be sent by itself as soon as there is signal" is true for a
 * worker in a dead spot and a lie for a worker who has been signed out - nothing about signal
 * will fix that, and they would stand there waiting for a send that cannot happen (audit,
 * 3 October 2026).
 *
 * Waiting work keeps the code of its last failure, so the words can say which it is. The work
 * is NOT refused in either case: it stays on the phone and goes when the obstacle clears.
 */
export function noAccessQueuedResult(code) {
  const clean = String(code || "")
    .trim()
    .toLowerCase()
    .replace(/^functions\//, "");

  if (clean === "unauthenticated") return noAccessResult("UNAUTHENTICATED");

  return noAccessResult("OK_QUEUED");
}

/** Never leave a worker with a developer's message. An unknown code reads as UNKNOWN. */
export function noAccessResult(code) {
  return BY_CODE.get(String(code || "").trim()) || BY_CODE.get("UNKNOWN");
}
