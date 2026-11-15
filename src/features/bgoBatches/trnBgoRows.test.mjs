import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildTrnBgoMobileRows, summarizeTrnBgoRows } from "./trnBgoRows.js";

test("buildTrnBgoMobileRows maps TRN items into TargetedBatchRowsWorklist row shape", () => {
  const rows = buildTrnBgoMobileRows([
    {
      id: "TRN_1",
      trnType: "METER_DISCONNECTION",
      workflowState: "ACCEPTED",
      meterNo: "M100",
      address: "12 Main St",
      raw: {
        accessData: { premise: { erfNo: "45", erfId: "ERF_45" } },
        ast: { location: { gps: { lat: -28.1, lng: 30.2 } } },
        metadata: { updatedAt: "2026-11-15T10:00:00Z" },
      },
    },
    {
      id: "TRN_2",
      trnType: "METER_READING",
      workflowState: "IN_PROGRESS",
      meterNo: "M200",
      address: "14 Main St",
    },
    {
      id: "TRN_3",
      trnType: "METER_INSPECTION",
      workflowState: "COMPLETED",
      meterNo: "M300",
      address: "16 Main St",
    },
  ]);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].sourceModule, "TRN_BGO");
  assert.equal(rows[0].trnTypeLabel, "Disconnection");
  assert.equal(rows[0].displayStatus, "NOT_STARTED");
  assert.equal(rows[0].erfNo, "45");
  assert.deepEqual(rows[0].mapPosition, { latitude: -28.1, longitude: 30.2 });
  assert.equal(rows[1].displayStatus, "IN_PROGRESS");
  assert.equal(rows[2].displayStatus, "COMPLETED");

  assert.deepEqual(summarizeTrnBgoRows(rows), {
    total: 3,
    notStarted: 1,
    inProgress: 1,
    completed: 1,
    qaPass: 0,
    qaFail: 0,
  });
});

test("my-workorders splits BGOB into 4 buckets and routes TRN BGO rows to TargetedBatchRowsWorklist", async () => {
  const screen = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
  assert.match(screen, /title="Adhoc Trns \(Individual\)"/);
  assert.match(screen, /title="Adhoc Trns \(Bulk\)"/);
  assert.match(screen, /title="Targeted Audit"/);
  assert.match(screen, /title="Sweep Audit"/);
  assert.match(screen, /onPress=\{\(\) => onOpen\("TRNBGO"\)\}/);
  assert.match(screen, /showTrnBgoWorklist/);
  assert.match(screen, /buildTrnBgoMobileRows/);
  assert.doesNotMatch(screen, /if \(!isBmdBgoBucket\(props\.bucket\)\) return <BucketCard/);
  assert.match(screen, /const canView = isBmd \? bucket\.permissions\?\.canViewErfs : bucket\.permissions\?\.canViewTrns/);
  assert.match(screen, /item\?\.raw\?\.origin\?\.trnBgo\?\.batchId/);
});
