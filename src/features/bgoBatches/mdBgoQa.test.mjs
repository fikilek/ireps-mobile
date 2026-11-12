import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { buildMdBgoMobileRows, buildMdBgoCaptureContext } from "./mdBgoRows.js";
import { calculateMdBgoQaFinal } from "./mdBgoQa.js";
import { summarizeMdBgoCardRows } from "./bgoBatchCardModel.js";
import { followMdBgoCardRows } from "./bgoBatchCardStream.js";
import { getTargetedBatchRowActionState, TARGETED_BATCH_INTENTS } from "../targetedBatches/targetedBatchActions.js";
import { calculateTbQaFinal, filterTargetedBatchRowsByStatus } from "../targetedBatches/targetedBatchRowSearch.js";

const row = (id = "R", state = "COMPLETED") => ({ id, bgoBatchId: "B", batchMode: "BMD", operationType: "METER_DISCOVERY", workflow: { state }, refs: { premiseId: "P", meterId: "AST", trnId: "TRN" }, erf: { id: "E", erfNo: "3485" } });
const data = { premises: [{ id: "P", qa: { status: "QA_PENDING" } }], meters: [{ id: "AST", qaStatus: "QA_PASS" }], trns: [{ id: "TRN", workflow: { state: "QA FAIL" } }] };

test("current premise/TRN badges activate existing correction actions, ignoring AST and row QA copies", () => {
  const [result] = buildMdBgoMobileRows({ rows: [{ ...row(), qa: { meterStatus: "QA_PASS", tbStatus: "QA_PASS" } }], ...data });
  const actions = getTargetedBatchRowActionState(result);
  assert.equal(actions.premise.helperText, "QA PENDING");
  assert.equal(actions.ast.helperText, "QA FAIL");
  assert.equal(actions.ast.intent, TARGETED_BATCH_INTENTS.CORRECT_AST);
  assert.equal(calculateTbQaFinal(result), "QA FAIL");
  assert.equal(result.displayStatus, "COMPLETED");
});

test("component failure is immediately correctable before completion; final and counts remain In Progress", () => {
  const [result] = buildMdBgoMobileRows({ rows: [row("R", "IN_PROGRESS")], ...data, premises: [{ id: "P", qa: { status: "QA_FAIL" } }] });
  const actions = getTargetedBatchRowActionState(result);
  assert.equal(actions.premise.helperText, "QA FAIL");
  assert.equal(actions.premise.intent, TARGETED_BATCH_INTENTS.CORRECT_PREMISE);
  assert.equal(calculateTbQaFinal(result), "QA NAv");
  assert.equal(filterTargetedBatchRowsByStatus([result], "IN_PROGRESS").length, 1);
  assert.equal(filterTargetedBatchRowsByStatus([result], "QA_FAIL").length, 0);
  assert.deepEqual(summarizeMdBgoCardRows(["B"], [result]).B, { total: 1, notStarted: 0, inProgress: 1, completed: 0, qaPass: 0, qaFail: 0 });
});

test("completion gate and all final combinations preserve pending/missing semantics; No Access is excluded", () => {
  for (const state of ["ISSUED", "IN_PROGRESS"]) assert.equal(calculateMdBgoQaFinal({ workflow: { state }, qa: { premiseStatus: "QA_FAIL", meterStatus: "QA_FAIL" } }), "QA NAv");
  for (const [p, m, expected] of [["QA_FAIL", "QA_NAv", "QA FAIL"], ["QA_PASS", "QA_FAIL", "QA FAIL"], ["QA_PASS", "QA_PASS", "QA PASS"], ["QA_PENDING", "QA_PENDING", "QA PENDING"], ["QA_PASS", "QA_PENDING", "QA PENDING"], ["QA_PENDING", "QA_PASS", "QA PENDING"], ["QA_PASS", "QA_NAv", "QA NAv"], ["QA_NAv", "QA_PASS", "QA NAv"]]) {
    assert.equal(calculateMdBgoQaFinal({ workflow: { state: "COMPLETED" }, qa: { premiseStatus: p, meterStatus: m, noAccessStatus: "QA_FAIL", tbStatus: "QA_PASS" } }), expected);
  }
});

test("each flat and each meter reads only its own component IDs", () => {
  const rows = [row("A"), { ...row("B", "IN_PROGRESS"), refs: { premiseId: "P-B" } }, { ...row("C"), refs: { premiseId: "P", meterId: "AST-C", trnId: "TRN-C" } }];
  const result = buildMdBgoMobileRows({ rows, ...data, premises: [...data.premises, { id: "P-B", qa: { status: "QA_PASS" } }], trns: [...data.trns, { id: "TRN-C", workflow: { state: "QA PASS" } }] });
  assert.deepEqual(result.map(r => [r.qa.premiseStatus, r.qa.meterStatus]), [["QA PENDING", "QA FAIL"], ["QA PASS", "QA NAv"], ["QA PENDING", "QA PASS"]]);
});

test("cached or missing source QA cannot present a stale pass or a correction badge", () => {
  for (const options of [{ qaReady: false, ...data }, {}]) {
    const [result] = buildMdBgoMobileRows({ rows: [row()], ...options });
    assert.equal(calculateTbQaFinal(result), "QA NAv");
    assert.equal(getTargetedBatchRowActionState(result).ast.helperText, "QA NAv");
  }
});

test("each row counts once across all six shared status filters", () => {
  const rows = ["ISSUED", "IN_PROGRESS", "COMPLETED", "COMPLETED", "COMPLETED"].map((state, i) => ({ ...row(String(i), state), sourceModule: "BULK_METER_DISCOVERY", displayStatus: state === "ISSUED" ? "NOT_STARTED" : state, qa: { premiseStatus: "QA_PASS", meterStatus: i === 3 ? "QA_PASS" : i === 4 ? "QA_FAIL" : "QA_PENDING" } }));
  const counts = summarizeMdBgoCardRows(["B"], rows).B;
  assert.deepEqual(counts, { total: 5, notStarted: 1, inProgress: 1, completed: 1, qaPass: 1, qaFail: 1 });
  for (const [filter, field] of [["NOT_STARTED", "notStarted"], ["IN_PROGRESS", "inProgress"], ["COMPLETED", "completed"], ["QA_PASS", "qaPass"], ["QA_FAIL", "qaFail"]]) assert.equal(filterTargetedBatchRowsByStatus(rows, filter).length, counts[field]);
});

test("batch card follows component reviews/resubmissions without a BGO row write and releases changed links", () => {
  const sources = [], states = [];
  let nextRows;
  const stop = followMdBgoCardRows({ batchIds: ["B"], listen: (_ids, next) => { nextRows = next; return () => {}; },
    listenDocuments: (collection, ids, next, error) => { const entry = { collection, ids, next, error, stopped: false }; sources.push(entry); return () => { entry.stopped = true; }; }, onChange: state => states.push(state),
  });
  try {
    nextRows([row()], { fromCache: false });
    assert.equal(states.at(-1).stream, "CONNECTING");
    assert.deepEqual(sources.map(s => [s.collection, s.ids]), [["premises", ["P"]], ["trns", ["TRN"]]]);
    sources[0].next([{ id: "P", qa: { status: "QA_PASS" } }], { fromCache: false });
    assert.equal(states.at(-1).stream, "CONNECTING");
    sources[1].next(data.trns, { fromCache: false });
    assert.equal(states.at(-1).countsByBatchId.B.qaFail, 1);
    sources[1].next([{ id: "TRN", workflow: { state: "COMPLETED" } }]);
    assert.equal(states.at(-1).countsByBatchId.B.completed, 1);
    sources[1].next([{ id: "TRN", workflow: { state: "QA PASS" } }]);
    assert.equal(states.at(-1).countsByBatchId.B.qaPass, 1);
    sources[1].next([], { fromCache: false });
    assert.equal(states.at(-1).countsByBatchId.B.qaPass, 0);
    nextRows([{ ...row(), refs: { premiseId: "NEW" } }]);
    assert.ok(sources.slice(0, 2).every(s => s.stopped));
    assert.equal(states.at(-1).stream, "CONNECTING");
    sources.at(-1).error(new Error("permission-denied"));
    assert.equal(states.at(-1).stream, "ERROR"); assert.deepEqual(states.at(-1).countsByBatchId, {});
  } finally { stop(); }
  assert.ok(sources.every(s => s.stopped));
});

test("actual shared mobile row card renders QA and invokes the failed component correction action", async () => {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { transformSync } = require("@babel/core");
  const source = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("function TargetedBatchRowCardBase("), source.indexOf("// TB-R051: every live Sales or row update"));
  const js = transformSync(code, { babelrc: false, configFile: false, plugins: [require.resolve("@babel/plugin-transform-react-jsx")] }).code;
  const Card = new Function("React", "View", "Text", "MaterialCommunityIcons", "TargetedBatchActionTile", "normalizeUpper", "calculateTbQaFinal", "cleanId", "readFirstString", "getTargetedBatchRowActionState", "styles", js + ";return TargetedBatchRowCardBase;")(
    React, "View", "Text", "Icon", "ActionTile", v => String(v || "").toUpperCase(), calculateTbQaFinal, v => v || "", (...values) => values.find(Boolean) || "", getTargetedBatchRowActionState, new Proxy({}, { get: (_target, key) => key }),
  );
  const nodes = tree => tree == null ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [tree];
  for (const state of ["COMPLETED", "IN_PROGRESS"]) {
    const [result] = buildMdBgoMobileRows({ rows: [row("R", state)], ...data });
    let action;
    const tree = Card({ row: result, bucket: { id: "B" }, onAction: value => { action = value; } });
    const all = nodes(tree);
    assert.ok(all.includes(state === "COMPLETED" ? "QA FAIL" : "IN PROGRESS"));
    const ast = all.find(node => node?.type === "ActionTile" && node.props.label === "AST");
    assert.equal(ast.props.helperText, "QA FAIL");
    ast.props.onPress(); assert.equal(action.intent, TARGETED_BATCH_INTENTS.CORRECT_AST);
    assert.equal(action.row.id, "R");
  }
});

test("actual memo comparator sees QA changes, and premise correction retains its workorder return", async () => {
  const source = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("const TARGETED_BATCH_ROW_CARD_FIELDS ="), source.indexOf("const TargetedBatchRowCard = memo("));
  const equal = new Function(code + ";return targetedBatchRowCardPropsEqual;")();
  const onAction = () => {};
  const [first] = buildMdBgoMobileRows({ rows: [row()], ...data });
  const [second] = buildMdBgoMobileRows({ rows: [row()], ...data, trns: [{ id: "TRN", workflow: { state: "QA PASS" } }] });
  assert.equal(equal({ row: first, onAction }, { row: second, onAction }), false);
  assert.match(source, /premiseId: premise.id, mdBgoContext: JSON.stringify\(context\)/);
  const form = await readFile(new URL("../premises/formPremise.js", import.meta.url), "utf8");
  assert.match(form, /const returnToMdBgoWorkorders = Boolean\(isEdit && params.mdBgoContext\)/);
  assert.match(form, /const successRoute = premiseFormReturnRoute\(params.returnTo/);
});

test("actual BGO handler routes the linked failed TRN/premise and never starts a new capture", async () => {
  const source = await readFile(new URL("../../../app/(tabs)/admin/operations/my-workorders.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("  function handleMdBgoRowAction("), source.indexOf("  // TB-R051: returns true only when the action is now pending"));
  for (const intent of [TARGETED_BATCH_INTENTS.CORRECT_AST, TARGETED_BATCH_INTENTS.CORRECT_PREMISE]) {
    const assets = { ...data, stream: "LIVE", erfs: [], premises: [{ id: "P", qa: { status: "QA_FAIL" } }] };
    const [liveRow] = buildMdBgoMobileRows({ rows: [row()], ...assets });
    const bucket = { id: "B", permissions: { canViewErfs: true } };
    const routes = [], alerts = [];
    const deps = { bgoBucketsRef: { current: [bucket] }, fieldWorkorderActor: true, actionBusy: false, mdBgoRows: [liveRow], mdBgoRowsData: { stream: "LIVE" }, mdBgoAssets: assets,
      buildMdBgoCaptureContext, buildBmdSelectedErf: ({ erf }) => erf, getTargetedBatchRowActionState, TARGETED_BATCH_INTENTS,
      isTargetedBatchWorkIntent: value => ["START_METER_DISCOVERY", "RECORD_NO_ACCESS"].includes(value), getBmdBucketScope: () => ({}), updateGeo: () => {}, setMdBgoMapOpen: () => {},
      router: { push: route => routes.push(route) }, Alert: { alert: (...values) => alerts.push(values) },
    };
    const handle = new Function(...Object.keys(deps), code + ";return handleMdBgoRowAction;")(...Object.values(deps));
    handle({ bucket, row: liveRow, intent });
    assert.deepEqual(alerts, []);
    assert.equal(routes.length, 1);
    if (intent === TARGETED_BATCH_INTENTS.CORRECT_AST) assert.deepEqual(routes[0], { pathname: "/(tabs)/trns/correct", params: { trnId: "TRN" } });
    else {
      assert.equal(routes[0].pathname, "/premises/formPremise"); assert.equal(routes[0].params.premiseId, "P");
      assert.equal(JSON.parse(routes[0].params.mdBgoContext).rowId, "R");
    }
  }
});
