import test from "node:test";
import assert from "node:assert/strict";
import { waitForNoAccessSend } from "./noAccessSendDeadline.js";
test("a slow send releases the form but retains the eventual result", async () => {
  let finish;
  const attempt = new Promise((resolve) => { finish = resolve; });
  assert.equal((await waitForNoAccessSend(attempt, 5)).code, "SEND_PENDING");
  finish({ success: true });
  assert.equal((await attempt).success, true);
});
test("immediate acknowledgement or failure passes through", async () => {
  assert.equal((await waitForNoAccessSend(Promise.resolve({ success: true }))).success, true);
  await assert.rejects(waitForNoAccessSend(Promise.reject(new Error("save failed"))), /save failed/);
});
