import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  TARGETED_BATCH_DERIVED_STATES,
  TARGETED_BATCH_ROW_STATUSES,
  deriveTargetedBatchState,
} from "./targetedBatchLifecycle.js";

const fixture = JSON.parse(
  fs.readFileSync(
    new URL("./targetedBatchLifecycle.conformance.json", import.meta.url),
    "utf8",
  ),
);

function diagnosticCodes(result) {
  return result.diagnostics.map((item) => item.code);
}

test("Mobile Targeted Batch lifecycle constants conform to the shared contract", () => {
  assert.deepEqual(
    Object.values(TARGETED_BATCH_ROW_STATUSES),
    fixture.contract.canonicalRowStatuses,
  );
  assert.equal(
    TARGETED_BATCH_DERIVED_STATES.inconsistent,
    fixture.contract.derivedOnlyStatus,
  );
});

for (const fixtureCase of fixture.cases) {
  test(`Mobile conformance: ${fixtureCase.name}`, () => {
    const result = deriveTargetedBatchState(fixtureCase.input);

    assert.equal(result.status, fixtureCase.expected.status);
    assert.equal(
      result.completeRowSet,
      fixtureCase.expected.completeRowSet,
    );
    assert.deepEqual(
      diagnosticCodes(result),
      fixtureCase.expected.diagnosticCodes,
    );
  });
}
