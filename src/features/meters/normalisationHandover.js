// MN-R001 section 6: from the finding to the disconnection.
//
// A discovery creates the meter, and the meter record is finished a moment after
// the server accepts the form. The disconnection form cannot open before that
// record exists, so we wait for it — and if it does not arrive, we say so
// plainly instead of pretending the work is done.
import { doc, getDoc } from "firebase/firestore";

import { db } from "../../firebase";

export const DISCONNECT_METER_ACTION = "Disconnect meter";
export const REPLACE_METER_ACTION = "Replace meter";
export const METER_RECORD_WAIT_MS = 20000;
const POLL_EVERY_MS = 1500;

// Field work is done by field workers and supervisors. A manager's finding still
// needs its work done, but the manager issues it to a field worker from the
// meter card instead of doing it (the server refuses a manager's field work).
export function canDoFieldDisconnection(role) {
  return ["FWR", "SPV"].includes(String(role || "").trim().toUpperCase());
}

export const canDoFieldWork = canDoFieldDisconnection;

export const MANAGER_DISCONNECTION_MESSAGE =
  "This meter still needs to be disconnected. Issue the disconnection to a field worker from the meter card (DISC).";

export const MANAGER_REPLACEMENT_MESSAGE =
  "This meter still needs to be replaced. Issue the removal to a field worker from the meter card (REM).";

export function leadsToReplacement(actionTaken) {
  return (Array.isArray(actionTaken) ? actionTaken : []).includes(
    REPLACE_METER_ACTION,
  );
}

// The follow-on work a finding calls for, if any (MN-R001 section 6).
export function getFollowOnWork(actionTaken) {
  if (leadsToDisconnection(actionTaken)) return "DISCONNECTION";
  if (leadsToReplacement(actionTaken)) return "REPLACEMENT";
  return "";
}

export function leadsToDisconnection(actionTaken) {
  return (Array.isArray(actionTaken) ? actionTaken : []).includes(
    DISCONNECT_METER_ACTION,
  );
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Returns the meter record, or null when it is not ready in time.
export async function waitForMeterRecord({
  astId,
  timeoutMs = METER_RECORD_WAIT_MS,
  pollEveryMs = POLL_EVERY_MS,
} = {}) {
  if (!astId) return null;

  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const snapshot = await getDoc(doc(db, "asts", astId));

      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() };
      }
    } catch (error) {
      // A lost connection is not a failed disconnection: keep trying until the
      // deadline, then let the caller tell the worker what to do.
    }

    if (Date.now() >= deadline) return null;

    await wait(Math.min(pollEveryMs, Math.max(0, deadline - Date.now())));
  }
}

// The disconnection carries where it came from, so the office can follow the
// chain: discovery or inspection → disconnection.
export function buildDisconnectionRouteParams({
  astDoc,
  astId,
  premiseId,
  parentTrnId,
  parentTrnType,
  returnTo = "/(tabs)/asts",
}) {
  const resolvedAstId = astDoc?.id || astId;

  return {
    pathname: "/(tabs)/asts/disconnection",
    params: {
      astId: resolvedAstId,
      sourceAstId: resolvedAstId,
      premiseId:
        premiseId || astDoc?.accessData?.premise?.id || "NAv",
      returnTo,
      action: JSON.stringify({
        source: "FIELD",
        trnType: "METER_DISCONNECTION",
        returnTo,
        astId: resolvedAstId,
        sourceAstId: resolvedAstId,
        premiseId: premiseId || astDoc?.accessData?.premise?.id || "NAv",
        meterType: astDoc?.meterType || "electricity",
        meterNo: astDoc?.ast?.astData?.astNo || "NAv",
        statusBefore: astDoc?.status?.state || "CONNECTED",
        ast: astDoc?.ast || null,
        accessData: astDoc?.accessData || null,
        status: astDoc?.status || null,
        origin: {
          channel: "FIELD",
          source: parentTrnType || "METER_DISCOVERY",
          parentTrnId: parentTrnId || null,
          parentTrnType: parentTrnType || null,
        },
      }),
    },
  };
}

// MN-R001 section 6.1: Replace meter opens the Remove Meter form first. The
// removal carries the finding it came from, and asks for the installation that
// completes the replacement once it has been accepted.
export function buildRemovalRouteParams({
  astDoc,
  astId,
  premiseId,
  parentTrnId,
  parentTrnType,
  returnTo = "/(tabs)/asts",
}) {
  const resolvedAstId = astDoc?.id || astId;
  const resolvedPremiseId =
    premiseId || astDoc?.accessData?.premise?.id || "NAv";

  return {
    pathname: "/(tabs)/asts/removal",
    params: {
      astId: resolvedAstId,
      sourceAstId: resolvedAstId,
      premiseId: resolvedPremiseId,
      returnTo,
      action: JSON.stringify({
        source: "FIELD",
        trnType: "METER_REMOVAL",
        returnTo,
        astId: resolvedAstId,
        sourceAstId: resolvedAstId,
        premiseId: resolvedPremiseId,
        meterType: astDoc?.meterType || "electricity",
        meterNo: astDoc?.ast?.astData?.astNo || "NAv",
        statusBefore: astDoc?.status?.state || "CONNECTED",
        ast: astDoc?.ast || null,
        accessData: astDoc?.accessData || null,
        status: astDoc?.status || null,
        followOn: "METER_INSTALLATION",
        origin: {
          channel: "FIELD",
          source: parentTrnType || "METER_DISCOVERY",
          parentTrnId: parentTrnId || null,
          parentTrnType: parentTrnType || null,
        },
      }),
    },
  };
}

// After the removal: the new meter goes in at the same premise, linked to the
// removal, and recorded as installed to replace the old meter.
export function buildInstallationRouteParams({
  premiseId,
  removalTrnId,
  replacedAstId,
  replacedMeterNo,
  meterType = "electricity",
  returnTo = "",
}) {
  return {
    pathname: "/(tabs)/premises/form-meter-installation",
    params: {
      premiseId,
      action: JSON.stringify({
        access: "yes",
        meterType,
        // Where the worker lands when the new meter is in: the batch they
        // started from, when they started from one.
        returnTo,
        origin: {
          channel: "FIELD",
          source: "METER_REMOVAL",
          parentTrnId: removalTrnId || null,
          parentTrnType: "METER_REMOVAL",
          replacesAstId: replacedAstId || null,
          replacesMeterNo: replacedMeterNo || null,
        },
      }),
    },
  };
}
