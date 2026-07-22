import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";

import { functions } from "../firebase";
import { addInformalErfQueueItem } from "../utils/informalErfSubmissionQueue";

export const INFORMAL_ERF_SUBMISSION_TIMEOUT_MS = 15000;

let lastGeneratedTimestampMs = 0;

const cleanText = (value, fallback = "") => {
  const clean = String(value ?? "").trim();
  return clean || fallback;
};

const normalizeErrorCode = (value) =>
  cleanText(value)
    .replace(/^functions\//, "")
    .replace(/^storage\//, "")
    .toUpperCase();

const isValidLatLng = (value) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
};

const getJohannesburgTimestampParts = (timestampMs) => {
  const southAfricaDate = new Date(timestampMs + 2 * 60 * 60 * 1000);

  const yyyy = String(southAfricaDate.getUTCFullYear());
  const month = String(southAfricaDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(southAfricaDate.getUTCDate()).padStart(2, "0");
  const hour = String(southAfricaDate.getUTCHours()).padStart(2, "0");
  const minute = String(southAfricaDate.getUTCMinutes()).padStart(2, "0");
  const second = String(southAfricaDate.getUTCSeconds()).padStart(2, "0");
  const millisecond = String(southAfricaDate.getUTCMilliseconds()).padStart(
    3,
    "0",
  );

  return {
    datePart: `${yyyy}${month}${day}`,
    timePart: `${hour}${minute}${second}${millisecond}`,
  };
};

const getNextUniqueTimestampMs = (preferredTimestampMs = Date.now()) => {
  const parsed = Number(preferredTimestampMs);
  const candidate = Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
  const next = Math.max(candidate, lastGeneratedTimestampMs + 1);

  lastGeneratedTimestampMs = next;
  return next;
};

export const createInformalErfId = (
  wardPcode,
  preferredTimestampMs = Date.now(),
) => {
  const cleanWardPcode = cleanText(wardPcode).toUpperCase();

  if (!cleanWardPcode || cleanWardPcode === "NAV") {
    throw new Error("A valid wardPcode is required to create an Informal ERF ID.");
  }

  const timestampMs = getNextUniqueTimestampMs(preferredTimestampMs);
  const { datePart, timePart } =
    getJohannesburgTimestampParts(timestampMs);

  return {
    erfId: `erf_inf__${cleanWardPcode}__${datePart}__${timePart}`,
    clientSubmittedAtMs: timestampMs,
  };
};

const getQueueCreatedAtMs = (queueItem = {}) => {
  const direct = Number(queueItem?.metadata?.createdAtMs);

  if (Number.isFinite(direct) && direct > 0) return direct;

  const parsedIso = Date.parse(queueItem?.metadata?.createdAt || "");

  if (Number.isFinite(parsedIso) && parsedIso > 0) return parsedIso;

  const queueIdMatch = String(queueItem?.id || "").match(
    /^IERF_QUEUE_(\d+)_/,
  );

  const fromQueueId = Number(queueIdMatch?.[1]);

  if (Number.isFinite(fromQueueId) && fromQueueId > 0) {
    return fromQueueId;
  }

  return Date.now();
};

export const ensureInformalErfSubmissionIdentity = (
  payloadInput = {},
  queueItem = null,
) => {
  const payload = {
    ...(payloadInput || {}),
  };

  const wardPcode = cleanText(
    payload?.wardPcode || queueItem?.context?.wardPcode,
  ).toUpperCase();

  const existingErfId = cleanText(payload?.erfId);
  const existingClientSubmittedAtMs = Number(payload?.clientSubmittedAtMs);

  if (
    existingErfId &&
    Number.isFinite(existingClientSubmittedAtMs) &&
    existingClientSubmittedAtMs > 0
  ) {
    return {
      ...payload,
      erfId: existingErfId,
      clientSubmittedAtMs: Math.trunc(existingClientSubmittedAtMs),
      wardPcode,
    };
  }

  const preferredTimestampMs =
    Number.isFinite(existingClientSubmittedAtMs) &&
    existingClientSubmittedAtMs > 0
      ? existingClientSubmittedAtMs
      : getQueueCreatedAtMs(queueItem || {});

  const generated = createInformalErfId(
    wardPcode,
    preferredTimestampMs,
  );

  return {
    ...payload,
    ...generated,
    wardPcode,
  };
};

export const isDeviceOnline = async () => {
  try {
    const state = await NetInfo.fetch();

    return Boolean(
      state?.isConnected &&
        state?.isInternetReachable !== false,
    );
  } catch {
    return false;
  }
};

export const withInformalErfTimeout = (
  promise,
  timeoutMs = INFORMAL_ERF_SUBMISSION_TIMEOUT_MS,
) => {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new Error("Informal ERF submission timed out.");
      timeoutError.code = "SUBMISSION_TIMEOUT";
      timeoutError.details = {
        retriable: true,
        errorType: "TEMPORARY",
      };

      reject(timeoutError);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
};

const getMediaExtension = (media = {}) => {
  const source = cleanText(media?.uri || media?.url).toLowerCase();

  if (source.includes(".png")) return "png";
  if (source.includes(".webp")) return "webp";

  return "jpg";
};

const getMediaContentType = (media = {}, extension = "jpg") => {
  const explicit = cleanText(
    media?.mimeType || media?.contentType,
  );

  if (explicit.startsWith("image/")) return explicit;
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";

  return "image/jpeg";
};

const getMediaCapturedAtMs = (media = {}) => {
  const direct = Number(media?.capturedAtMs);

  if (Number.isFinite(direct) && direct > 0) {
    return Math.trunc(direct);
  }

  const parsed = Date.parse(
    media?.created?.at ||
      media?.metadata?.createdAt ||
      "",
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
};

const getMediaGps = (media = {}, fallbackGps = null) => {
  const candidates = [
    media?.gps,
    media?.location?.gps,
    fallbackGps,
  ];

  const match = candidates.find(isValidLatLng);

  if (!match) return null;

  return {
    lat: Number(match.lat),
    lng: Number(match.lng),
  };
};

const uploadSingleInformalErfPhoto = async ({
  media,
  erfId,
  index,
  fallbackGps,
}) => {
  const expectedPrefix = `informal_erfs/${erfId}/`;
  const existingStoragePath = cleanText(media?.storagePath);

  if (existingStoragePath.startsWith(expectedPrefix)) {
    return {
      tag: "informalErfSitePhoto",
      type: "image",
      storagePath: existingStoragePath,
      url: cleanText(media?.url) || null,
      capturedAtMs: getMediaCapturedAtMs(media),
      gps: getMediaGps(media, fallbackGps),
    };
  }

  const localUri = cleanText(media?.uri);

  if (!localUri) {
    const missingUriError = new Error(
      "The Informal ERF site photograph is not available on this device.",
    );
    missingUriError.code = "MISSING_LOCAL_SITE_PHOTO";
    missingUriError.details = {
      retriable: false,
      errorType: "PERMANENT",
    };

    throw missingUriError;
  }

  const extension = getMediaExtension(media);
  const contentType = getMediaContentType(media, extension);
  const storagePath =
    `${expectedPrefix}informal_erf_site_photo_${index + 1}.${extension}`;

  const response = await fetch(localUri);
  const blob = await response.blob();
  const storage = getStorage();
  const storageReference = ref(storage, storagePath);

  try {
    await uploadBytes(storageReference, blob, {
      contentType,
      customMetadata: {
        erfId,
        tag: "informalErfSitePhoto",
      },
    });
  } finally {
    if (typeof blob?.close === "function") {
      blob.close();
    }
  }

  const url = await getDownloadURL(storageReference);

  return {
    tag: "informalErfSitePhoto",
    type: "image",
    storagePath,
    url,
    capturedAtMs: getMediaCapturedAtMs(media),
    gps: getMediaGps(media, fallbackGps),
  };
};

export const uploadInformalErfSitePhotos = async (
  payloadInput = {},
) => {
  const media = Array.isArray(payloadInput?.media)
    ? payloadInput.media
    : [];

  const sitePhotos = media.filter(
    (item) => item?.tag === "informalErfSitePhoto",
  );

  if (!sitePhotos.length) {
    const missingPhotoError = new Error(
      "Informal ERF site photograph is required.",
    );
    missingPhotoError.code = "MISSING_SITE_PHOTO";
    missingPhotoError.details = {
      retriable: false,
      errorType: "PERMANENT",
    };

    throw missingPhotoError;
  }

  const uploadedSitePhotos = [];

  for (let index = 0; index < sitePhotos.length; index += 1) {
    uploadedSitePhotos.push(
      await uploadSingleInformalErfPhoto({
        media: sitePhotos[index],
        erfId: payloadInput.erfId,
        index,
        fallbackGps: payloadInput.proposedErfLocation,
      }),
    );
  }

  return uploadedSitePhotos;
};

export const buildInformalErfCallablePayload = (
  payloadInput = {},
  uploadedMedia = [],
) => ({
  schemaVersion: 1,
  formType: "INFORMAL_ERF_CREATE",
  erfId: payloadInput.erfId,
  lmPcode: payloadInput.lmPcode,
  wardPcode: payloadInput.wardPcode,
  deviceLocation: payloadInput.deviceLocation,
  proposedErfLocation: payloadInput.proposedErfLocation,
  reasonCode: payloadInput.reasonCode,
  reasonOther:
    payloadInput.reasonCode === "OTHER"
      ? cleanText(payloadInput.reasonOther) || null
      : null,
  media: uploadedMedia,
  clientSubmittedAtMs: payloadInput.clientSubmittedAtMs,
});

export const submitInformalErfOnline = async (
  payloadInput = {},
) => {
  const identifiedPayload =
    ensureInformalErfSubmissionIdentity(payloadInput);

  const uploadedMedia = await uploadInformalErfSitePhotos(
    identifiedPayload,
  );

  const callablePayload = buildInformalErfCallablePayload(
    identifiedPayload,
    uploadedMedia,
  );

  const submitCallable = httpsCallable(
    functions,
    "submitInformalErfCallable",
  );

  const response = await submitCallable(callablePayload);
  const result = response?.data || {};

  if (result?.success !== true) {
    const backendError = new Error(
      result?.message || "Informal ERF submission failed.",
    );
    backendError.code = result?.code || "BACKEND_REJECTED";
    backendError.details = result?.details || {
      retriable: false,
      errorType: "PERMANENT",
    };

    throw backendError;
  }

  return {
    result,
    payload: {
      ...identifiedPayload,
      media: uploadedMedia,
    },
  };
};

export const getInformalErfErrorDetails = (error = {}) => {
  const details =
    error?.details ||
    error?.customData?.details ||
    error?.data ||
    {};

  const code = normalizeErrorCode(
    error?.code || details?.businessCode || "UNKNOWN_ERROR",
  );

  return {
    code,
    message:
      cleanText(error?.message) ||
      "The Informal ERF could not be submitted.",
    details,
  };
};

export const isPermanentInformalErfError = (error = {}) => {
  const { code, details } = getInformalErfErrorDetails(error);

  if (
    details?.retriable === false ||
    String(details?.errorType || "").toUpperCase() === "PERMANENT"
  ) {
    return true;
  }

  return [
    "INVALID-ARGUMENT",
    "INVALID_ARGUMENT",
    "UNAUTHENTICATED",
    "PERMISSION-DENIED",
    "PERMISSION_DENIED",
    "FAILED-PRECONDITION",
    "FAILED_PRECONDITION",
    "NOT-FOUND",
    "NOT_FOUND",
    "ALREADY-EXISTS",
    "ALREADY_EXISTS",
    "MISSING_LOCAL_SITE_PHOTO",
    "MISSING_SITE_PHOTO",
  ].includes(code);
};

const saveSubmissionToLocalQueue = async ({
  payload,
  context,
  createdByUid,
  createdByUser,
}) => {
  return addInformalErfQueueItem({
    payload,
    context: {
      lmPcode: payload?.lmPcode,
      wardPcode: payload?.wardPcode,
      ...(context || {}),
    },
    createdByUid,
    createdByUser,
  });
};

export const submitInformalErfWithFallback = async ({
  payloadInput = {},
  context = {},
  createdByUid = "SYSTEM",
  createdByUser = "SYSTEM",
  timeoutMs = INFORMAL_ERF_SUBMISSION_TIMEOUT_MS,
}) => {
  const identifiedPayload =
    ensureInformalErfSubmissionIdentity(payloadInput);

  const online = await isDeviceOnline();

  if (!online) {
    const queueResult = await saveSubmissionToLocalQueue({
      payload: identifiedPayload,
      context,
      createdByUid,
      createdByUser,
    });

    return {
      success: queueResult?.success === true,
      mode: queueResult?.success ? "QUEUED" : "FAILED",
      reason: "OFFLINE",
      message: queueResult?.success
        ? "No network was available. The Informal ERF was saved locally."
        : queueResult?.message,
      erfId: identifiedPayload.erfId,
      queueItem: queueResult?.queueItem || null,
    };
  }

  try {
    const onlineResult = await withInformalErfTimeout(
      submitInformalErfOnline(identifiedPayload),
      timeoutMs,
    );

    return {
      success: true,
      mode: "ONLINE",
      message:
        onlineResult?.result?.message ||
        "Informal ERF created successfully.",
      erfId:
        onlineResult?.result?.erfId ||
        identifiedPayload.erfId,
      duplicate: onlineResult?.result?.duplicate === true,
      result: onlineResult?.result || null,
    };
  } catch (error) {
    const errorInfo = getInformalErfErrorDetails(error);

    if (isPermanentInformalErfError(error)) {
      return {
        success: false,
        mode: "REJECTED",
        message: errorInfo.message,
        code: errorInfo.code,
        details: errorInfo.details,
        erfId: identifiedPayload.erfId,
      };
    }

    const queueResult = await saveSubmissionToLocalQueue({
      payload: identifiedPayload,
      context,
      createdByUid,
      createdByUser,
    });

    return {
      success: queueResult?.success === true,
      mode: queueResult?.success ? "QUEUED" : "FAILED",
      reason:
        errorInfo.code === "SUBMISSION_TIMEOUT"
          ? "TIMEOUT"
          : "TEMPORARY_FAILURE",
      message: queueResult?.success
        ? errorInfo.code === "SUBMISSION_TIMEOUT"
          ? "The server took longer than 15 seconds. The Informal ERF was saved locally."
          : "The server is temporarily unavailable. The Informal ERF was saved locally."
        : queueResult?.message,
      code: errorInfo.code,
      erfId: identifiedPayload.erfId,
      queueItem: queueResult?.queueItem || null,
    };
  }
};
