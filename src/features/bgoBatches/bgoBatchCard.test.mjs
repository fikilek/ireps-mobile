import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canOpenMdBgoRows, summarizeMdBgoCardRows } from "./bgoBatchCardModel.js";
import { followMdBgoCardRows } from "./bgoBatchCardStream.js";

const row = (id, state, batch = "a") => ({ id, bgoBatchId: batch,
  batchMode: "BMD", operationType: "METER_DISCOVERY", workflow: { state } });

test("counts permanent work rows, including several premises on the same ERF", () => {
  const rows = [row("1", "ISSUED"), row("2", "IN_PROGRESS"), row("3", "COMPLETED"), row("4", "CANCELLED"), row("5", "IN_PROGRESS")];
  rows[1].erf = rows[4].erf = { id: "same-erf" };
  const counts = summarizeMdBgoCardRows(["a", "empty"], [...rows, rows[0], row("other", "COMPLETED", "unassigned")]);
  assert.deepEqual(counts.a, { total: 4, notStarted: 1, inProgress: 2, completed: 1, qaPass: null, qaFail: null });
  assert.equal(counts.empty.total, 0);
});

test("does not invent progress for invalid states or QA from premise capture", () => {
  const rows = [row("1", "UNKNOWN"), row("2", "ISSUED")];
  rows[1].premise = { qaStatus: "QA_PASS" };
  const counts = summarizeMdBgoCardRows(["a"], rows).a;
  assert.equal(counts.notStarted, null);
  assert.equal(counts.qaPass, null);
});

test("excludes non-MD documents and keeps not-started states consistent", () => {
  const rows = [row("1", "READY_FOR_ALLOCATION"), row("2", "ALLOCATED"), { ...row("3", "ISSUED"), batchMode: "TRN" }];
  assert.equal(summarizeMdBgoCardRows(["a"], rows).a.notStarted, 2);
});

test("released rows remain viewable throughout execution, with no new state transitions", () => {
  for (const state of ["ACCEPTED", "IN_PROGRESS", "COMPLETED"]) {
    assert.equal(canOpenMdBgoRows(state, "RELEASED_TO_EXECUTION"), true);
    assert.equal(canOpenMdBgoRows(state, "WAITING_BATCH_ACCEPTANCE"), false);
  }
  for (const state of ["ISSUED", "REJECTED", "CANCELLED", "READY_FOR_ALLOCATION"]) {
    assert.equal(canOpenMdBgoRows(state, "RELEASED_TO_EXECUTION"), false);
  }
});

test("stream chunks batch IDs, waits for all chunks, updates live and cleans up", () => {
  const listeners = [], results = [];
  let stopped = 0;
  const stop = followMdBgoCardRows({
    batchIds: Array.from({ length: 35 }, (_, i) => `b${i}`),
    listen: (ids, next) => { listeners.push({ ids, next }); return () => stopped++; },
    onChange: (data) => results.push(data),
  });
  assert.deepEqual(listeners.map((l) => l.ids.length), [30, 5]);
  assert.equal(results.at(-1).stream, "CONNECTING");
  listeners[0].next([row("1", "ISSUED", listeners[0].ids[0])], { fromCache: false });
  assert.equal(results.at(-1).stream, "CONNECTING");
  listeners[1].next([], { fromCache: false });
  assert.equal(results.at(-1).stream, "LIVE");
  const batch = listeners[0].ids[0];
  assert.equal(results.at(-1).countsByBatchId[batch].notStarted, 1);
  listeners[0].next([row("1", "IN_PROGRESS", batch), row("2", "IN_PROGRESS", batch)]);
  assert.equal(results.at(-1).countsByBatchId[batch].total, 2);
  assert.equal(results.at(-1).countsByBatchId[batch].inProgress, 2);
  stop();
  assert.equal(stopped, 2);
  const length = results.length;
  listeners[0].next([]);
  assert.equal(results.length, length);
});

test("cached rows do not pretend to be confirmed and a failed stream clears visible counts", () => {
  let next, fail;
  const results = [];
  const stop = followMdBgoCardRows({ batchIds: ["a"], listen: (_ids, n, f) => { next = n; fail = f; return () => {}; }, onChange: (d) => results.push(d) });
  next([row("1", "ISSUED")], { fromCache: true });
  assert.deepEqual(results.at(-1).countsByBatchId, {});
  next([row("1", "ISSUED")], { fromCache: false });
  assert.equal(results.at(-1).countsByBatchId.a.total, 1);
  fail(new Error("permission-denied"));
  assert.equal(results.at(-1).stream, "ERROR");
  assert.equal(results.at(-1).error, "permission-denied");
  assert.deepEqual(results.at(-1).countsByBatchId, {});
  stop();
});

test("both cards share presentation, BGO title has no prefix, legacy BGO retains its card", async () => {
  const screen = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
  assert.equal((screen.match(/<BatchCardPresentation/g) || []).length, 2);
  assert.match(screen, /title=\{bucket.id \|\| "NAv"\}/);
  assert.match(screen, /if \(!isBmdBgoBucket\(props.bucket\)\) return <BucketCard/);
  assert.match(screen, /useGetMdBgoCardRowsQuery/);
});
