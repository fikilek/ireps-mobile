import { createFollowingSubscription, idsKey, idsFromKey, listenInChunks, combineLiveStatuses } from "../../redux/liveSubscription.js";

export function followMdBgoAssets({ premiseIds = [], meterIds = [], erfIds = [], listen, onChange }) {
  const data = { premises: [], meters: [], erfs: [] };
  const groups = [["premises", "premises", premiseIds], ["meters", "asts", meterIds], ["erfs", "ireps_erfs", erfIds]];
  const statuses = Object.fromEntries(groups.map(([key, _collection, ids]) => [key, ids.length ? "CONNECTING" : "LIVE"]));
  const errors = {};
  const publish = () => onChange({ ...data, stream: combineLiveStatuses(Object.values(statuses)), error: Object.values(errors).filter(Boolean).join("; ") || null });
  const follows = groups.filter(([_key, _collection, ids]) => ids.length).map(([key, collection, ids]) => {
    const follow = createFollowingSubscription({
      subscribe: (_idKey, { isCurrent, live, fail }) => listenInChunks({
        ids: idsFromKey(idsKey(ids)), listen: (values, next, error) => listen(collection, values, next, error),
        next: (docs, meta) => { if (isCurrent()) { data[key] = docs; live(meta); } }, error: fail,
      }),
      onStatus: (stream, error) => { statuses[key] = stream; errors[key] = error?.message || null; publish(); },
    });
    follow.setKey(idsKey(ids));
    return follow;
  });
  publish();
  return () => follows.forEach((follow) => follow.stop());
}
