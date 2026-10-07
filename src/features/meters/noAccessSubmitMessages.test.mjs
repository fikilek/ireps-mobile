// No Access rules NA-R060, NA-R061, NA-R062 — the words a worker gets, before and after.
import assert from "node:assert/strict";
import test from "node:test";

import { buildAppointmentInstant } from "./noAccessAppointment.js";
import {
  NO_ACCESS_PROGRESS,
  NO_ACCESS_RESULTS,
  noAccessConfirmation,
  noAccessDiscard,
  noAccessResult,
  noAccessQueuedResult,
  isSystemFaultCode,
  refusalMessage,
} from "./noAccessSubmitMessages.js";

test("NA-R061: the confirmation names the appointment when there is one", () => {
  const at = buildAppointmentInstant({ year: 2026, month: 10, day: 8, hour: 14, minute: 0 });
  const window = noAccessConfirmation({ reasonCode: "Property Locked", appointment: { at } });
  assert.match(window.body, /Property Locked/);
  assert.match(window.body, /Thursday 8 October 2026, 14:00/);
});

test("NA-R061: with no appointment it says so, rather than leaving a blank", () => {
  const window = noAccessConfirmation({ reasonCode: "Property Locked" });
  assert.match(window.body, /Appointment: none/);
});

test("NA-R061: Other shows the worker's own words, not the word Other", () => {
  const window = noAccessConfirmation({ reasonCode: "OTHER", reasonOther: "Vicious dogs" });
  assert.match(window.body, /Vicious dogs/);
});

test("NA-R062: there is something to show at every stage of sending", () => {
  for (const key of ["uploading", "recording", "queueing"]) {
    assert.equal(typeof NO_ACCESS_PROGRESS[key], "string");
    assert.ok(NO_ACCESS_PROGRESS[key].length > 0, `${key} must say something`);
  }
});

test("NA-R060: a worker is never left with a developer's message", () => {
  const unknown = noAccessResult("SOME_INTERNAL_CODE_NOBODY_WROTE_A_ROW_FOR");
  assert.equal(unknown.code, "UNKNOWN");
  assert.ok(unknown.body.length > 0);
});

test("NA-R060: every row has a title and words a worker can act on", () => {
  for (const row of NO_ACCESS_RESULTS) {
    assert.ok(row.title && row.title.length > 0, `${row.code} needs a title`);
    assert.ok(row.body && row.body.length > 10, `${row.code} needs words`);
  }
});

test("NA-R060: the Error Register covers every refusal the server can send", () => {
  // These are the codes the one recorder and the batch twin can return. A code the server can
  // send with no row here would reach a worker as raw text.
  const fromServer = [
    "NO_ACCESS_REASON_REQUIRED",
    "NO_ACCESS_REASON_OTHER_REQUIRED",
    "NO_ACCESS_PHOTO_REQUIRED",
    "NO_ACCESS_APPOINTMENT_REQUIRED",
    "NO_ACCESS_APPOINTMENT_NOT_ALLOWED",
    "NO_ACCESS_APPOINTMENT_NOT_FUTURE_AT_CAPTURE",
    "NO_ACCESS_APPOINTMENT_RULE_UNSUPPORTED",
    "NO_ACCESS_ERF_REQUIRED",
    "LOCATION_INVALID",
    "TARGETED_BATCH_METER_ALREADY_LINKED",
    "TARGETED_BATCH_EXECUTION_COMPLETED",
    "UNAUTHENTICATED",
  ];

  for (const code of fromServer) {
    assert.notEqual(noAccessResult(code).code, "UNKNOWN", `${code} has no Error Register row`);
  }
});

test("only a queued visit with an appointment mentions keeping its time", () => {
  assert.doesNotMatch(noAccessQueuedResult("SEND_PENDING").body, /appointment|signal|offline/i);
  assert.match(noAccessQueuedResult("SEND_PENDING", { appointmentAt: "2026-10-06T10:00:00Z" }).body, /appointment time is unchanged/i);
});

test("queued feedback distinguishes known offline, photo timeout and an unconfirmed send", () => {
  assert.match(noAccessQueuedResult("DEVICE_OFFLINE").body, /when you are online/);
  for (const code of ["STORAGE_UPLOAD_TIMEOUT", "storage/canceled", "storage/retry-limit-exceeded"]) {
    assert.match(noAccessQueuedResult(code).body, /photo has not finished uploading/i);
    assert.doesNotMatch(noAccessQueuedResult(code).body, /signal|cancelled|canceled|appointment/i);
  }
  for (const code of [undefined, "SEND_PENDING", "QUEUE_BUSY", "SYNCING", "functions/internal"]) {
    assert.match(noAccessQueuedResult(code).body, /not been confirmed/);
    assert.doesNotMatch(noAccessQueuedResult(code).body, /signal|offline|appointment/i);
  }
  assert.equal(noAccessQueuedResult("functions/unauthenticated").code, "UNAUTHENTICATED");
});

// NA-R006 — the arrow out of the form, and what it costs.

test("NA-R006: an untouched form is not stopped on the way out", () => {
  const window = noAccessDiscard({ reasonCode: "", media: [] });
  assert.equal(window.needed, false);
});

test("NA-R006: the worker is told what the arrow will lose", () => {
  const at = buildAppointmentInstant({
    year: 2026,
    month: 10,
    day: 8,
    hour: 14,
    minute: 0,
  });
  const window = noAccessDiscard({
    reasonCode: "Property Locked",
    media: [{ tag: "noAccessPhoto" }],
    appointment: { at },
  });

  assert.equal(window.needed, true);
  assert.match(window.body, /not been sent/);
  assert.match(window.body, /Reason: Property Locked/);
  assert.match(window.body, /Photographs: 1/);
  assert.match(window.body, /Thursday 8 October 2026, 14:00/);
});

test("NA-R006: a photograph on its own is enough to ask", () => {
  const window = noAccessDiscard({ media: [{ tag: "noAccessPhoto" }] });
  assert.equal(window.needed, true);
  assert.match(window.body, /Photographs: 1/);
});

test("NA-R006: Other shows the worker's own words here too", () => {
  const window = noAccessDiscard({ reasonCode: "OTHER", reasonOther: "Vicious dogs" });
  assert.match(window.body, /Vicious dogs/);
  assert.doesNotMatch(window.body, /Reason: OTHER/);
});

// NA-R063 … NA-R066 — a refusal is one of two things (owner, 7 October 2026).

test("NA-R065: a capture the app built wrong is a system fault, not the worker's fault", () => {
  for (const code of ["INVALID_PREMISE_ID", "INVALID_TRN_ID", "INVALID_AST_ID", "INVALID_ACCESS_DATA"]) {
    assert.equal(isSystemFaultCode(code), true, `${code} is not recognised as a system fault`);
    const window = refusalMessage(code);
    assert.match(window.body, /not your fault/);
    assert.match(window.body, /reported/);
    // It must not ASK them to act. "nothing to correct on the form" is the opposite of that,
    // so the test reads for the instruction, not for the word.
    assert.doesNotMatch(
      window.body,
      /send it again|try again|open the saved visit|choose a reason|take (it|the photograph) again/i,
      `${code} sends the worker to fix something no correction can reach`,
    );
  }
});

test("NA-R065: a refusal the worker CAN act on is not dressed up as a system fault", () => {
  for (const code of ["INSTRUCTION_NOT_ACCEPTED", "NO_ACCESS_PHOTO_REQUIRED", "NO_ACCESS_REASON_REQUIRED"]) {
    assert.equal(isSystemFaultCode(code), false, `${code} was swallowed by the system-fault row`);
  }
});

test("NA-R066: a code with no row still answers in words, never a developer's string", () => {
  const window = refusalMessage("SOME_CODE_NOBODY_WROTE_WORDS_FOR");
  assert.equal(window.code, "UNKNOWN");
  assert.ok(window.title && window.body);
});

test("NA-R065: the server's own prefix does not hide a system fault", () => {
  assert.equal(isSystemFaultCode("functions/INVALID_PREMISE_ID"), true);
  assert.equal(isSystemFaultCode("  invalid_premise_id  "), true);
});
