// TB-R052: My Work Orders reads only the worker's own work and keeps it live. The API modules initialise
// Firebase and MMKV on import, so their pure parts and live streams are evaluated from source text against
// fakes, and the rest is checked in the source.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const wmsSource = await read("./lifecycleInstructionApi.js");
const targetedSource = await read("./targetedBatchApi.js");
const bgoSource = await read("./bgoApi.js");
const listenersSource = await read("./firestoreListeners.js");
const logoutSource = await read("./logoutCleanup.js");
const queueSource = await read("../utils/submissionQueue.js");
const screenSource = await read("../../app/(tabs)/admin/operations/my-workorders.js");

function extractBlock(source, start, name) {
  let depth = 0;
  for (let index = source.indexOf("{", source.indexOf(")", start)); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is not closed`);
}

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(export )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} not found`);
  return extractBlock(source, start, name).replace(/^export /, "");
}

function extractConst(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} not found`);
  const end = source.slice(start).search(/;\r?\n/);
  assert.notEqual(end, -1, `${name} is not closed`);
  return source.slice(start, start + end + 1);
}

function endpoint(source, name, next) {
  const start = source.indexOf(`${name}: builder.query`);
  assert.notEqual(start, -1, `${name} not found`);
  return source.slice(start, source.indexOf(next, start));
}

// ---------- Office work orders ----------

const isListedWorkOrder = new Function(
  [
    extractConst(wmsSource, "WMS_FINISHED_WORKFLOW_STATES"),
    extractConst(wmsSource, "WMS_FINISHED_LISTED_DAYS"),
    extractConst(wmsSource, "DAY_MS"),
    ...["normalizeUpper", "toMillis", "getWorkflowState", "getCreatedAt", "getUpdatedAt", "isListedWorkOrder"].map((name) =>
      extractFunction(wmsSource, name),
    ),
    "return isListedWorkOrder;",
  ].join("\n"),
)();

const NOW = Date.parse("2026-09-17T12:00:00.000Z");
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const workOrder = (state, updatedAt, createdAt = daysAgo(90)) => ({
  workflow: { state },
  metadata: { updatedAt, createdAt },
});

test("TB-R052 open work orders are always listed, whatever their age", () => {
  for (const state of ["ISSUED", "REASSIGNED", "ACCEPTED", "REJECTED", "IN_PROGRESS"]) {
    assert.equal(isListedWorkOrder(workOrder(state, daysAgo(400)), NOW), true, state);
  }
});

test("TB-R052 finished work orders are listed for 30 days after they last changed", () => {
  for (const state of ["COMPLETED", "CANCELLED"]) {
    assert.equal(isListedWorkOrder(workOrder(state, daysAgo(0)), NOW), true, state);
    assert.equal(isListedWorkOrder(workOrder(state, daysAgo(30)), NOW), true, `${state} on day 30`);
    assert.equal(isListedWorkOrder(workOrder(state, daysAgo(30.01)), NOW), false, `${state} after 30 days`);
  }
  // Without updatedAt the creation time counts; without either it is not listed.
  assert.equal(isListedWorkOrder({ workflow: { state: "COMPLETED" }, metadata: { createdAt: daysAgo(3) } }, NOW), true);
  assert.equal(isListedWorkOrder({ workflow: { state: "COMPLETED" } }, NOW), false);
  // A Firestore Timestamp is read too.
  const timestamp = { toMillis: () => NOW - 2 * 24 * 60 * 60 * 1000 };
  assert.equal(isListedWorkOrder({ workflow: { state: "CANCELLED" }, metadata: { updatedAt: timestamp } }, NOW), true);
});

test("TB-R052 the 30-day list applies to the worker's own list, not an opened BGO batch", () => {
  const build = extractFunction(wmsSource, "buildWmsData");
  assert.match(build, /cleanMode !== "INDIVIDUAL" \|\| isListedWorkOrder\(trn, nowMs\)/);
  assert.match(build, /updatedAt: loaded \? new Date\(nowMs\)\.toISOString\(\) : null/);
  assert.match(build, /stream,/);
});

// TB-R052: the work order stream itself, run from its source text against a fake Firestore. buildWmsData is
// replaced by a recorder, so the test sees exactly what the stream hands it.
const liveHelpers = await import("./liveSubscription.js");

function evaluateWmsStream(bindings) {
  const start = wmsSource.indexOf("async function streamWmsWorkItems(");
  assert.notEqual(start, -1, "streamWmsWorkItems not found");
  const body = [
    ...["WMS_LCT_TYPES", "WMS_OPEN_WORKFLOW_STATES", "WMS_OFFICE_CHANNELS", "WMS_DEMO_STREAM_LIMIT", "WMS_QUEUE_CHECK_MS", "WMS_LISTED_CHECK_MS", "WMS_INDIVIDUAL_ENDPOINT"].map((name) =>
      extractConst(wmsSource, name),
    ),
    ...["normalizeUpper", "readFirstString", "wmsWorkItemsKey", "wmsWorkItemsCacheKey"].map((name) => extractFunction(wmsSource, name)),
    extractBlock(wmsSource, start, "streamWmsWorkItems"),
    "return streamWmsWorkItems;",
  ].join("\n");
  return new Function(...Object.keys(bindings), body)(...Object.values(bindings));
}

async function startWmsStream(args, { pending = [] } = {}) {
  const listeners = [];
  const intervals = new Map();
  let nextInterval = 1;
  const reconciled = [];
  const builds = [];
  const wmsLiveData = liveHelpers.createLiveDataStore();
  const listen = (kind) => (target, label, onDocs, onError) => {
    const listener = { kind, target, label, onDocs, onError, active: true };
    listeners.push(listener);
    return () => {
      listener.active = false;
    };
  };
  const bindings = {
    db: { name: "fake-db" },
    collection: (_db, path) => ({ path }),
    query: (reference, ...constraints) => ({ path: reference.path, constraints }),
    where: (field, op, value) => ({ field, op, value }),
    documentId: () => "__name__",
    firestoreLimit: (value) => ({ limit: value }),
    listenQuery: listen("query"),
    listenActorTeams: (uid, onDocs, onError) => listen("teams")({ uid }, "ACTOR_TEAMS", onDocs, onError),
    getPendingReconcilableTrnIds: () => pending,
    reconcileSubmissionQueueWithServerTrns: async (input) => {
      reconciled.push(input.trns.map((trn) => trn.id));
      return { changedCount: 0 };
    },
    getActorFromArgsOrState: (queryArgs) => ({ uid: queryArgs.actorUid }),
    buildWmsData: (input) => {
      builds.push(input);
      return { input, meta: { updatedAt: input.loaded ? "loaded" : null, stream: input.stream } };
    },
    setInterval: (callback, ms) => {
      const id = nextInterval++;
      intervals.set(id, { callback, ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    wmsLiveData,
    LIVE_STREAM_STATUS: liveHelpers.LIVE_STREAM_STATUS,
    combineLiveStatuses: liveHelpers.combineLiveStatuses,
    createFollowingSubscription: liveHelpers.createFollowingSubscription,
    createLiveDataStore: liveHelpers.createLiveDataStore,
    idsFromKey: liveHelpers.idsFromKey,
    idsKey: liveHelpers.idsKey,
    listenInChunks: liveHelpers.listenInChunks,
  };
  let data;
  let removeEntry;
  const cacheEntryRemoved = new Promise((resolve) => {
    removeEntry = resolve;
  });
  const running = evaluateWmsStream(bindings)(args, {
    updateCachedData: (recipe) => {
      data = recipe(data);
    },
    cacheDataLoaded: Promise.resolve(),
    cacheEntryRemoved,
    getState: () => ({}),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const live = () => listeners.filter((listener) => listener.active);
  const byLabel = (label) => {
    const found = live().filter((listener) => listener.label === label);
    assert.equal(found.length, 1, `one live ${label} listener`);
    return found[0];
  };
  return {
    listeners,
    live,
    byLabel,
    intervals,
    reconciled,
    wmsLiveData,
    get data() {
      return data;
    },
    get last() {
      return builds.at(-1);
    },
    setPending(ids) {
      pending = ids;
    },
    remove: async () => {
      removeEntry();
      await running;
    },
  };
}

const WMS_ARGS = { actorUid: "U1", actorRole: "FWR", actorSpId: "SP1", actorName: "Field Worker", mode: "INDIVIDUAL" };
const trn = (id) => ({ id });

test("TB-R052 office work orders: open ones, and Completed or Cancelled ones from office channels only", async () => {
  const stream = await startWmsStream(WMS_ARGS);
  const types = { field: "accessData.trnType", op: "in", value: ["METER_INSPECTION", "METER_DISCONNECTION", "METER_RECONNECTION", "METER_REMOVAL", "METER_READING"] };
  const office = { field: "origin.channel", op: "in", value: ["OFFICE", "API", "AMI", "INTEGRATION"] };
  assert.deepEqual(stream.byLabel("WMS_OPEN_TRN").target, {
    path: "trns",
    constraints: [types, { field: "workflow.state", op: "in", value: ["ISSUED", "REASSIGNED", "ACCEPTED", "REJECTED", "IN_PROGRESS"] }],
  });
  assert.deepEqual(stream.byLabel("WMS_COMPLETED_TRN").target.constraints, [types, { field: "workflow.state", op: "==", value: "COMPLETED" }, office]);
  assert.deepEqual(stream.byLabel("WMS_CANCELLED_TRN").target.constraints, [types, { field: "workflow.state", op: "==", value: "CANCELLED" }, office]);
  // Firestore allows at most 30 combinations of "in" values in one query.
  for (const label of ["WMS_OPEN_TRN", "WMS_COMPLETED_TRN", "WMS_CANCELLED_TRN"]) {
    const combinations = stream.byLabel(label).target.constraints.filter((c) => c.op === "in").reduce((n, c) => n * c.value.length, 1);
    assert.ok(combinations <= 30, `${label}: ${combinations}`);
  }
  assert.equal(stream.live().some((listener) => listener.target?.constraints?.some((c) => c.field === "metadata.createdAt")), false, "never the newest TRNs of all workers");
  assert.deepEqual(stream.byLabel("ACTOR_TEAMS").target, { uid: "U1" });
  assert.deepEqual(stream.byLabel("WMS_SP").target, { path: "serviceProviders", constraints: [] });
  await stream.remove();
});

test("TB-R052 the work order list is read once the server has answered all three parts, teams and service providers", async () => {
  const stream = await startWmsStream(WMS_ARGS);
  stream.byLabel("WMS_OPEN_TRN").onDocs([trn("OPEN_1")], { fromCache: false });
  stream.byLabel("WMS_COMPLETED_TRN").onDocs([trn("DONE_1")], { fromCache: false });
  stream.byLabel("ACTOR_TEAMS").onDocs([{ id: "T1" }], { fromCache: false });
  stream.byLabel("WMS_SP").onDocs([{ id: "SP1" }], { fromCache: false });
  assert.equal(stream.last.loaded, false, "the Cancelled part has not answered");
  assert.deepEqual(stream.last.trns, []);

  stream.byLabel("WMS_CANCELLED_TRN").onDocs([], { fromCache: true });
  assert.equal(stream.last.loaded, false, "an answer from the phone's memory is not read");
  assert.deepEqual(stream.last.trns.map((t) => t.id), ["OPEN_1", "DONE_1"]);
  assert.equal(stream.last.stream, "CONNECTING");

  stream.byLabel("WMS_CANCELLED_TRN").onDocs([trn("CANCELLED_1")], { fromCache: false });
  assert.equal(stream.last.loaded, true);
  assert.equal(stream.last.stream, "LIVE");
  assert.deepEqual(stream.last.trns.map((t) => t.id), ["OPEN_1", "DONE_1", "CANCELLED_1"]);
  assert.deepEqual(stream.last.teams, [{ id: "T1" }]);
  assert.equal(stream.data.meta.updatedAt, "loaded");

  // Later memory-only answers keep the list and say it may be out of date.
  stream.byLabel("WMS_OPEN_TRN").onDocs([trn("OPEN_1")], { fromCache: true });
  assert.equal(stream.last.loaded, true);
  assert.equal(stream.last.stream, "NOT_UP_TO_DATE");

  // A failure says ERROR and ends all three work order listeners together.
  const [open, completed, cancelled] = ["WMS_OPEN_TRN", "WMS_COMPLETED_TRN", "WMS_CANCELLED_TRN"].map(stream.byLabel);
  cancelled.onError(new Error("unavailable"));
  assert.equal(stream.last.stream, "ERROR");
  assert.deepEqual([open.active, completed.active, cancelled.active], [false, false, false]);
  assert.equal(stream.last.loaded, true, "the last list stays while it reconnects");
  await stream.remove();
});

test("TB-R052 a refetch reads the work orders last published; nothing is left after the entry is removed", async () => {
  const stream = await startWmsStream(WMS_ARGS);
  const key = new Function(
    ["normalizeUpper", "readFirstString", "wmsWorkItemsKey", "wmsWorkItemsCacheKey"].map((name) => extractFunction(wmsSource, name)).join("\n") +
      "\nreturn wmsWorkItemsCacheKey;",
  )()("getWmsLifecycleWorkItems", WMS_ARGS);
  assert.equal(key, "getWmsLifecycleWorkItems:U1:FWR:SP1:INDIVIDUAL:", "the store key is the cache key, with the endpoint name");
  const placeholder = { empty: true };
  assert.equal(stream.wmsLiveData.read(key, placeholder), stream.data);
  stream.byLabel("WMS_SP").onDocs([{ id: "SP1" }], { fromCache: false });
  assert.equal(stream.wmsLiveData.read(key, placeholder), stream.data);
  await stream.remove();
  assert.equal(stream.wmsLiveData.read(key, placeholder), placeholder);

  const reader = extractFunction(wmsSource, "readWmsWorkItemsFor");
  assert.match(reader, /wmsLiveData\.read\(wmsWorkItemsCacheKey\(endpointName, args\), EMPTY_WMS_DATA\)/);
});

test("TB-R052 queued forms are confirmed from exactly their own TRNs, followed as the queue changes", async () => {
  const stream = await startWmsStream(WMS_ARGS, { pending: ["TRN_Q1"] });
  const first = stream.byLabel("WMS_QUEUE_TRN");
  assert.deepEqual(first.target.constraints, [{ field: "__name__", op: "in", value: ["TRN_Q1"] }]);
  first.onDocs([trn("TRN_Q1")], { fromCache: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(stream.reconciled, [["TRN_Q1"]]);

  const checks = [...stream.intervals.values()].filter((interval) => interval.ms === 30000);
  assert.equal(checks.length, 1, "the queue is checked every 30 seconds");
  stream.setPending(["TRN_Q2", "TRN_Q1"]);
  checks[0].callback();
  assert.equal(first.active, false);
  assert.deepEqual(stream.byLabel("WMS_QUEUE_TRN").target.constraints[0].value, ["TRN_Q1", "TRN_Q2"]);

  stream.setPending([]);
  checks[0].callback();
  assert.equal(stream.live().some((listener) => listener.label === "WMS_QUEUE_TRN"), false, "nothing to confirm, nothing read");

  // A finished work order leaves the list after 30 days even while nothing changes: the list is rebuilt hourly.
  assert.equal([...stream.intervals.values()].filter((interval) => interval.ms === 60 * 60 * 1000).length, 1);

  await stream.remove();
  assert.equal(stream.intervals.size, 0, "both checks stop with the entry");
  assert.equal(stream.live().length, 0, "every listener stops with the entry");
});

test("TB-R052 an opened BGO batch reads only its own TRNs, with no queue check", async () => {
  const stream = await startWmsStream({ ...WMS_ARGS, mode: "BGO_BUCKET", bgoBatchId: "BGO_1", limit: 2000 });
  assert.deepEqual(stream.byLabel("WMS_BGO_TRN").target.constraints, [{ field: "bgo.batchId", op: "==", value: "BGO_1" }, { limit: 2000 }]);
  assert.equal(stream.live().filter((listener) => /^WMS_(OPEN|COMPLETED|CANCELLED|QUEUE)_TRN$/.test(listener.label)).length, 0);
  assert.equal(stream.intervals.size, 0);
  await stream.remove();
});

test("TB-R052 work orders stay live for 24 hours, one entry per worker (never per name); a BGO batch is kept by the keeper", () => {
  const individual = endpoint(wmsSource, "getWmsLifecycleWorkItems", "getWmsBgoBatchWorkItems: builder.query");
  assert.match(individual, /keepUnusedDataFor: MY_WORK_ORDERS_KEEP_SECONDS/);
  assert.match(individual, /queryFn: readWmsWorkItemsFor\(WMS_INDIVIDUAL_ENDPOINT\)/);
  assert.match(individual, /streamWmsWorkItems\(args, lifecycleApi, WMS_INDIVIDUAL_ENDPOINT\)/);
  assert.match(individual, /wmsWorkItemsCacheKey\(endpointName, queryArgs\)/);
  const bgo = endpoint(wmsSource, "getWmsBgoBatchWorkItems", "createLifecycleInstruction: builder.mutation");
  assert.doesNotMatch(bgo, /keepUnusedDataFor/);
  assert.match(bgo, /queryFn: readWmsWorkItemsFor\(WMS_BGO_BATCH_ENDPOINT\)/);
  assert.match(bgo, /streamWmsWorkItems\(args, lifecycleApi, WMS_BGO_BATCH_ENDPOINT\)/);
  assert.match(bgo, /wmsWorkItemsCacheKey\(endpointName, queryArgs\)/);
  const key = extractFunction(wmsSource, "wmsWorkItemsKey");
  assert.match(key, /actorUid/);
  assert.doesNotMatch(key, /actorName|limit/);
});

// ---------- Queue confirmation ----------

const listPendingReconcilableTrnIds = new Function(
  [
    ...["cleanQueueText", "normalizeQueueUpper", "readQueueInstructionTrnId", "readQueueTrnType", "isNoAccessMeterDiscoveryQueueItem", "isReconciliableQueueItem", "listPendingReconcilableTrnIds"].map(
      (name) => extractFunction(queueSource, name),
    ),
    "return listPendingReconcilableTrnIds;",
  ].join("\n"),
)();

test("TB-R052 the queue lookup asks for the TRNs of unconfirmed work order and No Access items only", () => {
  const queue = [
    { id: "Q1", status: "PENDING", formType: "METER_INSPECTION", context: { instructionTrnId: "TRN_INSP_1" } },
    { id: "Q2", status: "SUCCESS", formType: "METER_READING", context: { instructionTrnId: "TRN_DONE" } },
    { id: "Q3", status: "FAILED", payload: { id: "TRN_NA_1", accessData: { trnType: "METER_DISCOVERY", access: { hasAccess: "no" } } } },
    { id: "Q4", status: "PENDING", payload: { id: "TRN_MD_ACCESS", accessData: { trnType: "METER_DISCOVERY", access: { hasAccess: "YES" } } } },
    { id: "Q5", status: "IN_PROGRESS", formType: "METER_DISCONNECTION", context: { trnId: "TRN_INSP_1" } },
    { status: "PENDING", formType: "METER_REMOVAL", context: { instructionTrnId: "TRN_NO_QUEUE_ID" } },
    { id: "Q6", status: "PENDING", formType: "METER_REMOVAL" },
  ];
  assert.deepEqual(listPendingReconcilableTrnIds(queue), ["TRN_INSP_1", "TRN_NA_1"]);
  assert.deepEqual(listPendingReconcilableTrnIds(null), []);
});

test("TB-R052 the queue lookup matches exactly the items reconciliation confirms", () => {
  const reconcile = queueSource.slice(queueSource.indexOf("export const reconcileSubmissionQueueWithServerTrns"));
  assert.match(reconcile, /if \(queueItem\?\.status === "SUCCESS"\) return queueItem;/);
  assert.match(reconcile, /if \(!isReconciliableQueueItem\(queueItem\)\) return queueItem;/);
  assert.match(reconcile, /const queueInstructionTrnId = readQueueInstructionTrnId\(queueItem\);/);
});

// ---------- Batches, BGO batches, teams ----------

test("TB-R052 targeted batches are read by allocation target for the worker's teams and service provider", () => {
  const buckets = endpoint(targetedSource, "getTargetedBatchBuckets", "getTargetedBatchRows: builder.query");
  assert.doesNotMatch(buckets, /collection\(db, "tb_uploads"\)/);
  assert.doesNotMatch(targetedSource, /orderBy/);
  assert.match(buckets, /followActorAllocatedDocuments\(\{/);
  assert.match(buckets, /collectionName: "tb_uploads",\s*field: "allocation\.targetId"/);
  assert.doesNotMatch(buckets, /includeUid/);
  assert.match(buckets, /keepUnusedDataFor: MY_WORK_ORDERS_KEEP_SECONDS/);
  const serialize = buckets.slice(buckets.indexOf("serializeQueryArgs"));
  assert.doesNotMatch(serialize.slice(0, serialize.indexOf("keepUnusedDataFor")), /actorName|limit/);
});

test("TB-R052 BGO batches are read by target for the worker, their teams and service provider", () => {
  const buckets = endpoint(bgoSource, "getBgoBuckets", "acceptRejectBgoBatch: builder.mutation");
  assert.doesNotMatch(bgoSource, /firebase\/firestore/);
  assert.match(buckets, /collectionName: "bgo_batches",\s*field: "bgo\.targetId"/);
  assert.match(buckets, /includeUid: true/);
  assert.match(buckets, /keepUnusedDataFor: MY_WORK_ORDERS_KEEP_SECONDS/);
});

test("TB-R052 the worker's teams are the teams whose members include the worker", () => {
  assert.match(listenersSource, /where\("scope\.memberUserIds", "array-contains", uid\)/);
  assert.match(listenersSource, /where\(field, "in", values\)/);
  assert.match(listenersSource, /onError\(error\)/);
});

test("TB-R052 lists are ready once read, and say whether they are live", () => {
  assert.match(extractFunction(targetedSource, "buildTargetedBatchBucketData"), /updatedAt: loaded \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(extractFunction(bgoSource, "buildBgoBucketData"), /updatedAt: loaded \? new Date\(\)\.toISOString\(\) : null/);
});

test("TB-R052 sign-out ends the connections kept for 24 hours", () => {
  assert.match(logoutSource, /import\("\.\/targetedBatchApi"\)\.then\(\(module\) => module\.targetedBatchApi\)/);
  for (const api of ["lifecycleInstructionApi", "bgoApi", "teamsApi"]) assert.match(logoutSource, new RegExp(`module\\.${api}\\b`));
  const reset = logoutSource.slice(logoutSource.indexOf("export async function resetAuthenticatedApiStates"));
  assert.ok(
    reset.indexOf("releaseKeptWorkOrders()") !== -1 && reset.indexOf("releaseKeptWorkOrders()") < reset.indexOf("resetApiState"),
    "kept batches are let go before the caches are reset",
  );
});

test("TB-R052 a session that ends without Sign out also ends the kept connections", async () => {
  const authSource = await read("./authApi.js");
  const lifecycle = authSource.slice(authSource.indexOf("getAuthState: builder.query"), authSource.indexOf("signin: builder"));
  assert.match(lifecycle, /onCacheEntryAdded\(_, \{ updateCachedData, cacheEntryRemoved, dispatch \}\)/);
  assert.match(lifecycle, /if \(wasSignedIn && !logoutInProgress\) \{\s*resetAuthenticatedApiStates\(dispatch\)/);
  assert.match(lifecycle, /signedInUid = user\.uid;/);
  // Sign out marks logoutInProgress before it resets and signs out, so its own sign-out is not reset twice.
  const signout = authSource.slice(authSource.indexOf("signout: builder.mutation"));
  assert.ok(signout.indexOf("logoutInProgress: true") < signout.indexOf("resetAuthenticatedApiStates(dispatch)"));
  assert.ok(signout.indexOf("resetAuthenticatedApiStates(dispatch)") < signout.indexOf("await signOut(auth)"));
});

test("TB-R052 the screen keeps the batches it opens: a targeted batch's rows and a BGO batch's TRNs", async () => {
  const keeperSource = await read("./workOrderKeepers.js");
  assert.match(keeperSource, /targetedBatchApi\.endpoints\.getTargetedBatchRows\.initiate\(\{ tbId: id \}\)/);
  assert.match(keeperSource, /lifecycleInstructionApi\.endpoints\.getWmsBgoBatchWorkItems\.initiate\(bgoBatchArgs\.get\(key\)\)/);
  // A BGO batch is kept by its cache key, so new arguments for the same batch never leave an old entry held.
  assert.match(keeperSource, /const key = wmsWorkItemsCacheKey\("getWmsBgoBatchWorkItems", args\);/);
  assert.match(keeperSource, /bgoBatchWorkItemsKeeper\.keep\(key\);/);
  assert.equal(keeperSource.match(/subscription\.unsubscribe\(\);/g).length, 2);
  assert.match(screenSource, /if \(targetedBatchRowsQuerySkipped\) return;\s*keepTargetedBatchRows\(dispatch, selectedTargetedBatchId\);/);
  assert.match(screenSource, /if \(bgoDetailQuerySkipped\) return;\s*keepBgoBatchWorkItems\(dispatch, bgoDetailArgs\);/);
  assert.match(screenSource, /useGetWmsBgoBatchWorkItemsQuery\(bgoDetailArgs, \{/);
  // The rows endpoint itself keeps the default short wait; the keeper holds the three recent batches.
  const rows = targetedSource.slice(targetedSource.indexOf("getTargetedBatchRows: builder.query"), targetedSource.indexOf("acceptRejectTargetedBatch: builder.mutation"));
  assert.doesNotMatch(rows, /keepUnusedDataFor/);
});

// ---------- The screen ----------

test("TB-R052 the screen reads no whole team list and no newest 500 TRNs", () => {
  assert.doesNotMatch(screenSource, /useGetTeamsQuery/);
  assert.doesNotMatch(screenSource, /limit: 500/);
  assert.match(screenSource, /actorTeamIds: bgoTeamIds/);
  assert.match(screenSource, /actorTeamIds: targetedBatchTeamIds/);
});

test("TB-R052 the screen never logs every row or batch on each update", () => {
  assert.doesNotMatch(screenSource, /TB ROW QUERY STATE/);
  assert.doesNotMatch(screenSource, /TB BUCKET QUERY STATE/);
});

test("TB-R052 the screen is never silently out of date, and loading is never 'no work'", () => {
  assert.match(screenSource, /const WMS_NOT_UP_TO_DATE_MESSAGE = "Not up to date — reconnecting";/);
  assert.match(screenSource, /"No connection — showing your work orders from before the connection was lost"/);
  assert.match(screenSource, /const WMS_OFFLINE_MESSAGE = "No connection — your work orders are not loaded";/);
  assert.match(screenSource, /workOrdersOnScreen \? WMS_OFFLINE_KEPT_MESSAGE : WMS_OFFLINE_MESSAGE/);
  assert.match(screenSource, /\.some\(\(data\) => isLiveStreamOutOfDate\(data\?\.meta\?\.stream\)\)/);
  for (const part of ["wmsData,", "targetedBatchData,", "bgoData,", "targetedBatchRowsQuerySkipped ? null : targetedBatchRowsData,", "bgoDetailQuerySkipped ? null : bgoDetailData,"]) {
    assert.ok(screenSource.includes(part), part);
  }
  assert.match(screenSource, /const individualBucketReady = Boolean\(wmsData\?\.meta\?\.updatedAt\);/);
  assert.match(screenSource, /isLoading=\{!individualBucketReady && !error\}/);
  assert.match(screenSource, /!targetedBatchRowsError &&\s*!targetedBatchRowsData\?\.meta\?\.updatedAt;/);
  assert.match(screenSource, /!bgoDetailData\?\.meta\?\.updatedAt\) &&/);
});
