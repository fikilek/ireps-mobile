// OF-R002 section 7: work leaves the phone only when the office accepted it, or when a supervisor
// removed it on purpose, with a reason that is recorded.
import assert from "node:assert/strict";
import test from "node:test";

import {
  assessRemoval,
  buildRemovalRecord,
  canRemoveUnsentWork,
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
  assert.equal(isSentToOffice(refused), false);
  assert.equal(isUnsentWork(refused), true);

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

test("a reason that explains nothing is refused", () => {
  assert.equal(validateRemovalReason("").valid, false);
  assert.equal(validateRemovalReason("   ").valid, false);
  assert.equal(validateRemovalReason("ok").valid, false);
  assert.equal(validateRemovalReason("test").valid, false);
  assert.equal(validateRemovalReason("Captured twice by mistake").valid, true);
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
