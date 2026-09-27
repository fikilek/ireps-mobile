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

// OF-R002 section 5: a run that did not get the work out books its own next try. The network
// listener only fires when the signal CHANGES, so a run that failed just after the signal came
// back would otherwise wait for a change that never comes.
const RETRY_LADDER_MS = [60000, 300000, 900000, 3600000];
let failedRunCount = 0;


const runQueueSync = async () => {
  const result = await processSubmissionQueue({
    ...activeActor,
    // OF-R001: the whole form now, not only No Access. A meter that was found is saved
    // on the phone the same way, so it needs the same service to send it.
    //
    // 27 September: Targeted Batch No Access too. Its dialog promised the capture would sync by
    // itself, and no service ever looked at it. A form is added to AUTO_SEND only when its submit
    // path has been proved offline first (processSubmissionQueue).
    filterMode: "AUTO_SEND",
    includeSyncing: true,
  });

  if (result?.code === "QUEUE_BUSY") {
    scheduleMeterDiscoveryQueueSyncRetry();
  } else if (result?.success) {
    failedRunCount = 0;
  } else {
    const step = Math.min(failedRunCount, RETRY_LADDER_MS.length - 1);

    failedRunCount += 1;

    scheduleMeterDiscoveryQueueSyncRetry({ delayMs: RETRY_LADDER_MS[step] });
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
