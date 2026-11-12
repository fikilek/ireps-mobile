import test from "node:test";
import assert from "node:assert/strict";
import { calculateTbQaFinal, targetedBatchRowStatus, sortTargetedBatchRowsByLastWorked } from "./targetedBatchRowSearch.js";
import { calculateMdBgoQaFinal } from "../bgoBatches/mdBgoQa.js";
import { buildMdBgoMobileRows } from "../bgoBatches/mdBgoRows.js";
import { summarizeTargetedCardRows, followTargetedCardRows } from "./targetedBatchCardStream.js";
const states = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
const components = ["QA_PASS", "QA_FAIL", "QA_PENDING", "QA_NAv"];
test("final QA uses current components in every execution state, ignoring stale final and No Access", () => {
  for (const execution of states) for (const p of components) for (const m of components) {
    const expected = p === "QA_FAIL" || m === "QA_FAIL" ? "QA_FAIL" : p === "QA_PASS" && m === "QA_PASS" ? "QA_PASS" : [p,m].every(v => ["QA_PASS","QA_PENDING"].includes(v)) ? "QA_PENDING" : "QA_NAv";
    const row = { id: "R", tbId: "B", executionStatus: execution, execution: { status: execution }, qa: { premiseStatus: p, meterStatus: m, tbStatus: "QA_PASS", finalStatus: "QA_FAIL", noAccessStatus: "QA_FAIL" } };
    assert.equal(calculateTbQaFinal(row), expected === "QA_NAv" ? "QA NAv" : expected.replaceAll("_"," "));
    assert.equal(calculateMdBgoQaFinal(row), calculateTbQaFinal(row));
    const counts = summarizeTargetedCardRows(["B"], [row]).B;
    assert.equal(counts.total, counts.notStarted + counts.inProgress + counts.completed + counts.qaPass + counts.qaFail);
    assert.equal(counts.qaPass, expected === "QA_PASS" ? 1 : 0);
    assert.equal(counts.qaFail, expected === "QA_FAIL" ? 1 : 0);
  }
});

test("linked premise and meter correction activity move only their affected BGO row first", () => {
  const rows = [{ id: "A", refs: { premiseId: "P1", trnId: "T1" }, metadata: { updatedAt: 1000 } }, { id: "B", refs: { premiseId: "P2", trnId: "T2" }, metadata: { updatedAt: 2000 } }];
  for (const linked of [{ premises: [{ id: "P1", metadata: { updatedAt: { seconds: 3 } } }] }, { trns: [{ id: "T1", metadata: { updatedAt: "1970-01-01T00:00:04Z" } }] }]) {
    assert.equal(sortTargetedBatchRowsByLastWorked(buildMdBgoMobileRows({ rows, ...linked }))[0].id, "A");
  }
});
test("TB card counts stream later QA changes and unsubscribe", () => {
  let next, stopped = false; const values = [];
  const stop = followTargetedCardRows({ batchIds: ["B"], listen: (_ids, n) => { next = n; return () => { stopped = true; }; }, onChange: value => values.push(value) });
  next([{ id: "R", tbId: "B", execution: { status: "IN_PROGRESS" }, qa: { premiseStatus: "QA_FAIL" } }], { fromCache: false });
  assert.equal(values.at(-1).countsByBatchId.B.qaFail, 1);
  next([{ id: "R", tbId: "B", execution: { status: "IN_PROGRESS" }, qa: { premiseStatus: "QA_PASS", meterStatus: "QA_PASS" } }], { fromCache: false });
  assert.equal(values.at(-1).countsByBatchId.B.qaPass, 1);
  stop(); assert.equal(stopped, true);
});
