// NA-R005, one shape. These tests are the reason the ten builders can be collapsed into one:
// they pin the shape, and they pin the three things the ten disagreed about.
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrnId,
  isNoAccessTrnId,
  meterTypeCode,
  NO_ACCESS_TRN_SUFFIX,
  TRN_PREFIX_BY_TYPE,
} from "./trnId.js";

const AT = new Date(1791379564098);

test("a transaction id is the work, the milliseconds, the meter type, the ward and the ERF", () => {
  assert.equal(
    buildTrnId({
      trnType: "METER_DISCONNECTION",
      meterType: "electricity",
      wardPcode: "ZA5241006",
      erfNo: "5213",
      at: AT,
    }),
    "TRN_MDCN_1791379564098_ELC_ZA5241006_5213",
  );
});

test("a no access id is the same id with _NA on the end, and nothing else differs", () => {
  const args = {
    trnType: "METER_DISCONNECTION",
    meterType: "electricity",
    wardPcode: "ZA5241006",
    erfNo: "5213",
    at: AT,
  };

  const done = buildTrnId(args);
  const noAccess = buildTrnId({ ...args, noAccess: true });

  assert.equal(noAccess, done + NO_ACCESS_TRN_SUFFIX);
  assert.ok(isNoAccessTrnId(noAccess));
  assert.ok(!isNoAccessTrnId(done));
});

test("every kind of work builds the same shape", () => {
  for (const [trnType, prefix] of Object.entries(TRN_PREFIX_BY_TYPE)) {
    assert.equal(
      buildTrnId({ trnType, meterType: "water", wardPcode: "W1", erfNo: "2", at: AT }),
      `${prefix}_1791379564098_WTR_W1_2`,
      `${trnType} must build the one shape`,
    );
  }
});

// The three things the ten inline builders disagreed about, each pinned.

test("an unknown meter type is NAv, never ELC and never NA", () => {
  assert.equal(meterTypeCode("electricity"), "ELC");
  assert.equal(meterTypeCode("water"), "WTR");

  for (const unknown of ["", null, undefined, "NAv", "prepaid", "unknown"]) {
    assert.equal(
      meterTypeCode(unknown),
      "NAv",
      // Inspection used to answer ELC for anything that was not water, which put a wrong
      // fact in an id that can never be corrected.
      `${JSON.stringify(unknown)} is not electricity and must not be recorded as it`,
    );
  }
});

test("a missing ward or ERF is NAv, not WARD and not ERF", () => {
  assert.equal(
    buildTrnId({ trnType: "METER_READING", meterType: "water", at: AT }),
    "TRN_MREAD_1791379564098_WTR_NAv_NAv",
  );
});

test("punctuation is removed, never turned into a separator", () => {
  // `_` separates the parts of an id. A ward written "ZA 5241" must not become an extra part
  // and shift everything after it.
  assert.equal(
    buildTrnId({
      trnType: "METER_INSPECTION",
      meterType: "water",
      wardPcode: "ZA 5241/006",
      erfNo: "52-13",
      at: AT,
    }),
    "TRN_MINSP_1791379564098_WTR_ZA5241006_5213",
  );
});

test("a kind of work with no prefix is refused rather than guessed", () => {
  assert.throws(
    () => buildTrnId({ trnType: "METER_VENDING", at: AT }),
    /No transaction prefix/,
  );
});
