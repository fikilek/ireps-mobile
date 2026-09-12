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

// The module initialises Firebase on import, so the pure reader is evaluated from its source text.
function extractFunction(name) {
  const start = source.search(new RegExp(`(export )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} not found`);
  let depth = 0;
  for (let index = source.indexOf("{", source.indexOf(")", start)); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1).replace(/^export /, "");
  }
  throw new Error(`${name} is not closed`);
}

const enrich = new Function(
  `${["normalizeUpper", "cleanText", "readFirstString", "readTbRefBatchId", "enrichTargetedBatchRowFromSales"]
    .map(extractFunction)
    .join("\n")}\nreturn enrichTargetedBatchRowFromSales;`,
)();
const TB = "TGB_20260912_100000_ABCD";
const row = { tbId: TB, salesAllMeterId: "04297704498" };
const visit = { date: "2026-09-12", time: "10:00:00", user: "FWR" };

test("tbRefs reader links exactly one entry, including the legacy tbId key", () => {
  assert.doesNotMatch(source, /tbRefs\.find\(/);
  const byId = enrich(row, { tbRefs: [{ id: TB, fieldWork: { status: "IN_PROGRESS", meterId: "AST_1", noAccess: [visit, visit] } }] });
  assert.equal(byId.noAccessSourceStatus, "OK");
  assert.equal(byId.noAccessCount, 2);
  assert.equal(byId.fieldWorkMeterId, "AST_1");
  const legacy = enrich(row, { tbRefs: [{ tbId: TB.toLowerCase(), fieldWork: { noAccess: [visit] } }] });
  assert.equal(legacy.noAccessSourceStatus, "OK");
  assert.equal(legacy.noAccessCount, 1);
  const otherBatch = enrich(row, { tbRefs: [{ id: "TGB_20260101_000000_ZZZZ", fieldWork: { noAccess: [visit] } }, { id: TB }] });
  assert.equal(otherBatch.noAccessSourceStatus, "OK");
  assert.equal(otherBatch.noAccessCount, 0);
});

test("tbRefs reader never picks a winner among duplicate links", () => {
  for (const tbRefs of [
    [{ id: TB, fieldWork: { meterId: "AST_1", noAccess: [visit] } }, { id: TB, fieldWork: { noAccess: [visit, visit] } }],
    [{ id: TB, fieldWork: { noAccess: [visit] } }, { tbId: TB }],
  ]) {
    const result = enrich(row, { tbRefs });
    assert.equal(result.noAccessSourceStatus, "TB_REFERENCE_AMBIGUOUS");
    assert.equal(result.noAccessCount, 0);
    assert.equal(result.fieldWorkMeterId, null);
  }
});

test("tbRefs reader reports missing and malformed linkage explicitly", () => {
  assert.equal(enrich(row, { tbRefs: [] }).noAccessSourceStatus, "TB_REFERENCE_MISSING");
  assert.equal(enrich(row, {}).noAccessSourceStatus, "TB_REFERENCE_MISSING");
  assert.equal(enrich(row, { tbRefs: { id: TB } }).noAccessSourceStatus, "TB_REFERENCES_INVALID");
  assert.equal(enrich({ ...row, tbId: "" }, { tbRefs: [{ id: "" }, {}] }).noAccessSourceStatus, "TB_REFERENCE_MISSING");
  assert.equal(enrich(row, { tbRefs: [null, "TGB", { id: TB, fieldWork: [] }] }).noAccessSourceStatus, "FIELDWORK_INVALID");
  assert.equal(enrich(row, null).noAccessSourceStatus, "SALES_DOCUMENT_MISSING");
  assert.equal(enrich({ tbId: TB }, { tbRefs: [] }).noAccessSourceStatus, "SALES_DOCUMENT_ID_MISSING");
});
