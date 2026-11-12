import { createFollowingSubscription, idsFromKey, idsKey, listenInChunks } from "../../redux/liveSubscription.js";
import { targetedBatchRowStatus } from "./targetedBatchRowSearch.js";

export function summarizeTargetedCardRows(ids, rows) {
  const counts = Object.fromEntries(ids.map(id => [id, { total: 0, notStarted: 0, inProgress: 0, completed: 0, qaPass: 0, qaFail: 0 }]));
  const keys = { NOT_STARTED: "notStarted", IN_PROGRESS: "inProgress", COMPLETED: "completed", QA_PASS: "qaPass", QA_FAIL: "qaFail" };
  for (const row of rows) {
    const value = counts[row.tbId];
    if (!value) continue;
    value.total++;
    value[keys[targetedBatchRowStatus({ ...row, executionStatus: row.execution?.status })]]++;
  }
  return counts;
}

export function followTargetedCardRows({ batchIds, listen, onChange }) {
  const ids = idsFromKey(idsKey(batchIds));
  let rows = [];
  const follow = createFollowingSubscription({
    subscribe: (_key, { isCurrent, live, fail }) => listenInChunks({ ids, listen,
      next: (docs, meta) => { if (isCurrent()) { rows = docs; live(meta); } }, error: fail }),
    onStatus: (stream, error) => onChange({ stream, error, countsByBatchId: stream === "LIVE" ? summarizeTargetedCardRows(ids, rows) : {} }),
  });
  follow.setKey(idsKey(ids));
  return () => follow.stop();
}
