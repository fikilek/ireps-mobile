import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { configureStore } from "@reduxjs/toolkit";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query";
import * as live from "./liveSubscription.js";
import { followMdBgoAssets } from "../features/bgoBatches/mdBgoAssetStream.js";
import { followMdBgoCardRows } from "../features/bgoBatches/bgoBatchCardStream.js";
import { canOpenMdBgoRows } from "../features/bgoBatches/bgoBatchCardModel.js";
import { buildMdBgoMobileRows } from "../features/bgoBatches/mdBgoRows.js";

const screen = await readFile(new URL("../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
const source = await readFile(new URL("./bgoApi.js", import.meta.url), "utf8");
const BATCH = "MD_BGO_TEST";
const bucket = { id: BATCH, bucketType: "BGOB", batchMode: "BMD" };
const seed = { id: `${BATCH}_ROW_1`, bgoBatchId: BATCH, rowNo: 1, batchMode: "BMD", operationType: "METER_DISCOVERY", erf: { id: "E1", erfNo: "25" }, workflow: { state: "ISSUED" } };

// Execute the actual screen selection and hook arguments, not a duplicate selector.
function screenQueries(selectedBucket, fieldWorkorderActor = true, data) {
  const selection = screen.slice(screen.indexOf("  const selectedMdBgoBatchId ="), screen.indexOf("  const selectedTargetedBatchId ="));
  const queries = screen.slice(screen.indexOf("  const bgoDetailQuerySkipped ="), screen.indexOf("  const mdBgoRows = useMemo"));
  const calls = {};
  new Function("selectedBucket", "fieldWorkorderActor", "isBmdBgoBucket", "useMemo", "useGetMdBgoRowsQuery", "useGetMdBgoAssetsQuery", `${selection}\n${queries}`)(
    selectedBucket, fieldWorkorderActor, (item) => item?.batchMode === "BMD", (factory) => factory(),
    (args, options) => { calls.rows = { args, ...options }; return { currentData: data }; },
    (args, options) => { calls.assets = { args, ...options }; return {}; },
  );
  return calls;
}

// Evaluate the production API against the real RTK cache/middleware. Only its Firebase transport is injected.
function apiHarness() {
  const listeners = [];
  const deps = { ...live, createApi, fakeBaseQuery, followMdBgoAssets, followMdBgoCardRows, canOpenMdBgoRows,
    httpsCallable: () => { throw new Error("Unexpected callable read"); }, functions: {},
    listenActorTeams: () => { throw new Error("Unexpected team subscription"); },
    listenDocumentsByIds: (collectionName, values, next, error) => add({ collectionName, values }, next, error),
    listenWhereIn: (query, next, error) => add(query, next, error),
  };
  function add(query, next, error) {
    const listener = { query, next, error, stopped: false };
    listeners.push(listener);
    return () => { listener.stopped = true; };
  }
  const body = source.replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];/gm, "").replace(/\bexport /g, "");
  const api = new Function(...Object.keys(deps), `${body}\nreturn bgoApi;`)(...Object.values(deps));
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (get) => get({ serializableCheck: false }).concat(api.middleware) });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { api, store, listeners, flush, close: () => store.dispatch(api.util.resetApiState()) };
}

test("opening an MD BGO batch starts its actual RTK row listener and receives live updates", async () => {
  const h = apiHarness();
  try {
    const plan = screenQueries(bucket).rows;
    assert.equal(plan.skip, false, "MD BGO must not reuse the transaction-BGO skip gate");
    assert.equal(plan.args.bgoBatchId, BATCH);
    const request = h.store.dispatch(h.api.endpoints.getMdBgoRows.initiate(plan.args));
    await request; await h.flush();
    assert.equal(h.listeners.length, 1);
    const listener = h.listeners[0];
    assert.deepEqual(listener.query.values, [BATCH]);
    const current = () => h.api.endpoints.getMdBgoRows.select(plan.args)(h.store.getState()).data;
    listener.next([seed], { fromCache: false });
    assert.equal(current().stream, "LIVE");
    assert.equal(current().rows.length, 1);
    assert.equal(buildMdBgoMobileRows({ rows: current().rows })[0].meterNo, "NAv");
    const assets = screenQueries(bucket, true, current()).assets;
    assert.equal(assets.skip, false);
    assert.deepEqual(assets.args.erfIds, ["E1"]);
    listener.next([{ ...seed, workflow: { state: "COMPLETED" }, meter: { meterNo: "1234" } }], { fromCache: false });
    assert.equal(buildMdBgoMobileRows({ rows: current().rows })[0].meterNo, "1234");
    assert.equal(current().rows[0].workflow.state, "COMPLETED");
    listener.error(new Error("permission denied"));
    assert.equal(current().stream, "ERROR");
    assert.match(current().error, /permission denied/);
  } finally { h.close(); }
});

test("non-MD BGO, TB, no batch and non-field actors do not start MD BGO queries", () => {
  for (const selected of [null, { ...bucket, batchMode: "BTD" }, { ...bucket, bucketType: "TBB" }]) {
    const plan = screenQueries(selected);
    assert.equal(plan.rows.skip, true);
    assert.equal(plan.assets.skip, true);
  }
  assert.equal(screenQueries(bucket, false).rows.skip, true);
});

test("switching MD BGO batches uses separate caches and never reads another batch's rows", async () => {
  const h = apiHarness();
  try {
    const first = screenQueries(bucket).rows.args;
    await h.store.dispatch(h.api.endpoints.getMdBgoRows.initiate(first)); await h.flush();
    h.listeners[0].next([seed], { fromCache: false });
    const second = screenQueries({ ...bucket, id: "MD_BGO_SECOND" }).rows.args;
    await h.store.dispatch(h.api.endpoints.getMdBgoRows.initiate(second)); await h.flush();
    assert.deepEqual(h.listeners[1].query.values, ["MD_BGO_SECOND"]);
    assert.deepEqual(h.api.endpoints.getMdBgoRows.select(second)(h.store.getState()).data.rows, []);
    assert.equal(h.api.endpoints.getMdBgoRows.select(first)(h.store.getState()).data.rows[0].id, seed.id);
    assert.match(screen, /summarizeMdBgoCardRows\(\[selectedMdBgoBatchId\], mdBgoRows\)\[selectedMdBgoBatchId\]/);
  } finally { h.close(); }
});
