import { createFollowingSubscription, idsFromKey, idsKey, listenInChunks, combineLiveStatuses } from "../../redux/liveSubscription.js";
import { summarizeMdBgoCardRows } from "./bgoBatchCardModel.js";
import { buildMdBgoMobileRows } from "./mdBgoRows.js";
import { followMdBgoAssets } from "./mdBgoAssetStream.js";
import { mdBgoTrnId } from "./mdBgoQa.js";

export function followMdBgoCardRows({ batchIds, listen, listenDocuments, onChange }) {
  let rows = [];
  let rowStatus = "CONNECTING", rowError = null, qaKey = null;
  let qa = { stream: "CONNECTING", premises: [], trns: [] };
  let stopQa = () => {}, ended = false;
  const ids = idsFromKey(idsKey(batchIds));
  const publish = () => {
    if (ended) return;
    const stream = combineLiveStatuses([rowStatus, qa.stream]);
    onChange({
      countsByBatchId: stream === "LIVE" ? summarizeMdBgoCardRows(ids, buildMdBgoMobileRows({ rows, premises: qa.premises, trns: qa.trns })) : {},
      stream, error: rowError || qa.error || null,
    });
  };
  const followQa = () => {
    const premiseIds = rows.map(row => row.refs?.premiseId).filter(Boolean);
    const trnIds = rows.map(mdBgoTrnId).filter(Boolean);
    const key = JSON.stringify([idsKey(premiseIds), idsKey(trnIds)]);
    if (key === qaKey) return;
    stopQa(); qaKey = key;
    qa = { stream: "CONNECTING", premises: [], trns: [] };
    stopQa = followMdBgoAssets({ premiseIds, trnIds, listen: listenDocuments,
      onChange: data => { if (!ended && qaKey === key) { qa = data; publish(); } },
    });
  };
  const follow = createFollowingSubscription({
    subscribe: (_key, { isCurrent, live, fail }) => listenInChunks({
      ids,
      listen,
      next: (docs, meta) => {
        if (!isCurrent()) return;
        rows = docs;
        followQa();
        live(meta);
      },
      error: fail,
    }),
    onStatus: (stream, error) => { rowStatus = stream; rowError = error?.message || null; publish(); },
  });
  follow.setKey(idsKey(ids));
  return () => { ended = true; follow.stop(); stopQa(); };
}
