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
import { readFileSync } from "node:fs";
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

test("a capture the office has confirmed is cleared off the phone, whoever sent it", () => {
  // Found twice by the owner on 27 September: once after the background sender delivered a
  // capture, and once after he pressed Sync himself. Saved Work is work still to go, so an item
  // the office already has does not belong in it - one entry per job ever finished.
  const queueUtil = readFileSync(new URL("../utils/submissionQueue.js", import.meta.url), "utf8");
  const savedWork = readFileSync(
    new URL("../../app/(tabs)/admin/storage/forms-submission-queue.js", import.meta.url),
    "utf8",
  );

  // One sweep, and it is not Meter Discovery only: the pile-up does not care which form made it.
  assert.ok(
    queueUtil.includes("export const clearConfirmedSubmissions = async () => {"),
    "the shared sweep is gone",
  );
  assert.ok(
    queueUtil.includes('item?.status === "SUCCESS" && item?.result?.success === true'),
    "the sweep no longer requires the office to have confirmed it, so it could drop unsent work",
  );
  assert.equal(
    queueUtil.includes('formType !== "METER_DISCOVERY"'),
    false,
    "the sweep is narrowed to one form again",
  );

  // Both ways a capture can go out.
  assert.ok(
    serviceSource.includes("await clearConfirmedSubmissions();"),
    "the background sender does not clear what it has just delivered",
  );
  // Both Sync buttons, and from 27 September the Clear button too: Clear now takes away what the
  // office has confirmed and nothing else (OF-R002 section 7).
  assert.ok(
    savedWork.split("await clearConfirmedSubmissions();").length - 1 >= 2,
    "both Sync buttons must clear what they have just sent",
  );

  // It must never run where a form is waiting to read its own item back.
  assert.equal(queueSource.includes("clearConfirmedSubmissions"), false);
});

test("the sender covers the whole form, not only No Access", () => {
  // The service in app/_layout.js is the only one that actually runs, and it used to ask for
  // no-access captures alone. A found meter saved on the phone would have sat there for ever.
  //
  // 27 September: it now asks for AUTO_SEND, the list of forms whose submit path has been proved
  // offline first. Meter Discovery is on that list, so this still holds; Targeted Batch No Access
  // joined it (savedWorkGuards.test.mjs).
  assert.match(
    serviceSource,
    /filterMode: "AUTO_SEND",/,
    "the running sender no longer asks for the proved forms",
  );
  assert.match(
    queueSource,
    /const AUTO_SEND_FORM_TYPES = \[[^\]]*"METER_DISCOVERY"/,
    "the running sender is back to No Access only",
  );
  assert.match(
    queueSource,
    /if \(filterMode === "METER_DISCOVERY"\) \{\s*\r?\n\s*return isStandardMeterDiscoveryQueueItem\(item\);/,
    "the queue no longer knows how to pick out the whole of Meter Discovery",
  );
});

// OF-R001 — WHAT THE SCREEN SHOWS AFTER THE SENDER HAS BEEN
//
// The owner, 4 October 2026, after the first offline capture on his phone: "it did auto send
// when I opened up the network but it didn't clear the UI ... as soon as I clicked the sync
// button it just disappeared quickly. It's not like it was sending." The record was written at
// 18:21:31 and the Submission Queue screen still showed the capture as unsent at 18:25.
//
// The screen read the queue once, on focus, and focus only fires on the way IN. The background
// sender empties the queue without the worker touching anything, so a screen already open went
// on showing work that had been sent - and a worker looking at unsent work that is not unsent
// is being told something untrue, which is the same fault as a refusal shown as "saved".

const submissionQueueSource = await readFile(
  new URL("../utils/submissionQueue.js", import.meta.url),
  "utf8",
);
const queueScreenSource = await readFile(
  new URL("../../app/(tabs)/admin/storage/forms-submission-queue.js", import.meta.url),
  "utf8",
);

test("OF-R001: the queue says when it changes", () => {
  assert.match(
    submissionQueueSource,
    /export function subscribeToSubmissionQueue/,
    "nothing can hear about a queue change, so every reader is left to guess or poll",
  );

  // Every write in that file goes through writeQueueToStorage. Announcing anywhere else would
  // mean a write that changes the queue silently.
  const writer = submissionQueueSource.slice(
    submissionQueueSource.indexOf("const writeQueueToStorage"),
  );
  assert.match(
    writer.slice(0, writer.indexOf("return { success: true }")),
    /announceQueueChanged\(\)/,
    "the one place that writes the queue does not say so, so some changes are announced and some are not",
  );
});

test("OF-R001: the Submission Queue screen hears it, rather than only reading on focus", () => {
  assert.match(
    queueScreenSource,
    /subscribeToSubmissionQueue\(loadQueue\)/,
    "the screen only reloads when it comes into focus, so a background send leaves sent work on screen",
  );
});
