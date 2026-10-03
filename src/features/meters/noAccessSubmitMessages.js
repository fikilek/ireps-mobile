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
  {
    code: "UNKNOWN",
    title: "It did not send",
    body: "Something went wrong and the visit was not recorded. It is saved on the phone. Call the office if it keeps happening.",
  },
]);

const BY_CODE = new Map(NO_ACCESS_RESULTS.map((row) => [row.code, row]));

/** Never leave a worker with a developer's message. An unknown code reads as UNKNOWN. */
export function noAccessResult(code) {
  return BY_CODE.get(String(code || "").trim()) || BY_CODE.get("UNKNOWN");
}
