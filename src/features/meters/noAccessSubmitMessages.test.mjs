// No Access rules NA-R060, NA-R061, NA-R062 — the words a worker gets, before and after.
import assert from "node:assert/strict";
import test from "node:test";

import { buildAppointmentInstant } from "./noAccessAppointment.js";
import {
  NO_ACCESS_PROGRESS,
  NO_ACCESS_RESULTS,
  noAccessConfirmation,
  noAccessResult,
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

test("a queued visit tells the worker the appointment is unchanged", () => {
  assert.match(noAccessResult("OK_QUEUED").body, /appointment/i);
});
