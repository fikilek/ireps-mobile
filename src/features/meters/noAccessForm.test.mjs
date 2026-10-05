// No Access rules NA-R003 / NA-R010 — the one list, and what makes a no access complete.
import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_ACCESS_TRN_TYPES,
  canEndInNoAccess,
  isCompleteNoAccess,
} from "./noAccessReasons.js";

const PHOTO = [{ tag: "noAccessPhoto", uri: "file:///a.jpg" }];

test("NA-R003: seven transaction types can end in a no access", () => {
  assert.equal(NO_ACCESS_TRN_TYPES.length, 7);
  for (const type of NO_ACCESS_TRN_TYPES) assert.equal(canEndInNoAccess(type), true);
});

test("NA-R003: Commissioning cannot, and neither can an invented type", () => {
  assert.equal(canEndInNoAccess("METER_COMMISSIONING"), false);
  assert.equal(canEndInNoAccess("TARGETED_BATCH_NO_ACCESS"), false);
});

test("NA-R010: a reason and a photograph make it complete", () => {
  assert.equal(isCompleteNoAccess({ reasonCode: "Property Locked" }, PHOTO), true);
});

test("NA-R010: no photograph, not complete", () => {
  assert.equal(isCompleteNoAccess({ reasonCode: "Property Locked" }, []), false);
});

test("NA-R010: no reason, not complete", () => {
  assert.equal(isCompleteNoAccess({}, PHOTO), false);
});

test("NA-R010: Other with nothing said, not complete", () => {
  assert.equal(isCompleteNoAccess({ reasonCode: "OTHER" }, PHOTO), false);
  assert.equal(isCompleteNoAccess({ reasonCode: "OTHER", reasonOther: "Vicious dogs" }, PHOTO), true);
});

test("NA-R020: other reasons do not require an appointment", () => {
  assert.equal(isCompleteNoAccess({ reasonCode: "Property Locked", appointment: null }, PHOTO), true);
});

test("NA-R020: the dedicated return reason requires an appointment", () => {
  const draft = { reasonCode: "Occupant requested a return visit", appointment: null };
  assert.equal(isCompleteNoAccess(draft, PHOTO), false);
  assert.equal(isCompleteNoAccess({ ...draft, appointment: { at: "2026-10-06T08:00:00Z" } }, PHOTO), true);
});
