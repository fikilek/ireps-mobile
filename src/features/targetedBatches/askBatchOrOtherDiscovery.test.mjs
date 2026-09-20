import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";

import * as premiseContext from "../premises/targetedBatchPremiseContext.js";
import * as carry from "./targetedBatchContextCarry.js";
import { resolveTargetedBatchSalesPoint } from "./targetedBatchMapPoints.js";
import { readRowLastWorkedMillis } from "./rowLastWorked.js";

// askBatchOrOtherDiscovery imports React Native and Firebase, so it is evaluated
// from its source text with the pure modules it imports and fakes for the rest.
const askSource = await readFile(new URL("./askBatchOrOtherDiscovery.js", import.meta.url), "utf8");
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

test("the harness binds exactly what askBatchOrOtherDiscovery imports", () => {
  assert.deepEqual(readImports(askSource), {
    "firebase/firestore": ["doc", "getDoc"],
    "react-native": ["Alert", "Platform", "ToastAndroid"],
    "../../firebase": ["db"],
    "../../redux/targetedBatchApi": ["enrichTargetedBatchRowFromSales", "normalizeTargetedBatchRow"],
    "../premises/targetedBatchPremiseContext.js": ["getMissingTargetedBatchContextFields", "serializeTargetedBatchContext"],
    "./targetedBatchContextCarry.js": [
      "BATCH_DISCOVERY_REASONS",
      "erfWithCarriedBatchContext",
      "evaluateBatchDiscoveryOffer",
      "getBatchAllocationTarget",
      "getPremiseBatchErfId",
      "premiseTargetedBatchContext",
    ],
  });
  assert.equal(askSource.match(/^import /gm).length, 6);
  // db comes from src/firebase, the same export targetedBatchApi.js reads.
  assert.match(apiSource, /import \{ db, functions \} from "\.\.\/firebase";/);
});

const TB = "TB1";
// A field worker who can open My Work Orders (TB-R051 actor gate).
const ACTOR = Object.freeze({ uid: "FWR1", spId: "SP1", role: "FWR", profile: {} });
const selectedContext = (extra = {}) => ({
  sourceModule: "SALES_TARGETED_BATCH",
  operationType: "METER_DISCOVERY",
  tbId: TB,
  rowId: "ROW1",
  rowNo: 3,
  salesDocId: "S1",
  erfId: "ERF1",
  premiseId: "P1",
  targetedMeterNo: "04298112659",
  returnTo: "/(tabs)/admin/operations/my-workorders",
  sourceAddress: { addressLine1: "485 VAN RENSBURG", town: "SITHEMBILE" },
  ...extra,
});
const rowDoc = (extra = {}, refs = {}) => ({
  tbId: TB,
  rowNo: 3,
  salesAllMeterId: "S1",
  refs: { erfId: "ERF1", premiseId: "P1", ...refs },
  allocation: { status: "ALLOCATED" },
  execution: { status: "NOT_STARTED" },
  meter: { numberRaw: "04298112659" },
  ...extra,
});
const salesDoc = (visibility = "INVISIBLE") => ({
  master: { visibility },
  tbRefs: [{ id: TB, fieldWork: { noAccess: [] } }],
});
// tb_uploads/TB1 accepted by and allocated to TEAM1; the worker is a member.
const batchDoc = (extra = {}, allocation = {}) => ({
  allocation: { status: "ALLOCATED", targetType: "TEAM", targetId: "TEAM1", targetName: "Team A", ...allocation },
  acceptance: { status: "ACCEPTED" },
  ...extra,
});
const teamDoc = (members = ["FWR1", "FWR2"]) => ({ name: "Team A", scope: { memberUserIds: members } });
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
const FIRST_READS = ["tb_rows/ROW1", "sales-all-meters/S1", "tb_uploads/TB1"];
const ALL_READS = [...FIRST_READS, "teams/TEAM1"];

function createHarness({ docs = openDocs(), failures = {}, pending = [], os = "android" } = {}) {
  const calls = { reads: [], toasts: [], alerts: [], geo: [], pushes: [], missions: [], checking: [], events: [] };
  const body = `${askSource.replace(IMPORT_PATTERN, "").replace(/^export (function|const) /gm, "$1 ")}
return { askBatchOrOtherDiscovery, runLiveBatchRowCheck, STILL_CHECKING_MESSAGE };`;
  const deps = {
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
    db: { fake: "db" },
    ...api,
    ...premiseContext,
    ...carry,
  };
  const exported = new Function(...Object.keys(deps), body)(...Object.values(deps));
  const onCheckingChange = (checking) => {
    calls.checking.push(checking);
    calls.events.push(`checking:${checking}`);
  };
  const run = (args = {}) =>
    exported.askBatchOrOtherDiscovery({
      premise: { id: "P1", erfId: "ERF1" },
      parentErf: { id: "ERF1", erfNo: "485" },
      selectedErfContext: selectedContext(),
      updateGeo: (update) => calls.geo.push(update),
      router: { push: (route) => calls.pushes.push(route) },
      openMissionDiscovery: (mission) => calls.missions.push(mission),
      actor: ACTOR,
      onCheckingChange,
      ...args,
    });
  return { run, calls, exported };
}

const flush = async () => {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve));
};
const buttonTexts = (alert) => alert.buttons.map((button) => button.text);
const press = (alert, text) => alert.buttons.find((button) => button.text === text).onPress();
const OTHER_ONLY = ["Other work (not the batch)", "Cancel"];

function assertRefusal(calls, reason) {
  assert.equal(calls.alerts.length, 1);
  const [alert] = calls.alerts;
  assert.equal(alert.title, "Batch meter");
  assert.ok(alert.message.startsWith(reason), alert.message);
  assert.deepEqual(buttonTexts(alert), OTHER_ONLY);
  assert.equal(alert.buttons[1].style, "cancel");
  assert.equal(calls.pushes.length, 0);
  assert.equal(calls.geo.length, 0);
  return alert;
}

test("a premise with no batch link opens the ordinary flow at once (unchanged)", async () => {
  const { run, calls } = createHarness();
  run({ premise: { id: "P5", erfId: "ERF1" }, selectedErfContext: null });
  await flush();
  assert.deepEqual(calls.reads, []);
  assert.deepEqual(calls.checking, []);
  assert.deepEqual(calls.toasts, []);
  assert.deepEqual(calls.alerts, []);
  assert.equal(calls.missions.length, 1);
  assert.equal(calls.missions[0].premiseId, "P5");
  assert.deepEqual(calls.geo[0].selectedErf, { id: "ERF1", erfNo: "485" });

  // A same-ERF batch selection stays on the ERF for a premise that is not linked.
  const other = createHarness();
  other.run({ premise: { id: "P5", erfId: "ERF1" }, selectedErfContext: selectedContext({ premiseId: null }) });
  await flush();
  assert.deepEqual(other.calls.reads, []);
  assert.equal(other.calls.geo[0].selectedErf.targetedBatchContext.rowId, "ROW1");
  assert.equal(other.calls.missions.length, 1);
});

test("an open live row of the worker's batch: progress for the whole check, then the offer", async () => {
  const { run, calls } = createHarness();
  run();
  assert.deepEqual(calls.checking, [true], "progress starts with the check");
  assert.deepEqual(calls.toasts, [], "no short toast stands in for progress");
  assert.deepEqual(calls.reads, FIRST_READS);
  assert.equal(calls.alerts.length, 0, "no choice before the row is checked");
  await flush();

  assert.deepEqual(calls.reads, ALL_READS, "the TEAM of the allocation is read");
  assert.deepEqual(calls.events, ["checking:true", "checking:false", "alert:Batch meter"]);
  const [alert] = calls.alerts;
  assert.deepEqual(buttonTexts(alert), ["Discover batch meter", ...OTHER_ONLY]);

  press(alert, "Discover batch meter");
  assert.equal(calls.geo.length, 1);
  assert.equal(calls.geo[0].selectedErf.id, "ERF1");
  assert.equal(calls.geo[0].selectedErf.targetedBatchContext.rowId, "ROW1");
  assert.equal(calls.pushes.length, 1);
  assert.equal(calls.pushes[0].pathname, "/(tabs)/premises/form");
  assert.equal(calls.pushes[0].params.premiseId, "P1");
  const params = JSON.parse(calls.pushes[0].params.targetedBatchContext);
  assert.equal(params.rowId, "ROW1");
  assert.equal(params.premiseId, "P1");
  assert.equal(calls.missions.length, 0);
});

test("an SP batch of the worker's service provider is offered without reading a team", async () => {
  const { run, calls } = createHarness({
    docs: openDocs({ "tb_uploads/TB1": batchDoc({}, { targetType: "SP", targetId: "SP1" }) }, ["teams/TEAM1"]),
  });
  run();
  await flush();
  assert.deepEqual(calls.reads, FIRST_READS);
  assert.deepEqual(buttonTexts(calls.alerts[0]), ["Discover batch meter", ...OTHER_ONLY]);
});

test("Other work drops the batch from the selection before the ordinary flow", async () => {
  const { run, calls } = createHarness();
  run();
  await flush();
  press(calls.alerts[0], "Other work (not the batch)");
  assert.equal(calls.geo.length, 1);
  assert.deepEqual(calls.geo[0].selectedErf, { id: "ERF1", erfNo: "485" });
  assert.equal(calls.geo[0].selectedPremise.id, "P1");
  assert.equal(calls.missions.length, 1);
  assert.equal(calls.pushes.length, 0);
});

test("review scenario: VISIBLE Sales meter whose row is IN_PROGRESS, from the premise's own link", async () => {
  mock.method(console, "error", () => {});
  const { run, calls } = createHarness({
    docs: openDocs({
      "tb_rows/ROW1": rowDoc({ execution: { status: "IN_PROGRESS" } }),
      "sales-all-meters/S1": salesDoc("VISIBLE"),
    }),
  });
  const ownLink = { ...selectedContext(), premiseId: undefined, returnTo: undefined };
  run({ premise: { id: "P1", erfId: "ERF1", targetedBatchContext: ownLink }, selectedErfContext: null });
  await flush();

  const alert = assertRefusal(calls, "This batch meter is Completed.");
  assert.match(alert.message, /cannot be discovered from here/);
  press(alert, "Other work (not the batch)");
  assert.equal(Object.hasOwn(calls.geo[0].selectedErf, "targetedBatchContext"), false);
  assert.equal(calls.missions.length, 1);
  assert.equal(calls.pushes.length, 0);
  mock.restoreAll();
});

test("refusals from the live row", async () => {
  const cases = [
    ["row COMPLETED", openDocs({ "tb_rows/ROW1": rowDoc({ execution: { status: "COMPLETED" } }) }), "This batch meter is Completed."],
    ["row removed", openDocs({}, ["tb_rows/ROW1"]), "This batch row is no longer on the batch."],
    ["row of another batch", openDocs({ "tb_rows/ROW1": rowDoc({ tbId: "TB9" }) }), "This batch row is no longer on the batch."],
    ["row unallocated", openDocs({ "tb_rows/ROW1": rowDoc({ allocation: { status: "UNALLOCATED" } }) }), "This batch meter is no longer allocated for field work."],
    ["Sales record missing", openDocs({}, ["sales-all-meters/S1"]), "The meter's Sales record could not be checked."],
    ["row joined to another Sales record", openDocs({ "tb_rows/ROW1": rowDoc({ salesAllMeterId: "S9" }) }), "The meter's Sales record could not be checked."],
    ["row without a Sales id", openDocs({ "tb_rows/ROW1": rowDoc({ salesAllMeterId: "" }) }), "The meter's Sales record could not be checked."],
    ["row moved to another ERF", openDocs({ "tb_rows/ROW1": rowDoc({}, { erfId: "ERF9" }) }), "This batch meter is no longer on this ERF."],
    ["row linked to another premise", openDocs({ "tb_rows/ROW1": rowDoc({}, { premiseId: "P9" }) }), "This premise is not the batch meter's premise."],
  ];
  for (const [name, docs, reason] of cases) {
    const { run, calls } = createHarness({ docs });
    run();
    await flush();
    const alert = assertRefusal(calls, reason);
    assert.match(alert.message, /Batch TB1 row 3 \(meter 04298112659\)\./, name);
    assert.deepEqual(calls.checking, [true, false], name);
  }
});

test("review scenario: a batch the worker cannot open in My Work Orders is refused at the prompt", async () => {
  const REASON = "This batch meter is not in your work orders.";
  const cases = [
    [
      "accepted by and allocated to another TEAM",
      openDocs({ "tb_uploads/TB1": batchDoc({}, { targetId: "TEAM9" }), "teams/TEAM9": teamDoc(["FWR7"]) }),
      [...FIRST_READS, "teams/TEAM9"],
    ],
    ["the worker left the TEAM", openDocs({ "teams/TEAM1": teamDoc(["FWR2"]) }), ALL_READS],
    ["the TEAM no longer exists", openDocs({}, ["teams/TEAM1"]), ALL_READS],
    ["not accepted yet", openDocs({ "tb_uploads/TB1": batchDoc({ acceptance: { status: "WAITING" } }) }), ALL_READS],
    ["rejected", openDocs({ "tb_uploads/TB1": batchDoc({ acceptance: { status: "REJECTED" } }) }), ALL_READS],
    ["unallocated batch", openDocs({ "tb_uploads/TB1": batchDoc({}, { status: "UNALLOCATED" }) }), ALL_READS],
    ["another service provider", openDocs({ "tb_uploads/TB1": batchDoc({}, { targetType: "SP", targetId: "SP9" }) }), FIRST_READS],
    ["the batch no longer exists", openDocs({}, ["tb_uploads/TB1"]), FIRST_READS],
  ];
  for (const [name, docs, reads] of cases) {
    const { run, calls } = createHarness({ docs });
    run();
    await flush();
    const alert = assertRefusal(calls, REASON);
    assert.match(alert.message, /cannot be discovered from here/, name);
    assert.deepEqual(calls.reads, reads, name);
    press(alert, "Other work (not the batch)");
    assert.equal(calls.missions.length, 1, name);
    assert.equal(Object.hasOwn(calls.geo[0].selectedErf, "targetedBatchContext"), false, name);
  }

  // The same batch for a worker without a uid.
  const noActor = createHarness();
  noActor.run({ actor: undefined });
  await flush();
  assertRefusal(noActor.calls, REASON);
});

test("a row with a linked meter says to open it from My Work Orders", async () => {
  const { run, calls } = createHarness({
    docs: openDocs({ "tb_rows/ROW1": rowDoc({}, { meterId: "AST1" }) }),
  });
  run();
  await flush();
  const alert = assertRefusal(calls, "This batch meter already has a meter linked; open it from My Work Orders.");
  assert.doesNotMatch(alert.message, /cannot be discovered from here/);
});

test("a failed Sales read fails closed as not checked", async () => {
  mock.method(console, "error", () => {});
  const { run, calls } = createHarness({ failures: { "sales-all-meters/S1": new Error("permission-denied") } });
  run();
  await flush();
  assertRefusal(calls, "The meter's Sales record could not be checked.");
  mock.restoreAll();
});

test("a failed row, batch or team read says to check the connection", async () => {
  mock.method(console, "error", () => {});
  for (const path of ["tb_rows/ROW1", "tb_uploads/TB1", "teams/TEAM1"]) {
    const { run, calls } = createHarness({ failures: { [path]: new Error("unavailable") } });
    run();
    await flush();
    const alert = assertRefusal(calls, "Could not check the batch meter. Check your connection.");
    assert.match(alert.message, /Try again when connected/, path);
    assert.deepEqual(calls.checking, [true, false], path);
    press(alert, "Other work (not the batch)");
    assert.equal(calls.missions.length, 1, path);
  }
  mock.restoreAll();
});

test("the check gives up after 10 seconds, with progress shown until then", async () => {
  mock.method(console, "error", () => {});
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    for (const pending of [["tb_rows/ROW1"], ["teams/TEAM1"]]) {
      const { run, calls } = createHarness({ pending });
      run();
      await flush();
      mock.timers.tick(9999);
      await flush();
      assert.equal(calls.alerts.length, 0);
      assert.deepEqual(calls.checking, [true], "still checking");
      mock.timers.tick(1);
      await flush();
      assertRefusal(calls, "Could not check the batch meter. Check your connection.");
      assert.deepEqual(calls.events, ["checking:true", "checking:false", "alert:Batch meter"]);
    }
  } finally {
    mock.timers.reset();
    mock.restoreAll();
  }
});

test("a second tap while checking says so, and does not start a second check or Alert", async () => {
  const { run, calls } = createHarness();
  run();
  run({ premise: { id: "P2", erfId: "ERF1", targetedBatchContext: selectedContext({ premiseId: undefined }) }, selectedErfContext: null });
  assert.deepEqual(calls.toasts, [["Still checking the previous premise…", "SHORT"]]);
  assert.deepEqual(calls.checking, [true], "progress is started once, by the admitted check");
  assert.deepEqual(calls.reads, FIRST_READS);
  await flush();
  assert.equal(calls.alerts.length, 1);
  assert.deepEqual(calls.checking, [true, false]);

  // Once answered, a new tap checks again.
  run();
  await flush();
  assert.equal(calls.reads.length, ALL_READS.length * 2);
  assert.equal(calls.alerts.length, 2);
  assert.equal(calls.toasts.length, 1);
});

test("off Android the second tap is answered with an Alert; the check still runs", async () => {
  const { run, calls } = createHarness({ os: "ios" });
  run();
  run();
  assert.deepEqual(calls.toasts, []);
  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.alerts[0].message, "Still checking the previous premise.");
  await flush();
  assert.equal(calls.alerts.length, 2);
  assert.deepEqual(buttonTexts(calls.alerts[1]), ["Discover batch meter", ...OTHER_ONLY]);
});

test("a caller without progress still gets the answer", async () => {
  const { run, calls } = createHarness();
  run({ onCheckingChange: undefined });
  await flush();
  assert.deepEqual(buttonTexts(calls.alerts[0]), ["Discover batch meter", ...OTHER_ONLY]);

  // A failing progress callback is logged and never blocks the answer or the next check.
  mock.method(console, "error", () => {});
  const failing = createHarness();
  failing.run({ onCheckingChange: () => { throw new Error("unmounted"); } });
  await flush();
  assert.equal(failing.calls.alerts.length, 1);
  failing.run({ onCheckingChange: () => { throw new Error("unmounted"); } });
  await flush();
  assert.equal(failing.calls.alerts.length, 2);
  mock.restoreAll();
});

test("premise ERF is checked first and fails closed, without reading the row", async () => {
  for (const [premise, reason] of [
    [{ id: "P1" }, "This premise has no ERF, so it cannot be checked against the batch meter."],
    [{ id: "P1", erfId: "ERF9" }, "This premise is on another ERF than the batch meter."],
  ]) {
    const { run, calls } = createHarness();
    run({ premise });
    await flush();
    assert.deepEqual(calls.reads, []);
    assert.deepEqual(calls.checking, []);
    assertRefusal(calls, reason);
  }
});

test("incomplete batch details are refused without reading (unchanged)", async () => {
  const { run, calls } = createHarness();
  run({ selectedErfContext: selectedContext({ salesDocId: " " }) });
  await flush();
  assert.deepEqual(calls.reads, []);
  assert.deepEqual(calls.checking, []);
  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.alerts[0].title, "Batch details incomplete");
  assert.deepEqual(buttonTexts(calls.alerts[0]), OTHER_ONLY);
});
