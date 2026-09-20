// TB-R051 (1.3.68): the meter worked on most recently leads the batch, the sort button toggles it,
// and a different meter found at the ERF (TB-R063) is shown on the card.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveTargetedBatchSalesPoint } from "./targetedBatchMapPoints.js";
import {
  noAccessVisitMillis,
  readRowLastWorkedMillis,
  toWorkedMillis,
} from "./rowLastWorked.js";
import {
  DEFAULT_TARGETED_BATCH_ROW_ORDER,
  sortTargetedBatchRowsByLastWorked,
  TARGETED_BATCH_ROW_ORDERS,
} from "./targetedBatchRowSearch.js";

const apiSource = await readFile(new URL("../../redux/targetedBatchApi.js", import.meta.url), "utf8");
const screenSource = await readFile(
  new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url),
  "utf8",
);

function extractApiFunction(name) {
  const start = apiSource.search(new RegExp(`(export )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} not found`);
  let depth = 0;
  for (let index = apiSource.indexOf("{", apiSource.indexOf(")", start)); index < apiSource.length; index += 1) {
    if (apiSource[index] === "{") depth += 1;
    if (apiSource[index] === "}" && --depth === 0) return apiSource.slice(start, index + 1).replace(/^export /, "");
  }
  throw new Error(`${name} is not closed`);
}

// The real row pipeline of the rows stream, as the phone runs it.
const api = new Function(
  "resolveTargetedBatchSalesPoint",
  "readRowLastWorkedMillis",
  `${["normalizeUpper", "cleanText", "readFirstString", "readNumber", "readTbRefBatchId", "readSalesLoadState", "normalizeTargetedBatchRow", "enrichTargetedBatchRowFromSales"].map(extractApiFunction).join("\n")}
return { normalizeTargetedBatchRow, enrichTargetedBatchRowFromSales };`,
)(resolveTargetedBatchSalesPoint, readRowLastWorkedMillis);

const buildRow = (row, sales) =>
  api.normalizeTargetedBatchRow(api.enrichTargetedBatchRowFromSales(row, sales));

const ROW = Object.freeze({
  id: "ROW1",
  tbId: "TB1",
  rowNo: 3,
  salesAllMeterId: "S1",
  refs: { erfId: "ERF1" },
  meter: { numberRaw: "04298112659", numberNormalized: "04298112659" },
  execution: { status: "NOT_STARTED" },
});

const salesWith = (fieldWork, extra = {}) => ({
  master: { visibility: "INVISIBLE" },
  tbRefs: [{ id: "TB1", fieldWork }],
  ...extra,
});

test("a time reaches the phone as a Timestamp, a seconds map, a number or a string", () => {
  assert.equal(toWorkedMillis({ toMillis: () => 1_700_000_000_000 }), 1_700_000_000_000);
  assert.equal(toWorkedMillis({ seconds: 1_700_000_000 }), 1_700_000_000_000);
  assert.equal(toWorkedMillis(1_700_000_000_000), 1_700_000_000_000);
  assert.equal(toWorkedMillis("2026-09-20T05:30:00.000Z"), Date.parse("2026-09-20T05:30:00.000Z"));
  // Nothing readable is no time at all, never a wrong one.
  for (const value of [null, undefined, "", "not a date", {}, { seconds: "10" }, { toMillis: () => NaN }]) {
    assert.equal(toWorkedMillis(value), 0);
  }
});

test("a No Access visit is kept as the day and time it was recorded", () => {
  assert.equal(
    noAccessVisitMillis({ date: "2026-09-19", time: "14:05:00", user: "Thabo" }),
    Date.parse("2026-09-19T14:05:00"),
  );
  assert.equal(noAccessVisitMillis({ date: "2026-09-19", time: "14:05" }), Date.parse("2026-09-19T14:05:00"));
  // A visit with no usable time still counts on its day.
  assert.equal(noAccessVisitMillis({ date: "2026-09-19" }), Date.parse("2026-09-19T00:00:00"));
  for (const visit of [{}, { date: "19/09/2026" }, { time: "14:05:00" }]) {
    assert.equal(noAccessVisitMillis(visit), 0);
  }
});

test("the newest field work on the meter is its time, wherever it was written", () => {
  const fieldWork = { submittedAt: { seconds: 1_000 }, updatedAt: { seconds: 5_000 } };
  assert.equal(readRowLastWorkedMillis({}, { fieldWork }), 5_000_000);

  // A row the server closed, and a different meter found at the ERF, both count.
  assert.equal(
    readRowLastWorkedMillis({ execution: { completedAt: { seconds: 9_000 } } }, { fieldWork }),
    9_000_000,
  );
  assert.equal(readRowLastWorkedMillis({ execution: { startedAt: { seconds: 3_000 } } }, {}), 3_000_000);
  // The row's own metadata.updatedAt is not field work: every row carries it, because it moves when
  // the row is created and batched. Reading it would leave no meter untouched.
  assert.equal(
    readRowLastWorkedMillis({ metadata: { updatedAt: { seconds: 2_000 } }, execution: { status: "NOT_STARTED" } }, {}),
    0,
  );
  assert.equal(
    readRowLastWorkedMillis({}, { sales: { differentMeterFound: { foundAt: { seconds: 7_000 } } } }),
    7_000_000,
  );
  // A No Access visit is field work too.
  assert.equal(
    readRowLastWorkedMillis({}, { fieldWork: { noAccess: [{ date: "2026-09-19", time: "14:05:00" }] } }),
    Date.parse("2026-09-19T14:05:00"),
  );
  // A meter nobody has worked on has no time of its own.
  assert.equal(readRowLastWorkedMillis({}, {}), 0);
  assert.equal(readRowLastWorkedMillis(), 0);
});

test("the rows stream gives the card the time and the number found", () => {
  const worked = buildRow(ROW, salesWith({ premiseId: "P1", updatedAt: { seconds: 5_000 } }));
  assert.equal(worked.lastWorkedAt, 5_000_000);
  assert.equal(worked.foundMeterNo, null);

  // TB-R063: the server closed the row on a different meter; the row carries the number found.
  const different = buildRow(
    { ...ROW, execution: { status: "COMPLETED", foundMeterNo: "04297704464" } },
    salesWith({ meterId: "A9", updatedAt: { seconds: 6_000 } }),
  );
  assert.equal(different.foundMeterNo, "04297704464");
  assert.equal(different.displayStatus, "COMPLETED");

  // Before the row is closed the Sales record holds it.
  const onSalesOnly = buildRow(
    ROW,
    salesWith({ updatedAt: { seconds: 6_000 } }, { differentMeterFound: { meterNo: "04297704464" } }),
  );
  assert.equal(onSalesOnly.foundMeterNo, "04297704464");

  // The row's own meter found at its own ERF is not a different meter, whichever way it is written.
  for (const number of ["04298112659", " 04298112659 "]) {
    assert.equal(buildRow({ ...ROW, execution: { foundMeterNo: number } }, salesWith({})).foundMeterNo, null);
  }

  // A meter nobody has touched carries no time, so it follows the worked ones.
  assert.equal(buildRow(ROW, salesWith({})).lastWorkedAt, null);
  assert.equal(buildRow(ROW, null).lastWorkedAt, null);
});

test("the batch a worker comes back to leads with the meter they have just finished", () => {
  const rows = [
    buildRow({ ...ROW, id: "NEVER" }, salesWith({})),
    buildRow({ ...ROW, id: "YESTERDAY" }, salesWith({ updatedAt: { seconds: 1_000 } })),
    buildRow(
      { ...ROW, id: "JUST_DONE", execution: { status: "COMPLETED", completedAt: { seconds: 9_000 } } },
      salesWith({ updatedAt: { seconds: 8_000 } }),
    ),
  ];
  assert.deepEqual(
    sortTargetedBatchRowsByLastWorked(rows, DEFAULT_TARGETED_BATCH_ROW_ORDER).map((row) => row.id),
    ["JUST_DONE", "YESTERDAY", "NEVER"],
  );
  // The button's other way leads with the work nobody has started.
  assert.deepEqual(
    sortTargetedBatchRowsByLastWorked(rows, TARGETED_BATCH_ROW_ORDERS.OLDEST_FIRST).map((row) => row.id),
    ["NEVER", "YESTERDAY", "JUST_DONE"],
  );
});

test("the screen sorts the list it shows, and the sort button sits on the search row", () => {
  assert.match(
    screenSource,
    /sortTargetedBatchRowsByLastWorked\(\s*searchTargetedBatchRows\([\s\S]*?targetedBatchRowOrder,\s*\)/,
  );
  // The button is inside the search row, beside the search box.
  const searchRow = screenSource.slice(
    screenSource.indexOf("<View style={styles.tbSearchRow}>"),
    screenSource.indexOf("styles.tbSearchCount"),
  );
  assert.ok(searchRow.includes("styles.tbSearchBox"), "the search box shares the row");
  assert.match(searchRow, /onPress=\{\(\) => onRowOrderPress\?\.\(\)\}/);
  assert.match(searchRow, /sort-clock-descending-outline|sort-clock-ascending-outline/);
  // The words say which way it is showing.
  assert.match(screenSource, /const orderWords = newestFirst \? "Last worked on first" : "Oldest work first";/);
  // The old rule is gone.
  assert.doesNotMatch(screenSource, /sortTargetedBatchRowsOpenFirst/);
});

test("the card shows the meter found on site, and a tapped button that cannot work says why", () => {
  assert.match(screenSource, /Found on site: \{row\.foundMeterNo\}/);
  // The card is redrawn when the number found changes.
  assert.match(screenSource, /\(row\) => row\?\.foundMeterNo,/);
  // TB-R051 (1.3.68): the reason is given where every other refusal is decided, so the map tap
  // and the list tap answer the same way.
  const prepare = screenSource.slice(
    screenSource.indexOf("function prepareTargetedBatchAction("),
    screenSource.indexOf("const showBmdErfWorklist"),
  );
  assert.match(prepare, /const blocked = blockedTargetedBatchReason\(actions, intent\);/);
  assert.match(prepare, /Alert\.alert\(blocked\.title, blocked\.message\);\s*return false;/);
  // It never speaks over a batch that left the worker's work orders, or a Sales record that failed.
  assert.ok(
    prepare.indexOf("TB ACTION NOT IN WORK ORDERS") < prepare.indexOf("const blocked ="),
    "the work-orders check comes first",
  );
  assert.ok(
    prepare.indexOf("TARGETED_BATCH_SALES_NOT_READABLE_TITLE") < prepare.indexOf("const blocked ="),
    "the Sales check comes first",
  );
});
