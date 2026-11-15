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

export function buildTrnBgoMobileRows(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const raw = item?.raw || {};
    const premise = raw?.accessData?.premise || {};
    const astGps =
      readErfCentroid(raw?.ast?.location?.gps) ||
      readErfCentroid(raw?.ast?.location) ||
      readErfCentroid(raw?.ast?.astData?.location?.gps);
    const premiseGps =
      readErfCentroid(premise?.gps) ||
      readErfCentroid(premise?.location?.gps) ||
      readErfCentroid(premise?.geometry);
    const mapPosition = astGps || premiseGps || null;
    const workflowState = String(item?.workflowState || raw?.workflow?.state || "").trim().toUpperCase();
    const displayStatus = getDisplayStatus(workflowState);
    const qaStatus = workflowState === "QA FAIL" ? "QA FAIL" : workflowState === "QA PASS" ? "QA PASS" : null;

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
      meterNo: item?.meterNo || raw?.ast?.astData?.astNo || "NAv",
      erfId: premise?.erfId || raw?.property?.erfId || null,
      erfNo: premise?.erfNo || raw?.property?.erfNo || "NAv",
      address: item?.address || premise?.addressText || premise?.address || "NAv",
      addressLine: item?.address || premise?.addressText || premise?.address || "NAv",
      lastWorkedAt: toWorkedMillis(
        item?.updatedAt || raw?.metadata?.updatedAt || item?.createdAt || raw?.metadata?.createdAt,
      ),
      mapPosition,
      mapSource: astGps ? "GPS" : premiseGps ? "ERF" : null,
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
