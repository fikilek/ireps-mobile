import NetInfo from "@react-native-community/netinfo";
import { Alert, AppState } from "react-native";
import { processSubmissionQueue } from "./processSubmissionQueue";
import { clearConfirmedSubmissions, getSubmissionQueue, updateSubmissionQueueItem } from "../utils/submissionQueue";

let unsubscribeNetInfo = null;
let appStateSubscription = null;
let lastRunAt = 0;
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


const MIN_GAP_BETWEEN_RUNS_MS = 4000;

const runQueueSync = async () => {
  lastRunAt = Date.now();

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

  console.log("[SAVED WORK SYNC] run finished", {
    success: result?.success === true,
    code: result?.code || "NAv",
    message: result?.message || "NAv",
    failedRunCount,
  });

  if (result?.code === "QUEUE_BUSY") {
    scheduleMeterDiscoveryQueueSyncRetry();
    return result;
  } else if (result?.success) {
    failedRunCount = 0;
  } else {
    const step = Math.min(failedRunCount, RETRY_LADDER_MS.length - 1);

    failedRunCount += 1;

    scheduleMeterDiscoveryQueueSyncRetry({ delayMs: RETRY_LADDER_MS[step] });
  }

  // A result arriving after the form's 15-second wait still reaches the worker.
  if (AppState.currentState === "active") {
    const finished = (await getSubmissionQueue()).filter((item) => item?.payload?.accessData?.access?.hasAccess === "no" &&
      !item.outcomeNotified && ["SUCCESS", "CONFLICT"].includes(item.status));
    if (finished.length) {
      const recorded = finished.filter((item) => item.status === "SUCCESS").length;
      const refused = finished.filter((item) => item.status === "CONFLICT");
      Alert.alert("No Access results", [recorded ? `${recorded} visit(s) recorded.` : "",
        ...refused.map((item) => `${item.context?.meterNo || item.context?.erfNo || "Visit"}: ${item.result?.message || "The office refused this visit."}`),
        refused.length ? "Open Submission Queue to correct the refused visits." : ""].filter(Boolean).join("\n"));
      for (const item of finished) await updateSubmissionQueueItem(item.id, { outcomeNotified: true });
    }
    await clearConfirmedSubmissions();
  }

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

  // Android pauses the app's JavaScript while it is in the background, so the signal coming back
  // is often never heard: a worker turns airplane mode off from the notification shade, with the
  // app behind it, and the NetInfo event is lost. Coming back to the app is the moment we know
  // for certain that JavaScript is running again (the owner's phone, 28 September: it only ever
  // sent on a reload).
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      if (Date.now() - lastRunAt < MIN_GAP_BETWEEN_RUNS_MS) return;

      void runQueueSync();
    });
  }

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

    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  };
};
