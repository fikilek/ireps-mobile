import { normalizeComponentQa } from "./targetedBatchRowSearch.js";

export const TARGETED_BATCH_INTENTS = Object.freeze({
  OPEN_ERF: "OPEN_ERF",
  // TB-R051 (1.3.95): PREMISE captures a premise when the row has none, and otherwise opens the
  // Premises screen with the row's premise selected.
  OPEN_PREMISE: "OPEN_PREMISE",
  // TB-R051 (1.3.95): a premise that failed QA opens the Premise form on it, to correct it.
  CORRECT_PREMISE: "CORRECT_PREMISE",
  START_METER_DISCOVERY: "START_METER_DISCOVERY",
  OPEN_AST: "OPEN_AST",
  // TB-R051 (1.3.95): a meter that failed QA opens its correction form.
  CORRECT_AST: "CORRECT_AST",
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

// TB-R051 (1.3.95): the bottom slot of PREMISE and AST is reserved for the QA badge. A status that
// is not available reads QA NAv - never an action word.
export const QA_NAV_BADGE = "QA NAv";

const clean = (value) => String(value ?? "").trim();

function qaBadge(raw) {
  const qa = normalizeComponentQa(raw);
  return qa === "QA PENDING" || qa === "QA PASS" || qa === "QA FAIL" ? qa : QA_NAV_BADGE;
}

const PREMISE_FIRST_AST = Object.freeze({
  title: "Premise first",
  message:
    "The premise at this address is captured before its meter. Tap PREMISE, record it, then come back to the meter.",
});

const PREMISE_FIRST_NA = Object.freeze({
  title: "Premise first",
  message:
    "A No Access says which premise you could not get into. Tap PREMISE, record it, then come back.",
});

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
  const completed = clean(row?.displayStatus).toUpperCase() === "COMPLETED";

  // TB-R051 (1.3.95): the server projects component QA onto the row; the phone only reads it.
  // A component that does not exist has no QA, whatever the row holds.
  const premiseQa = premiseId
    ? qaBadge(row?.premise?.qaStatus ?? row?.qa?.premiseStatus ?? row?.raw?.qa?.premiseStatus)
    : QA_NAV_BADGE;
  const meterQa = meterId
    ? qaBadge(row?.fieldMeter?.qaStatus ?? row?.qa?.meterStatus ?? row?.raw?.qa?.meterStatus)
    : QA_NAV_BADGE;

  // PREMISE: 0 captures; QA FAIL corrects; otherwise the Premises screen. A premise can always be
  // edited from there. TB-R051 (1.3.42): a Completed row with no premise linked looks the found
  // meter's premise up by its meter number.
  let premiseIntent;
  if (!premiseId) {
    premiseIntent = completed
      ? TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE
      : TARGETED_BATCH_INTENTS.OPEN_PREMISE;
  } else if (premiseQa === "QA FAIL") {
    premiseIntent = TARGETED_BATCH_INTENTS.CORRECT_PREMISE;
  } else {
    premiseIntent = TARGETED_BATCH_INTENTS.OPEN_PREMISE;
  }

  // AST: 0 starts Meter Discovery (premise first); QA FAIL corrects; otherwise the ASTs screen.
  // TB-R051 (1.3.42): nothing starts on a Completed meter - with no meter linked it is looked up.
  let astIntent;
  let astBlocked = null;
  if (meterId) {
    astIntent = meterQa === "QA FAIL"
      ? TARGETED_BATCH_INTENTS.CORRECT_AST
      : TARGETED_BATCH_INTENTS.OPEN_AST;
  } else if (completed) {
    astIntent = TARGETED_BATCH_INTENTS.OPEN_FOUND_METER;
  } else {
    astIntent = TARGETED_BATCH_INTENTS.START_METER_DISCOVERY;
    // TB-R051 (1.3.68): no button is dead; it says why.
    if (!premiseId) astBlocked = PREMISE_FIRST_AST;
  }

  // NA: out of QA for now (1.3.95). Available until the meter is Completed; NA-R044 asks for the
  // premise first.
  const noAccessDisabled = completed || Boolean(fieldWorkMeterId);

  return {
    premise: {
      value: premiseId ? 1 : 0,
      disabled: false,
      helperText: premiseQa,
      ...(premiseQa === "QA FAIL" ? { tone: "issue" } : {}),
      blocked: null,
      intent: premiseIntent,
    },
    ast: {
      value: meterId ? 1 : 0,
      disabled: false,
      helperText: meterQa,
      ...(meterQa === "QA FAIL" || invalidLinkage ? { tone: "issue" } : {}),
      blocked: astBlocked,
      intent: astIntent,
    },
    noAccess: {
      value: safeNoAccessCount,
      disabled: noAccessDisabled,
      blocked: !noAccessDisabled && !premiseId ? PREMISE_FIRST_NA : null,
      intent: TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS,
    },
    erf: {
      value: clean(row?.erfNo) || "—",
      disabled: false,
      blocked: clean(row?.refs?.erfId)
        ? null
        : {
            title: "No ERF on this row",
            message: "This meter has no ERF linked to it, so there is nothing to open. Report it to the office.",
          },
      intent: TARGETED_BATCH_INTENTS.OPEN_ERF,
    },
    invalidLinkage,
    completed,
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

// TB-R051 (1.3.68): the reason a tapped button cannot do its work yet, or null when it can.
// No button is dead: the screen says this instead of leaving the worker with nothing.
export function blockedTargetedBatchReason(actions, intent) {
  if (!actions || !intent) return null;
  const tapped = [actions.premise, actions.ast, actions.noAccess, actions.erf].find(
    (action) => action?.intent === intent,
  );
  return tapped?.blocked || null;
}
