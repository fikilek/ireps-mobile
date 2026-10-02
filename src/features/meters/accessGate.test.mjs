// No Access rules NA-R003 / NA-R044 (1.3.0) — the gate, and what it hands the No Access screen.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_GATE,
  assetCanRecordNoAccess,
  buildAssetNoAccessContext,
} from "./accessGate.js";

const asset = (patch = {}) => ({
  id: "AST_1",
  ast: { astData: { astNo: "04297750491" } },
  accessData: {
    erfId: "K241N0GT030900000654000000",
    erfNo: "5214",
    premise: { id: "PRM_1" },
    parents: { wardPcode: "KZN241W6" },
  },
  ...patch,
});

test("NA-R001: the gate asks about the hand, not the eye", () => {
  assert.match(ACCESS_GATE.message, /touch the meter with your hand/i);
});

test("the gate offers exactly two answers, and No Access is one of them", () => {
  assert.match(ACCESS_GATE.no, /no access/i);
  assert.match(ACCESS_GATE.yes, /reached/i);
});

test("NA-R044: the context carries the premise and the ERF the work was issued against", () => {
  const context = buildAssetNoAccessContext(asset());
  assert.equal(context.premiseId, "PRM_1");
  assert.equal(context.erfId, "K241N0GT030900000654000000");
  assert.equal(context.erfNo, "5214");
  assert.equal(context.meterNo, "04297750491");
  assert.equal(context.wardPcode, "KZN241W6");
});

test("NA-R044: a meter with no premise cannot record a no access", () => {
  assert.equal(assetCanRecordNoAccess(asset()), true);
  assert.equal(
    assetCanRecordNoAccess(asset({ accessData: { erfId: "ERF_1", premise: null } })),
    false,
  );
});

test("a meter with no ERF cannot either", () => {
  assert.equal(
    assetCanRecordNoAccess(asset({ accessData: { erfId: "", premise: { id: "PRM_1" } } })),
    false,
  );
});

test("the context never invents an ERF number - it reads NAv", () => {
  const context = buildAssetNoAccessContext(
    asset({ accessData: { erfId: "ERF_1", premise: { id: "PRM_1" } } }),
  );
  assert.equal(context.erfNo, "NAv");
});
