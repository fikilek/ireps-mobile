const upper = (value) => String(value || "").trim().toUpperCase();

export function canOpenMdBgoRows(workflowState, releaseState) {
  return ["ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(upper(workflowState)) &&
    upper(releaseState) === "RELEASED_TO_EXECUTION";
}

// Work rows are the unit of progress. QA has no authoritative row projection yet.
export function summarizeMdBgoCardRows(batchIds = [], rows = []) {
  const result = Object.fromEntries(batchIds.map((id) => [id, {
    total: 0, notStarted: 0, inProgress: 0, completed: 0, qaPass: null, qaFail: null,
  }]));
  const seen = new Set();
  for (const row of rows) {
    const counts = result[row?.bgoBatchId];
    if (!counts || upper(row?.batchMode) !== "BMD" || upper(row?.operationType) !== "METER_DISCOVERY") continue;
    const state = upper(row?.workflow?.state);
    if (state === "CANCELLED" || seen.has(row.id)) continue;
    seen.add(row.id);
    counts.total += 1;
    if (state === "IN_PROGRESS") counts.inProgress += 1;
    else if (state === "COMPLETED") counts.completed += 1;
    else if (["READY_FOR_ALLOCATION", "ISSUED", "ALLOCATED"].includes(state)) {
      if (counts.notStarted !== null) counts.notStarted += 1;
    }
    else {
      // An unrecognized workflow must not be quietly reported as unstarted.
      counts.notStarted = null;
    }
  }
  return result;
}
