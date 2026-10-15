import { useEffect, useState } from "react";
import { getQaDraft, subscribeQaDrafts } from "./amendmentQueue";

// A pending receipt is not permission to create or edit a correction.
export function usePendingQaRecovery(uid, trnId) {
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    if (!uid || !trnId) return;
    const update = () => setCurrent({ uid, trnId,
      pending: Boolean(getQaDraft(uid, trnId)?.pending) });
    const stop = subscribeQaDrafts(update);
    update();
    return stop;
  }, [uid, trnId]);
  return current?.uid === uid && current?.trnId === trnId && current.pending === true;
}
