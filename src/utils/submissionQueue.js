import { createMMKV } from "react-native-mmkv";

const SUBMISSION_QUEUE_STORAGE_KEY = "submission_queue_items";

const submissionQueueStorage = createMMKV({
  id: "ireps-submission-queue-storage",
});

const nowIso = () => new Date().toISOString();

const generateQueueId = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `QUEUE_${Date.now()}_${random}`;
};

const safeArray = (value) => {
  return Array.isArray(value) ? value : [];
};

const readQueueFromStorage = () => {
  try {
    const raw = submissionQueueStorage.getString(SUBMISSION_QUEUE_STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return safeArray(parsed);
  } catch (error) {
    console.log("readQueueFromStorage error:", error);
    return [];
  }
};

const writeQueueToStorage = (queueItems) => {
  try {
    submissionQueueStorage.set(
      SUBMISSION_QUEUE_STORAGE_KEY,
      JSON.stringify(safeArray(queueItems)),
    );

    return { success: true };
  } catch (error) {
    console.log("writeQueueToStorage error:", error);
    return {
      success: false,
      error,
    };
  }
};

export const getSubmissionQueue = async () => {
  return readQueueFromStorage();
};

export const getSubmissionQueueItemById = async (queueItemId) => {
  const queue = readQueueFromStorage();
  return queue.find((item) => item?.id === queueItemId) || null;
};

export const addSubmissionQueueItem = async ({
  formType = "NAv",
  payload = {},
  context = {},
  createdByUid = "SYSTEM",
  createdByUser = "SYSTEM",
}) => {
  try {
    const queue = readQueueFromStorage();
    const timestamp = nowIso();

    const newQueueItem = {
      id: generateQueueId(),
      formType,
      status: "PENDING",

      payload,

      result: {
        success: false,
        code: "NAv",
        message: "NAv",
        trnId: "NAv",
      },

      context: {
        trnType:
          context?.trnType ||
          payload?.accessData?.trnType ||
          payload?.trnType ||
          formType ||
          "NAv",

        instructionTrnId:
          context?.instructionTrnId ||
          context?.trnId ||
          payload?.instructionTrnId ||
          payload?.id ||
          payload?.trnId ||
          "NAv",

        sourceAstId:
          context?.sourceAstId ||
          context?.astId ||
          payload?.sourceAstId ||
          payload?.ast?.astData?.astId ||
          "NAv",

        astId:
          context?.astId ||
          context?.sourceAstId ||
          payload?.sourceAstId ||
          payload?.ast?.astData?.astId ||
          "NAv",

        meterNo: context?.meterNo || payload?.ast?.astData?.astNo || "NAv",
        meterType: context?.meterType || payload?.meterType || "NAv",
        erfId: context?.erfId || payload?.accessData?.erfId || "NAv",
        erfNo: context?.erfNo || payload?.accessData?.erfNo || "NAv",
        premiseId:
          context?.premiseId || payload?.accessData?.premise?.id || "NAv",
        lmPcode:
          context?.lmPcode || payload?.accessData?.parents?.lmPcode || "NAv",
        wardPcode:
          context?.wardPcode ||
          payload?.accessData?.parents?.wardPcode ||
          "NAv",
      },

      sync: {
        attempts: 0,
        lastAttemptAt: "NAv",
        nextRetryAt: "NAv",
      },

      metadata: {
        createdAt: timestamp,
        createdByUid,
        createdByUser,
        updatedAt: timestamp,
        updatedByUid: createdByUid,
        updatedByUser: createdByUser,
      },
    };

    const updatedQueue = [newQueueItem, ...queue];
    const saveResult = writeQueueToStorage(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to save queue item locally",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Queue item saved locally",
      queueItem: newQueueItem,
    };
  } catch (error) {
    console.log("addSubmissionQueueItem error:", error);

    return {
      success: false,
      message: error?.message || "Failed to add queue item",
      queueItem: null,
    };
  }
};

export const updateSubmissionQueueItem = async (
  queueItemId,
  updates = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  try {
    const queue = readQueueFromStorage();

    const updatedQueue = queue.map((item) => {
      if (item?.id !== queueItemId) return item;

      return {
        ...item,
        ...updates,
        metadata: {
          ...item?.metadata,
          updatedAt: nowIso(),
          updatedByUid,
          updatedByUser,
        },
      };
    });

    const saveResult = writeQueueToStorage(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to update queue item locally",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Queue item updated locally",
      queueItem: updatedQueue.find((item) => item?.id === queueItemId) || null,
    };
  } catch (error) {
    console.log("updateSubmissionQueueItem error:", error);

    return {
      success: false,
      message: error?.message || "Failed to update queue item",
      queueItem: null,
    };
  }
};

export const markSubmissionQueueItemSyncing = async (
  queueItemId,
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const existingItem = await getSubmissionQueueItemById(queueItemId);
  const attempts = existingItem?.sync?.attempts || 0;

  return await updateSubmissionQueueItem(
    queueItemId,
    {
      status: "SYNCING",
      sync: {
        ...(existingItem?.sync || {}),
        attempts: attempts + 1,
        lastAttemptAt: nowIso(),
        nextRetryAt: "NAv",
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markSubmissionQueueItemSuccess = async (
  queueItemId,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  return await updateSubmissionQueueItem(
    queueItemId,
    {
      status: "SUCCESS",
      result: {
        success: true,
        code: result?.code || "SUCCESS",
        message: result?.message || "Synced successfully",
        trnId: result?.trnId || "NAv",
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markSubmissionQueueItemFailed = async (
  queueItemId,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const existingItem = await getSubmissionQueueItemById(queueItemId);

  console.log("markSubmissionQueueItemFailed -- keeping item PENDING", {
    queueItemId,
    previousStatus: existingItem?.status,
    code: result?.code || "SYNC_FAILED",
    message:
      result?.message || "Sync failed. This draft remains pending for retry.",
    trnId: result?.trnId || "NAv",
    result,
  });

  return await updateSubmissionQueueItem(
    queueItemId,
    {
      status: "PENDING",
      result: {
        success: false,
        code: result?.code || "SYNC_FAILED",
        message:
          result?.message ||
          "Sync failed. This draft remains pending for retry.",
        trnId: result?.trnId || "NAv",
      },
      sync: {
        ...(existingItem?.sync || {}),
        nextRetryAt: "NAv",
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const removeSubmissionQueueItem = async (queueItemId) => {
  try {
    const queue = readQueueFromStorage();

    const updatedQueue = queue.filter((item) => item?.id !== queueItemId);

    const saveResult = writeQueueToStorage(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to remove queue item locally",
      };
    }

    return {
      success: true,
      message: "Queue item removed locally",
    };
  } catch (error) {
    console.log("removeSubmissionQueueItem error:", error);

    return {
      success: false,
      message: error?.message || "Failed to remove queue item",
    };
  }
};

export const clearSubmissionQueue = async () => {
  try {
    submissionQueueStorage.remove(SUBMISSION_QUEUE_STORAGE_KEY);

    return {
      success: true,
      message: "Submission queue cleared",
    };
  } catch (error) {
    console.log("clearSubmissionQueue error:", error);

    return {
      success: false,
      message: error?.message || "Failed to clear submission queue",
    };
  }
};

function cleanQueueText(value, fallback = "NAv") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function normalizeQueueUpper(value) {
  return cleanQueueText(value, "").trim().toUpperCase();
}

function readServerTrnId(serverTrn = {}) {
  return cleanQueueText(serverTrn?.id || serverTrn?.trnId, "");
}

function readServerTrnType(serverTrn = {}) {
  return normalizeQueueUpper(
    serverTrn?.accessData?.trnType ||
      serverTrn?.trnType ||
      serverTrn?.assignment?.instruction?.code,
  );
}

function readServerWorkflowState(serverTrn = {}) {
  return normalizeQueueUpper(
    serverTrn?.workflow?.state || serverTrn?.workflowState,
  );
}

function readQueueInstructionTrnId(queueItem = {}) {
  return cleanQueueText(
    queueItem?.context?.instructionTrnId ||
      queueItem?.context?.trnId ||
      queueItem?.payload?.instructionTrnId ||
      queueItem?.payload?.id ||
      queueItem?.payload?.trnId ||
      queueItem?.result?.trnId,
    "",
  );
}

export const removeSubmissionQueueItemsByInstructionTrnId = async (
  instructionTrnId,
  { updatedByUid = "SYSTEM", updatedByUser = "SYSTEM" } = {},
) => {
  try {
    const cleanInstructionTrnId = cleanQueueText(instructionTrnId, "");

    if (!cleanInstructionTrnId) {
      return {
        success: false,
        removedCount: 0,
        removedItemIds: [],
        message: "Instruction TRN id is required for local queue cleanup.",
      };
    }

    const queue = readQueueFromStorage();
    const removedItems = [];

    const updatedQueue = queue.filter((item) => {
      const itemInstructionTrnId = readQueueInstructionTrnId(item);

      const matchesInstructionTrn =
        itemInstructionTrnId === cleanInstructionTrnId;

      if (matchesInstructionTrn) {
        removedItems.push(item);
        return false;
      }

      return true;
    });

    if (!removedItems.length) {
      return {
        success: true,
        removedCount: 0,
        removedItemIds: [],
        message: "No matching local queue item found for this instruction TRN.",
      };
    }

    const saveResult = writeQueueToStorage(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        removedCount: 0,
        removedItemIds: [],
        message: "Failed to remove matching local queue item(s).",
      };
    }

    const removedItemIds = removedItems.map((item) => item?.id).filter(Boolean);

    console.log(
      "removeSubmissionQueueItemsByInstructionTrnId -- removed matching queue items",
      {
        instructionTrnId: cleanInstructionTrnId,
        removedCount: removedItems.length,
        removedItemIds,
        updatedByUid,
        updatedByUser,
      },
    );

    return {
      success: true,
      removedCount: removedItems.length,
      removedItemIds,
      message: `${removedItems.length} matching local queue item(s) removed.`,
    };
  } catch (error) {
    console.log("removeSubmissionQueueItemsByInstructionTrnId error:", {
      instructionTrnId,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
      raw: error,
    });

    return {
      success: false,
      removedCount: 0,
      removedItemIds: [],
      message: error?.message || "Failed to remove matching local queue items.",
    };
  }
};

function readQueueTrnType(queueItem = {}) {
  return normalizeQueueUpper(
    queueItem?.context?.trnType ||
      queueItem?.payload?.accessData?.trnType ||
      queueItem?.payload?.trnType ||
      queueItem?.formType,
  );
}

function isLifecycleQueueItem(queueItem = {}) {
  const trnType = readQueueTrnType(queueItem);

  return [
    "METER_INSPECTION",
    "METER_DISCONNECTION",
    "METER_RECONNECTION",
    "METER_REMOVAL",
    "METER_READING",
  ].includes(trnType);
}

function isCompletedLifecycleServerTrn(serverTrn = {}) {
  const serverTrnId = readServerTrnId(serverTrn);
  const serverTrnType = readServerTrnType(serverTrn);
  const workflowState = readServerWorkflowState(serverTrn);

  if (!serverTrnId) return false;
  if (workflowState !== "COMPLETED") return false;

  return [
    "METER_INSPECTION",
    "METER_DISCONNECTION",
    "METER_RECONNECTION",
    "METER_REMOVAL",
    "METER_READING",
  ].includes(serverTrnType);
}

export const reconcileSubmissionQueueWithServerTrns = async ({
  trns = [],
  updatedByUid = "WMS_TRN_STREAM",
  updatedByUser = "WMS TRN Stream",
} = {}) => {
  try {
    const queue = readQueueFromStorage();

    if (!Array.isArray(queue) || queue.length === 0) {
      return {
        success: true,
        changedCount: 0,
        message: "No local queue items to reconcile.",
      };
    }

    const completedLifecycleTrns = (Array.isArray(trns) ? trns : []).filter(
      isCompletedLifecycleServerTrn,
    );

    if (!completedLifecycleTrns.length) {
      return {
        success: true,
        changedCount: 0,
        message: "No completed lifecycle TRNs found in stream.",
      };
    }

    const completedById = new Map();

    completedLifecycleTrns.forEach((serverTrn) => {
      const serverTrnId = readServerTrnId(serverTrn);
      if (serverTrnId) {
        completedById.set(serverTrnId, serverTrn);
      }
    });

    let changedCount = 0;
    const timestamp = nowIso();

    const updatedQueue = queue.map((queueItem) => {
      if (!queueItem?.id) return queueItem;
      if (queueItem?.status === "SUCCESS") return queueItem;
      if (!isLifecycleQueueItem(queueItem)) return queueItem;

      const queueInstructionTrnId = readQueueInstructionTrnId(queueItem);
      if (!queueInstructionTrnId) return queueItem;

      const serverTrn = completedById.get(queueInstructionTrnId);
      if (!serverTrn) return queueItem;

      changedCount += 1;

      return {
        ...queueItem,
        status: "SUCCESS",
        result: {
          success: true,
          code: "SERVER_CONFIRMED",
          message:
            "Server confirmed this lifecycle TRN was completed successfully.",
          trnId: readServerTrnId(serverTrn),
        },
        sync: {
          ...(queueItem?.sync || {}),
          serverConfirmedAt: timestamp,
          nextRetryAt: "NAv",
        },
        metadata: {
          ...(queueItem?.metadata || {}),
          updatedAt: timestamp,
          updatedByUid,
          updatedByUser,
        },
      };
    });

    if (!changedCount) {
      return {
        success: true,
        changedCount: 0,
        message: "No matching lifecycle queue items needed reconciliation.",
      };
    }

    const saveResult = writeQueueToStorage(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        changedCount: 0,
        message: "Failed to reconcile local queue with server TRN stream.",
      };
    }

    return {
      success: true,
      changedCount,
      message: `${changedCount} lifecycle queue item(s) reconciled from server stream.`,
    };
  } catch (error) {
    console.log("reconcileSubmissionQueueWithServerTrns error:", error);

    return {
      success: false,
      changedCount: 0,
      message: error?.message || "Queue reconciliation failed.",
    };
  }
};

export function getCallableNameForSubmissionQueueItem(queueItem = {}) {
  const formType = String(queueItem?.formType || "")
    .trim()
    .toUpperCase();

  const trnType = String(
    queueItem?.context?.trnType ||
      queueItem?.payload?.accessData?.trnType ||
      queueItem?.payload?.trnType ||
      "",
  )
    .trim()
    .toUpperCase();

  if (formType === "METER_INSTALLATION" || trnType === "METER_INSTALLATION") {
    return "onMeterInstallationCallable";
  }

  if (formType === "METER_DISCOVERY" || trnType === "METER_DISCOVERY") {
    return "onMeterDiscoveryCallable";
  }

  if (
    [
      "METER_INSPECTION",
      "METER_DISCONNECTION",
      "METER_RECONNECTION",
      "METER_REMOVAL",
      "METER_READING",
    ].includes(formType) ||
    [
      "METER_INSPECTION",
      "METER_DISCONNECTION",
      "METER_RECONNECTION",
      "METER_REMOVAL",
      "METER_READING",
    ].includes(trnType)
  ) {
    return "onMeterLifecycleTrnCallable";
  }

  if (formType === "METER_COMMISSIONING" || trnType === "METER_COMMISSIONING") {
    return "onCreateMeterCommissioningCallable";
  }

  return null;
}
