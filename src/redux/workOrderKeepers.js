// TB-R052: the three most recently opened batches stay live for up to 24 hours after the worker leaves them, so
// opening one again is instant: a targeted batch's meters, and a BGO batch's TRNs. Sign-out lets them all go.
import {
  lifecycleInstructionApi,
  wmsWorkItemsCacheKey,
} from "./lifecycleInstructionApi";
import { createBatchKeeper } from "./liveSubscription";
import { targetedBatchApi } from "./targetedBatchApi";

let targetedBatchRowsKeeper = null;
let bgoBatchWorkItemsKeeper = null;
// The query arguments of each kept BGO batch, by its cache key. A BGO batch is kept by its cache key (worker, role,
// service provider and BGO batch), so new arguments for the same batch hold a new entry and the old one is let go
// in turn.
const bgoBatchArgs = new Map();

export function keepTargetedBatchRows(dispatch, tbId) {
  if (!targetedBatchRowsKeeper) {
    targetedBatchRowsKeeper = createBatchKeeper({
      hold: (id) => {
        const subscription = dispatch(
          targetedBatchApi.endpoints.getTargetedBatchRows.initiate({ tbId: id }),
        );
        return () => subscription.unsubscribe();
      },
    });
  }

  targetedBatchRowsKeeper.keep(tbId);
}

// args are the same query arguments the screen reads the BGO batch with.
export function keepBgoBatchWorkItems(dispatch, args = {}) {
  if (!String(args?.bgoBatchId || "").trim()) return;

  if (!bgoBatchWorkItemsKeeper) {
    bgoBatchWorkItemsKeeper = createBatchKeeper({
      hold: (key) => {
        const subscription = dispatch(
          lifecycleInstructionApi.endpoints.getWmsBgoBatchWorkItems.initiate(bgoBatchArgs.get(key)),
        );
        return () => {
          subscription.unsubscribe();
          bgoBatchArgs.delete(key);
        };
      },
    });
  }

  const key = wmsWorkItemsCacheKey("getWmsBgoBatchWorkItems", args);
  if (!bgoBatchArgs.has(key)) bgoBatchArgs.set(key, args);
  bgoBatchWorkItemsKeeper.keep(key);
}

export function releaseKeptWorkOrders() {
  targetedBatchRowsKeeper?.releaseAll();
  bgoBatchWorkItemsKeeper?.releaseAll();
  targetedBatchRowsKeeper = null;
  bgoBatchWorkItemsKeeper = null;
  bgoBatchArgs.clear();
}
