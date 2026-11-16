import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkorderNoAccessContext } from "./trnBgoRows.js";

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
