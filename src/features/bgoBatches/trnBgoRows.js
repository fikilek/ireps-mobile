import { toWorkedMillis } from "../targetedBatches/rowLastWorked.js";
import { readErfCentroid } from "../targetedBatches/targetedBatchMapPoints.js";

const TRN_TYPE_LABELS = {
  METER_DISCONNECTION: "Disconnection",
  MDCN: "Disconnection",
  METER_RECONNECTION: "Reconnection",
  MRCN: "Reconnection",
  METER_INSPECTION: "Inspection",
  MINS: "Inspection",
  METER_REMOVAL: "Removal",
  MREM: "Removal",
  METER_READING: "Reading",
  MRDG: "Reading",
};

function getTrnTypeLabel(trnType = "") {
  const upper = String(trnType || "").trim().toUpperCase();
  return TRN_TYPE_LABELS[upper] || upper || "TRN";
}

function getDisplayStatus(workflowState = "") {
  const upper = String(workflowState || "").trim().toUpperCase();
  if (upper === "COMPLETED" || upper === "QA PASS" || upper === "QA FAIL") {
    return "COMPLETED";
  }
  if (upper === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }
  return "NOT_STARTED";
}

function formatWardLabel(wardPcode = "", fallback = "Ward NAv") {
  const code = String(wardPcode || "").trim();
  if (!code) return fallback;
  const match = code.match(/(\d{1,3})$/);
  if (!match) return code;
  return `Ward ${match[1].padStart(3, "0")}`;
}

function readNoAccessCount(item = {}, raw = {}, premiseDoc = null) {
  const explicit =
    raw?.noAccessCount ??
    raw?.noAccess?.count ??
    (Array.isArray(raw?.noAccessTrnIds)
      ? raw.noAccessTrnIds.length
      : Array.isArray(raw?.refs?.noAccessTrnIds)
        ? raw.refs.noAccessTrnIds.length
        : premiseDoc?.noAccessCount ?? null);
  if (explicit !== null && explicit !== undefined && !Number.isNaN(Number(explicit))) {
    return Math.max(0, Number(explicit));
  }
  const accessStatus = String(raw?.access?.status || item?.accessOutcome || "").trim().toUpperCase();
  return accessStatus.includes("NO") ? 1 : 0;
}

export function buildTrnBgoMobileRows(items = [], assets = {}) {
  const premisesById = new Map((assets?.premises || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const metersById = new Map((assets?.meters || []).filter((m) => m?.id).map((m) => [m.id, m]));
  const erfsById = new Map((assets?.erfs || []).filter((e) => e?.id).map((e) => [e.id, e]));

  return (Array.isArray(items) ? items : []).map((item) => {
    const raw = item?.raw || {};
    const premise = raw?.accessData?.premise || {};
    const premiseId = String(item?.premiseId || premise?.id || raw?.accessData?.premiseId || "").trim() || null;
    const premiseDoc = premiseId ? premisesById.get(premiseId) || null : null;
    const meterId = String(raw?.ast?.astData?.astId || raw?.ast?.astId || raw?.ast?.id || raw?.accessData?.ast?.id || "").trim() || null;
    const meterDoc = meterId ? metersById.get(meterId) || null : null;
    const erfId = String(premise?.erfId || premiseDoc?.erfId || raw?.property?.erfId || raw?.accessData?.erf?.id || "").trim() || null;
    const erfDoc = erfId ? erfsById.get(erfId) || null : null;

    const astGps =
      readErfCentroid(raw?.ast?.location?.gps) ||
      readErfCentroid(raw?.ast?.location) ||
      readErfCentroid(raw?.ast?.astData?.location?.gps) ||
      readErfCentroid(meterDoc?.astData?.location?.gps) ||
      readErfCentroid(meterDoc?.location?.gps);
    const premiseGps =
      readErfCentroid(premise?.gps) ||
      readErfCentroid(premise?.location?.gps) ||
      readErfCentroid(premise?.geometry) ||
      readErfCentroid(premiseDoc?.geometry?.centroid) ||
      readErfCentroid(premiseDoc?.location?.gps);
    const erfGps = readErfCentroid(erfDoc?.geometry?.centroid) || readErfCentroid(erfDoc?.centroid);
    const mapPosition = astGps || premiseGps || erfGps || null;
    const workflowState = String(item?.workflowState || raw?.workflow?.state || "").trim().toUpperCase();
    const displayStatus = getDisplayStatus(workflowState);
    const qaStatus = workflowState === "QA FAIL" ? "QA FAIL" : workflowState === "QA PASS" ? "QA PASS" : null;
    const wardPcode = String(item?.wardPcode || raw?.accessData?.parents?.wardPcode || erfDoc?.wardPcode || "").trim() || null;
    const erfNo = item?.erfNo || premise?.erfNo || premiseDoc?.erfNo || raw?.property?.erfNo || erfDoc?.erfNo || "NAv";
    const addressLine = item?.address || premiseDoc?.addressText || premiseDoc?.address || premise?.addressText || premise?.address || "NAv";

    return {
      id: item?.id,
      raw,
      trnItem: item,
      sourceModule: "TRN_BGO",
      trnType: item?.trnType || raw?.accessData?.trnType || "",
      trnTypeLabel: getTrnTypeLabel(item?.trnType || raw?.accessData?.trnType),
      workflowState,
      displayStatus,
      executionStatus: displayStatus,
      qa: qaStatus ? { finalStatus: qaStatus, tbStatus: qaStatus } : null,
      qaFinalStatus: qaStatus,
      meterId,
      meterNo: item?.meterNo || meterDoc?.astData?.astNo || meterDoc?.astNo || raw?.ast?.astData?.astNo || "NAv",
      premiseId,
      erfId,
      erfNo,
      wardPcode,
      wardLabel: formatWardLabel(wardPcode),
      noAccessCount: readNoAccessCount(item, raw, premiseDoc),
      refs: { premiseId, meterId, erfId, trnId: item?.id },
      address: addressLine,
      addressLine,
      lastWorkedAt: toWorkedMillis(
        item?.updatedAt || raw?.metadata?.updatedAt || item?.createdAt || raw?.metadata?.createdAt,
      ),
      mapPosition,
      mapSource: astGps ? "GPS" : premiseGps ? "PREMISE" : erfGps ? "ERF" : null,
    };
  });
}

export function summarizeTrnBgoRows(rows = []) {
  const summary = {
    total: 0,
    notStarted: 0,
    inProgress: 0,
    completed: 0,
    qaPass: 0,
    qaFail: 0,
  };
  for (const row of rows) {
    summary.total += 1;
    if (row.displayStatus === "COMPLETED") summary.completed += 1;
    else if (row.displayStatus === "IN_PROGRESS") summary.inProgress += 1;
    else summary.notStarted += 1;

    if (row.qaFinalStatus === "QA PASS") summary.qaPass += 1;
    else if (row.qaFinalStatus === "QA FAIL") summary.qaFail += 1;
  }
  return summary;
}
