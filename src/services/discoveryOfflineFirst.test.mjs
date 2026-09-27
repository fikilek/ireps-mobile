// OF-R001 (1.0.0): a form saves the worker's work on the phone before it tries to send it.
//
// Meter Discovery used to check the network once, BEFORE uploading the photographs, and wrap its
// 15-second limit around the form only, which goes AFTER them. A weak signal passed the check and
// then failed the upload, and the capture was lost with nothing saved: the worker got a technical
// error, and backing out of the form threw away the meter number, the readings and the pictures.
//
// The form's own No Access path never had this fault, because it persisted first. These tests hold
// the found-meter path to the same shape.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formSource = await readFile(
  new URL("../features/meters/FormMeterDiscovery.js", import.meta.url),
  "utf8",
);
const serviceSource = await readFile(
  new URL("./startMeterDiscoveryQueueSyncService.js", import.meta.url),
  "utf8",
);
const queueSource = await readFile(
  new URL("./processSubmissionQueue.js", import.meta.url),
  "utf8",
);

// Where the found-meter path begins. Everything before it is the No Access path, which already
// worked this way.
const foundMeterPath = (() => {
  const at = formSource.indexOf("// OF-R001 (1.0.0): offline first.");
  assert.ok(at > 0, "the found-meter path no longer says which rule it follows");
  return formSource.slice(at);
})();

test("the work is on the phone before anything is sent", () => {
  const persistAt = foundMeterPath.indexOf("await persistMeterDraftToQueue()");
  const sendAt = foundMeterPath.indexOf("processSubmissionQueue({");

  assert.ok(persistAt > -1, "the found meter is never saved on the phone");
  assert.ok(sendAt > -1, "the found meter is never sent");
  assert.ok(
    persistAt < sendAt,
    "the phone sends before it saves, which is the fault this rule exists to stop",
  );
});

test("nothing is sent when the save itself failed", () => {
  assert.match(
    foundMeterPath,
    /if \(!persistResult\?\.success \|\| !activeQueueItemId\) \{/,
    "a failed save no longer stops the submission",
  );
});

test("the form does not upload, call the server, or test the network itself", () => {
  // All three now belong to processSubmissionQueue, so they share one deadline instead of the
  // photographs having none. This is also what lets every other form reuse the same plumbing.
  for (const owned of ["uploadBytes", "httpsCallable", "NetInfo"]) {
    assert.equal(
      formSource.includes(owned),
      false,
      `${owned} is back in the form, so the photographs have slipped outside the deadline again`,
    );
  }
});

test("MISSION SUCCESS waits for the office to really have it", () => {
  // The owner's decision of 27 September: the phone waits rather than saying the work is done and
  // telling the worker later. The 15 seconds is what keeps the waiting honest.
  assert.match(
    foundMeterPath,
    /syncedQueueItem\?\.status !== "SUCCESS"/,
    "the green panel no longer checks that the office accepted the work",
  );
  assert.match(foundMeterPath, /15000,/, "the 15-second limit is gone");
});

test("a capture kept on the phone is promised a retry, and gets one", () => {
  const savedLocally = foundMeterPath.split("showSavedQueueConfirmation(").length - 1;
  const retries = foundMeterPath.split("scheduleMeterDiscoveryQueueSyncRetry(").length - 1;

  assert.ok(savedLocally >= 3, "the saved-on-the-phone answers have been reduced");
  assert.ok(
    retries >= 3,
    "a capture is told it will be sent automatically without anything being asked to send it",
  );
});

test("a refusal is never promised a retry", () => {
  // m06: when the server has decided, sending it again cannot change its mind.
  const startsAt = foundMeterPath.indexOf('syncedQueueItem?.status === "CONFLICT"');
  assert.ok(startsAt > 0, "the refusal branch is gone");

  const refusal = foundMeterPath.slice(startsAt);
  const nextBranch = refusal.search(/syncedQueueItem\?\.status !== "SUCCESS"/);
  assert.ok(nextBranch > 0, "the branch after the refusal is gone");

  assert.equal(
    refusal.slice(0, nextBranch).includes("will be sent"),
    false,
    "a refused capture is told it will be sent later, which it never will be",
  );
});

test("the pictures are out of the camera cache before the work is saved", () => {
  // A capture waiting for signal is only safe if its evidence is still there when the signal
  // comes back, and the phone empties its camera cache when it pleases.
  const copiedAt = formSource.indexOf("cleanPayload.media = await persistNoAccessMeterDiscoveryMedia(");
  const savedAt = formSource.indexOf("const persistMeterDraftToQueue = async () => {");

  assert.ok(copiedAt > -1, "the pictures are left in the camera cache");
  assert.ok(copiedAt < savedAt, "the work is saved before its pictures are made durable");
  assert.equal(
    formSource.slice(0, copiedAt).includes("if (isNoAccessSubmission) {"),
    false,
    "only No Access captures keep their pictures again",
  );
});

test("sent pictures are swept up, for the whole form", () => {
  // Both access paths now copy into app storage, so a sweep that still asked for no-access only
  // would fill the phone with evidence the office already has.
  const sweep = queueSource.slice(queueSource.indexOf("cleanupNoAccessMeterDiscoveryMedia({"));
  assert.ok(sweep.length > 0, "the sweep is gone");
  assert.equal(
    queueSource
      .slice(0, queueSource.indexOf("await cleanupNoAccessMeterDiscoveryMedia({"))
      .includes('.toLowerCase() === "no"'),
    false,
    "the sweep is gated on No Access again",
  );
});

test("a capture sent in the background is cleared off the phone too", () => {
  // The form clears its own when the answer arrives inside its 15 seconds. A capture that went
  // out later, in the background, was left reading SUCCESS in Saved Work for ever - one per
  // meter the worker finished. Found by the owner on his phone, 27 September.
  assert.match(
    serviceSource,
    /await clearSentMeterDiscoveries\(\);/,
    "nothing clears a capture the background sender delivered",
  );
  assert.match(
    serviceSource,
    /item\?\.status !== "SUCCESS"/,
    "the sweep no longer checks that the office really accepted it",
  );
  // It must not run inside processSubmissionQueue: a form waiting there reads the item back to
  // see how it went, and would find nothing.
  assert.equal(
    queueSource.includes("clearSentMeterDiscoveries"),
    false,
    "the sweep has moved into the queue, where it deletes items forms are still reading",
  );
});

test("the sender covers the whole form, not only No Access", () => {
  // The service in app/_layout.js is the only one that actually runs, and it used to ask for
  // no-access captures alone. A found meter saved on the phone would have sat there for ever.
  assert.match(
    serviceSource,
    /filterMode: "METER_DISCOVERY",/,
    "the running sender is back to No Access only",
  );
  assert.match(
    queueSource,
    /if \(filterMode === "METER_DISCOVERY"\) \{\s*\r?\n\s*return isStandardMeterDiscoveryQueueItem\(item\);/,
    "the queue no longer knows how to pick out the whole of Meter Discovery",
  );
});
