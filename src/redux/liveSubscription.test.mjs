import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRESTORE_IN_LIMIT,
  KEPT_BATCHES,
  LIVE_STREAM_RETRY_MS,
  LIVE_STREAM_STATUS,
  MY_WORK_ORDERS_KEEP_SECONDS,
  chunkIds,
  combineLiveStatuses,
  createBatchKeeper,
  createFollowingSubscription,
  createLiveDataStore,
  isDocumentId,
  isLiveStreamOutOfDate,
  readFromCache,
  followActorAllocatedDocuments,
  idsFromKey,
  idsKey,
  listenInChunks,
  uniqueCleanIds,
} from "./liveSubscription.js";

// A fake clock: timers run only when the test moves time with advance(ms).
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    timers: {
      setTimeout: (callback, delay = 0) => {
        const id = nextId++;
        timers.set(id, { callback, due: now + delay });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.due <= until).sort((a, b) => a[1].due - b[1].due);
        if (!due.length) break;
        const [id, timer] = due[0];
        timers.delete(id);
        now = timer.due;
        timer.callback();
      }
      now = until;
    },
    get pending() {
      return timers.size;
    },
  };
}

// A fake listener registry: each opened listener can answer or fail, and knows whether it is still open.
function fakeListeners() {
  const opened = [];
  const listen = (value, onDocs, onError) => {
    const listener = { value, onDocs, onError, open: true };
    opened.push(listener);
    return () => {
      listener.open = false;
    };
  };
  return { opened, listen, live: () => opened.filter((listener) => listener.open) };
}

test("TB-R052 constants: 24 hours, 15 seconds, 30 values", () => {
  assert.equal(MY_WORK_ORDERS_KEEP_SECONDS, 86400);
  assert.equal(LIVE_STREAM_RETRY_MS, 15000);
  assert.equal(FIRESTORE_IN_LIMIT, 30);
});

test("TB-R052 IDs are cleaned, de-duplicated, sorted and chunked by 30", () => {
  assert.deepEqual(uniqueCleanIds([" T2 ", "T1", "", null, undefined, "T1", "a/b"]), ["T1", "T2"]);
  assert.equal(idsKey(["", null]), null);
  assert.equal(idsKey(["SP1", "T1", "SP1"]), "SP1|T1");
  assert.deepEqual(idsFromKey("SP1|T1"), ["SP1", "T1"]);
  assert.deepEqual(idsFromKey(null), []);
  const ids = Array.from({ length: 61 }, (_, index) => `ID${String(index).padStart(2, "0")}`);
  assert.deepEqual(chunkIds(ids).map((chunk) => chunk.length), [30, 30, 1]);
});

test("TB-R052 combined status: ERROR, then NOT_UP_TO_DATE, then CONNECTING, else LIVE", () => {
  assert.equal(combineLiveStatuses(["LIVE", "ERROR", "CONNECTING", "NOT_UP_TO_DATE"]), "ERROR");
  assert.equal(combineLiveStatuses(["CONNECTING", "NOT_UP_TO_DATE", "LIVE"]), "NOT_UP_TO_DATE");
  assert.equal(combineLiveStatuses(["LIVE", "CONNECTING"]), "CONNECTING");
  assert.equal(combineLiveStatuses(["LIVE", "LIVE"]), "LIVE");
  assert.equal(isLiveStreamOutOfDate("ERROR"), true);
  assert.equal(isLiveStreamOutOfDate("NOT_UP_TO_DATE"), true);
  assert.equal(isLiveStreamOutOfDate("CONNECTING"), false);
  assert.equal(isLiveStreamOutOfDate(undefined), false);
  assert.equal(readFromCache({ metadata: { fromCache: true } }), true);
  assert.equal(readFromCache({ metadata: {} }), false);
  assert.equal(isDocumentId("04297704498"), true);
  assert.equal(isDocumentId("04/123"), false);
  assert.equal(isDocumentId("  "), false);
});

test("TB-R052 a refetch reads what the running list last published; only that list closes its key", () => {
  const store = createLiveDataStore();
  const fallback = { empty: true };
  assert.equal(store.read("U1:SP1", fallback), fallback);

  const first = store.open("U1:SP1");
  const data = { buckets: [1] };
  assert.equal(first.publish(data), data);
  assert.equal(store.read("U1:SP1", fallback), data);

  // A new list for the same key starts before the old one has closed: the old one must not wipe it.
  const second = store.open("U1:SP1");
  const newer = { buckets: [2] };
  second.publish(newer);
  first.close();
  assert.equal(store.read("U1:SP1", fallback), newer);
  second.close();
  assert.equal(store.read("U1:SP1", fallback), fallback);
});

test("TB-R052 answers from the phone's memory: CONNECTING before the server answers, NOT_UP_TO_DATE after", () => {
  const listeners = fakeListeners();
  const statuses = [];
  const confirmed = [];
  const subscription = createFollowingSubscription({
    timers: fakeTimers().timers,
    subscribe: (key, handlers) => listeners.listen(key, (meta) => confirmed.push(handlers.live(meta)), handlers.fail),
    onStatus: (status) => statuses.push(status),
  });

  subscription.setKey("A");
  listeners.opened[0].onDocs({ fromCache: true });
  assert.deepEqual(statuses, ["CONNECTING", "CONNECTING"]);
  listeners.opened[0].onDocs({ fromCache: false });
  assert.equal(statuses.at(-1), "LIVE");
  listeners.opened[0].onDocs({ fromCache: true });
  assert.equal(statuses.at(-1), "NOT_UP_TO_DATE");
  assert.deepEqual(confirmed, [false, true, true]);

  // Another key has not been answered by the server yet.
  subscription.setKey("B");
  listeners.opened[1].onDocs({ fromCache: true });
  assert.equal(statuses.at(-1), "CONNECTING");
  assert.equal(confirmed.at(-1), false);
});

test("TB-R052 chunks answer from memory when any group does", () => {
  const listeners = fakeListeners();
  const answers = [];
  const ids = Array.from({ length: 31 }, (_, index) => `S${String(index).padStart(2, "0")}`);
  listenInChunks({ ids, listen: listeners.listen, next: (docs, meta) => answers.push(meta), error: () => {} });
  listeners.opened[0].onDocs([], { fromCache: false });
  listeners.opened[1].onDocs([], { fromCache: true });
  assert.deepEqual(answers.at(-1), { fromCache: true });
  listeners.opened[1].onDocs([], { fromCache: false });
  assert.deepEqual(answers.at(-1), { fromCache: false });
});

test("TB-R052 chunks answer together once every group has answered, and stop together", () => {
  const listeners = fakeListeners();
  const answers = [];
  const errors = [];
  const ids = Array.from({ length: 31 }, (_, index) => `S${String(index).padStart(2, "0")}`);
  const stop = listenInChunks({ ids, listen: listeners.listen, next: (docs) => answers.push(docs), error: (e) => errors.push(e) });
  assert.equal(listeners.live().length, 2);
  assert.equal(listeners.opened[0].value.length, 30);
  assert.deepEqual(listeners.opened[1].value, ["S30"]);

  listeners.opened[0].onDocs([{ id: "S00" }]);
  assert.equal(answers.length, 0, "no answer until every group has answered");
  listeners.opened[1].onDocs([{ id: "S30" }]);
  assert.deepEqual(answers.at(-1).map((d) => d.id), ["S00", "S30"]);
  listeners.opened[0].onDocs([]);
  assert.deepEqual(answers.at(-1).map((d) => d.id), ["S30"]);

  listeners.opened[1].onError(new Error("denied"));
  assert.equal(errors.length, 1);
  stop();
  assert.equal(listeners.live().length, 0);
  listeners.opened[0].onDocs([{ id: "late" }]);
  assert.deepEqual(answers.at(-1).map((d) => d.id), ["S30"], "nothing after stop");
});

test("TB-R052 no IDs answers an empty list at once", () => {
  const answers = [];
  listenInChunks({ ids: [], listen: () => assert.fail("no listener"), next: (docs) => answers.push(docs), error: () => {} });
  assert.deepEqual(answers, [[]]);
});

test("TB-R052 a following subscription keeps the same key, replaces another and closes on null", () => {
  const listeners = fakeListeners();
  const statuses = [];
  const clock = fakeTimers();
  const subscription = createFollowingSubscription({
    timers: clock.timers,
    subscribe: (key, handlers) => listeners.listen(key, () => handlers.live(), handlers.fail),
    onStatus: (status) => statuses.push(status),
  });

  subscription.setKey("A");
  subscription.setKey("A");
  assert.equal(listeners.opened.length, 1, "the same key keeps its listener");
  assert.deepEqual(statuses, ["CONNECTING"]);
  listeners.opened[0].onDocs();
  assert.deepEqual(statuses, ["CONNECTING", "LIVE"]);

  subscription.setKey("B");
  assert.equal(listeners.opened[0].open, false);
  assert.equal(listeners.live().length, 1);
  listeners.opened[0].onDocs();
  assert.deepEqual(statuses, ["CONNECTING", "LIVE", "CONNECTING"], "an answer from the replaced listener is ignored");

  subscription.setKey(null);
  assert.equal(listeners.live().length, 0);
  assert.equal(subscription.key, null);
});

test("TB-R052 a failed subscription reports ERROR, ends the listener and subscribes again after 15 seconds", () => {
  const listeners = fakeListeners();
  const statuses = [];
  const clock = fakeTimers();
  const subscription = createFollowingSubscription({
    timers: clock.timers,
    subscribe: (key, handlers) => listeners.listen(key, () => handlers.live(), handlers.fail),
    onStatus: (status) => statuses.push(status),
  });

  subscription.setKey("A");
  listeners.opened[0].onDocs();
  listeners.opened[0].onError(new Error("unavailable"));
  assert.equal(statuses.at(-1), "ERROR");
  assert.equal(listeners.live().length, 0, "the failed listener is ended");
  listeners.opened[0].onError(new Error("again"));
  assert.equal(statuses.filter((s) => s === "ERROR").length, 1, "a late failure of the ended listener is ignored");

  subscription.setKey("A");
  assert.equal(listeners.opened.length, 1, "the same key waits for its retry");

  clock.advance(LIVE_STREAM_RETRY_MS - 1);
  assert.equal(listeners.opened.length, 1);
  clock.advance(1);
  assert.equal(listeners.live().length, 1, "subscribed again after 15 seconds");
  assert.equal(statuses.at(-1), "ERROR", "still not up to date until it answers");
  listeners.opened[1].onDocs();
  assert.equal(statuses.at(-1), "LIVE");
});

test("TB-R052 a failure while opening is retried, and a retry never runs after stop", () => {
  const statuses = [];
  const clock = fakeTimers();
  let attempts = 0;
  const closed = [];
  const subscription = createFollowingSubscription({
    timers: clock.timers,
    subscribe: (key, handlers) => {
      attempts += 1;
      if (attempts === 1) handlers.fail(new Error("at once"));
      return () => closed.push(attempts);
    },
    onStatus: (status) => statuses.push(status),
  });

  subscription.setKey("A");
  assert.deepEqual(statuses, ["CONNECTING", "ERROR"]);
  assert.deepEqual(closed, [1], "the listener that failed while opening is closed");
  clock.advance(LIVE_STREAM_RETRY_MS);
  assert.equal(attempts, 2);

  subscription.stop();
  assert.deepEqual(closed, [1, 2]);
  subscription.setKey("B");
  clock.advance(LIVE_STREAM_RETRY_MS * 2);
  assert.equal(attempts, 2, "nothing opens after stop");
  assert.equal(clock.pending, 0);
});

function startAllocated({ uid = "U1", spId = "SP1", includeUid = false } = {}) {
  const teams = fakeListeners();
  const allocated = fakeListeners();
  const clock = fakeTimers();
  const changes = [];
  const stop = followActorAllocatedDocuments({
    uid,
    spId,
    includeUid,
    timers: clock.timers,
    listenTeams: teams.listen,
    listenAllocated: allocated.listen,
    onChange: (change) => changes.push(change),
  });
  return { teams, allocated, clock, changes, stop, get last() { return changes.at(-1); } };
}

test("TB-R052 the worker's teams are read first, then what is allocated to the teams and service provider", () => {
  const run = startAllocated();
  assert.equal(run.teams.live().length, 1);
  assert.equal(run.teams.opened[0].value, "U1");
  assert.equal(run.allocated.opened.length, 0, "nothing allocated is read before the teams answer");
  assert.equal(run.last?.loaded ?? false, false);

  run.teams.opened[0].onDocs([{ id: "T2" }, { id: "T1" }]);
  assert.deepEqual(run.allocated.live().map((l) => l.value), [["SP1", "T1", "T2"]]);
  assert.equal(run.last.loaded, false);
  assert.equal(run.last.stream, "CONNECTING");

  run.allocated.opened[0].onDocs([{ id: "TB1" }]);
  assert.equal(run.last.loaded, true);
  assert.equal(run.last.stream, "LIVE");
  assert.deepEqual(run.last.docs, [{ id: "TB1" }]);
  assert.deepEqual(run.last.teamIds, ["T1", "T2"]);
  run.stop();
  assert.equal(run.teams.live().length + run.allocated.live().length, 0);
});

test("TB-R052 a list answered only from the phone's memory is not read until the server answers teams and batches", () => {
  const run = startAllocated();
  // Firestore cannot reach the server: the teams and the batches answer from memory, empty.
  run.teams.opened[0].onDocs([], { fromCache: true });
  assert.deepEqual(run.allocated.live()[0].value, ["SP1"]);
  run.allocated.opened[0].onDocs([], { fromCache: true });
  assert.equal(run.last.loaded, false, "an empty answer from memory is never 'no batches'");
  assert.equal(run.last.stream, "CONNECTING");

  // The batches answer from the server, but the teams have not: still not read.
  run.allocated.opened[0].onDocs([{ id: "TB_SP" }], { fromCache: false });
  assert.equal(run.last.loaded, false);

  // The teams answer from the server with the same teams: the batches already answered, so the list is read.
  run.teams.opened[0].onDocs([], { fromCache: false });
  assert.equal(run.allocated.opened.length, 1, "the same teams keep their listener");
  assert.equal(run.last.loaded, true);
  assert.equal(run.last.stream, "LIVE");

  // Later, memory-only answers keep the list and say it may be out of date.
  run.allocated.opened[0].onDocs([{ id: "TB_SP" }], { fromCache: true });
  assert.equal(run.last.stream, "NOT_UP_TO_DATE");
  assert.equal(run.last.loaded, true);
  assert.deepEqual(run.last.docs, [{ id: "TB_SP" }]);
  run.stop();
});

test("TB-R052 teams answered from memory, then other teams from the server: read once the server answers those batches", () => {
  const run = startAllocated();
  run.teams.opened[0].onDocs([{ id: "T1" }], { fromCache: true });
  run.allocated.opened[0].onDocs([{ id: "TB1" }], { fromCache: false });
  assert.equal(run.last.loaded, false);

  run.teams.opened[0].onDocs([{ id: "T2" }], { fromCache: false });
  assert.deepEqual(run.allocated.live()[0].value, ["SP1", "T2"]);
  assert.equal(run.last.loaded, false, "the batches of the new teams have not answered yet");
  run.allocated.opened[1].onDocs([{ id: "TB2" }], { fromCache: false });
  assert.equal(run.last.loaded, true);
  assert.deepEqual(run.last.docs, [{ id: "TB2" }]);
  run.stop();
});

test("TB-R052 after a team change, a memory-only answer never replaces a list already read; it says not up to date", () => {
  const run = startAllocated();
  run.teams.opened[0].onDocs([{ id: "T1" }], { fromCache: false });
  run.allocated.opened[0].onDocs([{ id: "TB1" }], { fromCache: false });
  assert.equal(run.last.loaded, true);

  run.teams.opened[0].onDocs([{ id: "T2" }], { fromCache: false });
  run.allocated.opened[1].onDocs([], { fromCache: true });
  assert.deepEqual(run.last.docs, [{ id: "TB1" }], "the server-read list stays");
  assert.equal(run.last.stream, "NOT_UP_TO_DATE");

  run.allocated.opened[1].onDocs([{ id: "TB2" }], { fromCache: false });
  assert.deepEqual(run.last.docs, [{ id: "TB2" }]);
  assert.equal(run.last.stream, "LIVE");
  run.stop();
});

test("TB-R052 BGO batches also include the worker's own ID", () => {
  const run = startAllocated({ includeUid: true });
  run.teams.opened[0].onDocs([{ id: "T1" }]);
  assert.deepEqual(run.allocated.live()[0].value, ["SP1", "T1", "U1"]);
  run.stop();
});

test("TB-R052 a team change reads the allocated documents again; the last list stays until then", () => {
  const run = startAllocated();
  run.teams.opened[0].onDocs([{ id: "T1" }]);
  run.allocated.opened[0].onDocs([{ id: "TB1" }]);

  run.teams.opened[0].onDocs([{ id: "T1" }]);
  assert.equal(run.allocated.opened.length, 1, "the same teams keep their listener");

  run.teams.opened[0].onDocs([{ id: "T9" }]);
  assert.equal(run.allocated.opened[0].open, false);
  assert.deepEqual(run.allocated.live()[0].value, ["SP1", "T9"]);
  assert.deepEqual(run.last.docs, [{ id: "TB1" }], "the last list stays while the new one connects");
  assert.equal(run.last.stream, "CONNECTING");
  run.allocated.opened[1].onDocs([{ id: "TB9" }]);
  assert.deepEqual(run.last.docs, [{ id: "TB9" }]);
  assert.deepEqual(run.last.teamIds, ["T9"]);
  run.stop();
});

test("TB-R052 a worker with no team and no service provider has nothing allocated, read at once", () => {
  const run = startAllocated({ spId: "" });
  run.teams.opened[0].onDocs([]);
  assert.equal(run.allocated.opened.length, 0);
  assert.equal(run.last.loaded, true);
  assert.equal(run.last.stream, "LIVE");
  assert.deepEqual(run.last.docs, []);
  run.stop();
});

test("TB-R052 a failed list says ERROR, keeps its last documents and reconnects after 15 seconds", () => {
  const run = startAllocated();
  run.teams.opened[0].onDocs([{ id: "T1" }]);
  run.allocated.opened[0].onDocs([{ id: "TB1" }]);

  run.allocated.opened[0].onError(new Error("unavailable"));
  assert.equal(run.last.stream, "ERROR");
  assert.equal(run.last.loaded, true);
  assert.deepEqual(run.last.docs, [{ id: "TB1" }]);

  run.clock.advance(LIVE_STREAM_RETRY_MS);
  assert.equal(run.allocated.live().length, 1);
  run.allocated.opened[1].onDocs([{ id: "TB1" }, { id: "TB2" }]);
  assert.equal(run.last.stream, "LIVE");

  run.teams.opened[0].onError(new Error("teams unavailable"));
  assert.equal(run.last.stream, "ERROR", "a failed teams list also says ERROR");
  run.clock.advance(LIVE_STREAM_RETRY_MS);
  assert.equal(run.teams.live().length, 1);
  run.stop();
  const count = run.changes.length;
  run.teams.opened[1].onDocs([{ id: "T1" }]);
  assert.equal(run.changes.length, count, "nothing is reported after stop");
});

function startKeeper() {
  const clock = fakeTimers();
  const held = [];
  const released = [];
  const keeper = createBatchKeeper({
    timers: clock.timers,
    hold: (id) => {
      held.push(id);
      return () => released.push(id);
    },
  });
  return { clock, held, released, keeper };
}

test("TB-R052 the three most recently opened batches are kept; the oldest is let go", () => {
  assert.equal(KEPT_BATCHES, 3);
  const { keeper, held, released } = startKeeper();
  keeper.keep("TB1");
  keeper.keep("TB2");
  keeper.keep("TB3");
  keeper.keep("TB1");
  assert.deepEqual(held, ["TB1", "TB2", "TB3"], "opening a kept batch again holds nothing new");
  assert.deepEqual(keeper.keptIds, ["TB2", "TB3", "TB1"]);

  keeper.keep("TB4");
  assert.deepEqual(released, ["TB2"], "the least recently opened batch is let go");
  assert.deepEqual(keeper.keptIds, ["TB3", "TB1", "TB4"]);

  keeper.keep("TB2");
  assert.deepEqual(held, ["TB1", "TB2", "TB3", "TB4", "TB2"], "a let-go batch is held again when opened");
  assert.deepEqual(released, ["TB2", "TB3"]);
  keeper.keep("");
  keeper.keep(null);
  assert.equal(held.length, 5);
});

test("TB-R052 a kept batch is let go 24 hours after it was last opened, and all at sign-out", () => {
  const { keeper, clock, released } = startKeeper();
  keeper.keep("TB1");
  clock.advance(12 * 60 * 60 * 1000);
  keeper.keep("TB2");
  clock.advance(12 * 60 * 60 * 1000 - 1);
  keeper.keep("TB1");
  clock.advance(1);
  assert.deepEqual(released, [], "opening TB1 again started its 24 hours again");
  clock.advance(12 * 60 * 60 * 1000);
  assert.deepEqual(released, ["TB2"]);
  assert.deepEqual(keeper.keptIds, ["TB1"]);

  keeper.keep("TB3");
  keeper.releaseAll();
  assert.deepEqual(released, ["TB2", "TB1", "TB3"]);
  assert.deepEqual(keeper.keptIds, []);
  assert.equal(clock.pending, 0);
});

test("TB-R052 a worker without an ID reads nothing and is not loading", () => {
  const run = startAllocated({ uid: "" });
  assert.equal(run.teams.opened.length, 0);
  assert.equal(run.last.loaded, true);
  assert.equal(run.last.stream, LIVE_STREAM_STATUS.LIVE);
  run.stop();
});
