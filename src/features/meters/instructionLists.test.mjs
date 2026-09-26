// UI-R003 1.4.0: the office instruction lists live in the app, not on the
// server. A manager with no network could not issue an instruction at all
// while these were fetched.
//
// This test locks the codes. The words a manager sees may be improved, but a
// code is what lands on the record, so changing one would silently split the
// history of an instruction in two.
import assert from "node:assert/strict";
import test from "node:test";

import { getFormOptions } from "./formOptions.js";

// Read from irepsSelectLookups on DEV, 25 September 2026, before the lists
// were brought into the app.
const ON_THE_SERVER = {
  inspection_instructions: [
    ["Check illegal connection", "CHECK_ILLEGAL_CONNECTION"],
    ["General inspection", "GENERAL_INSPECTION"],
  ],
  disconnection_instructions: [
    ["Credit Control Instruction", "CREDIT_CONTROL_INSTRUCTION"],
    ["Illegal Connection", "ILLEGAL_CONNECTION"],
    ["Non Payment", "NON_PAYMENT"],
  ],
  reconnection_instructions: [["Reconnect meter", "RECONNECT_METER"]],
};

for (const [listName, expected] of Object.entries(ON_THE_SERVER)) {
  test(`${listName} keeps the codes and words the server had`, () => {
    const options = getFormOptions(listName);
    assert.deepEqual(
      options.map((option) => [option.label, option.value]),
      expected,
    );
  });
}

test("every instruction list has something to choose", () => {
  for (const listName of [
    "inspection_instructions",
    "disconnection_instructions",
    "reconnection_instructions",
    "removal_instructions",
    "meter_reading_instructions",
  ]) {
    assert.ok(
      getFormOptions(listName).length > 0,
      `${listName} is empty, so a manager cannot issue that instruction`,
    );
  }
});

test("Check illegal connection comes before General inspection", () => {
  // Both carried the same sort order on the server, so the order a manager
  // saw was undefined. The one issued against a finding goes first.
  const [first] = getFormOptions("inspection_instructions");
  assert.equal(first.value, "CHECK_ILLEGAL_CONNECTION");
});

test("a retired instruction is not offered", () => {
  // Meter remove decommission is retired. Records that carry it still read
  // back correctly because an instruction stores its own words, so no list
  // has to remember it.
  const codes = getFormOptions("removal_instructions").map((o) => o.value);
  assert.ok(!codes.includes("METER_REMOVE_DECOMMISION"));
});

// UI-R003 section 2, one list one set of words. The owner, 25 September 2026:
// they must drink from the same well. A form that keeps its own copy of a
// list looks right the day it is written and drifts the first time the words
// change on one side only - which is exactly what happened to the
// reconnection instruction.
const FORMS_AND_THEIR_LISTS = [
  ["reconnection.jsx", "reconnection_instructions"],
  ["disconnection.jsx", "disconnection_instructions"],
];

for (const [form, listName] of FORMS_AND_THEIR_LISTS) {
  test(`the ${form} form drinks from the same well`, async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL(`../../../app/(tabs)/asts/${form}`, import.meta.url),
      "utf8",
    );
    assert.ok(
      source.includes(`getFormOptions("${listName}")`),
      `${form} should read ${listName} from formOptions`,
    );
    assert.ok(
      !/const FIELD_[A-Z_]*INSTRUCTION_OPTIONS/.test(source),
      `${form} should not keep its own list of instructions`,
    );
  });
}

// UI-R003 1.7.0: two lists that used to live inside their own screen. They
// were never duplicated, so nothing had drifted - but the codes still land on
// records, so moving them had to change nothing at all.
const MOVED_INTO_THE_WELL = {
  disconnection_levels: [
    ["Level 1 - Flip circuit breaker only", "LEVEL_1_CB_ONLY"],
    ["Level 2 - Remove wire on circuit breaker", "LEVEL_2_CB_WIRE_REMOVED"],
    ["Level 3 - Remove whole supply cable", "LEVEL_3_SUPPLY_CABLE_REMOVED"],
  ],
  lower_reading_reasons: [
    ["Previous reading incorrect", "PREVIOUS_READING_INCORRECT"],
    ["Wrong meter read previously", "WRONG_METER_READ_PREVIOUSLY"],
    ["Display faulty", "DISPLAY_FAULTY"],
    ["Possible tamper/reverse run", "POSSIBLE_TAMPER_REVERSE_RUN"],
  ],
};

for (const [listName, expected] of Object.entries(MOVED_INTO_THE_WELL)) {
  test(`${listName} kept every code and word when it moved`, () => {
    assert.deepEqual(
      getFormOptions(listName).map((option) => [option.label, option.value]),
      expected,
    );
  });
}

test("no form keeps its own list of options", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const form of ["disconnection.jsx", "reconnection.jsx", "meter-reading.js"]) {
    const source = await readFile(
      new URL(`../../../app/(tabs)/asts/${form}`, import.meta.url),
      "utf8",
    );
    const ownList = source.match(
      /const [A-Z][A-Z0-9_]*(?:OPTIONS|REASONS)\s*=\s*\[[\s\S]{0,80}?(?:code|value|label):/,
    );
    assert.equal(
      ownList,
      null,
      `${form} keeps its own list: ${ownList?.[0]?.split("\n")[0]}`,
    );
  }
});
