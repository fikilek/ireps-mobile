// TB-R051 (1.3.42): the batch header's status filters, Completed meters that open but start nothing, and meters
// found outside the batch.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { chooseFoundMeter, describeFoundMeter, foundMeterMessage, wardNumberFromPcode } from "./foundMeter.js";
import {
  filterTargetedBatchRowsByStatus,
  nextTargetedBatchStatusFilter,
  searchTargetedBatchRows,
  targetedBatchRowStatus,
  TARGETED_BATCH_STATUS_FILTERS,
} from "./targetedBatchRowSearch.js";

const screenSource = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
const finderSource = await readFile(new URL("./findMetersByNumber.js", import.meta.url), "utf8");

const rows = [
  { id: "R1", displayStatus: "NOT_STARTED", meterNo: "04111111111", addressLine1: "1 Church St" },
  { id: "R2", displayStatus: "IN_PROGRESS", meterNo: "04222222222", addressLine1: "2 Church St" },
  { id: "R3", displayStatus: "COMPLETED", meterNo: "04333333333", addressLine1: "3 Main Rd" },
  { id: "R4", displayStatus: "COMPLETED", meterNo: "04444444444", addressLine1: "4 Church St" },
  { id: "R5", displayStatus: "", executionStatus: "NOT_STARTED", meterNo: "04555555555", addressLine1: "5 Main Rd" },
];
const ids = (list) => list.map((row) => row.id);

test("TB-R051 1.3.42 a row counts under Completed, In Progress, else Not Started, as the header counts do", () => {
  assert.deepEqual(rows.map(targetedBatchRowStatus), ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "COMPLETED", "NOT_STARTED"]);
  // Any other or missing status counts as Not Started, like buildTargetedBatchRowsData's summary.
  assert.equal(targetedBatchRowStatus({ displayStatus: "NO_ACCESS" }), "NOT_STARTED");
  assert.equal(targetedBatchRowStatus(null), "NOT_STARTED");
});

test("TB-R051 1.3.42 each status filter shows only its meters; Total shows every meter", () => {
  assert.deepEqual(ids(filterTargetedBatchRowsByStatus(rows, "TOTAL")), ["R1", "R2", "R3", "R4", "R5"]);
  assert.deepEqual(ids(filterTargetedBatchRowsByStatus(rows, "NOT_STARTED")), ["R1", "R5"]);
  assert.deepEqual(ids(filterTargetedBatchRowsByStatus(rows, "IN_PROGRESS")), ["R2"]);
  assert.deepEqual(ids(filterTargetedBatchRowsByStatus(rows, "COMPLETED")), ["R3", "R4"]);
  assert.deepEqual(ids(filterTargetedBatchRowsByStatus(rows, "SOMETHING_ELSE")), ["R1", "R2", "R3", "R4", "R5"]);
  assert.deepEqual(filterTargetedBatchRowsByStatus(null, "COMPLETED"), []);
});

test("TB-R051 1.3.42 the search works inside the selected status", () => {
  const completedOnChurch = searchTargetedBatchRows(filterTargetedBatchRowsByStatus(rows, "COMPLETED"), "church");
  assert.deepEqual(ids(completedOnChurch), ["R4"]);
});

test("TB-R051 1.3.42 tapping a status selects it; tapping it again, or Total, goes back to every meter", () => {
  const { TOTAL, NOT_STARTED, IN_PROGRESS, COMPLETED } = TARGETED_BATCH_STATUS_FILTERS;
  assert.equal(nextTargetedBatchStatusFilter(TOTAL, COMPLETED), COMPLETED);
  assert.equal(nextTargetedBatchStatusFilter(COMPLETED, COMPLETED), TOTAL);
  assert.equal(nextTargetedBatchStatusFilter(COMPLETED, IN_PROGRESS), IN_PROGRESS);
  assert.equal(nextTargetedBatchStatusFilter(IN_PROGRESS, TOTAL), TOTAL);
  assert.equal(nextTargetedBatchStatusFilter(TOTAL, TOTAL), TOTAL);
  assert.equal(nextTargetedBatchStatusFilter(NOT_STARTED, "rubbish"), TOTAL);
});

test("TB-R051 1.3.42 the header: four filters Total, Not Started, In Progress, Completed; no foreign words", () => {
  const buttons = screenSource.slice(screenSource.indexOf("const TARGETED_BATCH_STATUS_FILTER_BUTTONS = ["), screenSource.indexOf("];", screenSource.indexOf("const TARGETED_BATCH_STATUS_FILTER_BUTTONS = [")));
  assert.deepEqual([...buttons.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["Total", "Not Started", "In Progress", "Completed"]);
  assert.deepEqual([...buttons.matchAll(/summaryKey: "([^"]+)"/g)].map((match) => match[1]), ["total", "notStarted", "inProgress", "completed"]);
  const worklist = screenSource.slice(screenSource.indexOf("function TargetedBatchRowsWorklist("), screenSource.indexOf("function TargetedBatchRowCardBase("));
  for (const word of [">Rows<", ">Started<", ">Done<", "Status on the phone"]) assert.equal(worklist.includes(word), false, word);
  assert.match(worklist, /onPress=\{\(\) => onStatusFilterPress\?\.\(button\.key\)\}/);
  assert.match(worklist, /accessibilityState=\{\{ selected \}\}/);
  // The counts are always the whole batch's, from the rows summary.
  assert.match(worklist, /\? summary\?\.total \?\? allRowCount\s*: summary\?\.\[button\.summaryKey\] \?\? 0;/);
  // An empty status says so.
  assert.match(worklist, /`No \$\{statusButton\.label\} meters in this batch`/);
  assert.match(worklist, /`No \$\{statusButton\.label\} meter matches \$\{searchQuery\}`/);
});

test("TB-R051 1.3.42 the list follows the filter; another batch, or an action from the map, starts on Total", () => {
  assert.match(screenSource, /filterTargetedBatchRowsByStatus\(targetedBatchRows, targetedBatchStatusFilter\),\s*targetedBatchSearchText,/);
  // TB-R051 (1.3.68): another batch also opens on the order a batch opens on.
  assert.match(screenSource, /setTargetedBatchSearchText\(""\);\s*setTargetedBatchStatusFilter\(TARGETED_BATCH_STATUS_FILTERS\.TOTAL\);\s*setTargetedBatchRowOrder\(DEFAULT_TARGETED_BATCH_ROW_ORDER\);\s*setTargetedBatchMapOpen\(false\);\s*\}, \[selectedTargetedBatchId\]\);/);
  const mapAction = screenSource.slice(screenSource.indexOf("const handleTargetedBatchMapRowAction"), screenSource.indexOf("const pendingTargetedBatchRowId"));
  assert.match(mapAction, /setTargetedBatchStatusFilter\(TARGETED_BATCH_STATUS_FILTERS\.TOTAL\);/);
  // The batch map always gets every meter.
  assert.match(screenSource, /<TargetedBatchMapModal[\s\S]*?rows=\{targetedBatchRows\}/);
});

test("TB-R051 1.3.42 on a Completed meter nothing starts work, also when it became Completed while preparing", () => {
  const prepare = screenSource.slice(screenSource.indexOf("function prepareTargetedBatchAction("), screenSource.indexOf("const showBmdErfWorklist"));
  assert.match(prepare, /if \(actions\.completed && isTargetedBatchWorkIntent\(intent\)\) \{/);
  assert.doesNotMatch(prepare, /if \(actions\.completed\) return false;/);
  assert.match(screenSource, /currentRowCompleted &&\s*\(isTargetedBatchWorkIntent\(pending\.intent\) \|\| becameCompletedWithoutPremise\)/);
  // A Completed meter is opened without carrying the batch.
  assert.match(screenSource, /const selectedErf = currentRowCompleted\s*\? withoutTargetedBatchContext\(batchSelectedErf\)\s*: batchSelectedErf;/);
});

test("TB-R051 1.3.42 a meter found outside the batch is looked up from the server only: its VISIBLE link first, then its number", () => {
  assert.match(finderSource, /getDocsFromServer\(/);
  assert.doesNotMatch(finderSource, /getDocs\(|getDoc\(/);
  assert.match(finderSource, /cleanMeterNumberInput\(meterNumber\)/);
  // The link that made the meter VISIBLE is followed first (MV-R001).
  const masterAt = finderSource.indexOf('getDocFromServer(doc(db, "meter_master", meterNo))');
  const linkedAt = finderSource.indexOf('getDocFromServer(doc(db, "asts", linkedId))');
  const numberAt = finderSource.indexOf('where("ast.astData.astNo", "==", meterNo)');
  assert.ok(masterAt !== -1 && linkedAt > masterAt && numberAt > linkedAt, "master link, then the linked record, then the number");
  assert.match(finderSource, /master\.data\(\)\?\.refs\?\.asts\?\.id/);
  // Only a failure to reach the server blames the connection.
  assert.match(screenSource, /lookup\.code === "unavailable" \|\| lookup\.code === "deadline-exceeded"/);
  // The premise list is narrowed to the found meter's ERF, never left on the whole Ward.
  assert.match(screenSource, /\(foundPremise \? getPremiseErfId\(foundPremise\) : ""\) \|\|/);
  assert.match(screenSource, /id: foundErfId,\s*\}\s*: null;/);
  const prepare = screenSource.slice(screenSource.indexOf("function prepareTargetedBatchAction("), screenSource.indexOf("const showBmdErfWorklist"));
  assert.match(prepare, /const meterNo = readFirstString\(row\?\.salesDocId, row\?\.meterNo\);/);
  assert.match(prepare, /findMetersByNumber\(meterNo\)/);
  // The effect waits for the look-up, and opens only a meter record in the batch's Ward, with no batch carried.
  const found = screenSource.slice(screenSource.indexOf("if (isTargetedBatchFoundMeterIntent(pending.intent)) {"));
  assert.match(found, /waitFor\("the meter's record"\);/);
  assert.match(found, /chooseFoundMeter\(lookup\.found, \{\s*lmPcode: pending\.lmPcode,\s*wardPcode: pending\.wardPcode,\s*\}\)/);
  assert.match(found, /foundMeterMessage\(choice, lookup\.meterNo\)/);
  assert.match(found, /selectedErf: foundErf \|\| null,/);
  assert.match(found, /router\.push\(openMeter \? "\/\(tabs\)\/asts" : "\/\(tabs\)\/premises"\);/);
});

test("TB-R051 1.3.42 found meter records: described, chosen by the batch's Ward, or explained", () => {
  assert.equal(wardNumberFromPcode("ZA7423013"), "13");
  assert.equal(wardNumberFromPcode("ZA5241006"), "6");
  assert.equal(wardNumberFromPcode(""), "");
  // Meter records carry the Ward code only; the Ward number comes from it.
  const record = describeFoundMeter("DOC1", {
    ast: { astData: { astId: "AST1", astNo: "04297763213" } },
    accessData: { parents: { lmPcode: "ZA5241", wardPcode: "ZA5241006" }, premise: { id: "P1" }, erfId: "E1", erfNo: "4241" },
  });
  assert.deepEqual(record, { id: "AST1", meterNo: "04297763213", lmPcode: "ZA5241", wardPcode: "ZA5241006", wardName: "6", premiseId: "P1", erfId: "E1", erfNo: "4241" });
  assert.equal(describeFoundMeter("DOC2", {}).id, "DOC2");

  const scope = { lmPcode: "ZA5241", wardPcode: "ZA5241006" };
  const elsewhere = { ...record, id: "AST2", wardPcode: "ZA5241002", wardName: "2", erfNo: "57" };
  assert.deepEqual(chooseFoundMeter([record], scope), { outcome: "OPEN", meter: record });
  assert.deepEqual(chooseFoundMeter([elsewhere, record], scope), { outcome: "OPEN", meter: record }, "the one in the batch's Ward");
  assert.deepEqual(chooseFoundMeter([elsewhere], scope), { outcome: "ELSEWHERE", meter: elsewhere });
  assert.deepEqual(chooseFoundMeter([], scope), { outcome: "NONE" });
  assert.deepEqual(chooseFoundMeter(null, scope), { outcome: "NONE" });

  assert.equal(
    foundMeterMessage({ outcome: "ELSEWHERE", meter: elsewhere }, "04297763213"),
    "Meter 04297763213 was found outside this batch, in Ward 2 on ERF 57. Open it from the ASTs tab in that Ward.",
  );
  assert.equal(
    foundMeterMessage({ outcome: "NONE" }, "04297763213"),
    "Meter 04297763213 is Completed: it was found outside this batch, but no meter record with this number is on the system.",
  );
});
