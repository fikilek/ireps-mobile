import { createFollowingSubscription, idsFromKey, idsKey, listenInChunks } from "../../redux/liveSubscription.js";
import { summarizeMdBgoCardRows } from "./bgoBatchCardModel.js";

export function followMdBgoCardRows({ batchIds, listen, onChange }) {
  let rows = [];
  const ids = idsFromKey(idsKey(batchIds));
  const follow = createFollowingSubscription({
    subscribe: (_key, { isCurrent, live, fail }) => listenInChunks({
      ids,
      listen,
      next: (docs, meta) => {
        if (!isCurrent()) return;
        rows = docs;
        live(meta);
      },
      error: fail,
    }),
    onStatus: (stream, error) => onChange({
      countsByBatchId: stream === "LIVE" ? summarizeMdBgoCardRows(ids, rows) : {},
      stream,
      error: error?.message || null,
    }),
  });
  follow.setKey(idsKey(ids));
  return () => follow.stop();
}
