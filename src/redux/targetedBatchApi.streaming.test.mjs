import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveTargetedBatchSalesPoint } from "../features/targetedBatches/targetedBatchMapPoints.js";

const source = await readFile(new URL("./targetedBatchApi.js", import.meta.url), "utf8");

test("Targeted Batch rows use a live rows stream and no callable read", () => {
  const endpoint = source.slice(source.indexOf("getTargetedBatchRows: builder.query"), source.indexOf("acceptRejectTargetedBatch: builder.mutation"));
  assert.match(endpoint, /onSnapshot\(/);
  assert.match(endpoint, /collection\(db, "tb_rows"\)/);
  assert.doesNotMatch(endpoint, /getTargetedBatchRowsCallable/);
  assert.doesNotMatch(endpoint, /firestoreLimit/);
});

test("row stream dynamically joins and cleans Sales listeners", () => {
  assert.match(source, /doc\(db, "sales-all-meters", id\)/);
  assert.doesNotMatch(source, /demo_sales_meters/);
  assert.match(source, /salesListeners\.has\(id\)/);
  assert.match(source, /salesListeners\.delete\(id\)/);
  assert.match(source, /for \(const unsubscribe of salesListeners\.values\(\)\) unsubscribe\(\)/);
  assert.match(source, /active = false/);
});

test("Sales fieldwork drives NA count and locked meter rule", () => {
  assert.match(source, /fieldWork\.noAccess\?\.length \|\| 0/);
  assert.match(source, /fieldWorkMeterId = cleanText\(fieldWork\.meterId\) \|\| null/);
});

// The module initialises Firebase on import, so the pure reader is evaluated from its source text.
function extractBlock(start, name) {
  let depth = 0;
  for (let index = source.indexOf("{", source.indexOf(")", start)); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is not closed`);
}

function extractFunction(name) {
  const start = source.search(new RegExp(`(export )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} not found`);
  return extractBlock(start, name).replace(/^export /, "");
}

// Pure imports of the module are bound into the evaluated source under the names it imports them by.
const pureImports = { resolveTargetedBatchSalesPoint };
function evaluateFunctions(names, returned) {
  const body = `${names.map(extractFunction).join("\n")}\nreturn ${returned};`;
  return new Function(...Object.keys(pureImports), body)(...Object.values(pureImports));
}

test("pure imports bound in the harness are the ones the module imports", () => {
  assert.match(source, /import \{ resolveTargetedBatchSalesPoint \} from "\.\.\/features\/targetedBatches\/targetedBatchMapPoints";/);
});

const enrichNames = ["normalizeUpper", "cleanText", "readFirstString", "readTbRefBatchId", "readSalesLoadState", "enrichTargetedBatchRowFromSales"];
const enrich = evaluateFunctions(enrichNames, "enrichTargetedBatchRowFromSales");
const helpers = ["normalizeUpper", "cleanText", "readFirstString", "readNumber", "toMillis", "getAgeSeconds", "readSalesLoadState"];
const buildRows = evaluateFunctions([...helpers, "normalizeTargetedBatchRow", "buildTargetedBatchRowsData"], "buildTargetedBatchRowsData");
const normalizeRow = evaluateFunctions([...helpers, "normalizeTargetedBatchRow"], "normalizeTargetedBatchRow");
const normalizeBucket = evaluateFunctions(
  [...helpers, "getTargetedBatchTarget", "getTargetText", "getAcceptanceStatus", "getCreatedAt", "getUpdatedAt", "getTargetedBatchCounts", "normalizeTargetedBatchBucket"],
  "normalizeTargetedBatchBucket",
);
const TB = "TGB_20260912_100000_ABCD";
const row = { tbId: TB, salesAllMeterId: "04297704498" };
const visit = { date: "2026-09-12", time: "10:00:00", user: "FWR" };

test("tbRefs reader links exactly one entry, including the legacy tbId key", () => {
  assert.doesNotMatch(source, /tbRefs\.find\(/);
  const byId = enrich(row, { tbRefs: [{ id: TB, fieldWork: { status: "IN_PROGRESS", meterId: "AST_1", noAccess: [visit, visit] } }] });
  assert.equal(byId.noAccessSourceStatus, "OK");
  assert.equal(byId.noAccessCount, 2);
  assert.equal(byId.fieldWorkMeterId, "AST_1");
  const legacy = enrich(row, { tbRefs: [{ tbId: TB.toLowerCase(), fieldWork: { noAccess: [visit] } }] });
  assert.equal(legacy.noAccessSourceStatus, "OK");
  assert.equal(legacy.noAccessCount, 1);
  const otherBatch = enrich(row, { tbRefs: [{ id: "TGB_20260101_000000_ZZZZ", fieldWork: { noAccess: [visit] } }, { id: TB }] });
  assert.equal(otherBatch.noAccessSourceStatus, "OK");
  assert.equal(otherBatch.noAccessCount, 0);
});

test("tbRefs reader never picks a winner among duplicate links", () => {
  for (const tbRefs of [
    [{ id: TB, fieldWork: { meterId: "AST_1", noAccess: [visit] } }, { id: TB, fieldWork: { noAccess: [visit, visit] } }],
    [{ id: TB, fieldWork: { noAccess: [visit] } }, { tbId: TB }],
  ]) {
    const result = enrich(row, { tbRefs });
    assert.equal(result.noAccessSourceStatus, "TB_REFERENCE_AMBIGUOUS");
    assert.equal(result.noAccessCount, 0);
    assert.equal(result.fieldWorkMeterId, null);
  }
});

test("tbRefs reader reports missing and malformed linkage explicitly", () => {
  assert.equal(enrich(row, { tbRefs: [] }).noAccessSourceStatus, "TB_REFERENCE_MISSING");
  assert.equal(enrich(row, {}).noAccessSourceStatus, "TB_REFERENCE_MISSING");
  assert.equal(enrich(row, { tbRefs: { id: TB } }).noAccessSourceStatus, "TB_REFERENCES_INVALID");
  assert.equal(enrich({ ...row, tbId: "" }, { tbRefs: [{ id: "" }, {}] }).noAccessSourceStatus, "TB_REFERENCE_MISSING");
  assert.equal(enrich(row, { tbRefs: [null, "TGB", { id: TB, fieldWork: [] }] }).noAccessSourceStatus, "FIELDWORK_INVALID");
  assert.equal(enrich(row, null).noAccessSourceStatus, "SALES_DOCUMENT_MISSING");
  assert.equal(enrich({ tbId: TB }, { tbRefs: [] }).noAccessSourceStatus, "SALES_DOCUMENT_ID_MISSING");
});

const linkedSales = (extra = {}) => ({ tbRefs: [{ id: TB, fieldWork: { noAccess: [] } }], ...extra });

test("TB-R051 enrichment reads Sales visibility and the Sales map point", () => {
  const visible = enrich(row, linkedSales({ master: { visibility: "visible" }, erfCandidates: [{ ErfId: "E1", Latitude: -28.5, Longitude: 30.5 }] }));
  assert.equal(visible.salesVisibility, "VISIBLE");
  assert.deepEqual(visible.salesPoint, { latitude: -28.5, longitude: 30.5, source: "GPS" });
  assert.equal(visible.noAccessSourceStatus, "OK");

  const invisible = enrich(row, linkedSales({ master: { visibility: "INVISIBLE" } }));
  assert.equal(invisible.salesVisibility, "INVISIBLE");
  assert.equal(invisible.salesPoint, null);

  const erfId = "ZA5241003_ERF_1";
  const erfResolution = {
    version: 1,
    revision: 1,
    method: "GEOCODED",
    evidenceRefs: [`ireps_erfs/${erfId}`],
    geocode: { latitude: -28.16, longitude: 30.23, matchLevel: "EXACT_STREET_NUMBER", geocodedAddress: "12 Main Street, Dundee", provider: "Google Geocoding API", geocodedAt: { seconds: 1789200000, nanoseconds: 0 } },
    confirmedByUid: "UID_OFFICE_1",
    confirmedByUser: "Office User",
    confirmedAt: { seconds: 1789200060, nanoseconds: 0 },
    tbId: TB,
  };
  const geocoded = enrich(row, linkedSales({ erfId, erfResolution }));
  assert.deepEqual(geocoded.salesPoint, { latitude: -28.16, longitude: 30.23, source: "GEOCODED" });
  assert.equal(geocoded.salesVisibility, null);
  // A saved decision ireps-web counts as invalid (here: no confirmation) gives no G point.
  const { confirmedAt, ...unconfirmed } = erfResolution;
  assert.ok(confirmedAt);
  assert.equal(enrich(row, linkedSales({ erfId, erfResolution: unconfirmed })).salesPoint, null);

  for (const master of [undefined, null, {}, { visibility: "" }, { visibility: 1 }, { visibility: { value: "VISIBLE" } }]) {
    assert.equal(enrich(row, linkedSales({ master })).salesVisibility, null);
  }
  const missing = enrich(row, null);
  assert.equal(missing.salesVisibility, null);
  assert.equal(missing.salesPoint, null);
  const noSalesId = enrich({ tbId: TB }, linkedSales({ master: { visibility: "VISIBLE" }, erfCandidates: [{ Latitude: -28.5, Longitude: 30.5 }] }));
  assert.equal(noSalesId.salesVisibility, null);
  assert.equal(noSalesId.salesPoint, null);
});

const tbRow = (id, rowNo, extra = {}) => ({
  id,
  tbId: TB,
  rowNo,
  refs: { erfId: "E1" },
  meter: { numberRaw: `0000${rowNo}` },
  location: { addressLine1: "12 Main Street", town: "Dundee", erfNo: "3/826" },
  execution: { status: "NOT_STARTED" },
  ...extra,
});

test("TB-R051 rows show Completed when Sales is VISIBLE or the row is COMPLETED", () => {
  const { rows, summary } = buildRows({
    tbId: TB,
    rows: [
      tbRow("R1", 1),
      tbRow("R2", 2, { execution: { status: "IN_PROGRESS" } }),
      tbRow("R3", 3, { execution: { status: "IN_PROGRESS" }, salesVisibility: "VISIBLE" }),
      tbRow("R4", 4, { execution: { status: "COMPLETED" }, salesVisibility: "INVISIBLE" }),
      tbRow("R5", 5, { salesVisibility: "visible" }),
      tbRow("R6", 6, { salesVisibility: null }),
    ],
  });
  assert.deepEqual(rows.map((item) => [item.id, item.executionStatus, item.salesVisibility, item.displayStatus]), [
    ["R1", "NOT_STARTED", null, "NOT_STARTED"],
    ["R2", "IN_PROGRESS", null, "IN_PROGRESS"],
    ["R3", "IN_PROGRESS", "VISIBLE", "COMPLETED"],
    ["R4", "COMPLETED", "INVISIBLE", "COMPLETED"],
    ["R5", "NOT_STARTED", "VISIBLE", "COMPLETED"],
    ["R6", "NOT_STARTED", null, "NOT_STARTED"],
  ]);
  // TB-R051: the header counts use the same status.
  assert.deepEqual(summary, { total: 6, notStarted: 2, inProgress: 1, completed: 3 });
});

test("TB-R051 rows carry the Sales point, the street line and the location ERF number", () => {
  const point = { latitude: -28.5, longitude: 30.5, source: "GPS" };
  const { rows } = buildRows({
    tbId: TB,
    rows: [
      tbRow("R1", 1, { salesPoint: point }),
      tbRow("R2", 2, { location: { town: "Dundee", addressLine1: "  " }, property: { erfNo: "RE/799" } }),
      tbRow("R3", 3, { location: {}, erfNo: "1138" }),
    ],
  });
  assert.deepEqual(rows[0].salesPoint, point);
  assert.equal(rows[0].addressLine1, "12 Main Street");
  assert.equal(rows[0].address, "12 Main Street");
  assert.equal(rows[0].erfNo, "3/826");
  assert.equal(rows[1].salesPoint, null);
  assert.equal(rows[1].addressLine1, null);
  assert.equal(rows[1].address, "Dundee");
  assert.equal(rows[1].erfNo, "RE/799");
  assert.equal(rows[2].addressLine1, null);
  assert.equal(rows[2].erfNo, "1138");
  assert.equal(buildRows({ tbId: TB, rows: [tbRow("R4", 4, { location: {} })] }).rows[0].erfNo, "");
});

test("enriched rows flow through normalisation with their Sales fields", () => {
  const enriched = enrich({ ...tbRow("R1", 1), salesAllMeterId: "04297704498" }, linkedSales({ master: { visibility: "VISIBLE" }, erfCandidates: [{ Latitude: -28.5, Longitude: 30.5 }] }));
  const [normalized] = buildRows({ tbId: TB, rows: [enriched] }).rows;
  assert.equal(normalized.displayStatus, "COMPLETED");
  assert.equal(normalized.salesVisibility, "VISIBLE");
  assert.deepEqual(normalized.salesPoint, { latitude: -28.5, longitude: 30.5, source: "GPS" });
  assert.equal(normalized.salesDocId, "04297704498");
});

test("TB-R051 enrichment reports whether the Sales record was read", () => {
  // Default: a Sales record given is LOADED, none is MISSING.
  assert.equal(enrich(row, linkedSales()).salesLoadState, "LOADED");
  assert.equal(enrich(row, null).salesLoadState, "MISSING");
  assert.equal(enrich(row).salesLoadState, "MISSING");
  assert.equal(enrich(row, linkedSales(), undefined).salesLoadState, "LOADED");
  assert.equal(enrich(row, linkedSales(), null).salesLoadState, "LOADED");
  assert.equal(enrich(row, null, "").salesLoadState, "MISSING");

  // The stream's state is kept as given.
  assert.equal(enrich(row, null, "LOADING").salesLoadState, "LOADING");
  assert.equal(enrich(row, null, "ERROR").salesLoadState, "ERROR");
  assert.equal(enrich(row, null, "MISSING").salesLoadState, "MISSING");
  assert.equal(enrich(row, linkedSales(), "LOADED").salesLoadState, "LOADED");
  assert.equal(enrich(row, linkedSales(), "loaded").salesLoadState, "LOADED");
  // Last Sales data read before the listener failed: still ERROR, and its status still shows.
  const failed = enrich(row, linkedSales({ master: { visibility: "VISIBLE" } }), "ERROR");
  assert.equal(failed.salesLoadState, "ERROR");
  assert.equal(failed.salesVisibility, "VISIBLE");

  // Fail closed: LOADED needs the record, a row with no Sales ID has nothing to load, unknown values are ERROR.
  assert.equal(enrich(row, null, "LOADED").salesLoadState, "MISSING");
  assert.equal(enrich({ tbId: TB }, linkedSales(), "LOADED").salesLoadState, "MISSING");
  assert.equal(enrich({ tbId: TB }, null, "LOADING").salesLoadState, "MISSING");
  assert.equal(enrich({ tbId: TB, salesAllMeterId: "   " }, null, "ERROR").salesLoadState, "MISSING");
  for (const value of ["READY", "OK", true, 1, { state: "LOADED" }]) {
    assert.equal(enrich(row, linkedSales(), value).salesLoadState, "ERROR", String(value));
  }
});

test("TB-R051 normalised rows carry the Sales load state; normalizeTargetedBatchRow is exported", () => {
  assert.match(source, /export function normalizeTargetedBatchRow\(/);
  for (const state of ["LOADING", "LOADED", "MISSING", "ERROR"]) {
    assert.equal(normalizeRow({ ...tbRow("R1", 1), salesAllMeterId: "S1", salesLoadState: state }).salesLoadState, state);
  }
  assert.equal(normalizeRow({ ...tbRow("R1", 1), salesLoadState: "error" }).salesLoadState, "ERROR");
  assert.equal(normalizeRow({ ...tbRow("R1", 1), salesLoadState: "SOMETHING" }).salesLoadState, "ERROR");
  // A row never joined to Sales has not loaded its record, unless it has no Sales ID at all.
  assert.equal(normalizeRow({ ...tbRow("R1", 1), salesAllMeterId: "S1" }).salesLoadState, "LOADING");
  assert.equal(normalizeRow({ ...tbRow("R1", 1), salesDocId: "S1" }).salesLoadState, "LOADING");
  assert.equal(normalizeRow(tbRow("R1", 1)).salesLoadState, "MISSING");
  assert.equal(normalizeRow().salesLoadState, "MISSING");

  const loading = enrich({ ...tbRow("R2", 2), salesAllMeterId: "S2" }, null, "LOADING");
  const [normalized] = buildRows({ tbId: TB, rows: [loading] }).rows;
  assert.equal(normalized.salesLoadState, "LOADING");
  assert.equal(normalized.displayStatus, "NOT_STARTED");
});

// TB-R051: the rows stream itself, run from its source text against a fake Firestore and a fake clock.
function evaluateRowsStream(bindings) {
  const endpointStart = source.indexOf("getTargetedBatchRows: builder.query");
  const start = source.indexOf("async onCacheEntryAdded(", endpointStart);
  assert.ok(endpointStart !== -1 && start !== -1, "rows stream not found");
  const method = extractBlock(start, "getTargetedBatchRows onCacheEntryAdded").replace(/^async onCacheEntryAdded\(/, "async function onCacheEntryAdded(");
  const names = [...new Set([...enrichNames, ...helpers, "normalizeTargetedBatchRow", "buildTargetedBatchRowsData"])];
  const body = `${names.map(extractFunction).join("\n")}\nreturn ${method};`;
  const bound = { ...pureImports, ...bindings };
  return new Function(...Object.keys(bound), body)(...Object.values(bound));
}

const salesSnapshot = (document, { fromCache = false } = {}) => ({
  exists: () => document != null,
  data: () => document,
  metadata: { fromCache, hasPendingWrites: false },
});

// Like Firestore's snapshotEqual for documents: existence and data count, snapshot metadata does not.
const fakeSnapshotEqual = (left, right) =>
  left.exists() === right.exists() && JSON.stringify(left.data() ?? null) === JSON.stringify(right.data() ?? null);

async function startRowsStream(tbId = TB) {
  const listeners = [];
  const firestore = {
    db: { name: "fake-db" },
    collection: (_db, path) => ({ path }),
    where: (field, op, value) => ({ field, op, value }),
    query: (reference, ...constraints) => ({ path: reference.path, constraints }),
    doc: (_db, path, id) => ({ path: `${path}/${id}` }),
    snapshotEqual: fakeSnapshotEqual,
    onSnapshot: (reference, ...rest) => {
      const options = rest[0] && typeof rest[0] === "object" ? rest.shift() : {};
      const listener = { path: reference.path, constraints: reference.constraints, options, next: rest[0], error: rest[1], active: true };
      listeners.push(listener);
      return () => {
        listener.active = false;
      };
    },
  };
  // The stream's setTimeout and clearTimeout run on this clock; tests move it with flush() and advance(ms).
  const clock = { now: 0, nextId: 1, timers: new Map() };
  const timers = {
    setTimeout: (callback, delay = 0) => {
      const id = clock.nextId++;
      clock.timers.set(id, { callback, due: clock.now + Math.max(Number(delay) || 0, 0) });
      return id;
    },
    clearTimeout: (id) => {
      clock.timers.delete(id);
    },
  };
  const advance = (ms = 0) => {
    const until = clock.now + ms;
    for (;;) {
      const due = [...clock.timers].filter(([, timer]) => timer.due <= until).sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
      if (!due.length) break;
      const [id, timer] = due[0];
      clock.timers.delete(id);
      clock.now = timer.due;
      timer.callback();
    }
    clock.now = until;
  };
  // Outside a burst, each fired event is followed by the timers that are due now (the scheduled publish).
  let inBurst = false;
  const settle = () => {
    if (!inBurst) advance(0);
  };
  let data;
  let publishCount = 0;
  let removeEntry;
  const cacheEntryRemoved = new Promise((resolve) => {
    removeEntry = resolve;
  });
  const running = evaluateRowsStream({ ...firestore, ...timers })(
    { tbId },
    { updateCachedData: (recipe) => { publishCount += 1; data = recipe(data); }, cacheDataLoaded: Promise.resolve(), cacheEntryRemoved },
  );
  await new Promise((resolve) => setImmediate(resolve));
  const live = (path) => listeners.filter((listener) => listener.path === path && listener.active);
  const salesListener = (id) => {
    const [listener] = live(`sales-all-meters/${id}`);
    assert.ok(listener, `no live Sales listener for ${id}`);
    return listener;
  };
  return {
    listeners,
    live,
    get data() {
      return data;
    },
    get publishCount() {
      return publishCount;
    },
    get pendingTimers() {
      return clock.timers.size;
    },
    flush: () => advance(0),
    advance,
    // Fires several events as Firestore does for one connectivity change, with no timer running in between.
    burst: (fire) => {
      inBurst = true;
      try {
        fire();
      } finally {
        inBurst = false;
      }
    },
    state: (rowId) => data.rows.find((item) => item.id === rowId)?.salesLoadState,
    row: (rowId) => data.rows.find((item) => item.id === rowId),
    rows: (docs) => {
      live("tb_rows")[0].next({ docs: docs.map(({ id, ...fields }) => ({ id, data: () => fields })) });
      settle();
    },
    sales: (id, document, options) => {
      salesListener(id).next(salesSnapshot(document, options));
      settle();
    },
    salesError: (id) => {
      salesListener(id).error(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
      settle();
    },
    remove: async () => {
      removeEntry();
      await running;
    },
  };
}

test("TB-R051 rows stream: the Firestore functions bound in the harness are the ones the module imports", () => {
  const imported = source.match(/import \{([^}]+)\} from "firebase\/firestore";/);
  assert.ok(imported, "no firebase/firestore import");
  const names = imported[1].split(",").map((name) => name.trim()).filter(Boolean);
  for (const name of ["collection", "doc", "onSnapshot", "query", "snapshotEqual", "where"]) assert.ok(names.includes(name), name);
  // TB-R051: listener callbacks only schedule a publish; publish() itself is called in one place.
  const endpoint = source.slice(source.indexOf("getTargetedBatchRows: builder.query"), source.indexOf("acceptRejectTargetedBatch: builder.mutation"));
  assert.equal(endpoint.match(/\bpublish\(\)/g).length, 1);
});

const streamRow = (id, rowNo, salesAllMeterId, extra = {}) => ({ ...tbRow(id, rowNo), salesAllMeterId, ...extra });

test("TB-R051 rows stream: rows are LOADING until their Sales snapshot arrives", async () => {
  const stream = await startRowsStream();
  const [rowsListener] = stream.live("tb_rows");
  assert.deepEqual(rowsListener.constraints, [{ field: "tbId", op: "==", value: TB }]);

  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2"), streamRow("R3", 3, "")]);
  assert.deepEqual(stream.data.rows.map((item) => [item.id, item.salesLoadState, item.displayStatus]), [
    ["R1", "LOADING", "NOT_STARTED"],
    ["R2", "LOADING", "NOT_STARTED"],
    ["R3", "MISSING", "NOT_STARTED"],
  ]);
  assert.deepEqual(stream.live("sales-all-meters/S1").map((listener) => listener.options), [{ includeMetadataChanges: true }]);
  assert.equal(stream.live("sales-all-meters/").length, 0);

  stream.sales("S1", linkedSales({ master: { visibility: "VISIBLE" } }));
  assert.equal(stream.state("R1"), "LOADED");
  assert.equal(stream.row("R1").displayStatus, "COMPLETED");
  assert.equal(stream.state("R2"), "LOADING");

  stream.sales("S2", null);
  assert.equal(stream.state("R2"), "MISSING");
  assert.equal(stream.row("R2").noAccessSourceStatus, "SALES_DOCUMENT_MISSING");
  await stream.remove();
});

test("TB-R051 rows stream: a cache-only 'does not exist' stays LOADING until the server answers", async () => {
  const stream = await startRowsStream();
  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2")]);

  stream.sales("S1", null, { fromCache: true });
  assert.equal(stream.state("R1"), "LOADING");
  stream.sales("S1", linkedSales({ master: { visibility: "INVISIBLE" } }));
  assert.equal(stream.state("R1"), "LOADED");

  stream.sales("S2", null, { fromCache: true });
  assert.equal(stream.state("R2"), "LOADING");
  stream.sales("S2", null, { fromCache: false });
  assert.equal(stream.state("R2"), "MISSING");

  // A cached Sales record that exists is read.
  stream.sales("S2", linkedSales({ master: { visibility: "VISIBLE" } }), { fromCache: true });
  assert.equal(stream.state("R2"), "LOADED");
  assert.equal(stream.row("R2").displayStatus, "COMPLETED");
  await stream.remove();
});

test("TB-R051 rows stream: a failed Sales listener marks its rows ERROR", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const stream = await startRowsStream();
  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2"), streamRow("R3", 3, "S1")]);
  assert.equal(stream.live("sales-all-meters/S1").length, 1, "one listener per Sales ID");

  stream.salesError("S1");
  assert.equal(stream.state("R1"), "ERROR");
  assert.equal(stream.state("R3"), "ERROR");
  assert.equal(stream.state("R2"), "LOADING");
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(logged.mock.calls[0].arguments[0], "[TARGETED_BATCH_SALES_STREAM_ERROR]");

  // After data was read, an error keeps the last status but the row is no longer LOADED.
  stream.sales("S2", linkedSales({ master: { visibility: "VISIBLE" } }));
  assert.equal(stream.state("R2"), "LOADED");
  stream.salesError("S2");
  assert.equal(stream.state("R2"), "ERROR");
  assert.equal(stream.row("R2").displayStatus, "COMPLETED");

  // A new rows snapshot subscribes again, but does not bring an errored row back to LOADING or LOADED.
  stream.rows([streamRow("R1", 1, "S1", { execution: { status: "IN_PROGRESS" } }), streamRow("R2", 2, "S2")]);
  assert.equal(stream.state("R1"), "ERROR");
  assert.equal(stream.state("R2"), "ERROR");
  assert.equal(stream.listeners.filter((listener) => listener.path === "sales-all-meters/S1").length, 2);
  assert.equal(stream.live("sales-all-meters/S1").length, 1);
  await stream.remove();
});

test("TB-R051 rows stream: a failed Sales listener is ended and the next rows snapshot subscribes again", async (t) => {
  t.mock.method(console, "error", () => {});
  const stream = await startRowsStream();
  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2")]);
  stream.sales("S1", linkedSales({ master: { visibility: "INVISIBLE" } }));
  const [failed] = stream.live("sales-all-meters/S1");

  stream.salesError("S1");
  assert.equal(failed.active, false, "the failed listener is unsubscribed");
  assert.equal(stream.live("sales-all-meters/S1").length, 0);
  assert.equal(stream.state("R1"), "ERROR");

  // A late event from the failed listener changes nothing.
  const count = stream.publishCount;
  failed.next(salesSnapshot(linkedSales({ master: { visibility: "VISIBLE" } })));
  stream.flush();
  assert.equal(stream.publishCount, count);
  assert.equal(stream.row("R1").displayStatus, "NOT_STARTED");

  stream.rows([streamRow("R1", 1, "S1", { execution: { status: "IN_PROGRESS" } }), streamRow("R2", 2, "S2")]);
  const [second] = stream.live("sales-all-meters/S1");
  assert.notEqual(second, failed);
  assert.deepEqual(second.options, { includeMetadataChanges: true });
  assert.equal(stream.state("R1"), "ERROR", "ERROR until the new listener answers");
  // The same record as before the failure still clears ERROR.
  stream.sales("S1", linkedSales({ master: { visibility: "INVISIBLE" } }));
  assert.equal(stream.state("R1"), "LOADED");
  assert.equal(stream.row("R1").displayStatus, "IN_PROGRESS");

  // A failed Sales ID whose row leaves the batch is forgotten: if it returns it starts LOADING.
  stream.salesError("S1");
  stream.rows([streamRow("R1", 1, ""), streamRow("R2", 2, "S2")]);
  assert.equal(stream.state("R1"), "MISSING");
  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2")]);
  assert.equal(stream.live("sales-all-meters/S1").length, 1);
  assert.equal(stream.state("R1"), "LOADING");
  await stream.remove();
});

test("TB-R051 rows stream: failed Sales listeners are retried after 15 seconds while the entry is alive", async (t) => {
  t.mock.method(console, "error", () => {});
  const stream = await startRowsStream();
  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2")]);
  stream.salesError("S1");
  stream.salesError("S2");
  assert.equal(stream.pendingTimers, 1, "one retry for every failed Sales ID");

  stream.advance(14999);
  assert.equal(stream.live("sales-all-meters/S1").length, 0);
  stream.advance(1);
  assert.equal(stream.live("sales-all-meters/S1").length, 1);
  assert.equal(stream.live("sales-all-meters/S2").length, 1);
  assert.equal(stream.state("R1"), "ERROR");
  stream.sales("S1", linkedSales());
  assert.equal(stream.state("R1"), "LOADED");

  // Failing again schedules another retry; a row already ERROR publishes nothing new.
  const count = stream.publishCount;
  stream.salesError("S2");
  assert.equal(stream.publishCount, count);
  assert.equal(stream.state("R2"), "ERROR");
  stream.advance(15000);
  assert.equal(stream.live("sales-all-meters/S2").length, 1);

  // Removing the entry cancels a pending retry.
  stream.salesError("S2");
  assert.equal(stream.pendingTimers, 1);
  await stream.remove();
  assert.equal(stream.pendingTimers, 0);
  stream.advance(60000);
  assert.equal(stream.live("sales-all-meters/S2").length, 0);
});

test("TB-R051 rows stream: the events of one burst publish once", async () => {
  const stream = await startRowsStream();
  const start = stream.publishCount;
  stream.burst(() => {
    stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2"), streamRow("R3", 3, "S3")]);
    stream.sales("S1", linkedSales({ master: { visibility: "VISIBLE" } }));
    stream.sales("S2", null);
    stream.sales("S3", linkedSales());
  });
  assert.equal(stream.publishCount, start, "nothing is published inside the burst");
  stream.flush();
  assert.equal(stream.publishCount, start + 1);
  assert.deepEqual(stream.data.rows.map((item) => [item.id, item.salesLoadState, item.displayStatus]), [
    ["R1", "LOADED", "COMPLETED"],
    ["R2", "MISSING", "NOT_STARTED"],
    ["R3", "LOADED", "NOT_STARTED"],
  ]);
  stream.flush();
  assert.equal(stream.publishCount, start + 1);
  await stream.remove();
});

test("TB-R051 rows stream: a Sales event that changes neither the record nor its load state publishes nothing", async () => {
  const stream = await startRowsStream();
  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2")]);
  stream.sales("S1", linkedSales({ master: { visibility: "INVISIBLE" } }));
  stream.sales("S2", linkedSales());
  const count = stream.publishCount;

  // Going offline and back online: the same records, only the snapshot metadata changes.
  stream.burst(() => {
    stream.sales("S1", linkedSales({ master: { visibility: "INVISIBLE" } }), { fromCache: true });
    stream.sales("S2", linkedSales(), { fromCache: true });
  });
  stream.flush();
  stream.sales("S1", linkedSales({ master: { visibility: "INVISIBLE" } }));
  stream.sales("S2", linkedSales());
  assert.equal(stream.publishCount, count);
  assert.equal(stream.pendingTimers, 0);

  // A data change publishes.
  stream.sales("S1", linkedSales({ master: { visibility: "VISIBLE" } }));
  assert.equal(stream.publishCount, count + 1);
  assert.equal(stream.row("R1").displayStatus, "COMPLETED");

  // A change of existence publishes, and so does a load state change on its own.
  stream.sales("S2", null, { fromCache: true });
  assert.equal(stream.publishCount, count + 2);
  assert.equal(stream.state("R2"), "LOADING");
  stream.sales("S2", null, { fromCache: true });
  assert.equal(stream.publishCount, count + 2);
  stream.sales("S2", null);
  assert.equal(stream.publishCount, count + 3);
  assert.equal(stream.state("R2"), "MISSING");
  stream.sales("S2", null);
  assert.equal(stream.publishCount, count + 3);
  await stream.remove();
});

test("TB-R051 rows stream: a Sales ID that leaves and returns starts LOADING again", async () => {
  const stream = await startRowsStream();
  stream.rows([streamRow("R1", 1, "S1")]);
  stream.sales("S1", linkedSales());
  assert.equal(stream.state("R1"), "LOADED");
  const [first] = stream.live("sales-all-meters/S1");

  stream.rows([streamRow("R1", 1, "")]);
  assert.equal(first.active, false);
  assert.equal(stream.state("R1"), "MISSING");

  stream.rows([streamRow("R1", 1, "S1")]);
  const [second] = stream.live("sales-all-meters/S1");
  assert.notEqual(second, first);
  assert.equal(stream.state("R1"), "LOADING");
  await stream.remove();
});

test("TB-R051 rows stream: removing the cache entry stops every listener and publish", async (t) => {
  t.mock.method(console, "error", () => {});
  const stream = await startRowsStream();
  stream.rows([streamRow("R1", 1, "S1"), streamRow("R2", 2, "S2")]);
  const salesListeners = stream.listeners.filter((listener) => listener.path.startsWith("sales-all-meters/"));
  const [rowsListener] = stream.live("tb_rows");
  const count = stream.publishCount;
  // A publish scheduled but not yet run when the entry is removed never runs.
  stream.burst(() => stream.sales("S1", linkedSales()));
  assert.equal(stream.pendingTimers, 1);
  await stream.remove();
  assert.equal(stream.listeners.every((listener) => !listener.active), true);
  assert.equal(stream.pendingTimers, 0);
  salesListeners[0].next(salesSnapshot(linkedSales({ master: { visibility: "VISIBLE" } })));
  salesListeners[1].error(new Error("late"));
  const listenerCount = stream.listeners.length;
  rowsListener.next({ docs: [{ id: "R9", data: () => streamRow("R9", 9, "S9") }] });
  stream.advance(60000);
  assert.equal(stream.listeners.length, listenerCount, "a late rows event opens no Sales listener");
  assert.equal(stream.publishCount, count);
  assert.equal(stream.state("R1"), "LOADING");
});

test("TB-R051 buckets carry the geofence link and schema version", () => {
  const bucket = normalizeBucket({ id: TB, schemaVersion: "0.3.0", geofenceId: "GF_1", allocation: { status: "ALLOCATED" }, acceptance: { status: "ACCEPTED" } });
  assert.equal(bucket.geofenceId, "GF_1");
  assert.equal(bucket.schemaVersion, "0.3.0");
  assert.equal(bucket.permissions.canViewRows, true);
  const legacy = normalizeBucket({ id: TB, allocation: { status: "ALLOCATED" } });
  assert.equal(legacy.geofenceId, null);
  assert.equal(legacy.schemaVersion, null);
  assert.equal(normalizeBucket({ id: TB, geofenceId: "  ", schemaVersion: "" }).geofenceId, null);
});
