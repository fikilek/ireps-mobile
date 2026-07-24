import { createMMKV } from "react-native-mmkv";

const STORAGE_KEY = "informal_erf_submission_queue";
const QUEUE_FORM_TYPE = "INFORMAL_ERF_CREATE";
const QUEUE_SCHEMA_VERSION = 2;

const informalErfQueueStorage = createMMKV({
  id: "ireps-informal-erf-submission-queue",
});

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();
const safeArray = (value) => (Array.isArray(value) ? value : []);

const cleanText = (value, fallback = "") => {
  const clean = String(value ?? "").trim();
  return clean || fallback;
};

const toNullableNumber = (value) => {
  if (value == null || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const generateQueueId = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `IERF_QUEUE_${Date.now()}_${random}`;
};

const normalizeBoundaryPoints = (boundaryPoints = []) =>
  safeArray(boundaryPoints).map((point) => ({
    lat: Number(point?.lat ?? point?.latitude),
    lng: Number(point?.lng ?? point?.longitude),
  }));

const normalizeDeviceLocation = (deviceLocation = {}) => ({
  latitude: toNullableNumber(deviceLocation?.latitude),
  longitude: toNullableNumber(deviceLocation?.longitude),
  accuracyM: toNullableNumber(deviceLocation?.accuracyM),
  altitudeM: toNullableNumber(deviceLocation?.altitudeM),
  headingDegrees: toNullableNumber(deviceLocation?.headingDegrees),
  speedMps: toNullableNumber(deviceLocation?.speedMps),
  capturedAtMs: toNullableNumber(deviceLocation?.capturedAtMs),
});

const normalizeMediaGps = (media = {}) => {
  const candidate = media?.gps || media?.location?.gps || null;
  const lat = Number(candidate?.lat);
  const lng = Number(candidate?.lng);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    (lat === 0 && lng === 0)
  ) {
    return null;
  }

  return { lat, lng };
};

const normalizeMediaItem = (media = {}) => ({
  tag: cleanText(media?.tag),
  type: cleanText(media?.type, "image"),
  uri: cleanText(media?.uri) || null,
  url: cleanText(media?.url) || null,
  storagePath: cleanText(media?.storagePath) || null,
  mimeType: cleanText(media?.mimeType) || null,
  contentType: cleanText(media?.contentType) || null,
  capturedAtMs: toNullableNumber(media?.capturedAtMs),
  gps: normalizeMediaGps(media),
  created: media?.created || null,
  updated: media?.updated || null,
});

export const normalizeInformalErfQueuePayload = (payload = {}) => {
  const reasonCode = cleanText(payload?.reasonCode).toUpperCase();

  return {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    formType: QUEUE_FORM_TYPE,
    erfId: cleanText(payload?.erfId),
    lmPcode: cleanText(payload?.lmPcode).toUpperCase(),
    wardPcode: cleanText(payload?.wardPcode).toUpperCase(),
    boundaryPoints: normalizeBoundaryPoints(payload?.boundaryPoints),
    reasonCode,
    reasonOther:
      reasonCode === "OTHER"
        ? cleanText(payload?.reasonOther) || null
        : null,
    media: safeArray(payload?.media).map(normalizeMediaItem),
    deviceLocation: normalizeDeviceLocation(payload?.deviceLocation),
    clientSubmittedAtMs: toNullableNumber(payload?.clientSubmittedAtMs),
  };
};

const readQueue = () => {
  try {
    const raw = informalErfQueueStorage.getString(STORAGE_KEY);

    if (!raw) return [];

    return safeArray(JSON.parse(raw));
  } catch (error) {
    console.error("[INFORMAL ERF QUEUE] Failed to read local queue.", error);
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
    console.error("[INFORMAL ERF QUEUE] Failed to write local queue.", error);

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
    const resolvedPayload = normalizeInformalErfQueuePayload(
      payloadInput || payload || {},
    );

    if (!resolvedPayload.erfId) {
      return {
        success: false,
        message: "A final Informal ERF ID is required before local storage.",
        queueItem: null,
      };
    }

    const existingIndex = queue.findIndex(
      (item) => item?.payload?.erfId === resolvedPayload.erfId,
    );

    if (existingIndex >= 0) {
      const existingItem = queue[existingIndex];
      const updatedItem = {
        ...existingItem,
        formType: QUEUE_FORM_TYPE,
        status:
          String(existingItem?.status || "").toUpperCase() === "SUCCESS"
            ? "SUCCESS"
            : "PENDING",
        context: {
          lmPcode:
            context?.lmPcode ||
            resolvedPayload.lmPcode ||
            existingItem?.context?.lmPcode ||
            "NAv",
          lmName:
            context?.lmName ||
            existingItem?.context?.lmName ||
            "NAv",
          wardPcode:
            context?.wardPcode ||
            resolvedPayload.wardPcode ||
            existingItem?.context?.wardPcode ||
            "NAv",
          wardName:
            context?.wardName ||
            existingItem?.context?.wardName ||
            "NAv",
        },
        payload: resolvedPayload,
        sync: {
          ...(existingItem?.sync || {}),
          nextRetryAt: "NAv",
          permanentFailure: false,
        },
        metadata: {
          ...(existingItem?.metadata || {}),
          updatedAt: timestamp,
          updatedAtMs: timestampMs,
          updatedByUid: createdByUid,
          updatedByUser: createdByUser,
        },
      };

      const updatedQueue = [...queue];
      updatedQueue[existingIndex] = updatedItem;

      const saveResult = writeQueue(updatedQueue);

      return {
        success: saveResult?.success === true,
        message: saveResult?.success
          ? "Existing Informal ERF queue item updated without creating a duplicate."
          : "Failed to update the existing Informal ERF queue item.",
        queueItem: saveResult?.success ? updatedItem : null,
      };
    }

    const queueItemId = generateQueueId();
    const newItem = {
      id: queueItemId,
      formType: QUEUE_FORM_TYPE,
      status: "PENDING",

      context: {
        lmPcode:
          context?.lmPcode ||
          resolvedPayload.lmPcode ||
          "NAv",
        lmName: context?.lmName || "NAv",
        wardPcode:
          context?.wardPcode ||
          resolvedPayload.wardPcode ||
          "NAv",
        wardName: context?.wardName || "NAv",
      },

      payload: resolvedPayload,

      result: {
        success: false,
        code: "NAv",
        message: "NAv",
        erfId: resolvedPayload.erfId,
        parcelNo: "NAv",
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

    console.log("[INFORMAL ERF QUEUE] Item saved.", {
      queueItemId,
      erfId: resolvedPayload.erfId,
      boundaryPointCount: resolvedPayload.boundaryPoints.length,
    });

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

    const normalizedUpdates = {
      ...updates,
      ...(updates?.payload
        ? {
            payload: normalizeInformalErfQueuePayload(updates.payload),
          }
        : {}),
    };

    const updatedQueue = queue.map((item) =>
      item?.id === queueItemId
        ? {
            ...item,
            ...normalizedUpdates,
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
        parcelNo: result?.parcelNo || "NAv",
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
        parcelNo: result?.parcelNo || "NAv",
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
      status: "REJECTED",
      result: {
        success: false,
        code: result?.code || "PERMANENT_REJECTION",
        message:
          result?.message ||
          "The server permanently rejected this Informal ERF.",
        erfId: result?.erfId || item?.payload?.erfId || "NAv",
        parcelNo: "NAv",
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
