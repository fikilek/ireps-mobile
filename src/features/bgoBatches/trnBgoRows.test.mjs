import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrnBgoMobileRows,
  buildWorkorderNoAccessContext,
  deriveTrnBgoQaBadge,
  resolveTrnBgoMeterState,
} from "./trnBgoRows.js";

test("buildWorkorderNoAccessContext routes TRN BGO items through trnBgoContext without top-level instructionTrnId", () => {
  const item = {
    id: "TRN_MINSP_1",
    trnType: "METER_INSPECTION",
    raw: {
      origin: { channel: "OFFICE", trnBgo: { batchId: "TRN_BGO_BATCH_1" } },
      assignment: { targetType: "USER", targetId: "U1" },
      accessData: {
        erfId: "E1",
        erfNo: "2631",
        parents: { lmPcode: "ZA5241", wardPcode: "ZA5241006" },
        premise: { id: "P1", address: "18A Oldacre St", propertyType: "Residential" },
      },
      ast: { astData: { astNo: "04297758833" } },
    },
  };

  const ctx = buildWorkorderNoAccessContext({ item, sourceAstId: "AST_1" });
  assert.equal(ctx.instructionTrnId, undefined);
  assert.deepEqual(ctx.trnBgoContext, {
    batchId: "TRN_BGO_BATCH_1",
    instructionTrnId: "TRN_MINSP_1",
  });
  assert.deepEqual(ctx.origin, { channel: "FIELD" });
});

test("buildWorkorderNoAccessContext retains instructionTrnId for Adhoc Individual office instructions", () => {
  const item = {
    id: "TRN_IND_1",
    trnType: "METER_INSPECTION",
    raw: {
      origin: { channel: "OFFICE" },
      assignment: { targetType: "USER", targetId: "U1" },
      accessData: {
        erfId: "E1",
        erfNo: "2631",
        parents: { lmPcode: "ZA5241", wardPcode: "ZA5241006" },
        premise: { id: "P1", address: "18A Oldacre St", propertyType: "Residential" },
      },
      ast: { astData: { astNo: "04297758833" } },
    },
  };

  const ctx = buildWorkorderNoAccessContext({ item, sourceAstId: "AST_1" });
  assert.equal(ctx.instructionTrnId, "TRN_IND_1");
  assert.equal(ctx.trnBgoContext, undefined);
  assert.deepEqual(ctx.origin, { channel: "OFFICE" });
});

test("buildTrnBgoMobileRows projects live meterState from streamed asts doc over static snapshot", () => {
  const rows = buildTrnBgoMobileRows(
    [
      {
        id: "TRN_MDCN_1",
        trnType: "METER_DISCONNECTION",
        workflowState: "IN_PROGRESS",
        raw: {
          ast: {
            astData: { astId: "AST_1", astNo: "04297749634" },
            status: { state: "CONNECTED" },
          },
          accessData: { premiseId: "P1", premise: { id: "P1", erfNo: "5267", address: "5267 CRAIGSIDE STREET" } },
        },
      },
    ],
    {
      meters: [{ id: "AST_1", status: { state: "disconnected" }, astData: { astNo: "04297749634" } }],
      premises: [],
      erfs: [],
    },
  );
  assert.equal(rows[0].meterState, "DISCONNECTED");
  assert.equal(rows[0].qaBadge, "QA NAv");
  assert.equal(deriveTrnBgoQaBadge("COMPLETED"), "QA PENDING");
  assert.equal(deriveTrnBgoQaBadge("QA PASS"), "QA PASS");
  assert.equal(deriveTrnBgoQaBadge("QA FAIL"), "QA FAIL");
  assert.equal(resolveTrnBgoMeterState(null, null), "NAv");
});
