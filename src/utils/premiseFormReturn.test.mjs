import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { premiseFormReturnRoute, returnAfterPremiseForm, PREMISE_TAB, PREMISE_WORKORDERS, PREMISE_QUEUE } from "./premiseFormReturn.js";

test("actual origin overrides inherited batch context and queue fallbacks", () => {
  for (const origin of [PREMISE_TAB, PREMISE_WORKORDERS, PREMISE_QUEUE, "/(tabs)/maps"]) {
    assert.equal(premiseFormReturnRoute(origin, { fromWorkorder: true, fromQueue: true }), origin);
    assert.equal(premiseFormReturnRoute([origin]), origin);
  }
  assert.equal(premiseFormReturnRoute(null, { fromWorkorder: true }), PREMISE_WORKORDERS);
  assert.equal(premiseFormReturnRoute(null, { fromQueue: true }), PREMISE_QUEUE);
  for (const invalid of ["/signin", "https://example.org", "", null]) assert.equal(premiseFormReturnRoute(invalid), PREMISE_TAB);
});

test("return to existing Premises screen preserves it; cross-tab return clears only the form's tab", () => {
  const moves = [];
  const router = { dismissTo: value => moves.push(["dismissTo", value]), navigate: value => moves.push(["navigate", value]), replace: value => moves.push(["replace", value]), dismissAll: () => { throw Error("Root dismissal forbidden"); } };
  returnAfterPremiseForm(router, PREMISE_TAB);
  assert.deepEqual(moves, [["dismissTo", PREMISE_TAB]]);
  for (const origin of [PREMISE_WORKORDERS, PREMISE_QUEUE, "/(tabs)/maps"]) {
    moves.length = 0;
    returnAfterPremiseForm(router, origin);
    assert.deepEqual(moves, [["dismissTo", PREMISE_TAB], ["navigate", origin]]);
  }
});

test("all nine premise-form entry points explicitly carry their own origin", async () => {
  for (const [file, origin, count] of [["premises/index.js", PREMISE_TAB, 4], ["maps/index.js", "/(tabs)/maps", 1], ["admin/storage/premise-offline-storage.js", PREMISE_QUEUE, 1], ["admin/operations/my-workorders.js", PREMISE_WORKORDERS, 3]]) {
    const source = await readFile(new URL(`../../app/(tabs)/${file}`, import.meta.url), "utf8");
    const entries = [...source.matchAll(/pathname: "\/(?:\(tabs\)\/)?premises\/formPremise",\s*params: \{ returnTo: "([^"]+)"/g)];
    assert.equal(entries.length, count, file);
    assert.ok(entries.every(entry => entry[1] === origin), file);
  }
  const form = await readFile(new URL("../features/premises/formPremise.js", import.meta.url), "utf8");
  assert.match(form, /const leaveForm = \(\) => \{\s*returnAfterPremiseForm\(router, premiseFormReturnRoute\(params.returnTo/);
  assert.match(form, /returnAfterPremiseForm\(router, successRoute\)/);
  assert.doesNotMatch(form, /dismissAll\(|signOut\(|router\.back\(/);
});
