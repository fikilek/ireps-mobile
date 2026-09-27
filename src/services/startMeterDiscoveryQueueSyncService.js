import NetInfo from "@react-native-community/netinfo";
import { processSubmissionQueue } from "./processSubmissionQueue";
import {
  getSubmissionQueue,
  removeSubmissionQueueItem,
} from "../utils/submissionQueue";

let unsubscribeNetInfo = null;
let initialRunTimer = null;
let deferredRetryTimer = null;
let serviceActive = false;
let activeActor = {
  agentUid: "SYSTEM",
  agentName: "SYSTEM",
};

const DEFAULT_DEFERRED_RETRY_MS = 2000;


// OF-R001: a capture the office has accepted is cleared off the phone.
//
// The form clears its own when the answer comes back inside its 15 seconds. When the capture
// went out later, in the background, nothing cleared it - so a meter sent this way stayed in
// Saved Work reading SUCCESS for ever, and a worker would have collected one per meter they
// finished. The evidence is already deleted by then; this removes the record of the send.
//
// Only this service does it. A form waiting on processSubmissionQueue reads the item back to
// see how it went, so the queue must not delete it underneath that read.
const clearSentMeterDiscoveries = async () => {
  try {
    const queue = await getSubmissionQueue();

    for (const item of Array.isArray(queue) ? queue : []) {
      const formType = String(item?.formType || "").trim().toUpperCase();

      if (formType !== "METER_DISCOVERY") continue;
      if (item?.status !== "SUCCESS") continue;
      if (item?.result?.success !== true) continue;

      await removeSubmissionQueueItem(item.id);
    }
  } catch (error) {
    // Never let tidying up break the sending.
    console.log("clearSentMeterDiscoveries -- failed", {
      message: error?.message || String(error),
    });
  }
};

const runQueueSync = async () => {
  const result = await processSubmissionQueue({
    ...activeActor,
    // OF-R001: the whole form now, not only No Access. A meter that was found is saved
    // on the phone the same way, so it needs the same service to send it.
    filterMode: "METER_DISCOVERY",
    includeSyncing: true,
  });

  if (result?.code === "QUEUE_BUSY") {
    scheduleMeterDiscoveryQueueSyncRetry();
  }

  await clearSentMeterDiscoveries();

  return result;
};

export const scheduleMeterDiscoveryQueueSyncRetry = ({
  agentUid,
  agentName,
  delayMs = DEFAULT_DEFERRED_RETRY_MS,
} = {}) => {
  if (agentUid) {
    activeActor = {
      agentUid,
      agentName: agentName || activeActor.agentName || "SYSTEM",
    };
  }

  if (!serviceActive || deferredRetryTimer) return false;

  deferredRetryTimer = setTimeout(() => {
    deferredRetryTimer = null;
    void runQueueSync();
  }, Math.max(250, Number(delayMs) || DEFAULT_DEFERRED_RETRY_MS));

  return true;
};

export const startMeterDiscoveryQueueSyncService = ({
  agentUid = "SYSTEM",
  agentName = "SYSTEM",
} = {}) => {
  activeActor = {
    agentUid,
    agentName,
  };
  serviceActive = true;

  if (unsubscribeNetInfo) {
    return () => {};
  }

  let wasOnline = false;

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const online = Boolean(
      state?.isConnected && state?.isInternetReachable !== false,
    );

    if (online && !wasOnline) {
      void runQueueSync();
    }

    wasOnline = online;
  });

  initialRunTimer = setTimeout(() => {
    initialRunTimer = null;
    void runQueueSync();
  }, 750);

  return () => {
    serviceActive = false;

    if (initialRunTimer) {
      clearTimeout(initialRunTimer);
      initialRunTimer = null;
    }

    if (deferredRetryTimer) {
      clearTimeout(deferredRetryTimer);
      deferredRetryTimer = null;
    }

    if (unsubscribeNetInfo) {
      unsubscribeNetInfo();
      unsubscribeNetInfo = null;
    }
  };
};
