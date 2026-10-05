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
