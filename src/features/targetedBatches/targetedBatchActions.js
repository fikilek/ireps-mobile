export const TARGETED_BATCH_INTENTS = Object.freeze({
  OPEN_ERF: "OPEN_ERF",
  OPEN_PREMISE: "OPEN_PREMISE",
  START_METER_DISCOVERY: "START_METER_DISCOVERY",
  OPEN_AST: "OPEN_AST",
  RECORD_NO_ACCESS: "RECORD_NO_ACCESS",
  // TB-R051 (1.3.42): a Completed meter with no meter linked to its row (found outside this batch) is looked up
  // by its meter number, to open the meter or its premise.
  OPEN_FOUND_METER: "OPEN_FOUND_METER",
  OPEN_FOUND_METER_PREMISE: "OPEN_FOUND_METER_PREMISE",
});

// TB-R051 (1.3.42): the actions that start work. Nothing starts work on a Completed meter.
const WORK_INTENTS = new Set([
  TARGETED_BATCH_INTENTS.START_METER_DISCOVERY,
  TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS,
]);

export function isTargetedBatchWorkIntent(intent) {
  return WORK_INTENTS.has(intent);
}

export function isTargetedBatchFoundMeterIntent(intent) {
  return (
    intent === TARGETED_BATCH_INTENTS.OPEN_FOUND_METER ||
    intent === TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE
  );
}

const clean = (value) => String(value ?? "").trim();

export function getTargetedBatchRowActionState(row = {}) {
  const premiseId = clean(row?.refs?.premiseId);
  const meterId = clean(row?.refs?.meterId);
  const fieldWorkMeterId = clean(
    row?.fieldWorkMeterId || row?.raw?.fieldWorkMeterId,
  );
  const invalidLinkage = !premiseId && Boolean(meterId);
  const noAccessCount = Number(row?.noAccessCount);
  const safeNoAccessCount = Number.isFinite(noAccessCount)
    ? Math.max(0, Math.trunc(noAccessCount))
    : 0;

  // TB-R051 (1.3.42): a Completed meter opens its meter, premise and ERF, but starts nothing: No Access stays
  // disabled. A row with no meter or premise linked (the meter was found outside this batch) opens them by
  // looking the meter up by its meter number.
  if (clean(row?.displayStatus).toUpperCase() === "COMPLETED") {
    return {
      premise: {
        value: premiseId ? 1 : 0,
        disabled: false,
        intent: premiseId
          ? TARGETED_BATCH_INTENTS.OPEN_PREMISE
          : TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE,
      },
      ast: {
        value: meterId ? 1 : 0,
        disabled: false,
        helperText: "OPEN AST",
        intent: meterId
          ? TARGETED_BATCH_INTENTS.OPEN_AST
          : TARGETED_BATCH_INTENTS.OPEN_FOUND_METER,
      },
      noAccess: {
        value: safeNoAccessCount,
        disabled: true,
        helperText: "COMPLETED",
        intent: TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS,
      },
      erf: { value: clean(row?.erfNo) || "—", disabled: !clean(row?.refs?.erfId), intent: TARGETED_BATCH_INTENTS.OPEN_ERF },
      invalidLinkage,
      completed: true,
    };
  }

  return {
    premise: { value: premiseId ? 1 : 0, disabled: false, intent: TARGETED_BATCH_INTENTS.OPEN_PREMISE },
    ast: {
      value: meterId ? 1 : 0,
      disabled: !premiseId && !meterId,
      helperText: invalidLinkage ? "LINKAGE ISSUE" : !premiseId ? "PREMISE REQUIRED" : meterId ? "OPEN AST" : "DISCOVER",
      intent: meterId ? TARGETED_BATCH_INTENTS.OPEN_AST : TARGETED_BATCH_INTENTS.START_METER_DISCOVERY,
    },
    noAccess: {
      value: safeNoAccessCount,
      helperText: fieldWorkMeterId ? "DISCOVERY COMPLETE" : null,
      disabled: Boolean(fieldWorkMeterId),
      intent: TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS,
    },
    erf: { value: clean(row?.erfNo) || "—", disabled: !clean(row?.refs?.erfId), intent: TARGETED_BATCH_INTENTS.OPEN_ERF },
    invalidLinkage,
    completed: false,
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
