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

// NA-R003 (1.3.0): a no access is a transaction OF THE TYPE the worker was sent to do.
test("a no access on a disconnection is a disconnection, not a discovery", () => {
  const context = buildAssetNoAccessContext(asset(), { trnType: "METER_DISCONNECTION" });
  assert.equal(context.trnType, "METER_DISCONNECTION");
});

// A premise address is an object { strNo, strName, strType, suburbName } and a property type
// is { type, name, unitNo }. Putting either on the record unformatted crashed the queue screen
// with "Objects are not valid as a React child" — found on the owner's phone, 3 Oct 2026.
test("the record stores the address as words, never as the object", () => {
  const context = buildAssetNoAccessContext(
    asset({
      accessData: {
        erfId: "ERF_1",
        premise: {
          id: "PRM_1",
          address: { strNo: "26", strName: "Old Acre", strType: "Street", suburbName: "Sibongile" },
          propertyType: { type: "Shop", name: "Spaza", unitNo: "3" },
        },
      },
    }),
  );

  assert.equal(typeof context.premiseAddress, "string");
  assert.equal(typeof context.premisePropertyType, "string");
  assert.equal(context.premiseAddress, "26 Old Acre Street");
  assert.equal(context.premisePropertyType, "Shop Spaza 3");
});

test("a premise with no address yet gives empty words, not an object and not a crash", () => {
  const context = buildAssetNoAccessContext(
    asset({ accessData: { erfId: "ERF_1", premise: { id: "PRM_1" } } }),
  );
  assert.equal(context.premiseAddress, "");
  assert.equal(context.premisePropertyType, "");
});
