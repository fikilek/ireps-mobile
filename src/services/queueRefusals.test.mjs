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

// The list as the file declares it.
const refusedCodes = (() => {
  const start = queueSource.indexOf("const REFUSED_BY_THE_SERVER = [");
  assert.notEqual(start, -1, "the refusal list is gone");
  const end = queueSource.indexOf("];", start);
  return queueSource
    .slice(start, end)
    .split("\n")
    .map((line) => line.match(/"([A-Z_]+)"/)?.[1])
    .filter(Boolean);
})();

test("the phone knows both codes the batch guard refuses with", () => {
  assert.ok(
    refusedCodes.includes("METER_IN_ANOTHER_TEAMS_BATCH"),
    "the meter is in another team's batch",
  );
  assert.ok(
    refusedCodes.includes("BATCH_CHECK_UNAVAILABLE"),
    "iREPS could not read the batch and refused rather than let the work through",
  );
});

test("the refusals the phone already knew are still there", () => {
  for (const code of [
    "TARGETED_BATCH_ACCESS_DENIED",
    "TARGETED_BATCH_NOT_ASSIGNED_TO_ACTOR",
    "TARGETED_BATCH_METER_ALREADY_LINKED",
    "TARGETED_BATCH_ROW_NOT_EXECUTABLE",
    "IDEMPOTENCY_CONFLICT",
    "SALES_DOCUMENT_NOT_FOUND",
  ]) {
    assert.ok(refusedCodes.includes(code), `${code} was dropped from the list`);
  }
  assert.equal(new Set(refusedCodes).size, refusedCodes.length, "a code is listed twice");
});

test("a refused job is kept as a conflict, never retried, with the server's own sentence", () => {
  assert.match(queueSource, /if \(REFUSED_BY_THE_SERVER\.includes\(code\)\) \{/);
  const branch = queueSource.slice(
    queueSource.indexOf("if (REFUSED_BY_THE_SERVER.includes(code)) {"),
    queueSource.indexOf("// Parent premise not ready yet"),
  );
  assert.match(branch, /status: "CONFLICT"/);
  // Word for word: the server's message is kept, and only stood in for when it sent none.
  assert.match(branch, /message: result\?\.message \|\|/);
  // It does not fall through to the retrying path.
  assert.match(branch, /continue;/);
});

test("every form that goes through the queue is covered by that one list", () => {
  // Meter Discovery's No Access queue runs the same processor with a filter, so the codes cover it too.
  assert.doesNotMatch(queueSource, /METER_IN_ANOTHER_TEAMS_BATCH[\s\S]{0,400}formType/);
  assert.equal(
    (queueSource.match(/REFUSED_BY_THE_SERVER/g) || []).length,
    2,
    "the list is declared once and read once",
  );
});

test("the card calls a refused job refused, not still pending", () => {
  assert.match(cardSource, /item\?\.status === "CONFLICT"\s*\?\s*"Refused"/);
  // And it shows what the server said, rather than "Draft saved locally".
  assert.match(cardSource, /message: item\?\.result\?\.message/);
  const pending = cardSource.slice(
    cardSource.indexOf('if (item?.status === "PENDING")'),
    cardSource.indexOf('if (item?.status === "SYNCING")'),
  );
  assert.match(pending, /Draft saved locally/, "PENDING keeps its own wording");
});

test("the wider trap is still open, and is m06 — not silently assumed fixed", () => {
  // Any code NOT on the list is still written back as PENDING and retried for ever. x11 covers the two
  // the guard uses; the owner kept the wider fix as its own job so it does not delay the LIVE release.
  assert.match(failedSource, /keeping item PENDING/);
  assert.match(failedSource, /status: "PENDING"/);
});
