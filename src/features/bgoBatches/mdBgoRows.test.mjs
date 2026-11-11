import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildMdBgoMobileRows, buildMdBgoCaptureContext, buildMdBgoMapPoints, parseMdBgoContext, preserveMdBgoErfSelection } from "./mdBgoRows.js";
import { followMdBgoAssets } from "./mdBgoAssetStream.js";
import { getTargetedBatchRowActionState } from "../targetedBatches/targetedBatchActions.js";
import { buildNoAccessPayload, noAccessContextFromQueue } from "../meters/noAccessCapture.js";
import { sortTargetedBatchRowsByLastWorked, searchTargetedBatchRows } from "../targetedBatches/targetedBatchRowSearch.js";

const seed = { id: "B_ROW_1", bgoBatchId: "B", batchMode: "BMD", operationType: "METER_DISCOVERY", erf: { id: "E", erfNo: "25", centroid: { latitude: -28, longitude: 30 } }, workflow: { state: "ISSUED" } };

test("same-ERF navigation preserves BGO context for repeatable premise capture, never another ERF or explicit reset", () => {
  const context = buildMdBgoCaptureContext({ id: "B" }, seed);
  const previous = { id: "E", bmdContext: context };
  assert.deepEqual(preserveMdBgoErfSelection(previous, { id: "E", erfNo: "25" }).bmdContext, context);
  assert.equal(preserveMdBgoErfSelection(previous, { id: "OTHER" }).bmdContext, undefined);
  assert.equal(preserveMdBgoErfSelection(previous, null), null);
  assert.equal(preserveMdBgoErfSelection(previous, { id: "E", bmdContext: null }).bmdContext, null);
});

test("two captured flat premises display two actionable rows before either meter exists", () => {
  const rows = ["A", "B"].map((unit, index) => ({ ...seed, id: `B_ROW_${index + 1}`, refs: { premiseId: `P${unit}` }, workflow: { state: "IN_PROGRESS" } }));
  const result = buildMdBgoMobileRows({ rows, premises: ["A", "B"].map(unit => ({ id: `P${unit}`, propertyType: { name: "ZK Flats", unitNo: unit } })) });
  assert.equal(result.length, 2);
  for (const [index, row] of result.entries()) {
    assert.match(row.addressLine, new RegExp(index ? "B$" : "A$"));
    assert.equal(row.meterNo, "NAv");
    const actions = getTargetedBatchRowActionState(row);
    assert.equal(actions.premise.value, 1);
    assert.equal(actions.ast.value, 0);
    assert.equal(row.displayStatus, "IN_PROGRESS");
  }
});
test("ERF seed displays Meter NAv with confirmed zero Premise, AST and No Access action counts", () => {
  const [row] = buildMdBgoMobileRows({ rows: [seed] });
  assert.equal(row.meterNo, "NAv");
  const actions = getTargetedBatchRowActionState(row);
  assert.equal(actions.premise.value, 0); assert.equal(actions.ast.value, 0); assert.equal(actions.noAccess.value, 0);
  assert.equal(row.displayStatus, "NOT_STARTED"); assert.deepEqual(row.mapPosition, { latitude: -28, longitude: 30 });
});
test("separate registered meters on one premise remain separate work rows without cross-joining", () => {
  const rows = [1, 2].map((n) => ({ ...seed, id: `B_ROW_${n}`, refs: { premiseId: "P", meterId: `M${n}` }, meter: { meterNo: `100${n}` }, workflow: { state: "COMPLETED" } }));
  const result = buildMdBgoMobileRows({ rows, premises: [{ id: "P", address: { strNo: "25", strName: "Robin", strType: "Road" }, geometry: { centroid: { lat: -28.01, lng: 30.01 } } }] });
  assert.deepEqual(result.map((r) => r.meterNo), ["1001", "1002"]);
  assert.equal(buildMdBgoMapPoints(result).groups[0].rows.length, 2);
  assert.equal(searchTargetedBatchRows(result, "Robin").length, 2);
});
test("capture context and No Access queue retain exact batch, premise and row identity", () => {
  const row = { ...seed, erfId: "E", refs: { premiseId: "P" } };
  const context = buildMdBgoCaptureContext({ id: "B" }, row);
  assert.deepEqual(parseMdBgoContext(JSON.stringify(context)), context);
  const payload = buildNoAccessPayload({ context: { trnType: "METER_DISCOVERY", erfId: "E", premiseId: "P", mdBgoContext: context }, trnId: "NA1", capturedAt: "2026-11-11T01:00:00Z", value: { reasonCode: "Property Locked" }, media: [] });
  assert.deepEqual(noAccessContextFromQueue({ payload }).mdBgoContext, context);
  assert.throws(() => parseMdBgoContext('{"batchId":"B"}'), /missing/);
});
test("last-worked ordering and map positions follow actual row activity and field coordinates", () => {
  const rows = [seed, { ...seed, id: "B_ROW_2", refs: { meterId: "M" }, workflow: { state: "COMPLETED" }, metadata: { updatedAt: "2026-11-11T01:00:00Z" } }];
  const result = buildMdBgoMobileRows({ rows, meters: [{ id: "M", ast: { location: { gps: { lat: -29, lng: 31 } } } }] });
  assert.equal(sortTargetedBatchRowsByLastWorked(result)[0].id, "B_ROW_2");
  const points = buildMdBgoMapPoints(result); assert.equal(points.groups.length, 2); assert.equal(points.groups[1].source, "GPS");
});
test("exact linked-document streams update, report failures and release all listeners", () => {
  const listens = [], states = []; let stopped = 0;
  const stop = followMdBgoAssets({ premiseIds: ["P"], meterIds: ["M"], erfIds: ["E"],
    listen: (collection, ids, next, error) => { listens.push({ collection, ids, next, error }); return () => stopped++; }, onChange: (data) => states.push(data) });
  for (const listener of listens) listener.next([{ id: listener.ids[0] }], { fromCache: false });
  assert.equal(states.at(-1).stream, "LIVE"); assert.equal(states.at(-1).premises[0].id, "P");
  listens[1].next([{ id: "M", meterNo: "NEW" }]); assert.equal(states.at(-1).meters[0].meterNo, "NEW");
  listens[0].error(new Error("permission denied")); assert.equal(states.at(-1).stream, "ERROR");
  stop(); assert.equal(stopped, 3);
});
test("BGO uses shared TB worklist and batch map with its own adapters and persisted queue context", async () => {
  const screen = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
  assert.match(screen, /batchLabel="MD BGO"/); assert.match(screen, /mapPointsOverride=\{mdBgoMapPoints\} batchOnly/);
  const form = await readFile(new URL("../meters/FormMeterDiscovery.js", import.meta.url), "utf8");
  assert.match(form, /editQueueItem\?\.payload\?\.mdBgoContext/); assert.match(form, /cleanPayload.mdBgoContext/);
});
