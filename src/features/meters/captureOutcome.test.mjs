// f01: the phone does not say MISSION SUCCESS for a meter that does not exist.
//
// The server taking the capture is not the same as the meter existing. When the step behind the
// server failed it said nothing, and the worker walked away believing the meter was done — so it
// went out to somebody again, and the numbers stopped balancing, because a transaction with no asset
// behind it is counted by everything that reads transactions and by nothing that reads meters
// (owner, 2026-09-28, after a capture died this way on TEST).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formSource = await readFile(
  new URL("./FormMeterDiscovery.js", import.meta.url),
  "utf8",
);
const outcomeSource = await readFile(
  new URL("./captureOutcome.js", import.meta.url),
  "utf8",
);

test("the phone waits for the meter before it claims success", () => {
  // Three screens call setShowSuccess: the saved-on-the-phone panel, No Access, and the found-meter
  // one. Only the last is the green MISSION SUCCESS this rule is about, so take the one that follows
  // the wait rather than the first in the file.
  const waitAt = formSource.indexOf("const meterRecord = await waitForMeterRecord({");

  assert.ok(waitAt > -1, "the phone no longer waits for the meter");
  assert.ok(
    formSource.indexOf("setShowSuccess(true)", waitAt) > waitAt,
    "nothing claims success after the wait, so the wait decides nothing",
  );
  assert.ok(
    formSource.slice(0, waitAt).lastIndexOf("setShowSuccess(true)") <
      formSource.lastIndexOf("await removeSubmissionQueueItem(activeQueueItemId);"),
    "the green panel for a found meter is shown before the meter is known to exist",
  );
});

test("no meter means the worker is told, and not sent on as though it worked", () => {
  const block = formSource.slice(formSource.indexOf("if (!meterRecord) {"));

  assert.ok(block.startsWith("if (!meterRecord) {"), "the no-meter branch is gone");
  assert.match(
    block.slice(0, 700),
    /captureFailureMessage\(\s*\r?\n?\s*await readCaptureFailure\(/,
    "the worker is not shown the reason the server recorded",
  );
  assert.match(block.slice(0, 700), /return;/, "it carries on to MISSION SUCCESS anyway");
});

test("the worker is not held twice for the same meter", () => {
  // The follow-on chain waits for the meter so it can open the next form. Having waited once
  // already, waiting again would keep a worker standing at a meter for no reason.
  assert.equal(
    (formSource.match(/await waitForMeterRecord\(/g) || []).length,
    1,
    "the meter is waited for more than once in one submit",
  );
  assert.match(formSource, /const astDoc = meterRecord;/);
});

test("silence is not reported as failure", () => {
  // The step behind the server may still be running. Saying the meter failed when nothing says so
  // would send a worker to re-capture a meter that is about to appear — and then it is there twice.
  assert.match(outcomeSource, /export const METER_NOT_THERE_YET = \{/);
  assert.match(outcomeSource, /has not appeared yet/);
  assert.match(
    outcomeSource,
    /if \(!failure\?\.reason\) return METER_NOT_THERE_YET;/,
    "a capture with no recorded reason is reported as a definite failure",
  );
});

test("reading the reason never breaks the telling", () => {
  // A phone that cannot read the reason must still be able to say the meter is not there.
  assert.match(outcomeSource, /} catch \(error\) \{\s*\r?\n\s*return null;/);
});
