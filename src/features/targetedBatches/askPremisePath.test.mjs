import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";

import * as premiseContext from "../premises/targetedBatchPremiseContext.js";
import * as carry from "./targetedBatchContextCarry.js";
import { resolveTargetedBatchSalesPoint } from "./targetedBatchMapPoints.js";
import { readRowLastWorkedMillis } from "./rowLastWorked.js";

// askPremisePath and the live check it reuses (askDiscoveryPath)
// import React Native and Firebase, so both are evaluated from their source text
// with the pure modules they import and fakes for the rest.
const premiseSource = await readFile(new URL("./askPremisePath.js", import.meta.url), "utf8");
const askSource = await readFile(new URL("./askDiscoveryPath.js", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../../redux/targetedBatchApi.js", import.meta.url), "utf8");

const IMPORT_PATTERN = /import\s*\{([^}]*)\}\s*from\s*"([^"]+)";/g;

function readImports(source) {
  const imports = {};
  for (const [, names, from] of source.matchAll(IMPORT_PATTERN)) {
    imports[from] = names.split(",").map((name) => name.trim()).filter(Boolean).sort();
  }
  return imports;
}

function extractApiFunction(name) {
  const start = apiSource.search(new RegExp(`(export )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} not found`);
  let depth = 0;
  for (let index = apiSource.indexOf("{", apiSource.indexOf(")", start)); index < apiSource.length; index += 1) {
    if (apiSource[index] === "{") depth += 1;
    if (apiSource[index] === "}" && --depth === 0) return apiSource.slice(start, index + 1).replace(/^export /, "");
  }
  throw new Error(`${name} is not closed`);
}

// The real row pipeline of the rows stream (TB-R051 salesLoadState included).
const api = new Function(
  "resolveTargetedBatchSalesPoint",
  "readRowLastWorkedMillis",
  `${["normalizeUpper", "cleanText", "readFirstString", "readNumber", "readTbRefBatchId", "readSalesLoadState", "normalizeTargetedBatchRow", "enrichTargetedBatchRowFromSales"].map(extractApiFunction).join("\n")}
return { normalizeTargetedBatchRow, enrichTargetedBatchRowFromSales };`,
)(resolveTargetedBatchSalesPoint, readRowLastWorkedMillis);

const moduleBody = (source, returns) =>
  `${source.replace(IMPORT_PATTERN, "").replace(/^export (function|const) /gm, "$1 ")}
return { ${returns.join(", ")} };`;

test("the harness binds exactly what askPremisePath imports", () => {
  assert.deepEqual(readImports(premiseSource), {
    "react-native": ["Alert"],
    "../premises/targetedBatchPremiseContext.js": [
      "getMissingTargetedBatchContextFields",
      "normalizeTargetedBatchContext",
      "serializeTargetedBatchContext",
    ],
    "./askDiscoveryPath.js": ["runLiveBatchRowCheck"],
    "./targetedBatchContextCarry.js": [
      "BATCH_PREMISE_REASONS",
      "erfWithCarriedBatchContext",
      "evaluateBatchPremiseOffer",
    ],
  });
  assert.equal(premiseSource.match(/^import /gm).length, 4);
  assert.equal(askSource.match(/^import /gm).length, 6);
});

// A field worker who can open My Work Orders (TB-R051 actor gate).
const ACTOR = Object.freeze({ uid: "FWR1", spId: "SP1", role: "FWR", profile: {} });
// The context My Work Orders puts on the ERF for a row with no premise yet.
const batchContext = (extra = {}) => ({
  sourceModule: "SALES_TARGETED_BATCH",
  operationType: "METER_DISCOVERY",
  tbId: "TB1",
  rowId: "ROW1",
  rowNo: 3,
  salesDocId: "S1",
  erfId: "ERF1",
  premiseId: null,
  targetedMeterNo: "04298112659",
  returnTo: "/(tabs)/admin/operations/my-workorders",
  sourceAddress: { addressLine1: "485 VAN RENSBURG", town: "SITHEMBILE" },
  ...extra,
});
const batchErf = (extra = {}) => ({ id: "ERF1", erfNo: "485", targetedBatchContext: batchContext(), ...extra });
const rowDoc = (extra = {}, refs = {}) => ({
  tbId: "TB1",
  rowNo: 3,
  salesAllMeterId: "S1",
  refs: { erfId: "ERF1", ...refs },
  allocation: { status: "ALLOCATED" },
  execution: { status: "NOT_STARTED" },
  meter: { numberRaw: "04298112659" },
  ...extra,
});
const salesDoc = (visibility = "INVISIBLE") => ({
  master: { visibility },
  tbRefs: [{ id: "TB1", fieldWork: { noAccess: [] } }],
});
const batchDoc = (extra = {}, allocation = {}) => ({
  allocation: { status: "ALLOCATED", targetType: "TEAM", targetId: "TEAM1", ...allocation },
  acceptance: { status: "ACCEPTED" },
  ...extra,
});
const teamDoc = (members = ["FWR1"]) => ({ name: "Team A", scope: { memberUserIds: members } });
const openDocs = (overrides = {}, removed = []) => {
  const docs = {
    "tb_rows/ROW1": rowDoc(),
    "sales-all-meters/S1": salesDoc(),
    "tb_uploads/TB1": batchDoc(),
    "teams/TEAM1": teamDoc(),
    ...overrides,
  };
  removed.forEach((path) => delete docs[path]);
  return docs;
};
const ALL_READS = ["tb_rows/ROW1", "sales-all-meters/S1", "tb_uploads/TB1", "teams/TEAM1"];

function createHarness({ docs = openDocs(), failures = {}, pending = [], os = "android" } = {}) {
  const calls = { reads: [], toasts: [], alerts: [], geo: [], forms: [], checking: [], events: [], missions: [], pushes: [] };
  const rn = {
    Alert: {
      alert: (title, message, buttons) => {
        calls.alerts.push({ title, message, buttons });
        calls.events.push(`alert:${title}`);
      },
    },
    Platform: { OS: os },
    ToastAndroid: {
      SHORT: "SHORT",
      LONG: "LONG",
      show: (message, duration) => {
        calls.toasts.push([message, duration]);
        calls.events.push(`toast:${message}`);
      },
    },
  };
  const askDeps = {
    doc: (_db, collection, id) => ({ path: `${collection}/${id}`, id }),
    getDoc: (ref) => {
      calls.reads.push(ref.path);
      if (pending.includes(ref.path)) return new Promise(() => {});
      if (failures[ref.path]) return Promise.reject(failures[ref.path]);
      return Promise.resolve({
        id: ref.id,
        exists: () => Object.hasOwn(docs, ref.path),
        data: () => docs[ref.path],
      });
    },
    ...rn,
    db: { fake: "db" },
    ...api,
    ...premiseContext,
    ...carry,
  };
  const discovery = new Function(...Object.keys(askDeps), moduleBody(askSource, ["askDiscoveryPath", "runLiveBatchRowCheck"]))(
    ...Object.values(askDeps),
  );
  const premiseDeps = { Alert: rn.Alert, ...premiseContext, runLiveBatchRowCheck: discovery.runLiveBatchRowCheck, ...carry };
  const { askPremisePath } = new Function(
    ...Object.keys(premiseDeps),
    moduleBody(premiseSource, ["askPremisePath"]),
  )(...Object.values(premiseDeps));

  const onCheckingChange = (checking) => {
    calls.checking.push(checking);
    calls.events.push(`checking:${checking}`);
  };
  const updateGeo = (update, options) => {
    calls.geo.push({ update, options });
    calls.events.push("geo");
  };
  const run = (args = {}) =>
    askPremisePath({
      erf: batchErf(),
      updateGeo,
      openPremiseForm: (form) => {
        calls.forms.push(form);
        calls.events.push("form");
      },
      actor: ACTOR,
      onCheckingChange,
      ...args,
    });
  const discover = (args = {}) =>
    discovery.askDiscoveryPath({
      premise: { id: "P1", erfId: "ERF1" },
      parentErf: { id: "ERF1", erfNo: "485" },
      selectedErfContext: batchContext({ premiseId: "P1" }),
      updateGeo,
      router: { push: (route) => calls.pushes.push(route) },
      openMissionDiscovery: (mission) => calls.missions.push(mission),
      actor: ACTOR,
      onCheckingChange,
      ...args,
    });
  return { run, discover, calls };
}

const flush = async () => {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve));
};
const buttonTexts = (alert) => alert.buttons.map((button) => button.text);
const press = (alert, text) => alert.buttons.find((button) => button.text === text).onPress();
const NORMAL_PATH_ONLY = ["Normal Path", "Cancel"];

// A check that could not be made offers both paths (owner, 2026-09-24): the ERF carries its row, and the
// server checks the batch again when the premise is submitted.
function assertCheckFailedOffer(calls) {
  assert.equal(calls.alerts.length, 1);
  const [alert] = calls.alerts;
  assert.equal(alert.title, "Batch premise");
  assert.ok(
    alert.message.startsWith("Could not check the batch meter. Check your connection."),
    alert.message,
  );
  assert.match(alert.message, /Add this premise on the Sales Path or the Normal Path\?/);
  assert.deepEqual(buttonTexts(alert), ["Sales Path", ...NORMAL_PATH_ONLY]);
  assert.equal(calls.forms.length, 0, "no form before the worker chooses");
  return alert;
}

function assertRefusal(calls, reason, title = "Batch premise") {
  assert.equal(calls.alerts.length, 1);
  const [alert] = calls.alerts;
  assert.equal(alert.title, title);
  assert.ok(alert.message.startsWith(reason), alert.message);
  assert.deepEqual(buttonTexts(alert), NORMAL_PATH_ONLY);
  assert.equal(alert.buttons[1].style, "cancel");
  assert.equal(calls.forms.length, 0, "no form before the worker chooses");
  assert.equal(calls.geo.length, 0);
  return alert;
}

function assertNormalPathChosen(calls, alert) {
  press(alert, "Normal Path");
  assert.equal(calls.geo.length, 1);
  assert.deepEqual(calls.geo[0].update, { selectedErf: { id: "ERF1", erfNo: "485" } });
  assert.equal(Object.hasOwn(calls.geo[0].update.selectedErf, "targetedBatchContext"), false);
  assert.deepEqual(calls.geo[0].options, { silent: true });
  assert.deepEqual(calls.forms, [{ erfId: "ERF1", targetedBatchContext: null }]);
  assert.deepEqual(calls.events.slice(-2), ["geo", "form"], "the plain ERF is selected before the form opens");
}

test("an ERF without a batch opens the form at once (unchanged)", async () => {
  const { run, calls } = createHarness();
  run({ erf: { id: "ERF1", erfNo: "485" } });
  await flush();
  assert.deepEqual(calls.forms, [{ erfId: "ERF1", targetedBatchContext: null }]);
  assert.deepEqual(calls.reads, []);
  assert.deepEqual(calls.checking, []);
  assert.deepEqual(calls.geo, []);
  assert.deepEqual(calls.alerts, []);
});

test("an ERF whose batch key is empty drops it and opens the ordinary form", async () => {
  for (const targetedBatchContext of [null, undefined]) {
    const { run, calls } = createHarness();
    run({ erf: { id: "ERF1", erfNo: "485", targetedBatchContext } });
    await flush();
    assert.deepEqual(calls.reads, []);
    assert.deepEqual(calls.alerts, []);
    assert.deepEqual(calls.geo[0].update, { selectedErf: { id: "ERF1", erfNo: "485" } });
    assert.deepEqual(calls.forms, [{ erfId: "ERF1", targetedBatchContext: null }]);
  }
});

test("no ERF id: nothing opens", async () => {
  const { run, calls } = createHarness();
  run({ erf: { erfNo: "485", targetedBatchContext: batchContext() } });
  run({ erf: null });
  await flush();
  assert.deepEqual(calls, { reads: [], toasts: [], alerts: [], geo: [], forms: [], checking: [], events: [], missions: [], pushes: [] });
});

test("offered: progress for the whole check, then the form opens as before with the batch", async () => {
  const { run, calls } = createHarness();
  run();
  assert.deepEqual(calls.checking, [true]);
  assert.deepEqual(calls.forms, [], "the form waits for the live check");
  await flush();
  assert.deepEqual(calls.reads, ALL_READS);
  assert.deepEqual(calls.events, ["checking:true", "checking:false", "form"]);
  assert.deepEqual(calls.alerts, []);
  assert.deepEqual(calls.geo, [], "the batch selection is kept");
  assert.equal(calls.forms.length, 1);
  assert.equal(calls.forms[0].erfId, "ERF1");
  assert.equal(calls.forms[0].targetedBatchContext, premiseContext.serializeTargetedBatchContext(batchContext()));
});

test("review scenario: the meter turned Completed (Sales VISIBLE) after the row's tile was tapped", async () => {
  const { run, calls } = createHarness({ docs: openDocs({ "sales-all-meters/S1": salesDoc("VISIBLE") }) });
  run();
  await flush();
  const alert = assertRefusal(calls, "This batch meter is Completed.");
  assert.match(alert.message, /Batch TB1 row 3 \(meter 04298112659\)\. This premise cannot be added on the Sales Path\./);
  assert.deepEqual(calls.events, ["checking:true", "checking:false", "alert:Batch premise"]);
  assertNormalPathChosen(calls, alert);
});

test("review scenario: the batch row already has a premise, so + is not forced into the batch", async () => {
  const { run, calls } = createHarness({ docs: openDocs({ "tb_rows/ROW1": rowDoc({}, { premiseId: "P1" }) }) });
  run({ erf: batchErf({ targetedBatchContext: batchContext({ premiseId: "P1" }) }) });
  await flush();
  const alert = assertRefusal(calls, "This batch meter already has a premise; open it from My Work Orders.");
  assertNormalPathChosen(calls, alert);
});

test("Cancel opens nothing and keeps the batch selection", async () => {
  const { run, calls } = createHarness({ docs: openDocs({ "tb_rows/ROW1": rowDoc({ execution: { status: "COMPLETED" } }) }) });
  run();
  await flush();
  const alert = assertRefusal(calls, "This batch meter is Completed.");
  assert.equal(alert.buttons[1].onPress, undefined);
  assert.deepEqual(calls.geo, []);
  assert.deepEqual(calls.forms, []);
});

test("premise refusals from the live batch and row", async () => {
  const cases = [
    ["another TEAM's batch", openDocs({ "tb_uploads/TB1": batchDoc({}, { targetId: "TEAM9" }), "teams/TEAM9": teamDoc(["FWR7"]) }), "This batch meter is not in your work orders."],
    ["not accepted", openDocs({ "tb_uploads/TB1": batchDoc({ acceptance: { status: "WAITING" } }) }), "This batch meter is not in your work orders."],
    ["another service provider", openDocs({ "tb_uploads/TB1": batchDoc({}, { targetType: "SP", targetId: "SP9" }) }), "This batch meter is not in your work orders."],
    ["row removed", openDocs({}, ["tb_rows/ROW1"]), "This batch row is no longer on the batch."],
    ["row unallocated", openDocs({ "tb_rows/ROW1": rowDoc({ allocation: { status: "UNALLOCATED" } }) }), "This batch meter is no longer allocated for field work."],
    ["Sales record missing", openDocs({}, ["sales-all-meters/S1"]), "The meter's Sales record could not be checked."],
    ["row moved to another ERF", openDocs({ "tb_rows/ROW1": rowDoc({}, { erfId: "ERF9" }) }), "This batch meter is no longer on this ERF."],
  ];
  for (const [name, docs, reason] of cases) {
    const { run, calls } = createHarness({ docs });
    run();
    await flush();
    const alert = assertRefusal(calls, reason);
    assert.deepEqual(calls.checking, [true, false], name);
    assertNormalPathChosen(calls, alert);
  }
});

test("a failed read still offers the Sales Path, and the Normal Path with it", async () => {
  mock.method(console, "error", () => {});
  for (const path of ["tb_rows/ROW1", "tb_uploads/TB1", "teams/TEAM1"]) {
    const { run, calls } = createHarness({ failures: { [path]: new Error("unavailable") } });
    run();
    await flush();
    const alert = assertCheckFailedOffer(calls);
    press(alert, "Sales Path");
    assert.equal(calls.forms.length, 1, path);
    assert.equal(calls.forms[0].targetedBatchContext === null, false, "the batch goes with it");
  }

  // And the Normal Path is still there for a worker who says it is not the batch's premise.
  const { run, calls } = createHarness({ failures: { "tb_rows/ROW1": new Error("unavailable") } });
  run();
  await flush();
  assertNormalPathChosen(calls, calls.alerts[0]);
  mock.restoreAll();
});

test("the check gives up after 10 seconds", async () => {
  mock.method(console, "error", () => {});
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { run, calls } = createHarness({ pending: ["tb_uploads/TB1"] });
    run();
    await flush();
    mock.timers.tick(9999);
    await flush();
    assert.deepEqual(calls.checking, [true]);
    assert.deepEqual(calls.forms, []);
    mock.timers.tick(1);
    await flush();
    assertCheckFailedOffer(calls);
  } finally {
    mock.timers.reset();
    mock.restoreAll();
  }
});

test("the batch of another ERF is refused without reading", async () => {
  const { run, calls } = createHarness();
  run({ erf: batchErf({ targetedBatchContext: batchContext({ erfId: "ERF9" }) }) });
  await flush();
  assert.deepEqual(calls.reads, []);
  assert.deepEqual(calls.checking, []);
  const alert = assertRefusal(calls, "This batch meter is not on this ERF.");
  assertNormalPathChosen(calls, alert);
});

test("incomplete batch details are refused without reading", async () => {
  for (const targetedBatchContext of [batchContext({ salesDocId: " " }), { sourceModule: "BGO", tbId: "B1" }, {}]) {
    const { run, calls } = createHarness();
    run({ erf: batchErf({ targetedBatchContext }) });
    await flush();
    assert.deepEqual(calls.reads, []);
    assert.deepEqual(calls.checking, []);
    const alert = assertRefusal(calls, "This ERF is selected for a batch, but the batch details are incomplete", "Batch details incomplete");
    assertNormalPathChosen(calls, alert);
  }
});

test("one live check at a time across Discover and a new premise; the second tap is answered", async () => {
  const { run, discover, calls } = createHarness({ docs: openDocs({ "tb_rows/ROW1": rowDoc({}, { premiseId: "P1" }) }) });
  discover();
  run();
  assert.deepEqual(calls.toasts, [["Still checking the previous premise…", "SHORT"]]);
  assert.deepEqual(calls.checking, [true]);
  await flush();
  assert.deepEqual(calls.forms, [], "the premise tap during the Discover check opened nothing");
  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.alerts[0].title, "Batch meter");
  assert.deepEqual(calls.reads, ALL_READS);

  // And the other way round.
  const other = createHarness();
  other.run();
  other.discover();
  assert.deepEqual(other.calls.toasts, [["Still checking the previous premise…", "SHORT"]]);
  await flush();
  assert.equal(other.calls.forms.length, 1);
  assert.deepEqual(other.calls.alerts, []);
  assert.deepEqual(other.calls.checking, [true, false]);
});
