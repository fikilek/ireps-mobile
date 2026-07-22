import {
  getInformalErfCreationReasonLabel,
  INFORMAL_ERF_CREATION_REASON_CODES,
  INFORMAL_ERF_PAYLOAD_SCHEMA_VERSION,
  INFORMAL_ERF_QUEUE_FORM_TYPE,
  INFORMAL_ERF_SITE_PHOTO_TAG,
} from "./informalErfConstants";

function cleanText(value, fallback = "") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function finiteNumber(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return numberValue;
}

function optionalFiniteNumber(value) {
  if (value == null || value === "") return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function cleanJson(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      item === undefined ? null : item,
    ),
  );
}

function buildDeviceLocation(value = {}) {
  return {
    latitude: finiteNumber(
      value?.latitude,
      "Device latitude",
    ),
    longitude: finiteNumber(
      value?.longitude,
      "Device longitude",
    ),
    accuracyM: optionalFiniteNumber(
      value?.accuracyM,
    ),
    altitudeM: optionalFiniteNumber(
      value?.altitudeM,
    ),
    headingDegrees: optionalFiniteNumber(
      value?.headingDegrees,
    ),
    speedMps: optionalFiniteNumber(
      value?.speedMps,
    ),
    capturedAtMs: optionalFiniteNumber(
      value?.capturedAtMs,
    ),
  };
}

function buildProposedErfLocation(value = {}) {
  const lat = finiteNumber(
    value?.lat,
    "Proposed ERF latitude",
  );

  const lng = finiteNumber(
    value?.lng,
    "Proposed ERF longitude",
  );

  if (lat < -90 || lat > 90) {
    throw new Error(
      "Proposed ERF latitude is outside the valid range.",
    );
  }

  if (lng < -180 || lng > 180) {
    throw new Error(
      "Proposed ERF longitude is outside the valid range.",
    );
  }

  if (lat === 0 && lng === 0) {
    throw new Error(
      "Proposed ERF GPS cannot be 0, 0.",
    );
  }

  return { lat, lng };
}

function buildReason({
  reasonCode,
  reasonOther,
}) {
  const code = cleanText(reasonCode).toUpperCase();

  if (!INFORMAL_ERF_CREATION_REASON_CODES.has(code)) {
    throw new Error(
      "A recognised Informal ERF creation reason is required.",
    );
  }

  const otherText =
    code === "OTHER"
      ? cleanText(reasonOther)
      : null;

  if (code === "OTHER" && !otherText) {
    throw new Error(
      "The other Informal ERF reason is required.",
    );
  }

  if (otherText && otherText.length > 250) {
    throw new Error(
      "The other Informal ERF reason cannot exceed 250 characters.",
    );
  }

  return {
    code,
    label:
      getInformalErfCreationReasonLabel(code),
    otherText,
  };
}

function buildMedia(media = []) {
  const mediaList = Array.isArray(media)
    ? media
    : [];

  const sitePhotos = mediaList.filter(
    (item) =>
      item?.tag === INFORMAL_ERF_SITE_PHOTO_TAG &&
      Boolean(
        cleanText(item?.uri) ||
          cleanText(item?.url),
      ),
  );

  if (sitePhotos.length === 0) {
    throw new Error(
      "Informal ERF site photograph is required.",
    );
  }

  return sitePhotos.map((item) => ({
    created: item?.created || null,
    gps: item?.gps || null,
    tag: INFORMAL_ERF_SITE_PHOTO_TAG,
    type: item?.type || "image",
    updated: item?.updated || null,
    uri: cleanText(item?.uri) || null,
    url: cleanText(item?.url) || null,
  }));
}

export function buildInformalErfSubmissionPayload({
  localQueueItemId,
  createdAtMs = Date.now(),
  lmPcode,
  wardPcode,
  deviceLocation,
  proposedErfLocation,
  reasonCode,
  reasonOther,
  media,
}) {
  const queueItemId = cleanText(localQueueItemId);
  const cleanLmPcode = cleanText(lmPcode);
  const cleanWardPcode = cleanText(wardPcode);

  if (!queueItemId) {
    throw new Error(
      "Informal ERF local queue item id is required.",
    );
  }

  if (!cleanLmPcode || cleanLmPcode === "NAv") {
    throw new Error(
      "Local Municipality pcode is required.",
    );
  }

  if (
    !cleanWardPcode ||
    cleanWardPcode === "NAv"
  ) {
    throw new Error("Ward pcode is required.");
  }

  const payload = {
    schemaVersion:
      INFORMAL_ERF_PAYLOAD_SCHEMA_VERSION,

    formType: INFORMAL_ERF_QUEUE_FORM_TYPE,

    request: {
      localQueueItemId: queueItemId,
      createdAtMs: finiteNumber(
        createdAtMs,
        "Request creation time",
      ),
    },

    scope: {
      lmPcode: cleanLmPcode,
      wardPcode: cleanWardPcode,
    },

    deviceLocation:
      buildDeviceLocation(deviceLocation),

    proposedErfLocation:
      buildProposedErfLocation(
        proposedErfLocation,
      ),

    reason: buildReason({
      reasonCode,
      reasonOther,
    }),

    media: buildMedia(media),
  };

  return cleanJson(payload);
}
