import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTargetedBatchContextFromRow,
  normalizeTargetedBatchContext,
  parseTargetedBatchAddress,
  parseTargetedBatchContextRouteParam,
  serializeTargetedBatchContext,
} from "./targetedBatchPremiseContext.js";

test("builds authoritative context from normalized row.raw paths", () => {
  const context = buildTargetedBatchContextFromRow({
    bucket: { id: "TGB_20260803_064212_LV1L" },
    row: {
      id: "TBR_20260803_064212_LV1L_000001",
      rowNo: 1,
      erfId: "K241N0GT030900000360000000",
      meterNo: "04298112659",
      accountNumber: "0001103604",
      customerName: "SITH0485",
      raw: {
        salesAllMeterId: "04298112659",
        source: { recordId: "04298112659" },
        refs: { erfId: "K241N0GT030900000360000000" },
        location: {
          addressLine1: "485 VAN RENSBURG",
          town: "SITHEMBILE",
        },
      },
    },
  });

  assert.equal(context.salesDocId, "04298112659");
  assert.equal(context.erfId, "K241N0GT030900000360000000");
  assert.deepEqual(context.sourceAddress, {
    addressLine1: "485 VAN RENSBURG",
    town: "SITHEMBILE",
  });
});

test("route fallback contains only safe fields and preserves correlation", () => {
  const context = normalizeTargetedBatchContext({
    sourceModule: "SALES_TARGETED_BATCH",
    operationType: "METER_DISCOVERY",
    tbId: "TB_1",
    rowId: "ROW_1",
    rowNo: 1,
    salesDocId: "SALE_1",
    erfId: "ERF_EXACT",
    meterNo: "METER_1",
    accountNumber: "ACCOUNT_PRIVATE",
    customerName: "CUSTOMER_PRIVATE",
    sourceAddress: {
      addressLine1: "485 VAN RENSBURG",
      town: "SITHEMBILE",
    },
  });
  const serialized = serializeTargetedBatchContext(context);
  const routeObject = JSON.parse(serialized);
  const parsed = parseTargetedBatchContextRouteParam(serialized);

  assert.deepEqual(Object.keys(routeObject), [
    "sourceModule",
    "operationType",
    "tbId",
    "rowId",
    "rowNo",
    "salesDocId",
    "erfId",
    "meterNo",
    "sourceAddress",
  ]);
  assert.equal("accountNumber" in routeObject, false);
  assert.equal("customerName" in routeObject, false);
  assert.equal(parsed.tbId, "TB_1");
  assert.equal(parsed.rowId, "ROW_1");
  assert.equal(parsed.salesDocId, "SALE_1");
  assert.equal(parsed.erfId, "ERF_EXACT");
  assert.deepEqual(parsed.sourceAddress, context.sourceAddress);
  assert.equal(parseTargetedBatchContextRouteParam("not-json"), null);
  assert.equal(
    parseTargetedBatchContextRouteParam('{"sourceModule":"BGO"}'),
    null,
  );
});

test("parses supported source addresses without inferring street type", () => {
  assert.deepEqual(
    parseTargetedBatchAddress({
      addressLine1: "485 VAN RENSBURG",
      town: "SITHEMBILE",
    }),
    {
      strNo: "485",
      strName: "VAN RENSBURG",
      suburbName: "SITHEMBILE",
      strType: "Select...",
    },
  );
  assert.deepEqual(
    parseTargetedBatchAddress({ addressLine1: "14A SMITH ROAD" }),
    {
      strNo: "14A",
      strName: "SMITH ROAD",
      suburbName: "",
      strType: "Select...",
    },
  );
  assert.deepEqual(
    parseTargetedBatchAddress({ addressLine1: "VAN RENSBURG" }),
    {
      strNo: "",
      strName: "VAN RENSBURG",
      suburbName: "",
      strType: "Select...",
    },
  );
  assert.deepEqual(parseTargetedBatchAddress({}), {
    strNo: "",
    strName: "",
    suburbName: "",
    strType: "Select...",
  });
});

test("editable premise address does not mutate preserved sourceAddress", () => {
  const context = normalizeTargetedBatchContext({
    sourceModule: "SALES_TARGETED_BATCH",
    tbId: "TB_1",
    rowId: "ROW_1",
    salesDocId: "SALE_1",
    erfId: "ERF_1",
    sourceAddress: {
      addressLine1: "485 VAN RENSBURG",
      town: "SITHEMBILE",
    },
  });
  const premiseAddress = parseTargetedBatchAddress(context.sourceAddress);
  premiseAddress.strName = "FIELD CORRECTION";

  assert.equal(context.sourceAddress.addressLine1, "485 VAN RENSBURG");
});

test("normal non-TB context remains absent", () => {
  assert.equal(normalizeTargetedBatchContext(undefined), null);
  assert.equal(normalizeTargetedBatchContext({ sourceModule: "BGO" }), null);
});
