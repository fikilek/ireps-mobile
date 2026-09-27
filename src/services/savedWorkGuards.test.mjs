// OF-R002 (1.0.0): work leaves the phone only when the office accepted it, or when a supervisor
// removed it on purpose with a reason.
//
// Three faults the owner met on his own phone on 27 September:
//   1. Clear sat beside Sync and emptied the queue after one tap, unsent captures included. Two
//      queued disconnections went that way.
//   2. Targeted Batch No Access told the worker the capture "will sync automatically". No service
//      ever looked at it, so it sat there until somebody pressed Sync by hand.
//   3. That same dialog explained itself with "the same TRN ID" — our word, not a worker's.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const screens = {
  forms: await read("../../app/(tabs)/admin/storage/forms-submission-queue.js"),
  premises: await read("../../app/(tabs)/admin/storage/premise-offline-storage.js"),
  accountData: await read("../../app/(tabs)/admin/storage/account-data-submission-queue.js"),
  informalErf: await read("../../app/(tabs)/admin/storage/informal-erf-submission-queue.js"),
};

const queueSource = await read("./processSubmissionQueue.js");
const senderSource = await read("./startMeterDiscoveryQueueSyncService.js");
const noAccessSource = await read("../../app/(tabs)/admin/operations/targeted-batch-no-access.js");

test("no screen can empty a queue of work that has not been sent", () => {
  const destructive = [
    "clearSubmissionQueue",
    "clearPremiseQueue",
    "clearAccountDataSubmissionQueue",
    "clearInformalErfSubmissionQueue",
  ];

  for (const [name, source] of Object.entries(screens)) {
    for (const call of destructive) {
      assert.equal(
        source.includes(call),
        false,
        `the ${name} screen can still throw away work the office has never seen (${call})`,
      );
    }
  }
});

test("every Clear button clears only what the office has confirmed", () => {
  const sweeps = {
    forms: "clearConfirmedSubmissions",
    premises: "clearConfirmedPremiseQueueItems",
    accountData: "clearConfirmedAccountDataQueueItems",
    informalErf: "clearConfirmedInformalErfQueueItems",
  };

  for (const [name, sweep] of Object.entries(sweeps)) {
    assert.ok(
      screens[name].includes(`await ${sweep}()`),
      `the ${name} screen does not clear sent work with ${sweep}`,
    );
    assert.ok(
      screens[name].includes("Clear sent"),
      `the ${name} screen still offers a Clear that does not say what it clears`,
    );
  }
});

test("removing a capture goes through the supervisor dialog on every screen", () => {
  for (const [name, source] of Object.entries(screens)) {
    assert.ok(
      source.includes("RemoveSavedWorkDialog"),
      `the ${name} screen removes work without asking who is asking`,
    );
    assert.ok(
      source.includes("recordWorkRemoval({"),
      `the ${name} screen removes work without recording it`,
    );
  }
});

test("the background sender is told which forms are proved, not left to guess", () => {
  assert.match(
    senderSource,
    /filterMode: "AUTO_SEND"/,
    "the sender no longer picks the forms it is allowed to send",
  );

  const list = queueSource.match(/const AUTO_SEND_FORM_TYPES = \[([^\]]+)\]/);

  assert.ok(list, "there is no list of forms proved safe to send in the background");
  assert.match(list[1], /"METER_DISCOVERY"/, "Meter Discovery is no longer sent in the background");
  assert.match(
    list[1],
    /"SALES_TARGETED_BATCH_NO_ACCESS"/,
    "Targeted Batch No Access still promises to send by itself without anything sending it",
  );
});

test("a Targeted Batch No Access capture books its own next try", () => {
  // The listener only fires when the signal CHANGES. A phone that was already offline when the
  // worker saved would otherwise never be woken.
  assert.match(
    noAccessSource,
    /scheduleMeterDiscoveryQueueSyncRetry\(\{ agentUid, agentName, delayMs: 20000 \}\)/,
    "a saved No Access capture waits for a signal change that may never come",
  );
});

test("the worker is not told about TRN IDs or offline queues", () => {
  for (const ours of ["TRN ID", "queued safely", "Saved offline"]) {
    assert.equal(
      noAccessSource.includes(ours),
      false,
      `a worker is still shown our own word: "${ours}"`,
    );
  }

  assert.ok(
    noAccessSource.includes("Saved on this phone"),
    "the worker is no longer told plainly where the work is",
  );
});

test("a submitted No Access form always lets the worker out", () => {
  // POP_TO_TOP was not handled by any navigator: dismissTo needs the screen the worker came from
  // to still be behind them. After a reload it is not, and they were left on a form they had
  // already submitted - where the only obvious move is to submit it again.
  assert.match(
    noAccessSource,
    /router\.canDismiss\?\.\(\)/,
    "the form assumes there is always a screen behind it",
  );
  assert.match(
    noAccessSource,
    /router\.replace\(target\)/,
    "there is no way back when the stack is empty",
  );
});
