import {
  getMissingTargetedBatchContextFields,
  normalizeTargetedBatchContext,
} from "../premises/targetedBatchPremiseContext.js";
import { isFieldWorkorderActor } from "./fieldWorkorderActor.js";
import { getTargetedBatchRowActionState } from "./targetedBatchActions.js";

const MY_WORK_ORDERS_ROUTE = "/(tabs)/admin/operations/my-workorders";

function cleanId(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeUpper(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

// TB-R051: a premise is linked when it is the premise of the batch row the
// worker opened, or when it carries that row's batch link.
export function premiseTargetedBatchContext({ premise, selectedErfContext } = {}) {
  const premiseId = cleanId(premise?.id);
  if (!premiseId) return null;

  const selected = normalizeTargetedBatchContext(selectedErfContext);
  const own = normalizeTargetedBatchContext(premise?.targetedBatchContext);

  if (selected) {
    const isRowPremise =
      !!selected.premiseId && selected.premiseId === premiseId;
    const carriesRowLink =
      !!selected.rowId && own?.rowId === selected.rowId;

    if (isRowPremise || carriesRowLink) {
      return { ...selected, premiseId };
    }
  }

  if (own && getMissingTargetedBatchContextFields(own).length === 0) {
    return {
      ...own,
      premiseId,
      returnTo: own.returnTo || MY_WORK_ORDERS_ROUTE,
    };
  }

  return null;
}

// TB-R051: the batch stays on the selection only for the same ERF.
export function erfWithCarriedBatchContext({ erf, selectedErfContext } = {}) {
  if (!erf || typeof erf !== "object") return null;

  const plainErf = { ...erf };
  delete plainErf.targetedBatchContext;

  const context = normalizeTargetedBatchContext(selectedErfContext);
  const erfId = cleanId(erf.id) || cleanId(erf.erfId);

  if (context?.erfId && erfId && context.erfId === erfId) {
    return { ...plainErf, targetedBatchContext: context };
  }

  return plainErf;
}

// TB-R051: the refusals Discover shows in field language.
export const BATCH_DISCOVERY_REASONS = Object.freeze({
  NOT_LINKED: "This premise is not linked to a batch meter",
  NOT_IN_WORK_ORDERS: "This batch meter is not in your work orders",
  ROW_NOT_FOUND: "This batch row is no longer on the batch",
  NOT_ALLOCATED: "This batch meter is no longer allocated for field work",
  COMPLETED: "This batch meter is Completed",
  SALES_NOT_CHECKED: "The meter's Sales record could not be checked",
  ROW_ERF_CHANGED: "This batch meter is no longer on this ERF",
  PREMISE_NOT_ROW_PREMISE: "This premise is not the batch meter's premise",
  PREMISE_ERF_MISSING:
    "This premise has no ERF, so it cannot be checked against the batch meter",
  PREMISE_ERF_MISMATCH: "This premise is on another ERF than the batch meter",
  METER_ALREADY_LINKED:
    "This batch meter already has a meter linked; open it from My Work Orders",
  CHECK_FAILED: "Could not check the batch meter. Check your connection.",
});

// TB-R051: the refusals a new batch premise shows in field language.
export const BATCH_PREMISE_REASONS = Object.freeze({
  NOT_LINKED: "This ERF is not linked to a batch meter",
  ERF_MISMATCH: "This batch meter is not on this ERF",
  NOT_IN_WORK_ORDERS: BATCH_DISCOVERY_REASONS.NOT_IN_WORK_ORDERS,
  ROW_NOT_FOUND: BATCH_DISCOVERY_REASONS.ROW_NOT_FOUND,
  NOT_ALLOCATED: BATCH_DISCOVERY_REASONS.NOT_ALLOCATED,
  COMPLETED: BATCH_DISCOVERY_REASONS.COMPLETED,
  SALES_NOT_CHECKED: BATCH_DISCOVERY_REASONS.SALES_NOT_CHECKED,
  ROW_ERF_CHANGED: BATCH_DISCOVERY_REASONS.ROW_ERF_CHANGED,
  PREMISE_ALREADY_LINKED:
    "This batch meter already has a premise; open it from My Work Orders",
  CHECK_FAILED: BATCH_DISCOVERY_REASONS.CHECK_FAILED,
});

// TB-R051: the premise's ERF, read the same way on every Discover path.
export function getPremiseBatchErfId(premise) {
  return (
    cleanId(premise?.erfId) ||
    cleanId(premise?.parents?.erfId) ||
    cleanId(premise?.erf?.id)
  );
}

// TB-R051: the batch's allocation target, read the same way as the My Work
// Orders batch list (allocation.targetType/targetId, else allocation.target).
export function getBatchAllocationTarget(batch) {
  const allocation = batch?.allocation || {};
  const target = allocation?.target || {};

  return {
    type: normalizeUpper(allocation?.targetType || target?.type),
    id: cleanId(allocation?.targetId || target?.id),
  };
}

function addMemberId(ids, value) {
  const id = cleanId(value);
  if (id) ids.add(id);
}

// TB-R051: the team's member uids, read the same way as the server's batch
// authority check (ireps-web functions/targetedBatches/premiseLink.js
// targetedBatchTeamMemberIds), so the phone never offers a batch the submit
// refuses: memberUids, scope.memberUserIds, members and users only.
export function getBatchTeamMemberIds(team) {
  const ids = new Set();

  if (Array.isArray(team?.memberUids)) {
    team.memberUids.forEach((uid) => addMemberId(ids, uid));
  }

  if (Array.isArray(team?.scope?.memberUserIds)) {
    team.scope.memberUserIds.forEach((uid) => addMemberId(ids, uid));
  }

  for (const key of ["members", "users"]) {
    if (!Array.isArray(team?.[key])) continue;

    team[key].forEach((member) => {
      if (typeof member === "string") {
        addMemberId(ids, member);
        return;
      }

      addMemberId(ids, member?.uid);
      addMemberId(ids, member?.id);
      addMemberId(ids, member?.userId);
    });
  }

  return [...ids];
}

// TB-R051: the batch is in the worker's work orders when the worker can open
// My Work Orders (FWR, or SPV not MNC-side: actor.role and actor.profile), and
// the batch is allocated and accepted, and allocated to the worker: their TEAM
// (they are a member) or their service provider. Anything else fails closed.
export function isBatchInActorWorkOrders({ ctx, batch, team, actor } = {}) {
  if (
    !isFieldWorkorderActor({ actorRole: actor?.role, profile: actor?.profile })
  ) {
    return false;
  }

  const context = normalizeTargetedBatchContext(ctx);
  if (!context?.tbId || !batch || typeof batch !== "object") return false;
  if (cleanId(batch.id) !== context.tbId) return false;

  if (normalizeUpper(batch.allocation?.status) !== "ALLOCATED") return false;
  if (normalizeUpper(batch.acceptance?.status) !== "ACCEPTED") return false;

  const target = getBatchAllocationTarget(batch);
  if (!target.id) return false;

  if (target.type === "SP") {
    const spId = cleanId(actor?.spId);
    return !!spId && spId === target.id;
  }

  if (target.type === "TEAM") {
    const uid = cleanId(actor?.uid);
    if (!uid || !team || typeof team !== "object") return false;
    if (cleanId(team.id || team.teamId) !== target.id) return false;
    return getBatchTeamMemberIds(team).includes(uid);
  }

  return false;
}

function refuse(reason, openAst = false) {
  return { offer: false, openAst, reason };
}

// TB-R051: the live checks both batch offers share, in order. Returns the
// first refusal, or null when the row is open for field work by this worker.
function liveBatchRowRefusal({ context, row, batch, team, actor }) {
  if (!isBatchInActorWorkOrders({ ctx: context, batch, team, actor })) {
    return BATCH_DISCOVERY_REASONS.NOT_IN_WORK_ORDERS;
  }

  if (!row || typeof row !== "object") {
    return BATCH_DISCOVERY_REASONS.ROW_NOT_FOUND;
  }

  if (cleanId(row.tbId) !== context.tbId || cleanId(row.id) !== context.rowId) {
    return BATCH_DISCOVERY_REASONS.ROW_NOT_FOUND;
  }

  if (normalizeUpper(row.allocationStatus) !== "ALLOCATED") {
    return BATCH_DISCOVERY_REASONS.NOT_ALLOCATED;
  }

  if (getTargetedBatchRowActionState(row).completed) {
    return BATCH_DISCOVERY_REASONS.COMPLETED;
  }

  // Sales not loaded, missing, failed, or not the batch meter's Sales record.
  if (
    row.salesLoadState !== "LOADED" ||
    cleanId(row.salesDocId) !== context.salesDocId
  ) {
    return BATCH_DISCOVERY_REASONS.SALES_NOT_CHECKED;
  }

  return null;
}

// TB-R051: "Discover batch meter" follows the batch path, the same as the
// Meter button. It is offered only on the live row of a batch in the worker's
// work orders, and fails closed.
export function evaluateBatchDiscoveryOffer({
  ctx,
  premise,
  row,
  batch,
  team,
  actor,
} = {}) {
  const context = normalizeTargetedBatchContext(ctx);
  if (!context || getMissingTargetedBatchContextFields(context).length > 0) {
    return refuse(BATCH_DISCOVERY_REASONS.NOT_LINKED);
  }

  const liveRefusal = liveBatchRowRefusal({ context, row, batch, team, actor });
  if (liveRefusal) return refuse(liveRefusal);

  if ((cleanId(row.refs?.erfId) || cleanId(row.erfId)) !== context.erfId) {
    return refuse(BATCH_DISCOVERY_REASONS.ROW_ERF_CHANGED);
  }

  const premiseId = cleanId(premise?.id);
  if (!premiseId || cleanId(row.refs?.premiseId) !== premiseId) {
    return refuse(BATCH_DISCOVERY_REASONS.PREMISE_NOT_ROW_PREMISE);
  }

  const premiseErfId = getPremiseBatchErfId(premise);
  if (!premiseErfId) {
    return refuse(BATCH_DISCOVERY_REASONS.PREMISE_ERF_MISSING);
  }
  if (premiseErfId !== context.erfId) {
    return refuse(BATCH_DISCOVERY_REASONS.PREMISE_ERF_MISMATCH);
  }

  if (cleanId(row.refs?.meterId)) {
    return refuse(BATCH_DISCOVERY_REASONS.METER_ALREADY_LINKED, true);
  }

  return { offer: true, openAst: false, reason: null };
}

// TB-R051: a new premise on a batch ERF follows the batch path, the same as
// the Premise button. It is offered only on the live row of a batch in the
// worker's work orders, on this ERF, whose meter has no premise yet. Fails closed.
export function evaluateBatchPremiseOffer({
  ctx,
  erf,
  row,
  batch,
  team,
  actor,
} = {}) {
  const context = normalizeTargetedBatchContext(ctx);
  if (!context || getMissingTargetedBatchContextFields(context).length > 0) {
    return refuse(BATCH_PREMISE_REASONS.NOT_LINKED);
  }

  const erfId = cleanId(erf?.id);
  if (!erfId || erfId !== context.erfId) {
    return refuse(BATCH_PREMISE_REASONS.ERF_MISMATCH);
  }

  const liveRefusal = liveBatchRowRefusal({ context, row, batch, team, actor });
  if (liveRefusal) return refuse(liveRefusal);

  if ((cleanId(row.refs?.erfId) || cleanId(row.erfId)) !== erfId) {
    return refuse(BATCH_PREMISE_REASONS.ROW_ERF_CHANGED);
  }

  if (cleanId(row.refs?.premiseId) || cleanId(row.premiseId)) {
    return refuse(BATCH_PREMISE_REASONS.PREMISE_ALREADY_LINKED);
  }

  return { offer: true, openAst: false, reason: null };
}
