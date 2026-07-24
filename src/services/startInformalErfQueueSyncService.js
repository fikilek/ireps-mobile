import NetInfo from "@react-native-community/netinfo";

import {
  ensureInformalErfSubmissionIdentity,
  getInformalErfErrorDetails,
  isDeviceOnline,
  isPermanentInformalErfError,
  isRetriableInformalErfError,
  submitInformalErfOnline,
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

const cleanText = (value, fallback = "") => {
  const clean = String(value ?? "").trim();
  return clean || fallback;
};

const hasAuthenticatedActor = (agentUid) => {
  const uid = cleanText(agentUid);
  return Boolean(uid && uid.toUpperCase() !== "SYSTEM");
};

const isQueueItemEligible = (item = {}, agentUid) => {
  const status = String(item?.status || "").toUpperCase();
  const ownerUid = cleanText(item?.metadata?.createdByUid);

  return (
    (status === "PENDING" || status === "SYNCING") &&
    item?.sync?.permanentFailure !== true &&
    ownerUid === cleanText(agentUid)
  );
};

export const processInformalErfSubmissionQueue = async ({
  agentUid = "SYSTEM",
  agentName = "SYSTEM",
} = {}) => {
  if (!hasAuthenticatedActor(agentUid)) {
    return {
      success: false,
      skipped: true,
      processedCount: 0,
      message: "Informal ERF queue sync requires an authenticated user.",
    };
  }

  if (isProcessing) {
    return {
      success: false,
      skipped: true,
      processedCount: 0,
      message: "Informal ERF queue processing is already in progress.",
    };
  }

  const online = await isDeviceOnline();

  if (!online) {
    return {
      success: false,
      skipped: true,
      processedCount: 0,
      message: "Device is offline.",
    };
  }

  isProcessing = true;

  let processedCount = 0;
  let successCount = 0;
  let pendingCount = 0;
  let permanentFailureCount = 0;
  let skippedOwnerCount = 0;

  try {
    const queue = await getInformalErfSubmissionQueue();
    const allItems = Array.isArray(queue) ? queue : [];
    const pendingItems = allItems.filter((item) =>
      isQueueItemEligible(item, agentUid),
    );

    skippedOwnerCount = allItems.filter((item) => {
      const status = String(item?.status || "").toUpperCase();
      const pending = status === "PENDING" || status === "SYNCING";
      const ownerUid = cleanText(item?.metadata?.createdByUid);

      return pending && ownerUid && ownerUid !== cleanText(agentUid);
    }).length;

    console.log(
      `[INFORMAL ERF SYNC] Starting ${pendingItems.length} pending item(s) for ${agentUid}.`,
      { skippedOwnerCount },
    );

    if (!pendingItems.length) {
      return {
        success: true,
        processedCount: 0,
        successCount: 0,
        pendingCount: 0,
        permanentFailureCount: 0,
        skippedOwnerCount,
        message: "No pending Informal ERF queue items for this user.",
      };
    }

    for (let index = 0; index < pendingItems.length; index += 1) {
      const item = pendingItems[index];
      processedCount += 1;

      console.log(
        `[INFORMAL ERF SYNC] Item ${index + 1}/${pendingItems.length}: ${item.id}`,
        { erfId: item?.payload?.erfId },
      );

      const identifiedPayload = ensureInformalErfSubmissionIdentity(
        item?.payload || {},
        item,
      );

      const identityUpdate = await updateInformalErfQueueItem(
        item.id,
        {
          payload: identifiedPayload,
        },
        agentUid,
        agentName,
      );

      if (!identityUpdate?.success) {
        console.error("[INFORMAL ERF SYNC] Identity update failed.", {
          queueItemId: item.id,
          erfId: identifiedPayload.erfId,
        });
        pendingCount += 1;
        continue;
      }

      await markInformalErfQueueItemSyncing(
        item.id,
        agentUid,
        agentName,
      );

      try {
        const onlineResult = await submitInformalErfOnline(identifiedPayload);

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

        console.log("[INFORMAL ERF SYNC] Item completed.", {
          queueItemId: item.id,
          erfId: onlineResult?.result?.erfId || identifiedPayload.erfId,
          parcelNo: onlineResult?.result?.parcelNo || null,
        });

        successCount += 1;
      } catch (error) {
        const errorInfo = getInformalErfErrorDetails(error);

        if (error?.preparedPayload) {
          await updateInformalErfQueueItem(
            item.id,
            {
              payload: error.preparedPayload,
            },
            agentUid,
            agentName,
          );
        }

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

          console.warn("[INFORMAL ERF SYNC] Item permanently rejected.", {
            queueItemId: item.id,
            erfId: identifiedPayload.erfId,
            code: errorInfo.code,
          });

          permanentFailureCount += 1;
          continue;
        }

        if (!isRetriableInformalErfError(error)) {
          await markInformalErfQueueItemPermanentFailure(
            item.id,
            {
              code: errorInfo.code || "UNCLASSIFIED_FAILURE",
              message:
                `Sync stopped because the failure was not classified as temporary: ${errorInfo.message}`,
              erfId: identifiedPayload.erfId,
              details: errorInfo.details,
            },
            agentUid,
            agentName,
          );

          console.error("[INFORMAL ERF SYNC] Unclassified failure stopped.", {
            queueItemId: item.id,
            erfId: identifiedPayload.erfId,
            code: errorInfo.code,
          });

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

        console.error("[INFORMAL ERF SYNC] Temporary failure remains pending.", {
          queueItemId: item.id,
          erfId: identifiedPayload.erfId,
          code: errorInfo.code,
        });

        pendingCount += 1;
      }
    }

    console.log("[INFORMAL ERF SYNC] Complete.", {
      processedCount,
      successCount,
      pendingCount,
      permanentFailureCount,
      skippedOwnerCount,
    });

    return {
      success: true,
      processedCount,
      successCount,
      pendingCount,
      permanentFailureCount,
      skippedOwnerCount,
      message: "Informal ERF queue processing completed.",
    };
  } finally {
    isProcessing = false;
  }
};

const runQueueSync = async () => {
  try {
    await processInformalErfSubmissionQueue(activeActor);
  } catch (error) {
    console.error("[INFORMAL ERF SYNC] Queue service failed.", error);
  }
};

export const stopInformalErfQueueSyncService = () => {
  if (initialRunTimer) {
    clearTimeout(initialRunTimer);
    initialRunTimer = null;
  }

  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }

  activeActor = {
    agentUid: "SYSTEM",
    agentName: "SYSTEM",
  };
};

export const startInformalErfQueueSyncService = ({
  agentUid = "SYSTEM",
  agentName = "SYSTEM",
} = {}) => {
  activeActor = {
    agentUid,
    agentName,
  };

  if (!hasAuthenticatedActor(agentUid)) {
    stopInformalErfQueueSyncService();
    return () => {};
  }

  if (unsubscribeNetInfo) {
    void runQueueSync();
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

  return stopInformalErfQueueSyncService;
};
