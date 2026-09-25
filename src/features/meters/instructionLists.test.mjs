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

test("the Reconnection form reads the shared list, not a copy of its own", async () => {
  // UI-R003 section 2, one list one set of words. The worker's form and the
  // manager's screen ask the same question and write the same field, so they
  // must offer the same words. The field form used to carry its own wording.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../../app/(tabs)/asts/reconnection.jsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.includes('getFormOptions("reconnection_instructions")'),
    "the Reconnection form should read reconnection_instructions",
  );
  assert.ok(
    !source.includes("FIELD_RECONNECTION_INSTRUCTION_OPTIONS"),
    "the Reconnection form should not keep its own list of instructions",
  );
});
