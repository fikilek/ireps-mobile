import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  METER_NUMBER_INVALID_MESSAGE,
  METER_NUMBER_PATTERN,
  cleanMeterNumberInput,
  isValidMeterNumber,
} from "./meterNumberRule.js";

test("every space is removed and letters become capitals; leading zeros stay", () => {
  assert.equal(cleanMeterNumberInput(" 0429 769 8195 "), "04297698195");
  assert.equal(cleanMeterNumberInput("ab 12\tcd"), "AB12CD");
  assert.equal(cleanMeterNumberInput(null), "");
});

test("dashes, slashes, dots and other symbols are kept so the form can refuse them", () => {
  for (const bad of ["0429-769", "0429/769", "0429.769", "0429_769", "0429#", "straße1", "ıd1"]) {
    assert.equal(isValidMeterNumber(bad), false);
    assert.match(cleanMeterNumberInput(bad), /[^A-Z0-9]/);
  }
  assert.equal(isValidMeterNumber(" 0429 769 8195 "), true);
  assert.equal(isValidMeterNumber("   "), false);
  assert.match(METER_NUMBER_INVALID_MESSAGE, /letters and digits/);
});

test("the meter number field and every meter form use the rule", async () => {
  const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");
  const input = await read("FormInputMeterNo.js");
  assert.match(input, /cleanMeterNumberInput\(val\)/);
  assert.doesNotMatch(input, /val\.trim\(\)\.toUpperCase\(\)/);

  for (const form of ["FormMeterDiscovery.js", "FormMeterIstallation.js"]) {
    const source = await read(form);
    const checks = source.match(/astNo: string\(\)[\s\S]*?\.matches\(METER_NUMBER_PATTERN, METER_NUMBER_INVALID_MESSAGE\)/g) || [];
    assert.equal(checks.length, 2, `${form} should refuse invalid characters on both meter types`);
    assert.doesNotMatch(source, /astNo: string\(\)\.required\("Meter number is required"\),/);
  }
  assert.equal(METER_NUMBER_PATTERN.test("AB12"), true);

  const discovery = await read("FormMeterDiscovery.js");
  assert.match(discovery, /astNo: cleanMeterNumberInput\(targetedBatchContext\?\.targetedMeterNo\)/);
});
