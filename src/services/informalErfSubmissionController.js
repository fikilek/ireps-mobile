import NetInfo from "@react-native-community/netinfo";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";

import {
  INFORMAL_ERF_CALLABLE_TIMEOUT_MS,
  informalErfsApi,
} from "../redux/informalErfsApi";
import { store } from "../redux/store";
import { addInformalErfQueueItem } from "../utils/informalErfSubmissionQueue";

export const INFORMAL_ERF_SUBMISSION_TIMEOUT_MS =
  INFORMAL_ERF_CALLABLE_TIMEOUT_MS;

const INFORMAL_ERF_ID_PATTERN = /^IE-(ZA\d{7})-\d{8}-\d{6}-\d{4}$/;
const WARD_PCODE_PATTERN = /^ZA\d{7}$/;
const INFORMAL_ERF_FORM_TYPE = "INFORMAL_ERF_CREATE";
const INFORMAL_ERF_SCHEMA_VERSION = 2;

let lastGeneratedTimestampMs = 0;

const cleanText = (value, fallback = "") => {
  const clean = String(value ?? "").trim();
  return clean || fallback;
};

const normalizeErrorCode = (value) =>
  cleanText(value, "UNKNOWN_ERROR")
    .replace(/^functions\//, "")
    .replace(/^storage\//, "")
    .toUpperCase();

const toNullableNumber = (value) => {
  if (value == null || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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

const normalizeBoundaryPoints = (boundaryPoints = []) =>
  (Array.isArray(boundaryPoints) ? boundaryPoints : []).map((point) => ({
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

const getJohannesburgTimestampParts = (timestampMs) => {
  const southAfricaDate = new Date(timestampMs + 2 * 60 * 60 * 1000);

  const yyyy = String(southAfricaDate.getUTCFullYear());
  const month = String(southAfricaDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(southAfricaDate.getUTCDate()).padStart(2, "0");
  const hour = String(southAfricaDate.getUTCHours()).padStart(2, "0");
  const minute = String(southAfricaDate.getUTCMinutes()).padStart(2, "0");
  const second = String(southAfricaDate.getUTCSeconds()).padStart(2, "0");

  return {
    datePart: `${yyyy}${month}${day}`,
    timePart: `${hour}${minute}${second}`,
  };
};

const createRandomNumericSuffix = () =>
  String(Math.floor(Math.random() * 10000)).padStart(4, "0");

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

  if (!WARD_PCODE_PATTERN.test(cleanWardPcode)) {
    throw new Error(
      "A valid wardPcode such as ZA7423006 is required to create an Informal ERF ID.",
    );
  }

  const timestampMs = getNextUniqueTimestampMs(preferredTimestampMs);
  const { datePart, timePart } = getJohannesburgTimestampParts(timestampMs);

  return {
    erfId: `IE-${cleanWardPcode}-${datePart}-${timePart}-${createRandomNumericSuffix()}`,
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
  const source = payloadInput || {};
  const lmPcode = cleanText(
    source?.lmPcode || queueItem?.context?.lmPcode,
  ).toUpperCase();
  const wardPcode = cleanText(
    source?.wardPcode || queueItem?.context?.wardPcode,
  ).toUpperCase();

  const existingErfId = cleanText(source?.erfId);
  const existingClientSubmittedAtMs = Number(source?.clientSubmittedAtMs);
  const preferredTimestampMs =
    Number.isFinite(existingClientSubmittedAtMs) &&
    existingClientSubmittedAtMs > 0
      ? existingClientSubmittedAtMs
      : getQueueCreatedAtMs(queueItem || {});

  let identity;

  if (existingErfId) {
    const currentIdMatch = existingErfId.match(INFORMAL_ERF_ID_PATTERN);

    if (!currentIdMatch) {
      throw new Error(
        "erfId must follow IE-{wardPcode}-YYYYMMDD-hhmmss-XXXX.",
      );
    }

    if (currentIdMatch[1] !== wardPcode) {
      throw new Error(
        "The wardPcode embedded in erfId must match the selected wardPcode.",
      );
    }

    identity = {
      erfId: existingErfId,
      clientSubmittedAtMs: Math.trunc(preferredTimestampMs),
    };
  } else {
    identity = createInformalErfId(wardPcode, preferredTimestampMs);
  }

  const reasonCode = cleanText(source?.reasonCode).toUpperCase();

  return {
    schemaVersion: INFORMAL_ERF_SCHEMA_VERSION,
    formType: INFORMAL_ERF_FORM_TYPE,
    ...identity,
    lmPcode,
    wardPcode,
    boundaryPoints: normalizeBoundaryPoints(source?.boundaryPoints),
    reasonCode,
    reasonOther:
      reasonCode === "OTHER"
        ? cleanText(source?.reasonOther) || null
        : null,
    media: Array.isArray(source?.media) ? source.media : [],
    deviceLocation: normalizeDeviceLocation(source?.deviceLocation),
  };
};

export const isDeviceOnline = async () => {
  try {
    const state = await NetInfo.fetch();

    return Boolean(
      state?.isConnected &&
        state?.isInternetReachable !== false,
    );
  } catch (error) {
    console.warn("[INFORMAL ERF] Network state check failed.", error);
    return false;
  }
};

const getMediaExtension = (media = {}) => {
  const source = cleanText(media?.uri || media?.url).toLowerCase();

  if (source.includes(".png")) return "png";
  if (source.includes(".webp")) return "webp";

  return "jpg";
};

const getMediaContentType = (media = {}, extension = "jpg") => {
  const explicit = cleanText(media?.mimeType || media?.contentType);

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

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getMediaGps = (media = {}) => {
  const candidates = [media?.gps, media?.location?.gps];
  const match = candidates.find(isValidLatLng);

  if (!match) return null;

  return {
    lat: Number(match.lat),
    lng: Number(match.lng),
  };
};

const makeMissingPhotoError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  error.details = {
    retriable: false,
    errorType: "PERMANENT",
  };
  return error;
};

const uploadSingleInformalErfPhoto = async ({ media, erfId, index }) => {
  const expectedPrefix = `informal_erfs/${erfId}/`;
  const existingStoragePath = cleanText(media?.storagePath);

  if (existingStoragePath.startsWith(expectedPrefix)) {
    const storageReference = ref(getStorage(), existingStoragePath);
    const existingUrl = cleanText(media?.url);

    return {
      tag: "informalErfSitePhoto",
      type: "image",
      storagePath: existingStoragePath,
      url: existingUrl || (await getDownloadURL(storageReference)),
      capturedAtMs: getMediaCapturedAtMs(media),
      gps: getMediaGps(media),
    };
  }

  const localUri = cleanText(media?.uri);

  if (!localUri) {
    throw makeMissingPhotoError(
      "The Informal ERF site photograph is not available on this device.",
      "MISSING_LOCAL_SITE_PHOTO",
    );
  }

  const extension = getMediaExtension(media);
  const contentType = getMediaContentType(media, extension);
  const storagePath =
    `${expectedPrefix}informal_erf_site_photo_${index + 1}.${extension}`;

  const response = await fetch(localUri);

  if (!response?.ok && response?.status) {
    const mediaReadError = new Error(
      `The Informal ERF photograph could not be read (${response.status}).`,
    );
    mediaReadError.code = "LOCAL_MEDIA_READ_FAILED";
    mediaReadError.details = {
      retriable: false,
      errorType: "PERMANENT",
    };
    throw mediaReadError;
  }

  const blob = await response.blob();
  const storageReference = ref(getStorage(), storagePath);

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
    gps: getMediaGps(media),
  };
};

export const uploadInformalErfSitePhotos = async (payloadInput = {}) => {
  const media = Array.isArray(payloadInput?.media)
    ? payloadInput.media
    : [];

  const sitePhotos = media.filter(
    (item) => item?.tag === "informalErfSitePhoto",
  );

  if (!sitePhotos.length) {
    throw makeMissingPhotoError(
      "Informal ERF site photograph is required.",
      "MISSING_SITE_PHOTO",
    );
  }

  console.log(
    `[INFORMAL ERF] Media upload started (${sitePhotos.length} photograph(s)).`,
    { erfId: payloadInput?.erfId },
  );

  const uploadedSitePhotos = [];

  for (let index = 0; index < sitePhotos.length; index += 1) {
    console.log(
      `[INFORMAL ERF] Uploading photograph ${index + 1}/${sitePhotos.length}.`,
      { erfId: payloadInput?.erfId },
    );

    uploadedSitePhotos.push(
      await uploadSingleInformalErfPhoto({
        media: sitePhotos[index],
        erfId: payloadInput.erfId,
        index,
      }),
    );
  }

  console.log("[INFORMAL ERF] Media upload completed.", {
    erfId: payloadInput?.erfId,
    uploadedCount: uploadedSitePhotos.length,
  });

  return uploadedSitePhotos;
};

export const buildInformalErfCallablePayload = (
  payloadInput = {},
  uploadedMedia = [],
) => ({
  schemaVersion: INFORMAL_ERF_SCHEMA_VERSION,
  formType: INFORMAL_ERF_FORM_TYPE,
  erfId: payloadInput.erfId,
  lmPcode: payloadInput.lmPcode,
  wardPcode: payloadInput.wardPcode,
  boundaryPoints: normalizeBoundaryPoints(payloadInput.boundaryPoints),
  reasonCode: cleanText(payloadInput.reasonCode).toUpperCase(),
  reasonOther:
    cleanText(payloadInput.reasonCode).toUpperCase() === "OTHER"
      ? cleanText(payloadInput.reasonOther) || null
      : null,
  media: uploadedMedia,
  deviceLocation: normalizeDeviceLocation(payloadInput.deviceLocation),
  clientSubmittedAtMs: payloadInput.clientSubmittedAtMs,
});

const toEnrichedSubmissionError = (error, preparedPayload) => {
  const enrichedError =
    error instanceof Error
      ? error
      : Object.assign(
          new Error(
            cleanText(error?.message) ||
              "The Informal ERF could not be submitted.",
          ),
          error || {},
        );

  enrichedError.preparedPayload = preparedPayload;
  return enrichedError;
};

export const submitInformalErfOnline = async (payloadInput = {}) => {
  const identifiedPayload = ensureInformalErfSubmissionIdentity(payloadInput);
  let uploadedMedia;

  try {
    uploadedMedia = await uploadInformalErfSitePhotos(identifiedPayload);
  } catch (error) {
    console.error("[INFORMAL ERF] Media upload failed.", {
      erfId: identifiedPayload.erfId,
      code: error?.code,
      message: error?.message,
    });
    throw error;
  }

  const preparedPayload = {
    ...identifiedPayload,
    media: uploadedMedia,
  };
  const callablePayload = buildInformalErfCallablePayload(
    preparedPayload,
    uploadedMedia,
  );

  console.log("[INFORMAL ERF] Callable request started.", {
    erfId: identifiedPayload.erfId,
    boundaryPointCount: callablePayload.boundaryPoints.length,
  });

  const apiRequest = store.dispatch(
    informalErfsApi.endpoints.submitInformalErf.initiate(callablePayload),
  );

  try {
    const result = await apiRequest.unwrap();

    console.log("[INFORMAL ERF] Callable response received.", {
      erfId: result?.erfId || identifiedPayload.erfId,
      parcelNo: result?.parcelNo || null,
      duplicate: result?.duplicate === true,
    });

    return {
      result,
      payload: preparedPayload,
    };
  } catch (error) {
    // Do not use console.error here. Firebase callable business rejections are
    // expected workflow outcomes (for example, overlapping ERF boundaries).
    // The caller classifies the rejection and shows the user-facing Alert.
    // console.error causes Expo's developer overlay to render a misleading
    // crash-style stack even though the rejection is fully handled.
    throw toEnrichedSubmissionError(error, preparedPayload);
  } finally {
    if (typeof apiRequest?.reset === "function") {
      apiRequest.reset();
    }
  }
};

export const getInformalErfErrorDetails = (error = {}) => {
  const details =
    error?.details ||
    error?.customData?.details ||
    error?.data ||
    {};

  const message =
    cleanText(error?.message) ||
    cleanText(details?.message) ||
    "The Informal ERF could not be submitted.";

  let code = normalizeErrorCode(
    error?.code ||
      details?.businessCode ||
      details?.code ||
      "UNKNOWN_ERROR",
  );

  if (
    code === "UNKNOWN_ERROR" &&
    /network request failed|failed to fetch|networkerror|network error/i.test(
      message,
    )
  ) {
    code = "NETWORK_REQUEST_FAILED";
  }

  return {
    code,
    message,
    details,
  };
};

export const isPermanentInformalErfError = (error = {}) => {
  const { code, details } = getInformalErfErrorDetails(error);
  const errorType = String(details?.errorType || "").toUpperCase();

  if (details?.retriable === true || errorType === "TEMPORARY") {
    return false;
  }

  if (details?.retriable === false || errorType === "PERMANENT") {
    return true;
  }

  return [
    "INVALID-ARGUMENT",
    "INVALID_ARGUMENT",
    "INVALID_PAYLOAD",
    "UNAUTHENTICATED",
    "PERMISSION-DENIED",
    "PERMISSION_DENIED",
    "FAILED-PRECONDITION",
    "FAILED_PRECONDITION",
    "NOT-FOUND",
    "NOT_FOUND",
    "ALREADY-EXISTS",
    "ALREADY_EXISTS",
    "OUT-OF-RANGE",
    "OUT_OF_RANGE",
    "UNIMPLEMENTED",
    "MISSING_LOCAL_SITE_PHOTO",
    "MISSING_SITE_PHOTO",
    "LOCAL_MEDIA_READ_FAILED",
    "UNAUTHORIZED",
    "OBJECT-NOT-FOUND",
    "BUCKET-NOT-FOUND",
    "PROJECT-NOT-FOUND",
  ].includes(code);
};

export const isRetriableInformalErfError = (error = {}) => {
  const { code, details } = getInformalErfErrorDetails(error);
  const errorType = String(details?.errorType || "").toUpperCase();

  if (details?.retriable === false || errorType === "PERMANENT") {
    return false;
  }

  if (details?.retriable === true || errorType === "TEMPORARY") {
    return true;
  }

  return [
    "UNAVAILABLE",
    "DEADLINE-EXCEEDED",
    "DEADLINE_EXCEEDED",
    "NETWORK_REQUEST_FAILED",
    "ABORTED",
    "CANCELLED",
    "INTERNAL",
    "RESOURCE-EXHAUSTED",
    "RESOURCE_EXHAUSTED",
    "RETRY-LIMIT-EXCEEDED",
    "SERVER-FILE-WRONG-SIZE",
    "UNKNOWN",
  ].includes(code);
};

const saveSubmissionToLocalQueue = async ({
  payload,
  context,
  createdByUid,
  createdByUser,
}) =>
  addInformalErfQueueItem({
    payload,
    context: {
      lmPcode: payload?.lmPcode,
      wardPcode: payload?.wardPcode,
      ...(context || {}),
    },
    createdByUid,
    createdByUser,
  });

export const submitInformalErfWithFallback = async ({
  payloadInput = {},
  context = {},
  createdByUid = "SYSTEM",
  createdByUser = "SYSTEM",
}) => {
  let identifiedPayload;

  try {
    identifiedPayload = ensureInformalErfSubmissionIdentity(payloadInput);
  } catch (error) {
    const errorInfo = getInformalErfErrorDetails(error);

    return {
      success: false,
      mode: "REJECTED",
      code: errorInfo.code,
      firebaseCode: errorInfo.code,
      message: errorInfo.message,
      details: errorInfo.details,
      erfId: null,
    };
  }

  const online = await isDeviceOnline();

  console.log("[INFORMAL ERF] Network state checked.", {
    erfId: identifiedPayload.erfId,
    online,
  });

  if (!online) {
    console.log("[INFORMAL ERF] Queuing submission because device is offline.", {
      erfId: identifiedPayload.erfId,
    });

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
      code: "OFFLINE",
      firebaseCode: null,
      message: queueResult?.success
        ? "No network was available. The Informal ERF was saved locally."
        : queueResult?.message,
      erfId: identifiedPayload.erfId,
      queueItem: queueResult?.queueItem || null,
    };
  }

  try {
    const onlineResult = await submitInformalErfOnline(identifiedPayload);

    return {
      success: true,
      mode: "ONLINE",
      code: onlineResult?.result?.code || "INFORMAL_ERF_CREATED",
      firebaseCode: null,
      message:
        onlineResult?.result?.message ||
        "Informal ERF created successfully.",
      erfId:
        onlineResult?.result?.erfId ||
        identifiedPayload.erfId,
      parcelNo: onlineResult?.result?.parcelNo || null,
      duplicate: onlineResult?.result?.duplicate === true,
      result: onlineResult?.result || null,
    };
  } catch (error) {
    const errorInfo = getInformalErfErrorDetails(error);

    if (isPermanentInformalErfError(error)) {
      console.log("[INFORMAL ERF] Business rejection received; not queued.", {
        erfId: identifiedPayload.erfId,
        code: errorInfo.code,
        message: errorInfo.message,
      });

      return {
        success: false,
        mode: "REJECTED",
        message: errorInfo.message,
        code: errorInfo.code,
        firebaseCode: errorInfo.code,
        details: errorInfo.details,
        erfId: identifiedPayload.erfId,
      };
    }

    if (!isRetriableInformalErfError(error)) {
      console.error("[INFORMAL ERF] Unclassified failure; not queued.", {
        erfId: identifiedPayload.erfId,
        code: errorInfo.code,
        message: errorInfo.message,
      });

      return {
        success: false,
        mode: "FAILED",
        message: errorInfo.message,
        code: errorInfo.code,
        firebaseCode: errorInfo.code,
        details: errorInfo.details,
        erfId: identifiedPayload.erfId,
      };
    }

    const queuePayload =
      error?.preparedPayload || identifiedPayload;

    console.log("[INFORMAL ERF] Queuing temporary failure.", {
      erfId: identifiedPayload.erfId,
      code: errorInfo.code,
      message: errorInfo.message,
    });

    const queueResult = await saveSubmissionToLocalQueue({
      payload: queuePayload,
      context,
      createdByUid,
      createdByUser,
    });

    return {
      success: queueResult?.success === true,
      mode: queueResult?.success ? "QUEUED" : "FAILED",
      reason: "TEMPORARY_FAILURE",
      message: queueResult?.success
        ? "The server is temporarily unavailable. The Informal ERF was saved locally and will retry automatically."
        : queueResult?.message,
      code: errorInfo.code,
      firebaseCode: errorInfo.code,
      details: errorInfo.details,
      erfId: identifiedPayload.erfId,
      queueItem: queueResult?.queueItem || null,
    };
  }
};
