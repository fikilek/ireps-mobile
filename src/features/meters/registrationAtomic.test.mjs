// RG-R001: a registration produces its meter, or it never happened.
//
// The phone's half of the rule. The server now writes the transaction, the meter, the meter master's
// field link and the premise's meter list in one commit, so what changes here is what the phone sends
// and what it says afterwards: the time the work was actually done, no invented address, the plain
// sentence when the work is refused, and the photographs taken away again when nothing was saved.
//
// These are source checks, as the other tests over these two forms are: they are React files with a
// form engine inside them, and the shape of what they send is what matters.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const discoverySource = await readFile(
  new URL("./FormMeterDiscovery.js", import.meta.url),
  "utf8",
);
const installationSource = await readFile(
  new URL("./FormMeterIstallation.js", import.meta.url),
  "utf8",
);
const queueSource = await readFile(
  new URL("../../services/processSubmissionQueue.js", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// The two times
// ---------------------------------------------------------------------------

test("Meter Discovery sends the time the work was done", () => {
  const at = discoverySource.indexOf("const trnMetadata = {");
  assert.ok(at > 0, "the discovery form no longer builds its own metadata");

  const metadata = discoverySource.slice(at, at + 400);
  assert.match(
    metadata,
    /createdOnDevice: timestamp/,
    "the phone does not say when the work was done, so the office will date it on arrival",
  );
  assert.match(metadata, /updatedOnDevice: timestamp/);
});

test("Meter Installation sends it too", () => {
  const at = installationSource.indexOf("const trnMetadata = {");
  assert.ok(at > 0, "the installation form no longer builds its own metadata");

  const metadata = installationSource.slice(at, at + 400);
  assert.match(metadata, /createdOnDevice: timestamp/);
  assert.match(metadata, /updatedOnDevice: timestamp/);
});

// ---------------------------------------------------------------------------
// There can be no premise without an address
// ---------------------------------------------------------------------------

test("neither form invents an address for a premise", () => {
  assert.doesNotMatch(
    discoverySource,
    /address: premiseAddress \|\| "N\/Av"/,
    "the discovery form still fills a missing address with a placeholder",
  );
  assert.doesNotMatch(
    installationSource,
    /address: premiseAddress \|\| "N\/Av"/,
    "the installation form still fills a missing address with a placeholder",
  );
});

test("the placeholder spelling is gone from what either form sends", () => {
  for (const [name, source] of [
    ["discovery", discoverySource],
    ["installation", installationSource],
  ]) {
    const at = source.indexOf("premise: {");
    assert.ok(at > 0, `the ${name} form no longer sends a premise block`);
    assert.doesNotMatch(
      source.slice(at, at + 600),
      /"N\/Av"/,
      `the ${name} form still writes N/Av into the premise it sends`,
    );
  }
});

// ---------------------------------------------------------------------------
// A refusal takes its photographs with it
// ---------------------------------------------------------------------------

test("the sender keeps a list of what it put into storage", () => {
  assert.match(queueSource, /const uploadedStoragePaths = \[\]/);
  assert.match(
    queueSource,
    /uploadedStoragePaths\.push\(storagePath\)/,
    "the sender uploads evidence it cannot find again to delete",
  );
});

test("an answered refusal deletes the evidence before it records the refusal", () => {
  const at = queueSource.indexOf("if (!result?.success) {");
  assert.ok(at > 0, "the answered-refusal path has moved");

  const block = queueSource.slice(at, at + 1600);
  const deleteAt = block.indexOf("deleteUploadedEvidence({");
  const refuseAt = block.indexOf("markSubmissionQueueItemRefused(");

  assert.ok(deleteAt > -1, "a refused submission leaves its photographs behind");
  assert.ok(
    deleteAt < refuseAt,
    "the evidence is cleared after the refusal is recorded, so a failure there keeps the orphans",
  );
});

test("a thrown refusal deletes the evidence too", () => {
  const at = queueSource.indexOf("if (isThrownRefusal(code)) {");
  assert.ok(at > 0, "the thrown-refusal path has moved");

  assert.match(
    queueSource.slice(at, at + 700),
    /deleteUploadedEvidence\(\{/,
    "a refusal the server throws leaves its photographs behind",
  );
});

test("clearing the evidence never becomes the failure the worker sees", () => {
  const at = queueSource.indexOf("async function deleteUploadedEvidence(");
  assert.ok(at > 0, "the evidence sweep has gone");

  const body = queueSource.slice(at, at + 900);
  assert.match(body, /try \{/, "a file that cannot be deleted would throw");
  assert.match(body, /console\.warn\(/, "a file left behind is never reported");
});

// ---------------------------------------------------------------------------
// What the worker reads
// ---------------------------------------------------------------------------

test("a refusal shows the worker the plain sentence and keeps our own words for the office", () => {
  const at = queueSource.indexOf("if (!result?.success) {");
  const block = queueSource.slice(at, at + 1600);

  assert.match(
    block,
    /message:\s*\n?\s*result\?\.plain \|\| result\?\.message/,
    "the worker is shown the server's own wording instead of the plain sentence",
  );
  assert.match(
    block,
    /detail: result\?\.message \|\| "NAv"/,
    "our own message is thrown away instead of being kept beside the plain one",
  );
});

test("a premise that is not ready yet still waits instead of being refused", () => {
  // RG-R001 section 6 draws the line: a refusal that will never change by itself stops, and anything
  // that will change on its own keeps waiting. The premise arriving late is the second kind.
  assert.match(
    queueSource,
    /const KEEP_WAITING_CODES = \["INVALID_PREMISE_ID", "PREMISE_NOT_FOUND"\]/,
  );
});
