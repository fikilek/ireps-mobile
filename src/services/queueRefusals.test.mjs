// x11 (TB-R059): a job the server refuses must stop, and say what the server said.
//
// The server refuses work on a meter in another team's batch with one of two codes. The phone did not
// know either, so it read the refusal as a network problem: the job went back to PENDING, the card said
// "Draft saved locally", and it was retried for ever while the worker believed it was safe.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const queueSource = await readFile(
  new URL("./processSubmissionQueue.js", import.meta.url),
  "utf8",
);
const cardSource = await readFile(
  new URL("../../components/QueueItemCard.js", import.meta.url),
  "utf8",
);
const failedSource = await readFile(
  new URL("../utils/submissionQueue.js", import.meta.url),
  "utf8",
);
const storageSource = await readFile(
  new URL("../../app/(tabs)/admin/storage/forms-submission-queue.js", import.meta.url),
  "utf8",
);

// The codes that still mean "not yet, try later".
const keepWaiting = (() => {
  const line = queueSource.match(/const KEEP_WAITING_CODES = \[([^\]]*)\]/);
  assert.ok(line, "the waiting list is gone");
  return line[1].split(",").map((part) => part.trim().replace(/"/g, "")).filter(Boolean);
})();

test("a refusal the phone has never heard of still stops (x11 and m06)", () => {
  // The two the batch guard uses are not named anywhere, and do not need to be: anything the server
  // refuses stops. That is the point - the next code anybody adds cannot fall into the old trap.
  assert.doesNotMatch(queueSource, /METER_IN_ANOTHER_TEAMS_BATCH|BATCH_CHECK_UNAVAILABLE/);
  assert.match(queueSource, /markSubmissionQueueItemRefused\(/);
});

test("only a job that is genuinely not ready yet keeps waiting", () => {
  assert.deepEqual(keepWaiting, ["INVALID_PREMISE_ID", "PREMISE_NOT_FOUND"]);
  const branch = queueSource.slice(
    queueSource.indexOf("if (KEEP_WAITING_CODES.includes(code)) {"),
    queueSource.indexOf("// The server answered and refused"),
  );
  assert.match(branch, /status: "PENDING"/);
});

test("a refused job is kept as a conflict, never retried, with the server's own sentence", () => {
  const refused = failedSource.slice(
    failedSource.indexOf("export const markSubmissionQueueItemRefused"),
    failedSource.indexOf("export const markSubmissionQueueItemFailed"),
  );
  assert.match(refused, /status: "CONFLICT"/);
  // Word for word: the server's message is kept, and only stood in for when it sent none.
  assert.match(refused, /message: result\?\.message \|\|/);
  // Work the server has already accepted is never turned into a refusal.
  assert.match(refused, /Queue item is already server-confirmed/);
});

test("every form that goes through the queue is covered, in one place", () => {
  // Meter Discovery's No Access queue runs the same processor with a filter, so one rule serves
  // Discovery, Installation, Removal, Disconnection, Reconnection, Inspection, Reading and
  // Commissioning. Nothing here is per form.
  assert.doesNotMatch(queueSource, /formType[\s\S]{0,80}REFUSED|REFUSED[\s\S]{0,80}formType/);
  assert.doesNotMatch(queueSource, /REFUSED_BY_THE_SERVER/, "the old list is gone");
});

test("m06 is closed: nothing the server refuses is written back as waiting", () => {
  // The trap was that markSubmissionQueueItemFailed writes PENDING for everything, and every code the
  // phone did not recognise went to it. It is now only for a job that never reached the server.
  assert.match(failedSource, /keeping item PENDING/);
  const failed = failedSource.slice(failedSource.indexOf("export const markSubmissionQueueItemFailed"));
  assert.match(failed, /status: "PENDING"/);

  // Both files send a refusal to the refusal marker, and keep the waiting marker for their catch block.
  for (const source of [queueSource, storageSource]) {
    const waiting = (source.match(/markSubmissionQueueItemFailed\(/g) || []).length;
    assert.equal(waiting, 1, "only the catch block may keep a job waiting");
    assert.match(source, /markSubmissionQueueItemRefused\(/);
  }
});

test("a refused card is red and says Refused, and the worker is never told it is saved", () => {
  assert.match(cardSource, /item\?\.status === "CONFLICT"\s*\?\s*"Refused"/);
  assert.match(cardSource, /if \(status === "CONFLICT"\) return "#dc2626";/);
  assert.match(cardSource, /message: item\?\.result\?\.message/);
  const pending = cardSource.slice(
    cardSource.indexOf('if (item?.status === "PENDING")'),
    cardSource.indexOf('if (item?.status === "SYNCING")'),
  );
  assert.match(pending, /Draft saved locally/, "PENDING keeps its own wording");
});
