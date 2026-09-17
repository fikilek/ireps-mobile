import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  searchTargetedBatchRows,
  sortTargetedBatchRowsOpenFirst,
  targetedBatchRowMatchesSearch,
} from "./targetedBatchRowSearch.js";

const source = await readFile(new URL("./targetedBatchRowSearch.js", import.meta.url), "utf8");

// Shaped like a normalised row from src/redux/targetedBatchApi.js.
const batchRow = ({ id, meterNo, erfNo = "", addressLine1 = null, town = "Dundee", customerName = "Thandi Nkosi", accountNumber = "5500123456", status = "NOT_STARTED", raw = {} }) => ({
  id,
  meterNo,
  erfNo,
  addressLine1,
  address: addressLine1 || town || "NAv",
  town,
  customerName,
  accountNumber,
  executionStatus: status,
  displayStatus: status,
  raw: {
    salesAllMeterId: meterNo,
    meter: { numberRaw: meterNo, numberNormalized: meterNo },
    customer: { customerName, accountNumber },
    location: { addressLine1, town },
    ...raw,
  },
});

const rows = [
  batchRow({ id: "R1", meterNo: "04297704498", erfNo: "3/826", addressLine1: "12 Main Street" }),
  batchRow({ id: "R2", meterNo: "07126146500", erfNo: "RE/799", addressLine1: "4 Karel Landman Road", customerName: "Kaiser Dlamini", accountNumber: "9912345678" }),
  batchRow({ id: "R3", meterNo: "07152702168", erfNo: "1138", addressLine1: null }),
];
const ids = (list) => list.map((row) => row.id);

test("a blank search shows every row in order", () => {
  for (const query of ["", "   ", "\t\n", null, undefined]) {
    assert.deepEqual(ids(searchTargetedBatchRows(rows, query)), ["R1", "R2", "R3"]);
    assert.equal(targetedBatchRowMatchesSearch(rows[0], query), true);
  }
  assert.notEqual(searchTargetedBatchRows(rows, ""), rows);
});

test("meter number matches any part, ignoring spaces and punctuation", () => {
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "04297704498")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "7704")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "4498")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "0429 7704 498")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "071-2614")), ["R2"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "071")), ["R2", "R3"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "99999")), []);
});

test("meter number is also read from the raw meter fields and the Sales ID", () => {
  const onlyRaw = (raw) => ({ id: "X", meterNo: "NAv", raw });
  assert.equal(targetedBatchRowMatchesSearch(onlyRaw({ meter: { numberRaw: "0712 614 6500" } }), "6146"), true);
  assert.equal(targetedBatchRowMatchesSearch(onlyRaw({ meter: { numberNormalized: "07126146500" } }), "6146"), true);
  assert.equal(targetedBatchRowMatchesSearch(onlyRaw({ salesAllMeterId: "07126146500" }), "6146"), true);
  assert.equal(targetedBatchRowMatchesSearch(onlyRaw({}), "6146"), false);
});

test("ERF numbers match, including sectional and remainder numbers", () => {
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "3/826")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "RE/799")), ["R2"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "re/799")), ["R2"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, " Re/799 ")), ["R2"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "826")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "1138")), ["R3"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "RE/")), ["R2"]);
});

test("ERF number is also read from the raw property and location", () => {
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", raw: { property: { erfNo: "RE/799" } } }, "re/7"), true);
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", raw: { location: { erfNo: "RE/799" } } }, "re/7"), true);
});

test("street address matches any part, case-insensitive with spaces collapsed", () => {
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "main street")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "MAIN   Str")), ["R1"]);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "karel landman")), ["R2"]);
  assert.equal(targetedBatchRowMatchesSearch(rows[0], "12 main"), true);
  // TB-R051: a street search is not a meter number search, so R2's meter 07126146500 (which holds 12) is not found.
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "12 main")), ["R1"]);
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", raw: { location: { addressLine1: "9  Argyll   Street" } } }, "argyll street"), true);
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", address: "9 Argyll Street" }, "argyll"), true);
});

// TB-R051: the review's rows. A house number in an address search never matches meter numbers.
const streetRows = [
  batchRow({ id: "a", meterNo: "04251234567", erfNo: "701", addressLine1: "5 Church Street" }),
  batchRow({ id: "b", meterNo: "04259876543", erfNo: "702", addressLine1: "12 Main Road" }),
  batchRow({ id: "c", meterNo: "01115555555", erfNo: "703", addressLine1: "3 Oak Ave" }),
];

test("an address search with a house number finds only that address", () => {
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "5 Church")), ["a"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "5 church street")), ["a"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "12 Main")), ["b"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "3 Oak")), ["c"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "5 Oak")), []);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "Church 5")), []);
});

test("a query of digits, spaces or hyphens is a meter number search on any part", () => {
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "0425 123")), ["a"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "123")), ["a"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "0425-1234")), ["a"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, " 04 25 ")), ["a", "b"]);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "04251234567")), ["a"]);
  // A lone digit is still a meter number search: every meter here holds a 5.
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "5")), ["a", "b", "c"]);
  // Digits also match ERF numbers and street lines as typed.
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "702")), ["b"]);
  assert.deepEqual(ids(searchTargetedBatchRows([batchRow({ id: "d", meterNo: "09990000000", addressLine1: "4567 Long Road" })], "4567")), ["d"]);
  // Hyphens or spaces alone are not a meter number search.
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, "-")), []);
  assert.deepEqual(ids(searchTargetedBatchRows(streetRows, " - - ")), []);
});

test("any other query must occur inside the meter number as typed", () => {
  const lettered = batchRow({ id: "L", meterNo: "SN-0425A77", erfNo: "", addressLine1: "9 Hill Road" });
  assert.equal(targetedBatchRowMatchesSearch(lettered, "0425a"), true);
  assert.equal(targetedBatchRowMatchesSearch(lettered, "sn-0425"), true);
  assert.equal(targetedBatchRowMatchesSearch(lettered, "SN 0425"), false);
  assert.equal(targetedBatchRowMatchesSearch(lettered, "0425 a"), false);
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", meterNo: "NAv", raw: { meter: { numberRaw: "MTR-5521" } } }, "mtr-55"), true);
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", meterNo: "NAv", raw: { meter: { numberRaw: "MTR-5521" } } }, "5521 x"), false);
  // The NAv placeholder is not a meter number.
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", meterNo: "NAv" }, "nav"), false);
});

test("the town fallback and NAv placeholders are not a street address", () => {
  // R3 has no street line; its address falls back to the town.
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "dundee")), []);
  assert.deepEqual(ids(searchTargetedBatchRows(rows, "nav")), []);
  assert.equal(targetedBatchRowMatchesSearch({ id: "X", meterNo: "NAv", erfNo: "NAv", address: "NAv" }, "nav"), false);
});

test("customer name and account number are never searched (TB-R042)", () => {
  for (const query of ["Thandi", "nkosi", "Kaiser", "Kaiser Dlamini", "5500123456", "99123", "9912345678"]) {
    assert.deepEqual(ids(searchTargetedBatchRows(rows, query)), [], query);
  }
  assert.doesNotMatch(source, /customerName|accountNumber|customer\b/);
});

test("a row without searchable fields does not match a non-blank search", () => {
  assert.equal(targetedBatchRowMatchesSearch({}, "12"), false);
  assert.equal(targetedBatchRowMatchesSearch(null, "12"), false);
  assert.equal(targetedBatchRowMatchesSearch(undefined, "main"), false);
  assert.deepEqual(searchTargetedBatchRows(null, "12"), []);
  assert.deepEqual(searchTargetedBatchRows(undefined, ""), []);
});

test("open work is listed first and each part keeps its order", () => {
  const list = [
    { id: "1", displayStatus: "COMPLETED", executionStatus: "IN_PROGRESS" },
    { id: "2", displayStatus: "NOT_STARTED", executionStatus: "NOT_STARTED" },
    { id: "3", executionStatus: "COMPLETED" },
    { id: "4", displayStatus: "IN_PROGRESS", executionStatus: "IN_PROGRESS" },
    { id: "5" },
    { id: "6", displayStatus: "COMPLETED", executionStatus: "COMPLETED" },
    { id: "7", displayStatus: "NOT_STARTED" },
  ];
  const sorted = sortTargetedBatchRowsOpenFirst(list);
  assert.deepEqual(ids(sorted), ["2", "4", "5", "7", "1", "3", "6"]);
  assert.notEqual(sorted, list);
  assert.deepEqual(ids(list), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.equal(sorted[0], list[1]);
});

test("displayStatus decides before executionStatus when sorting", () => {
  const list = [
    { id: "visible", displayStatus: "COMPLETED", executionStatus: "NOT_STARTED" },
    { id: "open", displayStatus: "IN_PROGRESS", executionStatus: "COMPLETED" },
  ];
  assert.deepEqual(ids(sortTargetedBatchRowsOpenFirst(list)), ["open", "visible"]);
  assert.deepEqual(sortTargetedBatchRowsOpenFirst(null), []);
  assert.deepEqual(ids(sortTargetedBatchRowsOpenFirst([{ id: "a" }, { id: "b" }])), ["a", "b"]);
});

