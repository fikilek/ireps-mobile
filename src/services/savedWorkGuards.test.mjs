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
  premises: await read(
    "../../app/(tabs)/admin/storage/premise-offline-storage.js",
  ),
  accountData: await read(
    "../../app/(tabs)/admin/storage/account-data-submission-queue.js",
  ),
  informalErf: await read(
    "../../app/(tabs)/admin/storage/informal-erf-submission-queue.js",
  ),
};

const queueSource = await read("./processSubmissionQueue.js");
const senderSource = await read("./startMeterDiscoveryQueueSyncService.js");
// The No Access screen is now one screen for every transaction (NA-R003), and its words live
// beside it, so the guard reads both as one source.
const noAccessSource =
  (await read("../../app/(tabs)/admin/operations/no-access.js")) +
  (await read("../features/meters/noAccessSubmitMessages.js"));

// The same source with the prose taken out. A guard that forbids a call must read CODE: three
// times today a comment EXPLAINING why something was removed tripped the guard that forbade
// it - and worse, such a guard is silenced by deleting the comment rather than by fixing the
// code.
const noAccessCode = noAccessSource
  .split(/\r?\n/)
  .filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("/*")
    );
  })
  .join("\n");

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

  assert.ok(
    list,
    "there is no list of forms proved safe to send in the background",
  );
  // A no access IS a Meter Discovery now (NA-R003), and travels under that form type, so this
  // one entry carries both promises: a saved discovery and a saved no access each tell the
  // worker they will send by themselves, and the background sender has to be allowed to.
  assert.match(
    list[1],
    /"METER_DISCOVERY"/,
    "a saved Meter Discovery or No Access promises to send by itself with nothing sending it",
  );
});

test("a No Access capture books its own next try", () => {
  // The listener only fires when the signal CHANGES. A phone that was already offline when the
  // worker saved would otherwise never be woken.
  assert.match(
    noAccessSource,
    // Written so the formatter cannot break the guard: what matters is that the call is made
    // with a delay, not how many lines Prettier puts it on.
    /scheduleMeterDiscoveryQueueSyncRetry\(\{\s*agentUid,\s*agentName,\s*delayMs: 20000,?\s*\}\)/,
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

test("a submitted No Access form always leaves the screen", () => {
  // The owner, 3 October: "after the NA form is submitted the form does not clear, it remains
  // on the screen."
  //
  // It used to try router.dismissTo and RETURN. dismissTo only works when the screen it names
  // is still behind this one; where it is not it does nothing at all - no error, no navigation
  // - and the early return meant the replace below was never reached. The worker tapped OK on
  // "No Access recorded" and stayed on the form they had just sent.
  assert.equal(
    noAccessCode.includes("dismissTo"),
    false,
    "the form can silently stay on screen again: dismissTo does nothing when its target is not in the stack",
  );

  assert.match(
    noAccessSource,
    /router\.replace\(target\)/,
    "nothing takes the worker off a form they have already sent",
  );

  // NA-R006: BACK first, so the screen underneath is the one the worker left - the same
  // bucket, the same rows. replace() builds a new screen that has forgotten all of it.
  assert.match(
    noAccessCode,
    /router\.canGoBack\?\.\(\)/,
    "the form replaces the screen instead of going back, so My Work Orders forgets its bucket",
  );
  assert.match(
    noAccessCode,
    /router\.back\(\)/,
    "nothing pops this screen off the stack",
  );

  // THE SUBMIT LEAVES, NOT A BUTTON (owner, 4 Oct 2026: "why don't you do your routing at the
  // end of the NA submit function").
  //
  // It used to be goBack on the alert's OK, so the function finished with the form still on
  // screen waiting for a tap. If that tap did not come the worker was left on a capture they
  // had already sent, where the only obvious move is to send it again.
  assert.equal(
    noAccessCode.includes("onPress: goBack"),
    false,
    "leaving is hidden in a button callback again, so the form stays until somebody taps",
  );

  // goBack() is called in send() itself, after the form is cleared and the result shown.
  assert.match(
    noAccessCode,
    /Alert\.alert\(result\.title, result\.body\);\s*goBack\(\);/,
    "the submit no longer leaves the screen by itself",
  );

  // And no `finally`: it would run setBusy after the screen has gone.
  assert.equal(
    /\}\s*finally\s*\{/.test(noAccessCode),
    false,
    "finally is back, so cleanup runs after the screen has already been left",
  );
});

test("the No Access screen takes no position from the phone at all", () => {
  // THIS REPLACES the GPS deadline guard. That guard existed because the screen held the
  // submit for up to twenty seconds chasing a fix, and indoors behind a wall - exactly where a
  // no access is filled in - it could sit there for ever with nothing yet saved (the owner's
  // own phone, 27 September: "the gps picker was stuck").
  //
  // TR-R003 (0.6.0) removed the cause rather than capping it. The owner, 3 October: "the AST
  // location GPS must always be the asset location. The fallback is the premise location."
  // A worker who could not touch the meter is standing at a gate, not at the meter, so their
  // fix was never the asset's position however long the phone took to get it. The server reads
  // the asset and the premise instead, so the worker waits for nothing.
  for (const gone of [
    "expo-location",
    "readPosition",
    "GPS_FIX_DEADLINE_MS",
    "getCurrentPositionAsync",
    "getLastKnownPositionAsync",
  ]) {
    assert.equal(
      noAccessSource.includes(gone),
      false,
      `the screen is reading a position again ("${gone}"), which puts the wait back and lets a worker's own fix pass for the meter's`,
    );
  }

  // It sends the meter id instead, which is all the server needs to ask whether this no access
  // HAS a meter - a Reading does, a first-visit Discovery does not.
  assert.match(
    noAccessSource,
    /astId: context\.astId \|\| null/,
    "the server cannot tell whether there is an asset to take a position from",
  );

  // The retired home. Every record that ever used it was a no access written by this screen.
  assert.equal(
    /^\s*location,\s*$/m.test(noAccessSource),
    false,
    "the screen is writing root location again, which is the second home TR-R003 removed",
  );
});

test("unknown reachability counts as online", () => {
  // Coming out of airplane mode Android reports "connected, reachability unknown" for a few
  // seconds. Demanding a definite yes made the sender answer device offline and stop.
  assert.match(
    queueSource,
    /netState\.isInternetReachable !== false/,
    "the sender refuses to try when the phone cannot yet say the internet is reachable",
  );
});

test("a run that got nothing out books its own next try", () => {
  // The listener only fires when the signal CHANGES. A run that failed just after the signal came
  // back would otherwise wait for a change that never comes - the owner watched a capture sit
  // there for two minutes with zero attempts (27 September).
  assert.match(
    senderSource,
    /const RETRY_LADDER_MS = \[[^\]]+\]/,
    "there is no retry ladder",
  );
  assert.ok(
    senderSource.includes("const step = Math.min(failedRunCount"),
    "only a busy queue books another try; every other failure gives up",
  );
  assert.ok(
    senderSource.includes(
      "scheduleMeterDiscoveryQueueSyncRetry({ delayMs: RETRY_LADDER_MS[step] })",
    ),
    "a failed run does not book its next try from the ladder",
  );
  assert.match(
    senderSource,
    /failedRunCount = 0;/,
    "the ladder never resets, so one bad day slows the phone for ever",
  );
});

// ---------------------------------------------------------------------------
// One id per capture, and a queue that cannot swallow one.
//
// The owner, 3 October: two No Access visits recorded at ERF 5213, one in the office. The
// server logs show only ONE request ever arrived - the other capture was destroyed on the
// phone and he was shown "No Access recorded" for it.
// ---------------------------------------------------------------------------

test("the No Access id belongs to the capture, not to the screen", () => {
  // It was useRef(buildNoAccessTrnId(...)), so it was fixed for as long as the screen stayed
  // mounted and two captures carried the same id.
  assert.equal(
    /useRef\(\s*buildNoAccessTrnId/.test(noAccessCode),
    false,
    "the id is fixed per screen again, so two captures can carry the same one",
  );

  assert.match(
    noAccessCode,
    /const trnId = buildTrnId\(\)/,
    "the id is no longer built for each submission",
  );

  // capturedAt belongs to the capture for the same reason: it is when THAT visit was written
  // down, not when the screen happened to open.
  assert.equal(
    /useRef\(new Date\(\)\.toISOString\(\)\)/.test(noAccessCode),
    false,
    "capturedAt is fixed per screen again",
  );
});

test("the queue refuses a second capture rather than swallowing it", async () => {
  const queueSource = await read("../utils/submissionQueue.js");

  assert.match(
    queueSource,
    /QUEUE_TRN_ID_ALREADY_SENT/,
    "a payload arriving under an id the office already has is silently discarded again",
  );

  // The short-circuit that returns the existing item must stay behind the sent check, so a
  // genuine retry of UNSENT work still works and only finished work refuses.
  const sentCheck = queueSource.indexOf("alreadySent");
  const shortCircuit = queueSource.indexOf("Queue item already saved locally");
  assert.ok(
    sentCheck > -1 && sentCheck < shortCircuit,
    "the sent check no longer runs before the short-circuit, so a finished item can be reported as a fresh save",
  );
});

// ---------------------------------------------------------------------------
// A refusal is never shown as "saved on this phone".
//
// The owner, 3 October, on ERF 5212: the server refused the work twice under TB-R062 - the
// ERF belongs to another team's batch - and the phone told him both times that it was saved
// and would send itself as soon as there was signal. It never would. He went looking for a
// fault in the capture when the office had already answered him.
//
// The screen tested `saved?.status === "REFUSED"`. The queue has never written that status:
// it writes CONFLICT. So the branch could not fire and every refusal fell through to the
// queued message.
// ---------------------------------------------------------------------------

test("the No Access screen asks what a refusal is, it does not guess the word", async () => {
  assert.equal(
    /status === "REFUSED"/.test(noAccessCode),
    false,
    'the screen is comparing against "REFUSED" again, which the queue never writes - so a refusal is shown as saved',
  );

  assert.match(
    noAccessCode,
    /isRefusedByOffice\(saved\)/,
    "the screen is not using the shared test for a refusal",
  );

  // And the shared test must still know the status the queue actually writes.
  const rulesSource = await read(
    "../features/savedWork/savedWorkRemovalRules.js",
  );
  assert.match(
    rulesSource,
    /CONFLICT/,
    "isRefusedByOffice no longer recognises CONFLICT, which is the status a refusal gets",
  );

  const queueSource = await read("../utils/submissionQueue.js");
  assert.match(
    queueSource,
    /status: "CONFLICT"/,
    "the queue marks a refusal with a different status now; every reader of it must be checked",
  );
});

// ---------------------------------------------------------------------------
// TB-R059 / TB-R062 (1.3.91) — THE FRONT GATE.
//
// The owner, 3 October: "the field worker that is doing the work should never be allowed to
// even open the form if the work is not theirs… the user must not waste his or her time
// submitting work that's going to be refused."
//
// He proved the cost on ERF 5212: reason, photograph, appointment — twice — and only at submit
// did anyone tell him the ERF belonged to Simo Team.
// ---------------------------------------------------------------------------

test("every way into a transaction form passes the front gate", async () => {
  const entries = [
    ["../features/asts/astItem.js", "the five lifecycle forms"],
    ["../../components/MissionDiscoveryModal.js", "Meter Discovery"],
    ["../../components/MissionInstallationModal.js", "Meter Installation"],
  ];

  for (const [file, what] of entries) {
    const source = await read(file);
    assert.match(
      source,
      /checkBatchWorkBeforeForm\(/,
      `${what} opens a form without asking whose batch the ERF is in`,
    );
    assert.match(
      source,
      /BATCH_WORK_BLOCKED/,
      `${what} does not stop the worker when the answer is no`,
    );
  }
});

test("the front gate shows the server's own sentence, and never writes its own", async () => {
  const gate = await read("../features/meters/batchWorkGate.js");

  // The server knows the batch, the geofence, the team and the date. A sentence composed on
  // the phone would drift from the one the submit path shows for the same refusal.
  assert.match(
    gate,
    /result\?\.message/,
    "the gate is not reading the server's message",
  );

  // It must never throw: a front gate that can crash a screen stops work the worker IS
  // entitled to do, which is the opposite of its job.
  assert.match(
    gate,
    /catch \(error\)/,
    "the gate can throw, so it can block legitimate work",
  );
  assert.match(
    gate,
    /BATCH_WORK_UNCHECKED/,
    "there is no 'could not ask' answer, so a worker with no signal is treated as refused",
  );
});

// ---------------------------------------------------------------------------
// NA-R006 — a No Access goes back where it came from.
//
// The owner, 3 October 2026: "it must not wander. If it launched from My Work Orders rows it
// must go back there; if it launched from the premise it must go there."
//
// One screen serves seven transaction types and four entry points, so it cannot know where the
// worker was unless the screen that opened it says. This fails when a new entry point forgets.
// ---------------------------------------------------------------------------

test("every screen that opens No Access says where to come back to", async () => {
  const entries = [
    ["../../app/(tabs)/admin/operations/my-workorders.js", "My Work Orders"],
    ["../features/asts/astItem.js", "the five lifecycle forms"],
    ["../../components/MissionDiscoveryModal.js", "Meter Discovery"],
    ["../../components/MissionInstallationModal.js", "Meter Installation"],
  ];

  for (const [file, what] of entries) {
    const source = await read(file);

    assert.match(
      source,
      /returnTo:/,
      `${what} opens the No Access form without saying where the worker was, so it cannot go back`,
    );
  }
});

test("a recorded No Access does not jump to the bucket list", () => {
  // It did, for part of one afternoon. A worker with seventeen rows in a batch does the next
  // one in the same batch, so it made them navigate in again after every visit.
  assert.equal(
    noAccessCode.includes("backToBuckets"),
    false,
    "the form is sending the worker up to the buckets again instead of back where they were",
  );
});

test("NA-R006: the form always leaves the Admin stack, then crosses tabs if it must", () => {
  // This screen lives in the ADMIN tab and is opened from PREMISES, ASTS and ADMIN.
  //
  // router.replace to another tab SWITCHES tab and leaves this screen on the Admin stack - the
  // owner, 4 Oct: "the form is now sitting on admin stack, it does not close." He found it
  // still there the next time he opened Admin.
  //
  // router.back() pops it, but only reaches the screen underneath IN ADMIN - so using it for
  // every caller sent a premise-card visit to My Work Orders.
  //
  // Both, in order: pop ALWAYS, then replace only when the caller lives in another tab.
  assert.match(
    noAccessCode,
    /let popped = false/,
    "the pop is conditional again, so a cross-tab caller leaves the form on the Admin stack",
  );
  assert.match(
    noAccessCode,
    /if \(sameStack && popped\) return;/,
    "a same-tab caller will now replace as well as pop, rebuilding the screen it just returned to",
  );

  // The pop must not sit inside the sameStack branch - that was the shape that left the form up.
  assert.equal(
    /if \(sameStack\) \{\s*try \{/.test(noAccessCode),
    false,
    "the pop is back inside the stack check, so it only runs for same-tab callers",
  );
});

test("NA-R006: the tab is read from the right segment", async () => {
  // Every iREPS route starts "/(tabs)/...", so segment [1] is "(tabs)" for all of them and
  // comparing it says every screen is in the same stack. The owner found it on ERF 4310: a
  // Normal Path No Access called back(), had nothing of ours underneath, and the form stayed.
  const tabOf = (path) =>
    String(path || "")
      .split("/")
      .filter(Boolean)[1] || "";

  assert.equal(tabOf("/(tabs)/admin/operations/no-access"), "admin");
  assert.equal(tabOf("/(tabs)/admin/operations/my-workorders"), "admin");
  assert.equal(tabOf("/(tabs)/premises"), "premises");
  assert.equal(tabOf("/(tabs)/asts"), "asts");

  // And the screen must use filter(Boolean), not a bare [1].
  // Written so the formatter cannot break it: prettier splits this chain over four lines.
  assert.match(
    noAccessCode,
    /\.split\("\/"\)\s*\.filter\(Boolean\)\[1\]/,
    'the tab is read from segment [1] again, which is "(tabs)" for every route',
  );
});
