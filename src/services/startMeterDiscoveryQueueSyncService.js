import NetInfo from "@react-native-community/netinfo";
import { processSubmissionQueue } from "./processSubmissionQueue";
import { clearConfirmedSubmissions } from "../utils/submissionQueue";

let unsubscribeNetInfo = null;
let initialRunTimer = null;
let deferredRetryTimer = null;
let serviceActive = false;
let activeActor = {
  agentUid: "SYSTEM",
  agentName: "SYSTEM",
};

const DEFAULT_DEFERRED_RETRY_MS = 2000;


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

  await clearConfirmedSubmissions();

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
