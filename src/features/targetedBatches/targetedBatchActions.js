export const TARGETED_BATCH_INTENTS = Object.freeze({
  OPEN_ERF: "OPEN_ERF",
  OPEN_PREMISE: "OPEN_PREMISE",
  START_METER_DISCOVERY: "START_METER_DISCOVERY",
  OPEN_AST: "OPEN_AST",
  RECORD_NO_ACCESS: "RECORD_NO_ACCESS",
});

const clean = (value) => String(value ?? "").trim();

export function getTargetedBatchRowActionState(row = {}) {
  const premiseId = clean(row?.refs?.premiseId);
  const meterId = clean(row?.refs?.meterId);
  const salesOk = row?.noAccessSourceStatus === "OK";
  const invalidLinkage = !premiseId && Boolean(meterId);

  return {
    premise: { value: premiseId ? 1 : 0, disabled: false, intent: TARGETED_BATCH_INTENTS.OPEN_PREMISE },
    ast: {
      value: meterId ? 1 : 0,
      disabled: !premiseId && !meterId,
      helperText: invalidLinkage ? "LINKAGE ISSUE" : !premiseId ? "PREMISE REQUIRED" : meterId ? "OPEN AST" : "DISCOVER",
      intent: meterId ? TARGETED_BATCH_INTENTS.OPEN_AST : TARGETED_BATCH_INTENTS.START_METER_DISCOVERY,
    },
    noAccess: {
      value: salesOk ? row?.noAccessCount ?? 0 : null,
      helperText: !salesOk ? "DATA ISSUE" : meterId ? "DISCOVERY COMPLETE" : "PHASE 4",
      disabled: true,
      intent: TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS,
    },
    erf: { value: clean(row?.erfNo) || "—", disabled: !clean(row?.refs?.erfId), intent: TARGETED_BATCH_INTENTS.OPEN_ERF },
    invalidLinkage,
  };
}

export function appendUniqueTargetedBatchRows(current = [], incoming = []) {
  const seen = new Set();
  return [...current, ...incoming].filter((row) => {
    const id = clean(row?.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function snapshotTargetedBatchRefs(row = {}) {
  return { erfId: clean(row?.refs?.erfId), premiseId: clean(row?.refs?.premiseId), meterId: clean(row?.refs?.meterId), trnId: clean(row?.refs?.trnId) };
}

export function targetedBatchRefsMatch(row, snapshot) {
  const current = snapshotTargetedBatchRefs(row);
  return Object.keys(current).every((key) => current[key] === snapshot?.[key]);
}
