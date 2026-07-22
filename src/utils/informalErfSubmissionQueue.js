import { createMMKV } from "react-native-mmkv";

import { buildInformalErfSubmissionPayload } from "../features/erfs/buildInformalErfSubmissionPayload";
import { INFORMAL_ERF_QUEUE_FORM_TYPE } from "../features/erfs/informalErfConstants";

const STORAGE_KEY =
  "informal_erf_submission_queue";

const informalErfQueueStorage = createMMKV({
  id: "ireps-informal-erf-submission-queue",
});

const nowIso = () => new Date().toISOString();

const safeArray = (value) =>
  Array.isArray(value) ? value : [];

const generateQueueId = () => {
  const random = Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase();

  return `IERF_QUEUE_${Date.now()}_${random}`;
};

const readQueue = () => {
  try {
    const raw = informalErfQueueStorage.getString(
      STORAGE_KEY,
    );

    if (!raw) return [];

    return safeArray(JSON.parse(raw));
  } catch (error) {
    console.log(
      "[INFORMAL ERF QUEUE] Read failed.",
      {
        code: error?.code,
        message: error?.message,
      },
    );

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
    console.log(
      "[INFORMAL ERF QUEUE] Write failed.",
      {
        code: error?.code,
        message: error?.message,
      },
    );

    return {
      success: false,
      error,
    };
  }
};

export const getInformalErfSubmissionQueue =
  async () => {
    return readQueue();
  };

export const getInformalErfQueueItemById =
  async (queueItemId) => {
    const queue = readQueue();

    return (
      queue.find(
        (item) => item?.id === queueItemId,
      ) || null
    );
  };

export const addInformalErfQueueItem = async ({
  payloadInput = {},
  context = {},
  createdByUid = "SYSTEM",
  createdByUser = "SYSTEM",
}) => {
  try {
    const queue = readQueue();
    const timestamp = nowIso();
    const createdAtMs = Date.now();
    const queueItemId = generateQueueId();

    const payload =
      buildInformalErfSubmissionPayload({
        localQueueItemId: queueItemId,
        createdAtMs,
        ...payloadInput,
      });

    const newItem = {
      id: queueItemId,
      formType:
        INFORMAL_ERF_QUEUE_FORM_TYPE,
      status: "PENDING",

      context: {
        lmPcode:
          payload?.scope?.lmPcode || "NAv",
        lmName:
          context?.lmName || "NAv",
        wardPcode:
          payload?.scope?.wardPcode || "NAv",
        wardName:
          context?.wardName || "NAv",
      },

      payload,

      result: {
        success: false,
        code: "NAv",
        message: "NAv",
        erfId: "NAv",
        caseId: "NAv",
      },

      sync: {
        attempts: 0,
        lastAttemptAt: "NAv",
        nextRetryAt: "NAv",
      },

      metadata: {
        createdAt: timestamp,
        createdAtMs,
        createdByUid,
        createdByUser,
        updatedAt: timestamp,
        updatedAtMs: createdAtMs,
        updatedByUid: createdByUid,
        updatedByUser: createdByUser,
      },
    };

    const saveResult = writeQueue([
      newItem,
      ...queue,
    ]);

    if (!saveResult?.success) {
      return {
        success: false,
        message:
          "Failed to save the Informal ERF locally.",
        queueItem: null,
      };
    }

    console.log(
      "[INFORMAL ERF QUEUE] Item saved.",
      {
        queueItemId,
        status: newItem.status,
        queueSize: queue.length + 1,
        lmPcode:
          newItem.context.lmPcode,
        wardPcode:
          newItem.context.wardPcode,
        reasonCode:
          newItem.payload?.reason?.code,
        mediaCount: safeArray(
          newItem.payload?.media,
        ).length,
      },
    );

    return {
      success: true,
      message:
        "Informal ERF saved to the local submission queue.",
      queueItem: newItem,
    };
  } catch (error) {
    console.log(
      "[INFORMAL ERF QUEUE] Add failed.",
      {
        code: error?.code,
        message: error?.message,
      },
    );

    return {
      success: false,
      message:
        error?.message ||
        "Failed to save the Informal ERF locally.",
      queueItem: null,
    };
  }
};

export const updateInformalErfQueueItem =
  async (
    queueItemId,
    updates = {},
    updatedByUid = "SYSTEM",
    updatedByUser = "SYSTEM",
  ) => {
    try {
      const queue = readQueue();
      const timestamp = nowIso();
      const updatedAtMs = Date.now();

      const existingItem =
        queue.find(
          (item) => item?.id === queueItemId,
        ) || null;

      if (!existingItem) {
        return {
          success: false,
          message:
            "Informal ERF queue item not found.",
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
                updatedAtMs,
                updatedByUid,
                updatedByUser,
              },
            }
          : item,
      );

      const saveResult =
        writeQueue(updatedQueue);

      if (!saveResult?.success) {
        return {
          success: false,
          message:
            "Failed to update the Informal ERF queue item.",
          queueItem: null,
        };
      }

      return {
        success: true,
        message:
          "Informal ERF queue item updated.",
        queueItem:
          updatedQueue.find(
            (item) =>
              item?.id === queueItemId,
          ) || null,
      };
    } catch (error) {
      console.log(
        "[INFORMAL ERF QUEUE] Update failed.",
        {
          queueItemId,
          code: error?.code,
          message: error?.message,
        },
      );

      return {
        success: false,
        message:
          error?.message ||
          "Failed to update the Informal ERF queue item.",
        queueItem: null,
      };
    }
  };

export const markInformalErfQueueItemSyncing =
  async (
    queueItemId,
    updatedByUid = "SYSTEM",
    updatedByUser = "SYSTEM",
  ) => {
    const item =
      await getInformalErfQueueItemById(
        queueItemId,
      );

    const attempts = Number(
      item?.sync?.attempts || 0,
    );

    return updateInformalErfQueueItem(
      queueItemId,
      {
        status: "SYNCING",
        sync: {
          ...(item?.sync || {}),
          attempts: attempts + 1,
          lastAttemptAt: nowIso(),
          nextRetryAt: "NAv",
        },
      },
      updatedByUid,
      updatedByUser,
    );
  };

export const markInformalErfQueueItemSuccess =
  async (
    queueItemId,
    result = {},
    updatedByUid = "SYSTEM",
    updatedByUser = "SYSTEM",
  ) => {
    const item =
      await getInformalErfQueueItemById(
        queueItemId,
      );

    return updateInformalErfQueueItem(
      queueItemId,
      {
        status: "SUCCESS",
        result: {
          success: true,
          code:
            result?.code ||
            "INFORMAL_ERF_CREATED",
          message:
            result?.message ||
            "Informal ERF created successfully.",
          erfId:
            result?.erfId || "NAv",
          caseId:
            result?.caseId || "NAv",
        },
        sync: {
          ...(item?.sync || {}),
          lastAttemptAt: nowIso(),
          nextRetryAt: "NAv",
        },
      },
      updatedByUid,
      updatedByUser,
    );
  };

export const markInformalErfQueueItemFailed =
  async (
    queueItemId,
    result = {},
    updatedByUid = "SYSTEM",
    updatedByUser = "SYSTEM",
  ) => {
    const item =
      await getInformalErfQueueItemById(
        queueItemId,
      );

    console.log(
      "[INFORMAL ERF QUEUE] Sync failed; item remains pending.",
      {
        queueItemId,
        previousStatus: item?.status,
        code:
          result?.code || "SYNC_FAILED",
        message:
          result?.message ||
          "Sync failed. The item remains pending for retry.",
      },
    );

    return updateInformalErfQueueItem(
      queueItemId,
      {
        status: "PENDING",
        result: {
          success: false,
          code:
            result?.code || "SYNC_FAILED",
          message:
            result?.message ||
            "Sync failed. The item remains pending for retry.",
          erfId:
            result?.erfId || "NAv",
          caseId:
            result?.caseId || "NAv",
        },
        sync: {
          ...(item?.sync || {}),
          nextRetryAt: "NAv",
        },
      },
      updatedByUid,
      updatedByUser,
    );
  };

export const removeInformalErfQueueItem =
  async (queueItemId) => {
    try {
      const queue = readQueue();

      const updatedQueue = queue.filter(
        (item) => item?.id !== queueItemId,
      );

      if (
        updatedQueue.length === queue.length
      ) {
        return {
          success: false,
          message:
            "Informal ERF queue item not found.",
        };
      }

      const saveResult =
        writeQueue(updatedQueue);

      if (!saveResult?.success) {
        return {
          success: false,
          message:
            "Failed to remove the Informal ERF queue item.",
        };
      }

      return {
        success: true,
        message:
          "Informal ERF queue item removed.",
      };
    } catch (error) {
      console.log(
        "[INFORMAL ERF QUEUE] Remove failed.",
        {
          queueItemId,
          code: error?.code,
          message: error?.message,
        },
      );

      return {
        success: false,
        message:
          error?.message ||
          "Failed to remove the Informal ERF queue item.",
      };
    }
  };

export const clearInformalErfSubmissionQueue =
  async () => {
    try {
      informalErfQueueStorage.remove(
        STORAGE_KEY,
      );

      return {
        success: true,
        message:
          "Informal ERF submission queue cleared.",
      };
    } catch (error) {
      console.log(
        "[INFORMAL ERF QUEUE] Clear failed.",
        {
          code: error?.code,
          message: error?.message,
        },
      );

      return {
        success: false,
        message:
          error?.message ||
          "Failed to clear the Informal ERF queue.",
      };
    }
  };

export {
  INFORMAL_ERF_QUEUE_FORM_TYPE,
};
