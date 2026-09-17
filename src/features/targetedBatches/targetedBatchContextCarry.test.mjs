import test from "node:test";
import assert from "node:assert/strict";

import {
  BATCH_DISCOVERY_REASONS,
  BATCH_PREMISE_REASONS,
  erfWithCarriedBatchContext,
  evaluateBatchDiscoveryOffer,
  evaluateBatchPremiseOffer,
  getBatchAllocationTarget,
  getBatchTeamMemberIds,
  getPremiseBatchErfId,
  isBatchInActorWorkOrders,
  premiseTargetedBatchContext,
} from "./targetedBatchContextCarry.js";

const selectedContext = () => ({
  sourceModule: "SALES_TARGETED_BATCH",
  operationType: "METER_DISCOVERY",
  tbId: "TB1",
  rowId: "ROW1",
  rowNo: 3,
  salesDocId: "S1",
  erfId: "ERF1",
  premiseId: "P1",
  targetedMeterNo: "04298112659",
  returnTo: "/(tabs)/admin/operations/my-workorders",
  sourceAddress: { addressLine1: "485 VAN RENSBURG", town: "SITHEMBILE" },
});

// Shape written on premise documents by functions/targetedBatches/premiseLink.js
const premiseOwnContext = () => ({
  sourceModule: "SALES_TARGETED_BATCH",
  operationType: "METER_DISCOVERY",
  tbId: "TB2",
  rowId: "ROW2",
  rowNo: 7,
  salesDocId: "S2",
  erfId: "ERF2",
  meterNo: "11111111111",
  accountNumber: "ACC",
  customerName: "NAME",
  sourceAddress: { addressLine1: "1 MAIN", town: "TOWN" },
});

test("selected context matches the premise of the opened row by premiseId", () => {
  const ctx = premiseTargetedBatchContext({
    premise: { id: "P1", erfId: "ERF1" },
    selectedErfContext: selectedContext(),
  });

  assert.equal(ctx.tbId, "TB1");
  assert.equal(ctx.rowId, "ROW1");
  assert.equal(ctx.rowNo, 3);
  assert.equal(ctx.premiseId, "P1");
  assert.equal(ctx.targetedMeterNo, "04298112659");
});

test("selected context matches a premise carrying the same row link", () => {
  const ctx = premiseTargetedBatchContext({
    premise: {
      id: "P9",
      targetedBatchContext: { ...selectedContext(), premiseId: undefined },
    },
    selectedErfContext: { ...selectedContext(), premiseId: null },
  });

  assert.equal(ctx.tbId, "TB1");
  assert.equal(ctx.rowId, "ROW1");
  assert.equal(ctx.premiseId, "P9");
});

test("selected context without a row premise does not match any premise", () => {
  const ctx = premiseTargetedBatchContext({
    premise: { id: "P5" },
    selectedErfContext: { ...selectedContext(), premiseId: null },
  });

  assert.equal(ctx, null);
});

test("premise's own complete context is used when the selection does not match", () => {
  const ctx = premiseTargetedBatchContext({
    premise: { id: "P2", targetedBatchContext: premiseOwnContext() },
    selectedErfContext: selectedContext(),
  });

  assert.equal(ctx.tbId, "TB2");
  assert.equal(ctx.rowId, "ROW2");
  assert.equal(ctx.rowNo, 7);
  assert.equal(ctx.premiseId, "P2");
  assert.equal(ctx.targetedMeterNo, "11111111111");
  assert.equal(ctx.returnTo, "/(tabs)/admin/operations/my-workorders");

  const noSelection = premiseTargetedBatchContext({
    premise: { id: "P2", targetedBatchContext: premiseOwnContext() },
  });
  assert.equal(noSelection.rowId, "ROW2");
});

test("premise's own incomplete context is ignored", () => {
  for (const field of ["tbId", "rowId", "salesDocId", "erfId"]) {
    const own = { ...premiseOwnContext(), [field]: " " };
    assert.equal(
      premiseTargetedBatchContext({
        premise: { id: "P2", targetedBatchContext: own },
        selectedErfContext: null,
      }),
      null,
      field,
    );
  }
});

test("contexts from another source module are ignored", () => {
  assert.equal(
    premiseTargetedBatchContext({
      premise: { id: "P1" },
      selectedErfContext: { ...selectedContext(), sourceModule: "BGO" },
    }),
    null,
  );
  assert.equal(
    premiseTargetedBatchContext({
      premise: {
        id: "P2",
        targetedBatchContext: { ...premiseOwnContext(), sourceModule: "BGO" },
      },
    }),
    null,
  );
  // A premise carrying a non-batch context with the same rowId is not linked.
  assert.equal(
    premiseTargetedBatchContext({
      premise: {
        id: "P9",
        targetedBatchContext: { sourceModule: "BGO", rowId: "ROW1" },
      },
      selectedErfContext: { ...selectedContext(), premiseId: null },
    }),
    null,
  );
});

test("premise without id or context returns null", () => {
  assert.equal(premiseTargetedBatchContext({ premise: null }), null);
  assert.equal(
    premiseTargetedBatchContext({
      premise: { targetedBatchContext: premiseOwnContext() },
    }),
    null,
  );
  assert.equal(premiseTargetedBatchContext({ premise: { id: "P3" } }), null);
});

test("ERF carry keeps the batch for the same ERF", () => {
  const erf = { id: "ERF1", erfNo: "485" };
  const carried = erfWithCarriedBatchContext({
    erf,
    selectedErfContext: selectedContext(),
  });

  assert.equal(carried.id, "ERF1");
  assert.equal(carried.erfNo, "485");
  assert.equal(carried.targetedBatchContext.tbId, "TB1");
  assert.equal(carried.targetedBatchContext.erfId, "ERF1");
  assert.notEqual(carried, erf);
  assert.equal("targetedBatchContext" in erf, false);

  const byErfId = erfWithCarriedBatchContext({
    erf: { erfId: "ERF1" },
    selectedErfContext: selectedContext(),
  });
  assert.equal(byErfId.targetedBatchContext.rowId, "ROW1");
});

test("ERF carry drops the batch for a different ERF", () => {
  const erf = {
    id: "ERF2",
    erfNo: "486",
    targetedBatchContext: selectedContext(),
  };
  const plain = erfWithCarriedBatchContext({
    erf,
    selectedErfContext: selectedContext(),
  });

  assert.deepEqual(plain, { id: "ERF2", erfNo: "486" });
  assert.equal(Object.hasOwn(plain, "targetedBatchContext"), false);
  assert.equal("targetedBatchContext" in erf, true);
});

test("ERF carry without a batch selection returns a plain copy", () => {
  const erf = { id: "ERF1", targetedBatchContext: selectedContext() };

  for (const selectedErfContext of [
    null,
    undefined,
    { ...selectedContext(), sourceModule: "BGO" },
  ]) {
    const plain = erfWithCarriedBatchContext({ erf, selectedErfContext });
    assert.deepEqual(plain, { id: "ERF1" });
    assert.equal(Object.hasOwn(plain, "targetedBatchContext"), false);
  }
});

test("ERF carry with a null ERF returns null", () => {
  assert.equal(
    erfWithCarriedBatchContext({
      erf: null,
      selectedErfContext: selectedContext(),
    }),
    null,
  );
  assert.equal(erfWithCarriedBatchContext({ erf: undefined }), null);
});

// ---- TB-R051: "Discover batch meter" is offered only on the live row ----

const liveCtx = (extra = {}) => ({ ...selectedContext(), ...extra });
const livePremise = (extra = {}) => ({ id: "P1", erfId: "ERF1", ...extra });
// Shape of normalizeTargetedBatchRow(enrichTargetedBatchRowFromSales(...)).
const liveRow = (extra = {}, refs = {}) => ({
  id: "ROW1",
  tbId: "TB1",
  rowNo: 3,
  erfId: "ERF1",
  premiseId: "P1",
  meterId: "",
  salesDocId: "S1",
  allocationStatus: "ALLOCATED",
  executionStatus: "NOT_STARTED",
  displayStatus: "NOT_STARTED",
  salesVisibility: null,
  salesLoadState: "LOADED",
  refs: { erfId: "ERF1", premiseId: "P1", ...refs },
  ...extra,
});

// Shape of tb_uploads/{tbId} accepted by and allocated to TEAM1, and of teams/TEAM1.
const liveBatch = (extra = {}, allocation = {}) => ({
  id: "TB1",
  allocation: { status: "ALLOCATED", targetType: "TEAM", targetId: "TEAM1", targetName: "Team A", ...allocation },
  acceptance: { status: "ACCEPTED" },
  ...extra,
});
const liveTeam = (extra = {}) => ({ id: "TEAM1", name: "Team A", scope: { memberUserIds: ["FWR1", "FWR2"] }, ...extra });
// Shape of batchActor on the Premises and Maps tabs.
const liveActor = (extra = {}) => ({ uid: "FWR1", spId: "SP1", role: "FWR", profile: {}, ...extra });
// The worker's own batch unless a test says otherwise.
const discover = (args = {}) =>
  evaluateBatchDiscoveryOffer({ batch: liveBatch({ id: args.ctx?.tbId ?? "TB1" }), team: liveTeam(), actor: liveActor(), ...args });

const OFFER = { offer: true, openAst: false, reason: null };
const refused = (reason, openAst = false) => ({ offer: false, openAst, reason });

test("offer: an open, allocated live row with its Sales record loaded", () => {
  assert.deepEqual(
    discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow() }),
    OFFER,
  );
  assert.deepEqual(
    discover({
      ctx: liveCtx(),
      premise: livePremise(),
      row: liveRow({ executionStatus: "IN_PROGRESS", displayStatus: "IN_PROGRESS", salesVisibility: "INVISIBLE" }),
    }),
    OFFER,
  );
});

test("refusal reasons are the contract's field language", () => {
  assert.equal(BATCH_DISCOVERY_REASONS.COMPLETED, "This batch meter is Completed");
  assert.equal(BATCH_DISCOVERY_REASONS.ROW_NOT_FOUND, "This batch row is no longer on the batch");
  assert.equal(BATCH_DISCOVERY_REASONS.SALES_NOT_CHECKED, "The meter's Sales record could not be checked");
  assert.equal(
    BATCH_DISCOVERY_REASONS.METER_ALREADY_LINKED,
    "This batch meter already has a meter linked; open it from My Work Orders",
  );
  assert.equal(BATCH_DISCOVERY_REASONS.CHECK_FAILED, "Could not check the batch meter. Check your connection.");
  assert.equal(BATCH_DISCOVERY_REASONS.NOT_IN_WORK_ORDERS, "This batch meter is not in your work orders");
  assert.equal(
    BATCH_PREMISE_REASONS.PREMISE_ALREADY_LINKED,
    "This batch meter already has a premise; open it from My Work Orders",
  );
  for (const [key, reason] of [
    ...Object.entries(BATCH_DISCOVERY_REASONS),
    ...Object.entries(BATCH_PREMISE_REASONS).map(([key, reason]) => [`premise ${key}`, reason]),
  ]) {
    assert.equal(typeof reason, "string", key);
    // Plain field language: a sentence, no status codes or field names.
    assert.match(reason, /^[A-Z][a-z]/, key);
    assert.doesNotMatch(reason, /[A-Z]{2,}_[A-Z]|refs\.|\bnull\b|undefined|\bNAv\b/, key);
  }
});

test("refusal: no live row, or a row of another batch", () => {
  for (const row of [null, undefined, "ROW1", 0]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise: livePremise(), row }),
      refused(BATCH_DISCOVERY_REASONS.ROW_NOT_FOUND),
    );
  }
  for (const row of [
    liveRow({ tbId: "TB9" }),
    liveRow({ tbId: "" }),
    liveRow({ id: "ROW9" }),
    liveRow({ id: "NAv" }),
  ]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise: livePremise(), row }),
      refused(BATCH_DISCOVERY_REASONS.ROW_NOT_FOUND),
    );
  }
});

test("refusal: the row is not allocated (unallocated or never allocated)", () => {
  for (const allocationStatus of ["UNALLOCATED", "NOT_APPLICABLE", "", null, undefined]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow({ allocationStatus }) }),
      refused(BATCH_DISCOVERY_REASONS.NOT_ALLOCATED),
      String(allocationStatus),
    );
  }
});

test("refusal: a Completed meter is locked, including a VISIBLE Sales meter whose row is still open", () => {
  for (const row of [
    liveRow({ displayStatus: "COMPLETED", executionStatus: "COMPLETED" }),
    liveRow({ displayStatus: "COMPLETED", executionStatus: "IN_PROGRESS", salesVisibility: "VISIBLE" }),
    liveRow({ displayStatus: "completed", executionStatus: "NOT_STARTED", salesVisibility: "VISIBLE" }),
    // Completed wins over a linked meter: it is not offered to open either.
    liveRow({ displayStatus: "COMPLETED", meterId: "AST1" }, { meterId: "AST1" }),
    // Completed wins over a Sales record that could not be checked.
    liveRow({ displayStatus: "COMPLETED", salesLoadState: "ERROR" }),
  ]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise: livePremise(), row }),
      refused(BATCH_DISCOVERY_REASONS.COMPLETED),
    );
  }
});

test("review scenario: premise carrying its own batch link, row VISIBLE but IN_PROGRESS", () => {
  const premise = { id: "P2", erfId: "ERF2", targetedBatchContext: premiseOwnContext() };
  const ctx = premiseTargetedBatchContext({ premise, selectedErfContext: null });
  assert.equal(ctx.rowId, "ROW2");

  const row = liveRow(
    {
      id: "ROW2",
      tbId: "TB2",
      erfId: "ERF2",
      salesDocId: "S2",
      executionStatus: "IN_PROGRESS",
      displayStatus: "COMPLETED",
      salesVisibility: "VISIBLE",
    },
    { erfId: "ERF2", premiseId: "P2" },
  );

  assert.deepEqual(discover({ ctx, premise, row }), refused(BATCH_DISCOVERY_REASONS.COMPLETED));
  // The same row before its Sales record turned VISIBLE is offered.
  assert.deepEqual(
    discover({
      ctx,
      premise,
      row: { ...row, displayStatus: "IN_PROGRESS", salesVisibility: "INVISIBLE" },
    }),
    OFFER,
  );
});

test("refusal: the Sales record is not loaded, missing, failed or not the batch meter's", () => {
  for (const salesLoadState of ["LOADING", "MISSING", "ERROR", "loaded", "", null, undefined]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow({ salesLoadState }) }),
      refused(BATCH_DISCOVERY_REASONS.SALES_NOT_CHECKED),
      String(salesLoadState),
    );
  }
  for (const salesDocId of ["S9", "", null]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow({ salesDocId }) }),
      refused(BATCH_DISCOVERY_REASONS.SALES_NOT_CHECKED),
      String(salesDocId),
    );
  }
});

test("row ERF: refs.erfId first, then the row's erfId, and it must be the context ERF", () => {
  assert.deepEqual(
    discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow({}, { erfId: "ERF9" }) }),
    refused(BATCH_DISCOVERY_REASONS.ROW_ERF_CHANGED),
  );
  assert.deepEqual(
    discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow({ erfId: "ERF1" }, { erfId: "" }) }),
    OFFER,
  );
  assert.deepEqual(
    discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow({ erfId: "" }, { erfId: " " }) }),
    refused(BATCH_DISCOVERY_REASONS.ROW_ERF_CHANGED),
  );
  // Without refs the row has no linked premise.
  assert.deepEqual(
    discover({ ctx: liveCtx(), premise: livePremise(), row: { ...liveRow(), refs: undefined } }),
    refused(BATCH_DISCOVERY_REASONS.PREMISE_NOT_ROW_PREMISE),
  );
});

test("refusal: the premise is not the row's linked premise", () => {
  for (const [premise, refs] of [
    [livePremise(), { premiseId: "" }],
    [livePremise(), { premiseId: "P9" }],
    [livePremise({ id: "P9" }), {}],
    [livePremise({ id: " " }), {}],
    [null, {}],
    [undefined, {}],
  ]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise, row: liveRow({}, refs) }),
      refused(BATCH_DISCOVERY_REASONS.PREMISE_NOT_ROW_PREMISE),
    );
  }
});

test("premise ERF fails closed when empty and must be the context ERF", () => {
  assert.equal(getPremiseBatchErfId({ erfId: " ERF1 " }), "ERF1");
  assert.equal(getPremiseBatchErfId({ erfId: "", parents: { erfId: "ERF2" } }), "ERF2");
  assert.equal(getPremiseBatchErfId({ parents: {}, erf: { id: "ERF3" } }), "ERF3");
  assert.equal(getPremiseBatchErfId({ erfId: "ERF1", parents: { erfId: "ERF2" } }), "ERF1");
  assert.equal(getPremiseBatchErfId({}), null);
  assert.equal(getPremiseBatchErfId(null), null);

  for (const premise of [
    { id: "P1" },
    { id: "P1", erfId: "  " },
    { id: "P1", erfId: null, parents: { erfId: "" }, erf: { id: "" } },
  ]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise, row: liveRow() }),
      refused(BATCH_DISCOVERY_REASONS.PREMISE_ERF_MISSING),
    );
  }
  for (const premise of [
    { id: "P1", erfId: "ERF9" },
    { id: "P1", parents: { erfId: "ERF9" } },
    // premise.erfId is read first; a matching fallback does not rescue it.
    { id: "P1", erfId: "ERF9", parents: { erfId: "ERF1" } },
  ]) {
    assert.deepEqual(
      discover({ ctx: liveCtx(), premise, row: liveRow() }),
      refused(BATCH_DISCOVERY_REASONS.PREMISE_ERF_MISMATCH),
    );
  }
  for (const premise of [
    { id: "P1", parents: { erfId: "ERF1" } },
    { id: "P1", erf: { id: "ERF1" } },
  ]) {
    assert.deepEqual(discover({ ctx: liveCtx(), premise, row: liveRow() }), OFFER);
  }
});

test("a row with a linked meter is not discovered again; it opens from My Work Orders", () => {
  assert.deepEqual(
    discover({
      ctx: liveCtx(),
      premise: livePremise(),
      row: liveRow({ meterId: "AST1" }, { meterId: "AST1" }),
    }),
    refused(BATCH_DISCOVERY_REASONS.METER_ALREADY_LINKED, true),
  );
  assert.deepEqual(
    discover({ ctx: liveCtx(), premise: livePremise(), row: liveRow({}, { meterId: "  " }) }),
    OFFER,
  );
});

test("refusal: no usable batch context", () => {
  for (const ctx of [
    null,
    undefined,
    {},
    liveCtx({ sourceModule: "BGO" }),
    liveCtx({ tbId: "" }),
    liveCtx({ rowId: " " }),
    liveCtx({ salesDocId: null }),
    liveCtx({ erfId: undefined }),
  ]) {
    assert.deepEqual(
      discover({ ctx, premise: livePremise(), row: liveRow() }),
      refused(BATCH_DISCOVERY_REASONS.NOT_LINKED),
    );
  }
  assert.deepEqual(evaluateBatchDiscoveryOffer(), refused(BATCH_DISCOVERY_REASONS.NOT_LINKED));
});

test("offer checks run in the contract's order", () => {
  // A row failing every check reports the first failing check, one at a time.
  const worst = liveRow(
    { tbId: "TB9", allocationStatus: "UNALLOCATED", displayStatus: "COMPLETED", salesLoadState: "ERROR" },
    { erfId: "ERF9", premiseId: "P9", meterId: "AST1" },
  );
  const premise = { id: "P1", erfId: "" };
  const open = {
    ...worst,
    tbId: "TB1",
    allocationStatus: "ALLOCATED",
    displayStatus: "NOT_STARTED",
    salesLoadState: "LOADED",
  };
  assert.equal(
    discover({ ctx: liveCtx(), premise, row: worst, batch: liveBatch({}, { targetId: "TEAM9" }) }).reason,
    BATCH_DISCOVERY_REASONS.NOT_IN_WORK_ORDERS,
  );
  const steps = [
    [worst, BATCH_DISCOVERY_REASONS.ROW_NOT_FOUND],
    [{ ...worst, tbId: "TB1" }, BATCH_DISCOVERY_REASONS.NOT_ALLOCATED],
    [{ ...worst, tbId: "TB1", allocationStatus: "ALLOCATED" }, BATCH_DISCOVERY_REASONS.COMPLETED],
    [{ ...open, salesLoadState: "ERROR" }, BATCH_DISCOVERY_REASONS.SALES_NOT_CHECKED],
    [open, BATCH_DISCOVERY_REASONS.ROW_ERF_CHANGED],
    [{ ...open, refs: { ...open.refs, erfId: "ERF1" } }, BATCH_DISCOVERY_REASONS.PREMISE_NOT_ROW_PREMISE],
    [{ ...open, refs: { ...open.refs, erfId: "ERF1", premiseId: "P1" } }, BATCH_DISCOVERY_REASONS.PREMISE_ERF_MISSING],
  ];
  for (const [row, reason] of steps) {
    assert.equal(discover({ ctx: liveCtx(), premise, row }).reason, reason);
  }
  assert.deepEqual(
    discover({
      ctx: liveCtx(),
      premise: livePremise(),
      row: { ...open, refs: { ...open.refs, erfId: "ERF1", premiseId: "P1" } },
    }),
    refused(BATCH_DISCOVERY_REASONS.METER_ALREADY_LINKED, true),
  );
});

test("the offer check does not change its inputs", () => {
  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };
  const ctx = deepFreeze(liveCtx());
  const premise = deepFreeze(livePremise());
  const row = deepFreeze(liveRow());
  assert.deepEqual(discover({ ctx, premise, row }), OFFER);
  assert.deepEqual(ctx, liveCtx());
  assert.deepEqual(premise, livePremise());
  assert.deepEqual(row, liveRow());
});

// ---- TB-R051: both batch offers need the batch in the worker's work orders ----

test("batch target is read as My Work Orders; team members as the server's authority check", () => {
  assert.deepEqual(getBatchAllocationTarget(liveBatch()), { type: "TEAM", id: "TEAM1" });
  assert.deepEqual(
    getBatchAllocationTarget({ allocation: { target: { type: "sp", id: " SP1 " } } }),
    { type: "SP", id: "SP1" },
  );
  assert.deepEqual(getBatchAllocationTarget(null), { type: "", id: null });

  assert.deepEqual(
    getBatchTeamMemberIds({
      memberUids: ["A", " "],
      memberIds: ["B"],
      userIds: ["C"],
      scope: { memberUserIds: ["D", "A"] },
      members: ["E", { uid: "F" }, { id: "G" }, { userId: "H" }],
      users: [{ uid: "I" }, null],
    }).sort(),
    // memberIds and userIds are not read by premiseLink.js targetedBatchTeamMemberIds.
    ["A", "D", "E", "F", "G", "H", "I"],
  );
  assert.deepEqual(getBatchTeamMemberIds({ memberIds: ["FWR1"], userIds: ["FWR1"] }), []);
  assert.deepEqual(getBatchTeamMemberIds(null), []);
  assert.deepEqual(getBatchTeamMemberIds({ scope: { memberUserIds: "FWR1" } }), []);
});

test("in the worker's work orders: accepted, allocated to their TEAM or service provider", () => {
  const ctx = liveCtx();
  assert.equal(isBatchInActorWorkOrders({ ctx, batch: liveBatch(), team: liveTeam(), actor: liveActor() }), true);
  assert.equal(
    isBatchInActorWorkOrders({ ctx, batch: liveBatch(), team: liveTeam(), actor: liveActor({ uid: "FWR2", spId: null }) }),
    true,
  );
  // TEAM through the nested target, and the team's teamId.
  assert.equal(
    isBatchInActorWorkOrders({
      ctx,
      batch: { ...liveBatch(), allocation: { status: "ALLOCATED", target: { type: "TEAM", id: "TEAM1" } } },
      team: { teamId: "TEAM1", memberUids: ["FWR1"] },
      actor: liveActor(),
    }),
    true,
  );
  // SP: the batch target is the worker's service provider; no team is needed.
  const spBatch = liveBatch({}, { targetType: "SP", targetId: "SP1" });
  assert.equal(isBatchInActorWorkOrders({ ctx, batch: spBatch, team: null, actor: liveActor({ uid: "OTHER" }) }), true);
  // An SPV who can open My Work Orders: relationship unknown, or not MNC-side.
  assert.equal(
    isBatchInActorWorkOrders({ ctx, batch: liveBatch(), team: liveTeam(), actor: liveActor({ role: "SPV", profile: null }) }),
    true,
  );
  assert.equal(
    isBatchInActorWorkOrders({
      ctx,
      batch: spBatch,
      team: null,
      actor: liveActor({
        role: "spv",
        profile: { employment: { serviceProvider: { id: "SP1", relationshipType: "SUBC" } } },
      }),
    }),
    true,
  );
});

test("not in the worker's work orders: both offers fail closed", () => {
  const ctx = liveCtx();
  const cases = [
    ["no batch", { batch: null }],
    ["batch of another id", { batch: liveBatch({ id: "TB9" }) }],
    ["not allocated", { batch: liveBatch({}, { status: "UNALLOCATED" }) }],
    ["allocation status missing", { batch: liveBatch({ allocation: { targetType: "TEAM", targetId: "TEAM1" } }) }],
    ["waiting for acceptance", { batch: liveBatch({ acceptance: { status: "WAITING" } }) }],
    ["rejected", { batch: liveBatch({ acceptance: { status: "REJECTED" } }) }],
    ["no acceptance", { batch: liveBatch({ acceptance: undefined }) }],
    [
      "another TEAM's batch",
      { batch: liveBatch({}, { targetId: "TEAM9" }), team: liveTeam({ id: "TEAM9", scope: { memberUserIds: ["FWR7"] } }) },
    ],
    ["not a member of the TEAM", { actor: liveActor({ uid: "FWR9" }) }],
    ["TEAM not read", { team: null }],
    ["a different team passed", { team: liveTeam({ id: "TEAM9" }) }],
    ["no uid", { actor: liveActor({ uid: " " }) }],
    ["no actor", { actor: undefined }],
    ["another service provider", { batch: liveBatch({}, { targetType: "SP", targetId: "SP9" }) }],
    [
      "SP batch, worker without a service provider",
      { batch: liveBatch({}, { targetType: "SP", targetId: "SP1" }), actor: liveActor({ spId: null }) },
    ],
    ["USER allocation", { batch: liveBatch({}, { targetType: "USER", targetId: "FWR1" }) }],
    ["no target id", { batch: liveBatch({}, { targetId: "" }) }],
    // TB-R051: only the FWR and SPV who can open My Work Orders (its actor gate).
    [
      "TEAM member SPV who is MNC-side",
      { actor: liveActor({ role: "SPV", profile: { employment: { serviceProvider: { relationshipType: "MNC" } } } }) },
    ],
    [
      "SP batch, SPV who is MNC-side",
      {
        batch: liveBatch({}, { targetType: "SP", targetId: "SP1" }),
        actor: liveActor({ role: "SPV", profile: { serviceProvider: { clientRelationshipType: "mnc" } } }),
      },
    ],
    ["TEAM member MNG", { actor: liveActor({ role: "MNG" }) }],
    ["SP batch, ADM of the service provider", { batch: liveBatch({}, { targetType: "SP", targetId: "SP1" }), actor: liveActor({ role: "ADM" }) }],
    ["role not read", { actor: liveActor({ role: undefined }) }],
    ["role NAv", { actor: liveActor({ role: "NAv" }) }],
    // The server's member read ignores memberIds and userIds.
    ["member only through memberIds", { team: { id: "TEAM1", memberIds: ["FWR1"] } }],
    ["member only through userIds", { team: { id: "TEAM1", userIds: ["FWR1"] } }],
  ];
  for (const [name, args] of cases) {
    const input = { ctx, batch: liveBatch(), team: liveTeam(), actor: liveActor(), ...args };
    assert.equal(isBatchInActorWorkOrders(input), false, name);
    assert.deepEqual(
      evaluateBatchDiscoveryOffer({ ...input, premise: livePremise(), row: liveRow() }),
      refused(BATCH_DISCOVERY_REASONS.NOT_IN_WORK_ORDERS),
      name,
    );
    assert.deepEqual(
      evaluateBatchPremiseOffer({ ...input, erf: { id: "ERF1" }, row: liveRow({ premiseId: "" }, { premiseId: "" }) }),
      refused(BATCH_PREMISE_REASONS.NOT_IN_WORK_ORDERS),
      name,
    );
  }
  assert.equal(isBatchInActorWorkOrders(), false);
});

// ---- TB-R051: a new batch premise is offered only on the live row ----

const openPremiseRow = (extra = {}, refs = {}) => liveRow({ premiseId: "", ...extra }, { premiseId: "", ...refs });
const premiseOffer = (args = {}) =>
  evaluateBatchPremiseOffer({
    ctx: liveCtx({ premiseId: null }),
    erf: { id: "ERF1", erfNo: "485" },
    row: openPremiseRow(),
    batch: liveBatch(),
    team: liveTeam(),
    actor: liveActor(),
    ...args,
  });

test("premise offer: an open, allocated live row on this ERF with no premise yet", () => {
  assert.deepEqual(premiseOffer(), OFFER);
  assert.deepEqual(
    premiseOffer({
      row: openPremiseRow({ executionStatus: "IN_PROGRESS", displayStatus: "IN_PROGRESS", salesVisibility: "INVISIBLE" }),
    }),
    OFFER,
  );
  // SP allocation.
  assert.deepEqual(premiseOffer({ batch: liveBatch({}, { targetType: "SP", targetId: "SP1" }), team: null }), OFFER);
});

test("premise refusal, review scenario: the Sales record turned VISIBLE after the tile was tapped", () => {
  assert.deepEqual(
    premiseOffer({
      row: openPremiseRow({ displayStatus: "COMPLETED", executionStatus: "NOT_STARTED", salesVisibility: "VISIBLE" }),
    }),
    refused(BATCH_PREMISE_REASONS.COMPLETED),
  );
  assert.deepEqual(
    premiseOffer({ row: openPremiseRow({ displayStatus: "COMPLETED", executionStatus: "COMPLETED" }) }),
    refused(BATCH_PREMISE_REASONS.COMPLETED),
  );
});

test("premise refusal: the row already has a premise, so an ordinary + is not forced into the batch", () => {
  assert.deepEqual(premiseOffer({ row: liveRow() }), refused(BATCH_PREMISE_REASONS.PREMISE_ALREADY_LINKED));
  assert.deepEqual(
    premiseOffer({ row: openPremiseRow({ premiseId: "P1" }) }),
    refused(BATCH_PREMISE_REASONS.PREMISE_ALREADY_LINKED),
  );
  assert.deepEqual(premiseOffer({ row: openPremiseRow({}, { premiseId: "  " }) }), OFFER);
});

test("premise refusals from the live row", () => {
  const cases = [
    ["no row", null, BATCH_PREMISE_REASONS.ROW_NOT_FOUND],
    ["row of another batch", openPremiseRow({ tbId: "TB9" }), BATCH_PREMISE_REASONS.ROW_NOT_FOUND],
    ["another row", openPremiseRow({ id: "ROW9" }), BATCH_PREMISE_REASONS.ROW_NOT_FOUND],
    ["unallocated", openPremiseRow({ allocationStatus: "UNALLOCATED" }), BATCH_PREMISE_REASONS.NOT_ALLOCATED],
    ["Sales loading", openPremiseRow({ salesLoadState: "LOADING" }), BATCH_PREMISE_REASONS.SALES_NOT_CHECKED],
    ["Sales missing", openPremiseRow({ salesLoadState: "MISSING" }), BATCH_PREMISE_REASONS.SALES_NOT_CHECKED],
    ["Sales error", openPremiseRow({ salesLoadState: "ERROR" }), BATCH_PREMISE_REASONS.SALES_NOT_CHECKED],
    ["another Sales record", openPremiseRow({ salesDocId: "S9" }), BATCH_PREMISE_REASONS.SALES_NOT_CHECKED],
    ["row moved to another ERF", openPremiseRow({}, { erfId: "ERF9" }), BATCH_PREMISE_REASONS.ROW_ERF_CHANGED],
    ["row without an ERF", openPremiseRow({ erfId: "" }, { erfId: "" }), BATCH_PREMISE_REASONS.ROW_ERF_CHANGED],
  ];
  for (const [name, row, reason] of cases) {
    assert.deepEqual(premiseOffer({ row }), refused(reason), name);
  }
});

test("premise refusal: the ERF is not the batch meter's ERF, or there is no batch context", () => {
  for (const erf of [{ id: "ERF9" }, { id: " " }, { erfId: "ERF1" }, null, undefined]) {
    assert.deepEqual(premiseOffer({ erf }), refused(BATCH_PREMISE_REASONS.ERF_MISMATCH), JSON.stringify(erf));
  }
  for (const ctx of [null, {}, liveCtx({ sourceModule: "BGO" }), liveCtx({ rowId: "" }), liveCtx({ salesDocId: " " })]) {
    assert.deepEqual(premiseOffer({ ctx }), refused(BATCH_PREMISE_REASONS.NOT_LINKED));
  }
  assert.deepEqual(evaluateBatchPremiseOffer(), refused(BATCH_PREMISE_REASONS.NOT_LINKED));
});

test("premise offer checks run in order", () => {
  const worst = openPremiseRow(
    { tbId: "TB9", allocationStatus: "UNALLOCATED", displayStatus: "COMPLETED", salesLoadState: "ERROR" },
    { erfId: "ERF9", premiseId: "P9" },
  );
  const open = { ...worst, tbId: "TB1", allocationStatus: "ALLOCATED", displayStatus: "NOT_STARTED", salesLoadState: "LOADED" };
  const steps = [
    [{ ctx: liveCtx({ rowId: "" }), erf: { id: "ERF9" }, row: worst, batch: null }, BATCH_PREMISE_REASONS.NOT_LINKED],
    [{ erf: { id: "ERF9" }, row: worst, batch: null }, BATCH_PREMISE_REASONS.ERF_MISMATCH],
    [{ row: worst, batch: null }, BATCH_PREMISE_REASONS.NOT_IN_WORK_ORDERS],
    [{ row: worst }, BATCH_PREMISE_REASONS.ROW_NOT_FOUND],
    [{ row: { ...worst, tbId: "TB1" } }, BATCH_PREMISE_REASONS.NOT_ALLOCATED],
    [{ row: { ...worst, tbId: "TB1", allocationStatus: "ALLOCATED" } }, BATCH_PREMISE_REASONS.COMPLETED],
    [{ row: { ...open, salesLoadState: "ERROR" } }, BATCH_PREMISE_REASONS.SALES_NOT_CHECKED],
    [{ row: open }, BATCH_PREMISE_REASONS.ROW_ERF_CHANGED],
    [{ row: { ...open, refs: { ...open.refs, erfId: "ERF1" } } }, BATCH_PREMISE_REASONS.PREMISE_ALREADY_LINKED],
  ];
  for (const [args, reason] of steps) {
    assert.equal(premiseOffer(args).reason, reason);
  }
  assert.deepEqual(
    premiseOffer({ row: { ...open, premiseId: "", refs: { ...open.refs, erfId: "ERF1", premiseId: "" } } }),
    OFFER,
  );
});
