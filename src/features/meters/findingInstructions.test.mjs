// MN-R001 1.2.0: the locked instruction on work that follows a finding, and
// which removals lead on to the installation.
import test from "node:test";
import assert from "node:assert/strict";

import {
  REPLACE_METER_STEP_1,
  findingFormName,
  findingInstruction,
  isReplaceMeterInstruction,
} from "./findingInstructions.js";
import { getLocalSelectLookup } from "./formOptions.js";

test("only an inspection or a discovery is a finding", () => {
  assert.equal(findingFormName("METER_INSPECTION"), "Meter Inspection");
  assert.equal(findingFormName("meter_discovery"), "Meter Discovery");
  assert.equal(findingFormName("METER_REMOVAL"), "");
  assert.equal(findingFormName(null), "");
});

test("a disconnection after a finding is for an illegal connection", () => {
  assert.deepEqual(findingInstruction("METER_DISCONNECTION"), {
    code: "METER_DISCONNECTION",
    text: "Illegal Connection",
    notes: "",
    mediaRequired: false,
  });
});

test("a removal after a finding is step 1 of a replacement", () => {
  assert.equal(findingInstruction("METER_REMOVAL").text, "Replace meter – step 1: remove");
  assert.equal(findingInstruction("METER_READING"), null);
});

test("the server accepts the locked instruction: its code is the work's own type", () => {
  // validateAssignment refuses an instruction whose code is not the trnType.
  for (const type of ["METER_DISCONNECTION", "METER_REMOVAL"]) {
    assert.equal(findingInstruction(type).code, type);
  }
  assert.equal(isReplaceMeterInstruction(findingInstruction("METER_REMOVAL")), true);
  assert.equal(isReplaceMeterInstruction(findingInstruction("METER_DISCONNECTION")), false);
});

test("Replace meter from any channel leads on to the installation; Remove meter does not", () => {
  assert.equal(isReplaceMeterInstruction(REPLACE_METER_STEP_1), true);
  assert.equal(isReplaceMeterInstruction({ code: "METER_REMOVAL", text: "Replace meter – step 1: remove" }), true);
  assert.equal(isReplaceMeterInstruction({ code: "REMOVE_METER", text: "Remove meter" }), false);
  assert.equal(isReplaceMeterInstruction({ code: "OTHER", text: "Replaced by the council" }), false);
  assert.equal(isReplaceMeterInstruction({}), false);
});

test("the removal list offers the two instructions, and the finding's one is on it", () => {
  const options = getLocalSelectLookup("removal_instructions").options;
  assert.deepEqual(options, [
    { code: "REMOVE_METER", label: "Remove meter" },
    { code: REPLACE_METER_STEP_1.code, label: REPLACE_METER_STEP_1.text },
  ]);
});
