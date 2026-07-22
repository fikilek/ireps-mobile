import { createMMKV } from "react-native-mmkv";

const STORAGE_KEY = "informal_erf_submission_queue";
const QUEUE_FORM_TYPE = "INFORMAL_ERF_CREATE";

const informalErfQueueStorage = createMMKV({
  id: "ireps-informal-erf-submission-queue",
});

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

const safeArray = (value) => (Array.isArray(value) ? value : []);

const generateQueueId = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `IERF_QUEUE_${Date.now()}_${random}`;
};

const readQueue = () => {
  try {
    const raw = informalErfQueueStorage.getString(STORAGE_KEY);

    if (!raw) return [];

    return safeArray(JSON.parse(raw));
  } catch {
    return [];
  }
};

const writeQueue = (queue) => {
  try {
    informalErfQueueStorage.set(
      STORAGE_KEY,
      JSON.stringify(safeArray(queue)),
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error,
    };
  }
};

export const getInformalErfSubmissionQueue = async () => readQueue();

export const getInformalErfQueueItemById = async (queueItemId) => {
  const queue = readQueue();

  return queue.find((item) => item?.id === queueItemId) || null;
};

export const addInformalErfQueueItem = async ({
  payload = null,
  payloadInput = null,
  context = {},
  createdByUid = "SYSTEM",
  createdByUser = "SYSTEM",
}) => {
  try {
    const queue = readQueue();
    const timestamp = nowIso();
    const timestampMs = nowMs();
    const queueItemId = generateQueueId();
    const resolvedPayload = payloadInput || payload || {};

    const newItem = {
      id: queueItemId,
      formType: QUEUE_FORM_TYPE,
      status: "PENDING",

      context: {
        lmPcode:
          context?.lmPcode ||
          resolvedPayload?.lmPcode ||
          "NAv",
        lmName: context?.lmName || "NAv",
        wardPcode:
          context?.wardPcode ||
          resolvedPayload?.wardPcode ||
          "NAv",
        wardName: context?.wardName || "NAv",
      },

      payload: resolvedPayload,

      result: {
        success: false,
        code: "NAv",
        message: "NAv",
        erfId: resolvedPayload?.erfId || "NAv",
        caseId: "NAv",
      },

      sync: {
        attempts: 0,
        lastAttemptAt: "NAv",
        nextRetryAt: "NAv",
        permanentFailure: false,
      },

      metadata: {
        createdAt: timestamp,
        createdAtMs: timestampMs,
        createdByUid,
        createdByUser,
        updatedAt: timestamp,
        updatedAtMs: timestampMs,
        updatedByUid: createdByUid,
        updatedByUser: createdByUser,
      },
    };

    const saveResult = writeQueue([newItem, ...queue]);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to save the Informal ERF locally.",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Informal ERF saved to the local submission queue.",
      queueItem: newItem,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error?.message ||
        "Failed to save the Informal ERF locally.",
      queueItem: null,
    };
  }
};

export const updateInformalErfQueueItem = async (
  queueItemId,
  updates = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  try {
    const queue = readQueue();
    const timestamp = nowIso();
    const timestampMs = nowMs();

    const existingItem =
      queue.find((item) => item?.id === queueItemId) || null;

    if (!existingItem) {
      return {
        success: false,
        message: "Informal ERF queue item not found.",
        queueItem: null,
      };
    }

    const updatedQueue = queue.map((item) =>
      item?.id === queueItemId
        ? {
            ...item,
            ...updates,
            metadata: {
              ...(item?.metadata || {}),
              updatedAt: timestamp,
              updatedAtMs: timestampMs,
              updatedByUid,
              updatedByUser,
            },
          }
        : item,
    );

    const saveResult = writeQueue(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to update the Informal ERF queue item.",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Informal ERF queue item updated.",
      queueItem:
        updatedQueue.find((item) => item?.id === queueItemId) || null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error?.message ||
        "Failed to update the Informal ERF queue item.",
      queueItem: null,
    };
  }
};

export const markInformalErfQueueItemSyncing = async (
  queueItemId,
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = await getInformalErfQueueItemById(queueItemId);
  const attempts = Number(item?.sync?.attempts || 0);

  return updateInformalErfQueueItem(
    queueItemId,
    {
      status: "SYNCING",
      sync: {
        ...(item?.sync || {}),
        attempts: attempts + 1,
        lastAttemptAt: nowIso(),
        nextRetryAt: "NAv",
        permanentFailure: false,
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markInformalErfQueueItemSuccess = async (
  queueItemId,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = await getInformalErfQueueItemById(queueItemId);

  return updateInformalErfQueueItem(
    queueItemId,
    {
      status: "SUCCESS",
      result: {
        success: true,
        code: result?.code || "INFORMAL_ERF_CREATED",
        message:
          result?.message ||
          "Informal ERF created successfully.",
        erfId: result?.erfId || item?.payload?.erfId || "NAv",
        caseId: result?.caseId || "NAv",
        duplicate: result?.duplicate === true,
      },
      sync: {
        ...(item?.sync || {}),
        lastAttemptAt: nowIso(),
        nextRetryAt: "NAv",
        permanentFailure: false,
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markInformalErfQueueItemFailed = async (
  queueItemId,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = await getInformalErfQueueItemById(queueItemId);

  return updateInformalErfQueueItem(
    queueItemId,
    {
      status: "PENDING",
      result: {
        success: false,
        code: result?.code || "SYNC_FAILED",
        message:
          result?.message ||
          "Sync failed. The item remains pending for retry.",
        erfId: result?.erfId || item?.payload?.erfId || "NAv",
        caseId: result?.caseId || "NAv",
      },
      sync: {
        ...(item?.sync || {}),
        nextRetryAt: "NAv",
        permanentFailure: false,
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markInformalErfQueueItemPermanentFailure = async (
  queueItemId,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = await getInformalErfQueueItemById(queueItemId);

  return updateInformalErfQueueItem(
    queueItemId,
    {
      status: "PENDING",
      result: {
        success: false,
        code: result?.code || "PERMANENT_REJECTION",
        message:
          result?.message ||
          "The server permanently rejected this Informal ERF.",
        erfId: result?.erfId || item?.payload?.erfId || "NAv",
        caseId: result?.caseId || "NAv",
        details: result?.details || null,
      },
      sync: {
        ...(item?.sync || {}),
        nextRetryAt: "NEVER",
        permanentFailure: true,
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const removeInformalErfQueueItem = async (queueItemId) => {
  try {
    const queue = readQueue();
    const updatedQueue = queue.filter(
      (item) => item?.id !== queueItemId,
    );

    if (updatedQueue.length === queue.length) {
      return {
        success: false,
        message: "Informal ERF queue item not found.",
      };
    }

    const saveResult = writeQueue(updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to remove the Informal ERF queue item.",
      };
    }

    return {
      success: true,
      message: "Informal ERF queue item removed.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error?.message ||
        "Failed to remove the Informal ERF queue item.",
    };
  }
};

export const clearInformalErfSubmissionQueue = async () => {
  try {
    informalErfQueueStorage.remove(STORAGE_KEY);

    return {
      success: true,
      message: "Informal ERF submission queue cleared.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error?.message ||
        "Failed to clear the Informal ERF queue.",
    };
  }
};

export const INFORMAL_ERF_QUEUE_FORM_TYPE = QUEUE_FORM_TYPE;
