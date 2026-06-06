import { createMMKV } from "react-native-mmkv";

const ACCOUNT_DATA_DRAFTS_KEY = "account_data_form_drafts";
const ACCOUNT_DATA_QUEUE_KEY = "account_data_submission_queue";
const QUEUE_FORM_TYPE = "DATA_CLEANSING_ACCOUNT_DATA";

const accountDataStorage = createMMKV({
  id: "ireps-account-data-submission-storage",
});

const nowIso = () => new Date().toISOString();

const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const readJson = (key, fallback) => {
  try {
    const raw = accountDataStorage.getString(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.log("accountDataSubmissionQueue readJson error:", error);
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    accountDataStorage.set(key, JSON.stringify(value));
    return { success: true };
  } catch (error) {
    console.log("accountDataSubmissionQueue writeJson error:", error);
    return { success: false, error };
  }
};

const sanitizeIdSegment = (value, fallback = "NAv") => {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]/g, "_")
    .slice(0, 160);

  return cleaned || fallback;
};

export const buildAccountDataDraftId = (premiseId) => {
  return `FORM_ACCOUNT_DATA_DRAFT_${sanitizeIdSegment(premiseId)}`;
};

export const buildAccountDataQueueId = (premiseId) => {
  return `FAD_QUEUE_${Date.now()}_${sanitizeIdSegment(premiseId)}`;
};

export const getAccountDataDrafts = async () => {
  return safeObject(readJson(ACCOUNT_DATA_DRAFTS_KEY, {}));
};

export const getAccountDataDraftByPremiseId = async (premiseId) => {
  const drafts = await getAccountDataDrafts();
  return drafts?.[premiseId] || null;
};

export const saveAccountDataDraft = async ({
  premiseId,
  values = {},
  context = {},
  savedByUid = "SYSTEM",
  savedByUser = "SYSTEM",
}) => {
  try {
    if (!premiseId) {
      return { success: false, message: "Premise id is required." };
    }

    const drafts = await getAccountDataDrafts();
    const timestamp = nowIso();

    const draft = {
      id: buildAccountDataDraftId(premiseId),
      premiseId,
      values,
      context,
      metadata: {
        savedAt: timestamp,
        savedByUid,
        savedByUser,
        updatedAt: timestamp,
        updatedByUid: savedByUid,
        updatedByUser: savedByUser,
      },
    };

    const saveResult = writeJson(ACCOUNT_DATA_DRAFTS_KEY, {
      ...drafts,
      [premiseId]: draft,
    });

    if (!saveResult?.success) {
      return { success: false, message: "Failed to save account data draft." };
    }

    return {
      success: true,
      message: "Account data draft saved locally.",
      draft,
    };
  } catch (error) {
    console.log("saveAccountDataDraft error:", error);
    return {
      success: false,
      message: error?.message || "Failed to save account data draft.",
    };
  }
};

export const removeAccountDataDraftByPremiseId = async (premiseId) => {
  try {
    const drafts = await getAccountDataDrafts();
    const nextDrafts = { ...drafts };
    delete nextDrafts[premiseId];

    const saveResult = writeJson(ACCOUNT_DATA_DRAFTS_KEY, nextDrafts);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to remove account data draft.",
      };
    }

    return {
      success: true,
      message: "Account data draft removed.",
    };
  } catch (error) {
    console.log("removeAccountDataDraftByPremiseId error:", error);
    return {
      success: false,
      message: error?.message || "Failed to remove account data draft.",
    };
  }
};

export const getAccountDataSubmissionQueue = async () => {
  return safeArray(readJson(ACCOUNT_DATA_QUEUE_KEY, []));
};

export const getAccountDataQueueItemById = async (queueItemId) => {
  const queue = await getAccountDataSubmissionQueue();
  return queue.find((item) => item?.id === queueItemId) || null;
};

export const addAccountDataQueueItem = async ({
  premiseId,
  payload = {},
  context = {},
  createdByUid = "SYSTEM",
  createdByUser = "SYSTEM",
}) => {
  try {
    if (!premiseId) {
      return { success: false, message: "Premise id is required." };
    }

    const queue = await getAccountDataSubmissionQueue();
    const timestamp = nowIso();

    const newItem = {
      id: buildAccountDataQueueId(premiseId),
      formType: QUEUE_FORM_TYPE,
      status: "PENDING",

      context: {
        premiseId,
        erfId: context?.erfId || "NAv",
        erfNo: context?.erfNo || "NAv",
        lmPcode: context?.lmPcode || "NAv",
        wardPcode: context?.wardPcode || "NAv",
      },

      payload,

      result: {
        success: false,
        code: "NAv",
        message: "NAv",
        fieldAccountDataId: "NAv",
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

    const saveResult = writeJson(ACCOUNT_DATA_QUEUE_KEY, [newItem, ...queue]);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to save account data queue item.",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Account data saved to local queue.",
      queueItem: newItem,
    };
  } catch (error) {
    console.log("addAccountDataQueueItem error:", error);
    return {
      success: false,
      message: error?.message || "Failed to save account data queue item.",
      queueItem: null,
    };
  }
};

export const updateAccountDataQueueItem = async (
  queueItemId,
  updates = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  try {
    const queue = await getAccountDataSubmissionQueue();
    const timestamp = nowIso();

    const updatedQueue = queue.map((item) =>
      item?.id === queueItemId
        ? {
            ...item,
            ...updates,
            metadata: {
              ...(item?.metadata || {}),
              updatedAt: timestamp,
              updatedByUid,
              updatedByUser,
            },
          }
        : item,
    );

    const saveResult = writeJson(ACCOUNT_DATA_QUEUE_KEY, updatedQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to update account data queue item.",
        queueItem: null,
      };
    }

    return {
      success: true,
      message: "Account data queue item updated.",
      queueItem: updatedQueue.find((item) => item?.id === queueItemId) || null,
    };
  } catch (error) {
    console.log("updateAccountDataQueueItem error:", error);
    return {
      success: false,
      message: error?.message || "Failed to update account data queue item.",
      queueItem: null,
    };
  }
};

export const markAccountDataQueueItemSyncing = async (
  queueItemId,
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = await getAccountDataQueueItemById(queueItemId);
  const previousAttempts = Number(item?.sync?.attempts || 0);
  const timestamp = nowIso();

  return updateAccountDataQueueItem(
    queueItemId,
    {
      status: "SYNCING",
      result: {
        ...(item?.result || {}),
        success: false,
        code: "SYNCING",
        message: "Syncing account data with backend.",
        fieldAccountDataId: item?.result?.fieldAccountDataId || "NAv",
      },
      sync: {
        ...(item?.sync || {}),
        attempts: previousAttempts + 1,
        lastAttemptAt: timestamp,
        nextRetryAt: "NAv",
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markAccountDataQueueItemSuccess = async (
  queueItemId,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = await getAccountDataQueueItemById(queueItemId);
  const timestamp = nowIso();

  return updateAccountDataQueueItem(
    queueItemId,
    {
      status: "SUCCESS",
      result: {
        success: true,
        code: result?.code || "SUCCESS",
        message: result?.message || "Account data synced successfully.",
        fieldAccountDataId: result?.fieldAccountDataId || "NAv",
      },
      sync: {
        ...(item?.sync || {}),
        lastAttemptAt: timestamp,
        nextRetryAt: "NAv",
      },
    },
    updatedByUid,
    updatedByUser,
  );
};

export const markAccountDataQueueItemFailed = async (
  queueItemId,
  result = {},
  updatedByUid = "SYSTEM",
  updatedByUser = "SYSTEM",
) => {
  const item = await getAccountDataQueueItemById(queueItemId);
  const timestamp = nowIso();

  return updateAccountDataQueueItem(
    queueItemId,
    {
      status: "FAILED",
      result: {
        success: false,
        code: result?.code || "SYNC_FAILED",
        message: result?.message || "Account data sync failed.",
        fieldAccountDataId: result?.fieldAccountDataId || "NAv",
      },
      sync: {
        ...(item?.sync || {}),
        lastAttemptAt: timestamp,
        nextRetryAt: "NAv",
      },
    },
    updatedByUid,
    updatedByUser,
  );
};


export const removeAccountDataQueueItem = async (queueItemId) => {
  try {
    const queue = await getAccountDataSubmissionQueue();
    const nextQueue = queue.filter((item) => item?.id !== queueItemId);

    const saveResult = writeJson(ACCOUNT_DATA_QUEUE_KEY, nextQueue);

    if (!saveResult?.success) {
      return {
        success: false,
        message: "Failed to remove account data queue item.",
      };
    }

    return {
      success: true,
      message: "Account data queue item removed.",
    };
  } catch (error) {
    console.log("removeAccountDataQueueItem error:", error);
    return {
      success: false,
      message: error?.message || "Failed to remove account data queue item.",
    };
  }
};

export const clearAccountDataSubmissionQueue = async () => {
  try {
    accountDataStorage.remove(ACCOUNT_DATA_QUEUE_KEY);
    return { success: true, message: "Account data submission queue cleared." };
  } catch (error) {
    console.log("clearAccountDataSubmissionQueue error:", error);
    return {
      success: false,
      message: error?.message || "Failed to clear account data queue.",
    };
  }
};

export const ACCOUNT_DATA_QUEUE_FORM_TYPE = QUEUE_FORM_TYPE;
