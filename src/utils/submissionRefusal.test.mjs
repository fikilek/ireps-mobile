import test from "node:test";
import assert from "node:assert/strict";
import { thrownSubmissionRefusal } from "./submissionRefusal.js";
import { noAccessResult } from "../features/meters/noAccessSubmitMessages.js";

test("Installation appointment refusals keep the business code and actionable feedback", () => {
  for (const code of ["NO_ACCESS_APPOINTMENT_REQUIRED", "NO_ACCESS_APPOINTMENT_NOT_ALLOWED", "NO_ACCESS_APPOINTMENT_NOT_FUTURE_AT_CAPTURE", "NO_ACCESS_APPOINTMENT_RULE_UNSUPPORTED"]) {
    const refusal = thrownSubmissionRefusal({ code: "functions/failed-precondition", message: "outer", details: { code, message: "Check the saved appointment." } }, "SAVED_ID");
    assert.equal(refusal.code, code);
    assert.equal(refusal.message, "Check the saved appointment.");
    assert.equal(refusal.trnId, "SAVED_ID");
    assert.equal(noAccessResult(refusal.code).code, code);
  }
});
test("refusals without details keep the original server message", () => {
  assert.deepEqual(thrownSubmissionRefusal({ code: "functions/permission-denied", message: "Not assigned" }), { code: "functions/permission-denied", message: "Not assigned", trnId: "NAv" });
});
