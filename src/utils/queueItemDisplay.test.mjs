import test from "node:test";
import assert from "node:assert/strict";
import {
  canEditQueueItem,
  getQueueItemDisplayResult,
  getQueueItemSyncLabel,
} from "./queueItemDisplay.js";

test("IN_PROGRESS queue items are editable, show Draft Only sync label, and display local-save message", () => {
  assert.equal(canEditQueueItem("IN_PROGRESS"), true);
  assert.equal(canEditQueueItem("PENDING"), true);
  assert.equal(canEditQueueItem("SUCCESS"), false);

  assert.equal(
    getQueueItemSyncLabel({ isOnline: true, status: "IN_PROGRESS" }),
    "Draft Only",
  );
  assert.equal(
    getQueueItemSyncLabel({ isOnline: true, status: "PENDING" }),
    "Sync",
  );

  let refusalCalled = false;
  const display = getQueueItemDisplayResult(
    {
      status: "IN_PROGRESS",
      result: {
        code: "LOCAL_SAVE_ONLY",
        message: "Saved locally only. Not submitted.",
      },
    },
    () => {
      refusalCalled = true;
      return { title: "Should not run", body: "" };
    },
  );
  assert.equal(refusalCalled, false);
  assert.deepEqual(display, {
    code: "LOCAL_SAVE_ONLY",
    message: "Saved locally only. Not submitted.",
  });
});

test("IN_PROGRESS without result falls back to LOCAL_SAVE_ONLY edit prompt", () => {
  const display = getQueueItemDisplayResult({ status: "IN_PROGRESS" });
  assert.deepEqual(display, {
    code: "LOCAL_SAVE_ONLY",
    message: "Saved locally only. Tap Edit to continue and submit.",
  });
});
