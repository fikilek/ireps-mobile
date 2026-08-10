import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./targetedBatchApi.js", import.meta.url), "utf8");

test("Targeted Batch rows use a live rows stream and no callable read", () => {
  const endpoint = source.slice(source.indexOf("getTargetedBatchRows: builder.query"), source.indexOf("acceptRejectTargetedBatch: builder.mutation"));
  assert.match(endpoint, /onSnapshot\(/);
  assert.match(endpoint, /collection\(db, "tb_rows"\)/);
  assert.doesNotMatch(endpoint, /getTargetedBatchRowsCallable/);
  assert.doesNotMatch(endpoint, /firestoreLimit/);
});

test("row stream dynamically joins and cleans Sales listeners", () => {
  assert.match(source, /doc\(db, "sales-all-meters", id\)/);
  assert.doesNotMatch(source, /demo_sales_meters/);
  assert.match(source, /salesListeners\.has\(id\)/);
  assert.match(source, /salesListeners\.delete\(id\)/);
  assert.match(source, /for \(const unsubscribe of salesListeners\.values\(\)\) unsubscribe\(\)/);
  assert.match(source, /active = false/);
});

test("Sales fieldwork drives NA count and locked meter rule", () => {
  assert.match(source, /fieldWork\.noAccess\?\.length \|\| 0/);
  assert.match(source, /fieldWorkMeterId = cleanText\(fieldWork\.meterId\) \|\| null/);
});
