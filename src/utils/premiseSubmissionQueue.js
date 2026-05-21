import { createMMKV } from "react-native-mmkv";

const STORAGE_KEY = "premise_submission_queue";

const premiseQueueStorage = createMMKV({
  id: "ireps-premise-submission-queue",
});

const nowIso = () => new Date().toISOString();

const generateQueueId = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRM_QUEUE_${Date.now()}_${random}`;
};

const safeArray = (value) => (Array.isArray(value) ? value : []);

const readQueue = () => {
  try {
    const raw = premiseQueueStorage.getString(STORAGE_KEY);
    if (!raw) return [];
    return safeArray(JSON.parse(raw));
  } catch (error) {
    console.log("readPremiseQueue error:", error);
    return [];
  }
};

const writeQueue = (queue) => {
  try {
    premiseQueueStorage.set(STORAGE_KEY, JSON.stringify(safeArray(queue)));
    return { success: true };
  } catch (error) {
    console.log("writePremiseQueue error:", error);
    return {
      success: false,
      error,
    };
  }
};

export const getPremiseQueue = async () => {
  return readQueue();
};

export const getPremiseQueueItemById = async (queueItemId) => {
  const queue = readQueue();
  return queue.find((item) => item?.id === queueItemId) || null;
};

export const addPremiseQueueItem = async ({
  payload = {},
  createdByUid = "SYSTEM",
  createdByUser = "SYSTEM",
}) => {
  try {
    const queue = readQueue();
    const timestamp = nowIso();

    const premiseId = payload?.id || "NAv";

    const newItem = {
      id: generateQueueId(),
      premiseId,

      type: "PREMISE_CREATE",
      status: "PENDING",

      payload,

      result: {
        success: false,
        code: "NAv",
        message: "NAv",
        premiseId: "NAv",
      },

      sync: {
        attempts: 0,
        lastAttemptAt: "NAv",
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

    const updatedQueue = [newItem, ...queue];

    const saveResult = writeQueue(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to save premise queue item locally",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Premise queue item saved locally",
      queueItem: newItem,
    };
  } catch (error) {
    console.log("addPremiseQueueItem error:", error);

    return {
      success: false,
      message: error?.message || "Failed to add premise queue item",
      queueItem: null,
    };
  }
};

export const updatePremiseQueueItem = async (
  id,
  updates = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  try {
    const queue = readQueue();

    const updated = queue.map((item) =>
      item?.id === id
        ? {
            ...item,
            ...updates,
            metadata: {
              ...item?.metadata,
              updatedAt: nowIso(),
              updatedByUid,
              updatedByUser,
            },
          }
        : item,
    );

    const saveResult = writeQueue(updated);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to update premise queue item locally",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Premise queue item updated locally",
      queueItem: updated.find((item) => item?.id === id) || null,
    };
  } catch (error) {
    console.log("updatePremiseQueueItem error:", error);

    return {
      success: false,
      message: error?.message || "Failed to update premise queue item",
      queueItem: null,
    };
  }
};

export const removePremiseQueueItem = async (id) => {
  try {
    const queue = readQueue().filter((item) => item?.id !== id);
    const saveResult = writeQueue(queue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to remove premise queue item locally",
      };
    }

    return {
      success: true,
      message: "Premise queue item removed locally",
    };
  } catch (error) {
    console.log("removePremiseQueueItem error:", error);

    return {
      success: false,
      message: error?.message || "Failed to remove premise queue item",
    };
  }
};

export const clearPremiseQueue = async () => {
  try {
    premiseQueueStorage.remove(STORAGE_KEY);

    return {
      success: true,
      message: "Premise submission queue cleared",
    };
  } catch (error) {
    console.log("clearPremiseQueue error:", error);

    return {
      success: false,
      message: error?.message || "Failed to clear premise queue",
    };
  }
};

export const markPremiseQueueItemSyncing = async (
  id,
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = readQueue().find((q) => q.id === id);
  const attempts = item?.sync?.attempts || 0;

  return await updatePremiseQueueItem(
    id,
    {
      status: "SYNCING",
      sync: {
        ...(item?.sync || {}),
        attempts: attempts + 1,
        lastAttemptAt: nowIso(),
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markPremiseQueueItemSuccess = async (
  id,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  return await updatePremiseQueueItem(
    id,
    {
      status: "SUCCESS",
      result: {
        success: true,
        code: result?.code || "SUCCESS",
        message: result?.message || "Synced",
        premiseId: result?.premiseId || "NAv",
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markPremiseQueueItemFailed = async (
  id,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const existingItem = await getPremiseQueueItemById(id);

  console.log("markPremiseQueueItemFailed -- keeping item PENDING", {
    id,
    previousStatus: existingItem?.status,
    code: result?.code || "FAILED",
    message:
      result?.message || "Sync failed. This draft remains pending for retry.",
    premiseId: result?.premiseId || "NAv",
    result,
  });

  return await updatePremiseQueueItem(
    id,
    {
      status: "PENDING",
      result: {
        success: false,
        code: result?.code || "FAILED",
        message:
          result?.message ||
          "Sync failed. This draft remains pending for retry.",
        premiseId: result?.premiseId || "NAv",
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

export const getPremiseQueueItemByPremiseId = async (premiseId) => {
  try {
    const queue = await getPremiseQueue();

    return (
      (Array.isArray(queue) ? queue : []).find(
        (item) => item?.premiseId === premiseId,
      ) || null
    );
  } catch (error) {
    console.log("getPremiseQueueItemByPremiseId error:", error);
    return null;
  }
};
