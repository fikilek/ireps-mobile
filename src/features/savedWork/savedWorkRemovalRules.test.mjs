// OF-R002 section 7: work leaves the phone only when the office accepted it, or when a supervisor
// removed it on purpose, with a reason that is recorded.
import assert from "node:assert/strict";
import test from "node:test";

import {
  REMOVAL_REASONS,
  assessRemoval,
  buildRemovalRecord,
  canRemoveUnsentWork,
  isRefusedByOffice,
  isSentToOffice,
  isUnsentWork,
  validateRemovalReason,
} from "./savedWorkRemovalRules.js";

const sent = {
  id: "QUEUE_1",
  status: "SUCCESS",
  result: { success: true, code: "SERVER_CONFIRMED" },
};

const waiting = {
  id: "QUEUE_2",
  status: "PENDING",
  formType: "METER_DISCONNECTION",
  result: { success: false, code: "NAv" },
  context: { meterNo: "12345678", erfNo: "688", premiseId: "P1" },
  metadata: { createdAt: "2026-09-27T09:00:00.000Z", createdByUid: "U1", createdByUser: "Kaiser" },
};

const refused = {
  id: "QUEUE_3",
  status: "CONFLICT",
  result: { success: false, code: "TARGETED_BATCH_METER_ALREADY_LINKED" },
};

test("only a server-confirmed send counts as work the office has", () => {
  assert.equal(isSentToOffice(sent), true);
  assert.equal(isSentToOffice(waiting), false);
  assert.equal(isSentToOffice(refused), false, "the office does not HAVE refused work");

  // Owner, 3 Oct 2026: refused work is NOT "work still to go". It reached the office and was
  // rejected, so it will never send however long it is left, and the worker was being told to
  // leave it there for a signal that would change nothing.
  assert.equal(isUnsentWork(refused), false);

  // A SUCCESS the server never confirmed is not sent work.
  assert.equal(isSentToOffice({ status: "SUCCESS", result: { success: false } }), false);
});

test("a field worker cannot remove work that has not reached the office", () => {
  assert.equal(canRemoveUnsentWork("FWR"), false);
  assert.equal(canRemoveUnsentWork("GST"), false);
  assert.equal(canRemoveUnsentWork(""), false);
  assert.equal(canRemoveUnsentWork(undefined), false);

  for (const role of ["SPV", "MNG", "ADM", "SPU", "spv"]) {
    assert.equal(canRemoveUnsentWork(role), true, `${role} should be able to remove unsent work`);
  }
});

test("a reason is required, but it is a tap and not an essay", () => {
  // The owner, 27 September: "why do we need such a long sentence". A supervisor picks from a
  // short list; what matters is that a reason was chosen and is kept with their name.
  assert.equal(validateRemovalReason("").valid, false);
  assert.equal(validateRemovalReason("   ").valid, false);
  assert.equal(validateRemovalReason("ok").valid, true);
  assert.equal(validateRemovalReason("Captured twice by mistake").valid, true);

  assert.ok(REMOVAL_REASONS.length >= 3, "there is no list to pick from");
  assert.ok(
    REMOVAL_REASONS.every((reason) => validateRemovalReason(reason).valid),
    "a reason from the list is not accepted",
  );
});

test("sent work is removed with a plain confirmation, by anyone", () => {
  const verdict = assessRemoval({ item: sent, role: "FWR" });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.needsReason, false);
  assert.equal(verdict.code, "ALREADY_SENT");
});

test("unsent work needs a supervisor AND a reason", () => {
  const asWorker = assessRemoval({ item: waiting, role: "FWR", reason: "Captured twice by mistake" });
  assert.equal(asWorker.allowed, false);
  assert.equal(asWorker.code, "NOT_A_SUPERVISOR");

  const noReason = assessRemoval({ item: waiting, role: "SPV" });
  assert.equal(noReason.allowed, false);
  assert.equal(noReason.code, "REASON_REQUIRED");

  const done = assessRemoval({ item: waiting, role: "SPV", reason: "Captured twice by mistake" });
  assert.equal(done.allowed, true);
  assert.equal(done.reason, "Captured twice by mistake");
});

test("a refused capture is still unsent work, not spare rubbish", () => {
  // m06: a refusal stops the retry, it does not make the capture disposable.
  const verdict = assessRemoval({ item: refused, role: "FWR", reason: "Office said no" });

  assert.equal(verdict.allowed, false);
  assert.equal(verdict.code, "NOT_A_SUPERVISOR");
});

test("the record keeps who captured the work, not only who removed it", () => {
  const record = buildRemovalRecord({
    item: waiting,
    store: "forms",
    reason: "Captured twice by mistake",
    removedByUid: "U9",
    removedByUser: "Thandi",
    removedByRole: "SPV",
    removedAt: "2026-09-27T12:00:00.000Z",
  });

  assert.equal(record.id, "QUEUE_2");
  assert.equal(record.store, "forms");
  assert.equal(record.formType, "METER_DISCONNECTION");
  assert.equal(record.wasSent, false);
  assert.equal(record.meterNo, "12345678");
  assert.equal(record.capturedByUser, "Kaiser");
  assert.equal(record.removedByUser, "Thandi");
  assert.equal(record.removedByRole, "SPV");
  assert.equal(record.reason, "Captured twice by mistake");
  assert.equal(record.removedAt, "2026-09-27T12:00:00.000Z");
});

test("a record never carries empty holes", () => {
  const record = buildRemovalRecord({});

  for (const [key, value] of Object.entries(record)) {
    if (key === "wasSent" || key === "removedAt") continue;
    assert.equal(value, "NAv", `${key} should be NAv when it is not known`);
  }
});

test("refused work can be removed by anyone, because it will never send", () => {
  assert.equal(isRefusedByOffice({ status: "REFUSED" }), true);
  assert.equal(isRefusedByOffice({ status: "FAILED" }), true);
  assert.equal(isRefusedByOffice({ status: "CONFLICT" }), true);
});

test("work that can still reach the office is still protected", () => {
  assert.equal(isRefusedByOffice(waiting), false);
  assert.equal(isUnsentWork(waiting), true, "a field worker still cannot delete pending work");
  assert.equal(canRemoveUnsentWork("FWR"), false);
});
