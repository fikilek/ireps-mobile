import NetInfo from "@react-native-community/netinfo";

import {
  ensureInformalErfSubmissionIdentity,
  getInformalErfErrorDetails,
  isDeviceOnline,
  isPermanentInformalErfError,
  submitInformalErfOnline,
  withInformalErfTimeout,
} from "./informalErfSubmissionController";
import {
  getInformalErfSubmissionQueue,
  markInformalErfQueueItemFailed,
  markInformalErfQueueItemPermanentFailure,
  markInformalErfQueueItemSuccess,
  markInformalErfQueueItemSyncing,
  updateInformalErfQueueItem,
} from "../utils/informalErfSubmissionQueue";

let isProcessing = false;
let unsubscribeNetInfo = null;
let initialRunTimer = null;
let activeActor = {
  agentUid: "SYSTEM",
  agentName: "SYSTEM",
};

const isQueueItemEligible = (item = {}) => {
  const status = String(item?.status || "").toUpperCase();

  return (
    (status === "PENDING" || status === "SYNCING") &&
    item?.sync?.permanentFailure !== true
  );
};

export const processInformalErfSubmissionQueue = async ({
  agentUid = "SYSTEM",
  agentName = "SYSTEM",
} = {}) => {
  if (isProcessing) {
    return {
      success: false,
      skipped: true,
      message: "Informal ERF queue processing is already in progress.",
    };
  }

  const online = await isDeviceOnline();

  if (!online) {
    return {
      success: false,
      skipped: true,
      message: "Device is offline.",
    };
  }

  isProcessing = true;

  let processedCount = 0;
  let successCount = 0;
  let pendingCount = 0;
  let permanentFailureCount = 0;

  try {
    const queue = await getInformalErfSubmissionQueue();
    const pendingItems = (Array.isArray(queue) ? queue : []).filter(
      isQueueItemEligible,
    );

    console.log(
      `[INFORMAL ERF SYNC] Starting ${pendingItems.length} pending item(s).`,
    );

    if (!pendingItems.length) {
      return {
        success: true,
        processedCount: 0,
        successCount: 0,
        pendingCount: 0,
        permanentFailureCount: 0,
        message: "No pending Informal ERF queue items.",
      };
    }

    for (let index = 0; index < pendingItems.length; index += 1) {
      const item = pendingItems[index];
      processedCount += 1;

      console.log(
        `[INFORMAL ERF SYNC] Item ${index + 1}/${pendingItems.length}: ${item.id}`,
      );

      const identifiedPayload =
        ensureInformalErfSubmissionIdentity(item?.payload || {}, item);

      const identityUpdate = await updateInformalErfQueueItem(
        item.id,
        {
          payload: identifiedPayload,
        },
        agentUid,
        agentName,
      );

      if (!identityUpdate?.success) {
        pendingCount += 1;
        continue;
      }

      await markInformalErfQueueItemSyncing(
        item.id,
        agentUid,
        agentName,
      );

      try {
        const onlineResult = await withInformalErfTimeout(
          submitInformalErfOnline(identifiedPayload),
        );

        await updateInformalErfQueueItem(
          item.id,
          {
            payload: onlineResult.payload,
          },
          agentUid,
          agentName,
        );

        await markInformalErfQueueItemSuccess(
          item.id,
          onlineResult.result,
          agentUid,
          agentName,
        );

        successCount += 1;
      } catch (error) {
        const errorInfo = getInformalErfErrorDetails(error);

        if (isPermanentInformalErfError(error)) {
          await markInformalErfQueueItemPermanentFailure(
            item.id,
            {
              code: errorInfo.code,
              message: errorInfo.message,
              erfId: identifiedPayload.erfId,
              details: errorInfo.details,
            },
            agentUid,
            agentName,
          );

          permanentFailureCount += 1;
          continue;
        }

        await markInformalErfQueueItemFailed(
          item.id,
          {
            code: errorInfo.code,
            message: errorInfo.message,
            erfId: identifiedPayload.erfId,
          },
          agentUid,
          agentName,
        );

        pendingCount += 1;
      }
    }

    console.log("[INFORMAL ERF SYNC] Complete.", {
      processedCount,
      successCount,
      pendingCount,
      permanentFailureCount,
    });

    return {
      success: true,
      processedCount,
      successCount,
      pendingCount,
      permanentFailureCount,
      message: "Informal ERF queue processing completed.",
    };
  } finally {
    isProcessing = false;
  }
};

const runQueueSync = async () => {
  await processInformalErfSubmissionQueue(activeActor);
};

export const startInformalErfQueueSyncService = ({
  agentUid = "SYSTEM",
  agentName = "SYSTEM",
} = {}) => {
  activeActor = {
    agentUid,
    agentName,
  };

  if (unsubscribeNetInfo) {
    return () => {};
  }

  let wasOnline = false;

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const online = Boolean(
      state?.isConnected &&
        state?.isInternetReachable !== false,
    );

    if (online && !wasOnline) {
      void runQueueSync();
    }

    wasOnline = online;
  });

  initialRunTimer = setTimeout(() => {
    void runQueueSync();
  }, 750);

  return () => {
    if (initialRunTimer) {
      clearTimeout(initialRunTimer);
      initialRunTimer = null;
    }

    if (unsubscribeNetInfo) {
      unsubscribeNetInfo();
      unsubscribeNetInfo = null;
    }
  };
};
