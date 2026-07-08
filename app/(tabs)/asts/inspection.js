import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Formik } from "formik";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Divider,
  Modal,
  Portal,
  Surface,
  Text,
  TextInput,
} from "react-native-paper";
import { array, object, string } from "yup";

import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

import { IrepsFormActions } from "../../../components/forms/IrepsFormActions";
import { IrepsNoAccessSection } from "../../../components/forms/IrepsNoAccessSection";
import IrepsSelectWithOther, {
  isSelectWithOtherFilled,
  normalizeSelectWithOtherValue,
  selectWithOtherToText,
} from "../../../components/IrepsSelectWithOther";
import SovereignLocationPicker from "../../../components/maps/SovereignLocationPicker";
import { IrepsMedia } from "../../../components/media/IrepsMedia";
import { ScreenLock } from "../../../components/SceenLock";
import { getSafeCoords } from "../../../src/context/MapContext";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import { functions } from "../../../src/firebase";
import { useAuth } from "../../../src/hooks/useAuth";
import { useIrepsLookupOptions } from "../../../src/hooks/useIrepsLookupOptions";
import {
  addSubmissionQueueItem,
  getSubmissionQueueItemById,
  updateSubmissionQueueItem,
} from "../../../src/utils/submissionQueue";

const EMPTY_SELECT_WITH_OTHER = {
  code: "",
  label: "",
  otherText: "",
};

const INSP_SUBMIT_TIMEOUT_MS = 15000;
const GPS_TOLERANCE_METERS = 5;
const GPS_NEIGHBOURHOOD_RADIUS_METERS = 100;

const OFF_GRID_SUPPLY_OPTIONS = [
  {
    code: "yes",
    label: "Yes",
    description: "Off-grid supply is present.",
    sortOrder: 10,
    enabled: true,
  },
  {
    code: "no",
    label: "No",
    description: "No off-grid supply observed.",
    sortOrder: 20,
    enabled: true,
  },
];

const EXECUTION_MEDIA_TAGS = [
  "astNoPhoto",
  "meterReadingPhoto",
  "anomalyPhoto",
  "normalisationPhoto",
  "noAccessPhoto",
];

function makeEmptySelectWithOther() {
  return { ...EMPTY_SELECT_WITH_OTHER };
}

function safeParseJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value !== "string") return value;
    return JSON.parse(decodeURIComponent(value));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function removeUndefined(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (item === undefined ? null : item)),
  );
}

function textToOtherSelectValue(text) {
  const clean = String(text || "").trim();

  if (!clean || clean === "NAv") return makeEmptySelectWithOther();

  return {
    code: "OTHER",
    label: "Other",
    otherText: clean,
  };
}

function makeSelectFromText(text, options = []) {
  const clean = String(text || "").trim();

  if (!clean || clean === "NAv") return makeEmptySelectWithOther();

  const found = (Array.isArray(options) ? options : []).find((option) => {
    const code = String(option?.code || "")
      .trim()
      .toUpperCase();
    const label = String(option?.label || "")
      .trim()
      .toUpperCase();

    return (
      code === clean.toUpperCase().replace(/\s+/g, "_") ||
      label === clean.toUpperCase()
    );
  });

  if (found) {
    return normalizeSelectWithOtherValue(found);
  }

  return textToOtherSelectValue(clean);
}

function toLatLng(value) {
  if (!value) return null;

  if (Array.isArray(value) && value.length === 2) {
    return { lat: Number(value[0]), lng: Number(value[1]) };
  }

  if (value?.lat != null && value?.lng != null) {
    return { lat: Number(value.lat), lng: Number(value.lng) };
  }

  if (value?.latitude != null && value?.longitude != null) {
    return { lat: Number(value.latitude), lng: Number(value.longitude) };
  }

  return null;
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function calculateDistanceMeters(pointA, pointB) {
  const a = toLatLng(pointA);
  const b = toLatLng(pointB);

  if (!a || !b) return null;

  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * centralAngle;
}

function formatGpsPoint(point) {
  const gps = toLatLng(point);

  if (!gps) return "NAv";

  return `${gps.lat.toFixed(7)}, ${gps.lng.toFixed(7)}`;
}

const ANOMALY_DETAIL_PARENT_BY_CODE = {
  OPERATIONALLY_OK: "METER_OK",

  NO_TID_KC_TOKENS_ON_PORTAL: "METER_NOT_ON_PORTAL",
  NO_SGC_TOKENS_AVAILABLE: "METER_NOT_ON_PORTAL",

  NOT_ACCEPTING_SGC_TOKENS: "METER_FAULTY",
  METER_DISPLAY_BLANK: "METER_FAULTY",
  NEGATIVE_CREDIT_UNITS: "METER_FAULTY",
  ZERO_READING_CONVENTIONAL_METER: "METER_FAULTY",
  ZERO_READING_CONVETIONAL_METER: "METER_FAULTY",
  METER_WHEEL_NOT_MOVING: "METER_FAULTY",
  METER_WHEEL_RUNNING_IN_REVERSE: "METER_FAULTY",

  METER_NUMBER_NOT_CLEARLY_VISIBLE: "METER_DAMAGED",
  METER_BURNT: "METER_DAMAGED",
  METER_BUTTONS_NOT_WORKING: "METER_DAMAGED",
  METER_BROKEN: "METER_DAMAGED",

  STRAIGHT_CONNECTION_METER_BYPASSED: "ILLEGALLY_CONNECTED",
  BRIDGE_WIRE_ON_THE_METER: "ILLEGALLY_CONNECTED",
  BYPASS_SUSPECTED: "ILLEGALLY_CONNECTED",
};

function getAnomalyDetailParentCode(option = {}) {
  return normalizeUpper(
    option?.parentCode ||
      option?.parent?.code ||
      option?.anomalyCode ||
      ANOMALY_DETAIL_PARENT_BY_CODE[normalizeUpper(option?.code)] ||
      "",
  );
}

function anomalyParentMatches(option = {}, selectedParentCode = "") {
  const parentCode = normalizeUpper(selectedParentCode);
  if (!parentCode) return false;

  const optionParentCode = getAnomalyDetailParentCode(option);

  if (!optionParentCode) return false;

  if (optionParentCode === parentCode) return true;

  // Supports both names if the seeded anomaly code is ILLEGAL_CONNECTION
  // while the migrated detail parent is ILLEGALLY_CONNECTED.
  if (
    ["ILLEGAL_CONNECTION", "ILLEGALLY_CONNECTED"].includes(optionParentCode) &&
    ["ILLEGAL_CONNECTION", "ILLEGALLY_CONNECTED"].includes(parentCode)
  ) {
    return true;
  }

  return false;
}

function formatGpsDistance(distanceMeters) {
  if (distanceMeters === null || distanceMeters === undefined) return "NAv";

  const numeric = Number(distanceMeters);

  if (!Number.isFinite(numeric)) return "NAv";

  if (numeric < 1000) {
    return `${numeric.toFixed(numeric < 10 ? 1 : 0)} m`;
  }

  return `${(numeric / 1000).toFixed(2)} km`;
}

function formatGpsDistanceBetween(pointA, pointB) {
  const distanceMeters = calculateDistanceMeters(pointA, pointB);
  return formatGpsDistance(distanceMeters);
}

function toMapCoordinate(value) {
  const gps = toLatLng(value);

  if (!gps) return null;

  return {
    latitude: gps.lat,
    longitude: gps.lng,
  };
}

function readCoordinateFromAny(...values) {
  for (const value of values) {
    const gps = toLatLng(value);
    if (gps) return gps;
  }

  return null;
}

function normalizeBoundaryCoordinates(value) {
  if (!value) return [];

  const rawBoundary =
    value?.boundary ||
    value?.geometry?.boundary ||
    value?.geometry?.coordinates ||
    value?.coordinates ||
    value;

  if (!Array.isArray(rawBoundary)) return [];

  const first = rawBoundary[0];

  // GeoJSON polygon [[[lng, lat], ...]]
  if (Array.isArray(first) && Array.isArray(first[0])) {
    return first
      .map((coord) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;

        return {
          latitude: Number(coord[1]),
          longitude: Number(coord[0]),
        };
      })
      .filter(
        (coord) =>
          Number.isFinite(coord?.latitude) && Number.isFinite(coord?.longitude),
      );
  }

  return rawBoundary
    .map((coord) => {
      if (Array.isArray(coord) && coord.length >= 2) {
        return {
          latitude: Number(coord[0]),
          longitude: Number(coord[1]),
        };
      }

      if (coord?.latitude != null && coord?.longitude != null) {
        return {
          latitude: Number(coord.latitude),
          longitude: Number(coord.longitude),
        };
      }

      if (coord?.lat != null && coord?.lng != null) {
        return {
          latitude: Number(coord.lat),
          longitude: Number(coord.lng),
        };
      }

      return null;
    })
    .filter(
      (coord) =>
        Number.isFinite(coord?.latitude) && Number.isFinite(coord?.longitude),
    );
}

function getBoundaryCentroid(boundary = []) {
  if (!Array.isArray(boundary) || boundary.length === 0) return null;

  const points = boundary
    .map((point) => ({
      lat: Number(point?.latitude),
      lng: Number(point?.longitude),
    }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );

  if (!points.length) return null;

  const sum = points.reduce(
    (acc, point) => {
      acc.lat += point.lat;
      acc.lng += point.lng;
      return acc;
    },
    { lat: 0, lng: 0 },
  );

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  };
}

function getErfCentroid(erf = {}) {
  const direct = readCoordinateFromAny(
    erf?.geometry?.centroid,
    erf?.centroid,
    erf?.coordinate,
    erf?.gps,
    erf?.location?.gps,
  );

  if (direct) return direct;

  return getBoundaryCentroid(normalizeBoundaryCoordinates(erf));
}

function getPremiseCoordinate(premise = {}) {
  return readCoordinateFromAny(
    premise?.geometry?.centroid,
    premise?.coordinate,
    premise?.gps,
    premise?.location?.gps,
    premise?.address?.gps,
  );
}

function getMeterCoordinate(meter = {}) {
  return readCoordinateFromAny(
    meter?.ast?.location?.gps,
    meter?.location?.gps,
    meter?.coordinate,
    meter?.gps,
    meter?.astData?.location?.gps,
  );
}

function normalizeNearbyErf(erf = {}) {
  const boundary = normalizeBoundaryCoordinates(erf);
  const centroid = getErfCentroid(erf);

  if (!boundary.length && !centroid) return null;

  return {
    id: erf?.id || erf?.pcode || erf?.erfId || erf?.erfNo || "NAv",
    erfNo:
      erf?.erfNo ||
      erf?.erf_no ||
      erf?.erfNumber ||
      erf?.sg?.erfNo ||
      erf?.sg?.parcelNo ||
      erf?.parcelNo ||
      erf?.code ||
      "NAv",
    boundary,
    centroid: centroid ? toMapCoordinate(centroid) : null,
  };
}

function normalizeNearbyPremise(premise = {}) {
  const coordinate = getPremiseCoordinate(premise);

  if (!coordinate) return null;

  return {
    id: premise?.id || premise?.premiseId || "NAv",
    coordinate,
    address: premise?.address || {},
    propertyType: premise?.propertyType || {},
  };
}

function normalizeNearbyMeter(meter = {}) {
  const coordinate = getMeterCoordinate(meter);

  if (!coordinate) return null;

  return {
    id:
      meter?.id || meter?.ast?.astData?.astId || meter?.astData?.astId || "NAv",
    coordinate,
    meterType:
      meter?.meterType ||
      meter?.ast?.astData?.meter?.category ||
      meter?.astData?.meter?.category ||
      "NAv",
  };
}

function isWithinRadiusMeters(center, point, radiusMeters = 50) {
  const distance = calculateDistanceMeters(center, point);
  return distance !== null && Number(distance) <= radiusMeters;
}

function formatDateTime(value) {
  if (!value) return "NAv";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NAv";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasMediaTag(media = [], tag) {
  return (Array.isArray(media) ? media : []).some((item) => item?.tag === tag);
}

function filterExecutionMedia(media = []) {
  return (Array.isArray(media) ? media : []).filter((item) =>
    EXECUTION_MEDIA_TAGS.includes(item?.tag),
  );
}

function filterInspectionExecutionMedia(
  media = [],
  { includeReadingMedia = false } = {},
) {
  const executionMedia = filterExecutionMedia(media);

  if (includeReadingMedia) return executionMedia;

  return executionMedia.filter((item) => item?.tag !== "meterReadingPhoto");
}

function getMediaExtension(mediaItem = {}) {
  const type = normalizeLower(mediaItem?.type || mediaItem?.mimeType || "");

  if (type.includes("video")) return "mp4";
  if (type.includes("audio") || type.includes("voice")) return "m4a";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";

  const uri = String(mediaItem?.uri || "").toLowerCase();

  if (uri.includes(".png")) return "png";
  if (uri.includes(".webp")) return "webp";
  if (uri.includes(".mp4")) return "mp4";
  if (uri.includes(".mov")) return "mov";
  if (uri.includes(".m4a")) return "m4a";
  if (uri.includes(".mp3")) return "mp3";

  return "jpg";
}

function stripLocalUri(mediaItem = {}) {
  const { uri, ...cleanItem } = mediaItem || {};
  return cleanItem;
}

function normalizeFirebaseStorageImageUrl(rawUrl) {
  const url = String(rawUrl || "").trim();

  if (!url) return "";

  const marker = "firebasestorage.googleapis.com/v0/b/";
  const objectMarker = "/o/";

  if (!url.includes(marker) || !url.includes(objectMarker)) {
    return url;
  }

  try {
    const [beforeQuery, query = ""] = url.split("?");
    const objectMarkerIndex = beforeQuery.indexOf(objectMarker);

    if (objectMarkerIndex < 0) return url;

    const prefix = beforeQuery.slice(
      0,
      objectMarkerIndex + objectMarker.length,
    );
    const objectPath = beforeQuery.slice(
      objectMarkerIndex + objectMarker.length,
    );

    const decodedObjectPath = decodeURIComponent(objectPath);
    const encodedObjectPath = encodeURIComponent(decodedObjectPath);

    return `${prefix}${encodedObjectPath}${query ? `?${query}` : ""}`;
  } catch (_error) {
    return url;
  }
}

function getMediaPreviewUrl(mediaItem = {}) {
  return normalizeFirebaseStorageImageUrl(
    mediaItem?.url ||
      mediaItem?.downloadURL ||
      mediaItem?.downloadUrl ||
      mediaItem?.storageUrl ||
      mediaItem?.uri ||
      "",
  );
}

function isImageMedia(mediaItem = {}) {
  const type = String(
    mediaItem?.type || mediaItem?.mimeType || "",
  ).toLowerCase();
  const url = getMediaPreviewUrl(mediaItem).toLowerCase();

  return (
    type.includes("image") ||
    url.includes(".jpg") ||
    url.includes(".jpeg") ||
    url.includes(".png") ||
    url.includes(".webp")
  );
}

async function uploadLocalMediaItem({ storage, mediaItem, storagePath }) {
  if (!mediaItem?.uri || mediaItem?.url) {
    return stripLocalUri(mediaItem);
  }

  const response = await fetch(mediaItem.uri);
  const blob = await response.blob();

  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob);

  const downloadUrl = await getDownloadURL(storageRef);

  return {
    ...stripLocalUri(mediaItem),
    url: downloadUrl,
  };
}

function withSubmitTimeout(promise, timeoutMs = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        reject(new Error("SUBMISSION_TIMEOUT"));
      }, timeoutMs),
    ),
  ]);
}

function isNoAccess(values = {}) {
  return (
    String(values?.accessData?.access?.hasAccess || "yes").toLowerCase() ===
    "no"
  );
}

function isConventionalMeterKind(value) {
  const clean = normalizeLower(value).replace(/[\s_-]/g, "");
  return clean === "conventional" || clean === "postpaid" || clean === "credit";
}

function isPrepaidMeterKind(value) {
  const clean = normalizeLower(value).replace(/[\s_-]/g, "");
  return clean === "prepaid" || clean === "prepayment" || clean === "token";
}

function isKnownInspectionMeterKind(value) {
  return isConventionalMeterKind(value) || isPrepaidMeterKind(value);
}

function makeEmptyMreadingPayload() {
  return {
    reading: "",
    readingAt: "NAv",
    noReadingReason: "NAv",
  };
}

function isWaterOrElectricityMeterType(value) {
  const clean = normalizeLower(value).replace(/[\s_-]/g, "");

  return ["electricity", "elec", "elc", "water", "wtr"].includes(clean);
}

function isElectricityMeterService(value) {
  const clean = normalizeLower(value).replace(/[\s_-]/g, "");

  return ["electricity", "elec", "elc"].includes(clean);
}

function isWaterMeterService(value) {
  const clean = normalizeLower(value).replace(/[\s_-]/g, "");

  return ["water", "wtr"].includes(clean);
}

function shouldRequireInspectionReading(values = {}) {
  const capturedMeterKind =
    values?.inspection?.captured?.ast?.astData?.meter?.type ||
    values?.inspection?.lastKnown?.ast?.astData?.meter?.type;

  const meterType =
    values?.meterType || values?.inspection?.lastKnown?.meterType || "NAv";

  return (
    isConventionalMeterKind(capturedMeterKind) &&
    isWaterOrElectricityMeterType(meterType)
  );
}

function routeBackToMyWorkorders(router) {
  const astsIndexRoute = "/(tabs)/asts";
  const targetRoute = "/(tabs)/admin/operations/my-workorders";

  if (typeof router?.replace === "function") {
    // Important: inspection.js belongs to the AST tab stack. If we only route
    // to My Workorders, the AST tab can keep inspection.js as its top screen.
    // First replace the AST stack entry with the AST index, then route to WMS.
    router.replace(astsIndexRoute);

    setTimeout(() => {
      router.replace(targetRoute);
    }, 0);

    return;
  }

  if (typeof router?.push === "function") {
    router.push(targetRoute);
  }
}

function getActionAstSnapshot(action = {}) {
  return action?.ast || action?.raw?.ast || null;
}

function getActionAccessData(action = {}) {
  return action?.accessData || action?.raw?.accessData || {};
}

function getActionStatus(action = {}) {
  return action?.status || action?.raw?.status || {};
}

function getActionAssignment(action = {}) {
  return action?.assignment || action?.raw?.assignment || {};
}

function getOfficeInstruction(action = {}) {
  return (
    action?.officeInstruction ||
    action?.assignment?.instruction ||
    action?.raw?.assignment?.instruction || {
      code: "METER_INSPECTION",
      text: "",
      notes: "",
      mediaRequired: false,
    }
  );
}

function cloneAstForInspection(ast = {}) {
  const astData = ast?.astData || {};
  const meter = astData?.meter || {};
  const location = ast?.location || {};

  return {
    astData: {
      astId: astData?.astId || "",
      astNo: astData?.astNo || "",
      astManufacturer: astData?.astManufacturer || "",
      astManufacturerSelect: makeEmptySelectWithOther(),
      astName: astData?.astName || "",
      meter: {
        type: meter?.type || "",
        category: meter?.category || "",
        phase: meter?.phase || "",
        phaseSelect: makeEmptySelectWithOther(),
        cb: {
          size: meter?.cb?.size || "",
          sizeSelect: makeEmptySelectWithOther(),
          comment: meter?.cb?.comment || "",
        },
        seal: {
          sealNo: meter?.seal?.sealNo || "",
          comment: meter?.seal?.comment || "",
        },
        keypad: {
          serialNo: meter?.keypad?.serialNo || "",
          comment: meter?.keypad?.comment || "",
        },
      },
    },
    anomalies: {
      anomaly: ast?.anomalies?.anomaly || "",
      anomalyDetail: ast?.anomalies?.anomalyDetail || "",
      anomalySelect: makeEmptySelectWithOther(),
      anomalyDetailSelect: makeEmptySelectWithOther(),
    },
    location: {
      gps: toLatLng(location?.gps) || null,
      placement: location?.placement || "",
      placementSelect: makeEmptySelectWithOther(),
    },
    meterReading: ast?.meterReading || "",
    ogs: {
      hasOffGridSupply: ast?.ogs?.hasOffGridSupply || "",
      hasOffGridSupplySelect: makeEmptySelectWithOther(),
    },
    normalisation: {
      actionTaken: "NONE",
      actionText: "None",
      actionSelect: {
        code: "NONE",
        label: "None",
        otherText: "",
      },
      childTrnId: "NAv",
      childTrnType: "NAv",
      childTrnStatus: "NOT_REQUIRED",
    },
  };
}

function buildLastKnownSnapshot({ action, astDoc, sourceAstId }) {
  const astSnapshot = getActionAstSnapshot(action) || astDoc?.ast || {};
  const status = getActionStatus(action) || astDoc?.status || {};
  const accessData = getActionAccessData(action) || astDoc?.accessData || {};

  return {
    sourceAstId:
      sourceAstId || astDoc?.id || astSnapshot?.astData?.astId || "NAv",
    meterType: action?.meterType || astDoc?.meterType || "NAv",
    status,
    accessData,
    ast: {
      astData: astSnapshot?.astData || {},
      anomalies: astSnapshot?.anomalies || {},
      location: astSnapshot?.location || {},
      meterReading: astSnapshot?.meterReading || "NAv",
      ogs: astSnapshot?.ogs || {},
      normalisation: astSnapshot?.normalisation || {},
    },
  };
}

function getByPath(source = {}, path = "") {
  return path.split(".").reduce((acc, key) => {
    if (!acc) return undefined;
    return acc[key];
  }, source);
}

function normalizeCompareText(value) {
  if (value === null || value === undefined) return "";

  const rawValue =
    typeof value === "object" ? JSON.stringify(value) : String(value || "");

  return rawValue.trim().replace(/\s+/g, " ").toLowerCase();
}

function hasMeaningfulExistingValue(value) {
  const cleanValue = normalizeCompareText(value);

  return Boolean(cleanValue) && cleanValue !== "nav";
}

function isDifferentFromExisting({ value, lastKnownValue }) {
  if (!hasMeaningfulExistingValue(lastKnownValue)) return false;

  return normalizeCompareText(value) !== normalizeCompareText(lastKnownValue);
}

function compareTextField({
  differences,
  lastKnownAst,
  capturedAst,
  fieldPath,
  label,
}) {
  const lastKnownValue = normalizeCompareText(
    getByPath(lastKnownAst, fieldPath),
  );
  const capturedValue = normalizeCompareText(getByPath(capturedAst, fieldPath));

  if (lastKnownValue !== capturedValue) {
    differences.push({
      fieldPath: `ast.${fieldPath}`,
      label,
      lastKnownValue: lastKnownValue || "NAv",
      capturedValue: capturedValue || "NAv",
      result: "MISMATCH",
    });
  }
}

function buildComparison({ values, actorUid, actorName }) {
  const lastKnownAst = values?.inspection?.lastKnown?.ast || {};
  const capturedAst = values?.inspection?.captured?.ast || {};
  const differences = [];
  const meterService =
    values?.meterType || values?.inspection?.lastKnown?.meterType;
  const compareElectricityOnlyFields = isElectricityMeterService(meterService);

  const comparisonFields = [
    { fieldPath: "astData.astNo", label: "Meter Number" },
    { fieldPath: "astData.astManufacturer", label: "Manufacturer" },
    { fieldPath: "astData.astName", label: "Meter Model" },
    { fieldPath: "astData.meter.type", label: "Meter Kind" },
    { fieldPath: "astData.meter.category", label: "Meter Category" },
  ];

  if (compareElectricityOnlyFields) {
    comparisonFields.push(
      { fieldPath: "astData.meter.phase", label: "Meter Phase" },
      { fieldPath: "astData.meter.cb.size", label: "CB Size" },
      { fieldPath: "astData.meter.seal.sealNo", label: "Seal Number" },
      {
        fieldPath: "astData.meter.keypad.serialNo",
        label: "Keypad Serial Number",
      },
      { fieldPath: "location.placement", label: "Meter Placement" },
      { fieldPath: "ogs.hasOffGridSupply", label: "Off-grid Supply" },
    );
  }

  comparisonFields.forEach((config) =>
    compareTextField({
      differences,
      lastKnownAst,
      capturedAst,
      fieldPath: config.fieldPath,
      label: config.label,
    }),
  );

  const lastKnownGps = toLatLng(lastKnownAst?.location?.gps);
  const capturedGps = toLatLng(capturedAst?.location?.gps);

  // INSPECTION GPS rule:
  // If the executor does not touch/capture GPS during inspection, keep captured
  // GPS empty and do not compare it. This preserves the true field meaning:
  // GPS was not inspected/changed in this inspection.
  if (capturedGps) {
    const distanceMeters = calculateDistanceMeters(lastKnownGps, capturedGps);

    if (
      distanceMeters === null ||
      Number(distanceMeters) > GPS_TOLERANCE_METERS
    ) {
      differences.push({
        fieldPath: "ast.location.gps",
        label: "Meter GPS",
        lastKnownValue: lastKnownGps || "NAv",
        capturedValue: capturedGps,
        distanceMeters:
          distanceMeters === null ? null : Number(distanceMeters.toFixed(2)),
        toleranceMeters: GPS_TOLERANCE_METERS,
        result: "MISMATCH",
      });
    }
  }

  const previousConfirmation =
    values?.inspection?.comparison?.confirmation || {};

  return {
    checkedAt: new Date().toISOString(),
    gpsToleranceMeters: GPS_TOLERANCE_METERS,
    hasDifferences: differences.length > 0,
    differenceCount: differences.length,
    differences,
    excludedFields: [
      "ast.meterReading",
      "ast.anomalies",
      "ast.normalisation",
      "media",
      "metadata",
    ],
    confirmation: {
      required: differences.length > 0,
      confirmed:
        differences.length > 0
          ? previousConfirmation?.confirmed === true
          : true,
      confirmedAt:
        differences.length > 0
          ? previousConfirmation?.confirmedAt || "NAv"
          : new Date().toISOString(),
      confirmedByUid:
        differences.length > 0
          ? previousConfirmation?.confirmedByUid || "NAv"
          : actorUid || "NAv",
      confirmedByUser:
        differences.length > 0
          ? previousConfirmation?.confirmedByUser || "NAv"
          : actorName || "NAv",
    },
  };
}

function normalizeComparisonSignatureValue(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value || "").trim();
}

function buildComparisonSignature(comparison = {}) {
  const differences = Array.isArray(comparison?.differences)
    ? comparison.differences
    : [];

  return JSON.stringify(
    differences.map((difference) => ({
      fieldPath: difference?.fieldPath || "",
      lastKnownValue: normalizeComparisonSignatureValue(
        difference?.lastKnownValue,
      ),
      capturedValue: normalizeComparisonSignatureValue(
        difference?.capturedValue,
      ),
      distanceMeters: difference?.distanceMeters ?? null,
    })),
  );
}

function buildAssignmentPayload({ assignment = {}, officeInstruction = {} }) {
  const { instructionSelect, createdFor, ...restAssignment } = assignment || {};

  const targetFromCreatedFor = createdFor?.id
    ? [
        {
          type: createdFor?.type || "USER",
          id: createdFor.id,
          name: createdFor?.name || "NAv",
        },
      ]
    : [];

  const targets =
    Array.isArray(restAssignment?.targets) && restAssignment.targets.length
      ? restAssignment.targets
      : targetFromCreatedFor;

  return removeUndefined({
    ...restAssignment,
    targets,
    instruction: {
      ...(restAssignment?.instruction || {}),
      code:
        restAssignment?.instruction?.code ||
        officeInstruction?.code ||
        "METER_INSPECTION",
      text: restAssignment?.instruction?.text || officeInstruction?.text || "",
      notes:
        restAssignment?.instruction?.notes || officeInstruction?.notes || "",
      mediaRequired:
        restAssignment?.instruction?.mediaRequired ??
        officeInstruction?.mediaRequired ??
        false,
    },
  });
}

function buildCapturedMreading(values = {}, { isConventional = false } = {}) {
  if (!isConventional || isNoAccess(values)) {
    return makeEmptyMreadingPayload();
  }

  const mreading = values?.inspection?.captured?.mreading || {};
  const reading = String(mreading?.reading || "").trim();

  return {
    reading: reading || "NAv",
    readingAt: reading
      ? mreading?.readingAt || new Date().toISOString()
      : "NAv",
    noReadingReason: selectWithOtherToText(mreading?.noReadingReason) || "NAv",
  };
}

function getNormalisationActionCode(values = {}) {
  return (
    values?.inspection?.captured?.ast?.normalisation?.actionSelect?.code ||
    values?.inspection?.captured?.ast?.normalisation?.actionTaken ||
    "NONE"
  );
}

function shouldRequireNormalisationPhoto(values = {}) {
  return getNormalisationActionCode(values) !== "NONE";
}

function shouldRequireAnomalyPhoto(values = {}) {
  const anomalyCode =
    values?.inspection?.captured?.ast?.anomalies?.anomalySelect?.code || "";

  const anomalyText =
    values?.inspection?.captured?.ast?.anomalies?.anomaly || "";

  return !["METER_OK", "Meter Ok", "meter ok"].includes(
    anomalyCode || anomalyText,
  );
}

function getNestedError(errorObject, path) {
  return path.split(".").reduce((acc, key) => {
    if (!acc || typeof acc !== "object") return "";
    return acc[key];
  }, errorObject);
}

function getErrorText(errorObject, path) {
  const value = getNestedError(errorObject, path);
  return typeof value === "string" ? value : "";
}

const InspectionSchema = object()
  .shape({
    accessData: object().shape({
      access: object().shape({
        hasAccess: string()
          .oneOf(["yes", "no"])
          .required("Access outcome is required"),
        reason: string().notRequired(),
        reasonSelect: object().shape({
          code: string().notRequired(),
          label: string().notRequired(),
          otherText: string().notRequired(),
        }),
      }),
    }),
    inspection: object().shape({
      captured: object().shape({
        ast: object().shape({
          astData: object().shape({
            astNo: string().notRequired(),
            astManufacturer: string().notRequired(),
            astName: string().notRequired(),
          }),
        }),
      }),
    }),
    media: array().of(object()),
  })
  .test(
    "inspection-v01-validation",
    "Inspection validation failed",
    function (values = {}) {
      const noAccess = isNoAccess(values);
      const media = values?.media || [];
      const lastKnownMeterKind =
        values?.inspection?.lastKnown?.ast?.astData?.meter?.type ||
        values?.ast?.astData?.meter?.type ||
        "";

      if (!isKnownInspectionMeterKind(lastKnownMeterKind)) {
        return this.createError({
          path: "inspection.captured.ast.astData.meter.type",
          message:
            "Inspection is blocked because the existing iREPS meter kind is unknown. Update the meter record before creating an INSPECTION.",
        });
      }

      if (noAccess) {
        if (
          !isSelectWithOtherFilled(values?.accessData?.access?.reasonSelect)
        ) {
          return this.createError({
            path: "accessData.access.reasonSelect",
            message: "No-access reason is required",
          });
        }

        if (!hasMediaTag(media, "noAccessPhoto")) {
          return this.createError({
            path: "media",
            message: "No access photo is required",
          });
        }

        return true;
      }

      const capturedAst = values?.inspection?.captured?.ast || {};
      const astData = capturedAst?.astData || {};
      const meter = astData?.meter || {};
      const meterService =
        values?.meterType || values?.inspection?.lastKnown?.meterType;
      const requireElectricityOnlyFields =
        isElectricityMeterService(meterService);

      if (!String(astData?.astNo || "").trim()) {
        return this.createError({
          path: "inspection.captured.ast.astData.astNo",
          message: "Meter number is required",
        });
      }

      if (!String(astData?.astManufacturer || "").trim()) {
        return this.createError({
          path: "inspection.captured.ast.astData.astManufacturer",
          message: "Manufacturer is required",
        });
      }

      if (!String(astData?.astName || "").trim()) {
        return this.createError({
          path: "inspection.captured.ast.astData.astName",
          message: "Meter model/name is required",
        });
      }

      if (!String(meter?.type || "").trim()) {
        return this.createError({
          path: "inspection.captured.ast.astData.meter.type",
          message: "Meter kind is required",
        });
      }

      if (!String(meter?.category || "").trim()) {
        return this.createError({
          path: "inspection.captured.ast.astData.meter.category",
          message: "Meter category is required",
        });
      }

      if (requireElectricityOnlyFields) {
        if (!String(meter?.phase || "").trim()) {
          return this.createError({
            path: "inspection.captured.ast.astData.meter.phaseSelect",
            message: "Phase is required",
          });
        }

        if (!String(meter?.cb?.size || "").trim()) {
          return this.createError({
            path: "inspection.captured.ast.astData.meter.cb.sizeSelect",
            message: "CB size is required",
          });
        }

        if (!String(meter?.keypad?.serialNo || "").trim()) {
          return this.createError({
            path: "inspection.captured.ast.astData.meter.keypad.serialNo",
            message: "Serial number is required",
          });
        }

        if (!String(capturedAst?.location?.placement || "").trim()) {
          return this.createError({
            path: "inspection.captured.ast.location.placementSelect",
            message: "Placement is required",
          });
        }

        if (!String(capturedAst?.ogs?.hasOffGridSupply || "").trim()) {
          return this.createError({
            path: "inspection.captured.ast.ogs.hasOffGridSupplySelect",
            message: "Off-grid supply is required",
          });
        }
      }

      if (!String(values?.status?.state || "").trim()) {
        return this.createError({
          path: "status.stateSelect",
          message: "Meter status is required",
        });
      }

      if (!isSelectWithOtherFilled(capturedAst?.anomalies?.anomalySelect)) {
        return this.createError({
          path: "inspection.captured.ast.anomalies.anomalySelect",
          message: "Anomaly is required",
        });
      }

      if (
        !isSelectWithOtherFilled(capturedAst?.anomalies?.anomalyDetailSelect)
      ) {
        return this.createError({
          path: "inspection.captured.ast.anomalies.anomalyDetailSelect",
          message: "Anomaly detail is required",
        });
      }

      if (!isSelectWithOtherFilled(capturedAst?.normalisation?.actionSelect)) {
        return this.createError({
          path: "inspection.captured.ast.normalisation.actionSelect",
          message: "Normalisation action is required",
        });
      }

      if (!hasMediaTag(media, "astNoPhoto")) {
        return this.createError({
          path: "media",
          message: "Meter number photo is required",
        });
      }

      if (
        shouldRequireAnomalyPhoto(values) &&
        !hasMediaTag(media, "anomalyPhoto")
      ) {
        return this.createError({
          path: "media",
          message: "Anomaly photo is required when anomaly is not Meter Ok",
        });
      }

      if (
        shouldRequireNormalisationPhoto(values) &&
        !hasMediaTag(media, "normalisationPhoto")
      ) {
        return this.createError({
          path: "media",
          message:
            "Normalisation photo is required when normalisation is not None",
        });
      }

      const mreading = values?.inspection?.captured?.mreading || {};
      const reading = String(mreading?.reading || "").trim();
      const noReadingReason = selectWithOtherToText(mreading?.noReadingReason);
      const readingRequired = shouldRequireInspectionReading(values);

      if (readingRequired && !reading && !noReadingReason) {
        return this.createError({
          path: "inspection.captured.mreading.noReadingReason",
          message:
            "Meter reading is required for a conventional meter. If no reading is available, select a no-reading reason.",
        });
      }

      if (reading && !String(mreading?.readingAt || "").trim()) {
        return this.createError({
          path: "inspection.captured.mreading.readingAt",
          message: "Meter reading date/time is required",
        });
      }

      if (reading && !hasMediaTag(media, "meterReadingPhoto")) {
        return this.createError({
          path: "media",
          message: "Meter reading photo is required when reading is captured",
        });
      }

      const comparison = values?.inspection?.comparison || {};

      if (
        comparison?.hasDifferences === true &&
        comparison?.confirmation?.confirmed !== true
      ) {
        return this.createError({
          path: "inspection.comparison.confirmation.confirmed",
          message: "Confirm comparison differences before submit",
        });
      }

      return true;
    },
  );

function lookupState(lookup = {}) {
  return {
    options: lookup?.options || [],
    allowOther: lookup?.allowOther ?? true,
    otherCode: lookup?.otherCode || "OTHER",
    otherLabel: lookup?.otherLabel || "Other",
    loading: lookup?.isLoading || lookup?.isFetching,
  };
}

function AccessOutcomeCard({ value, setFieldValue }) {
  const hasAccess = String(value || "yes").toLowerCase();

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="gate" size={18} color="#2563eb" />
        <Text style={styles.sectionTitle}>Access Outcome</Text>
      </View>

      <View style={styles.choiceRow}>
        {[
          { value: "yes", label: "ACCESS YES", icon: "check-circle-outline" },
          { value: "no", label: "NO ACCESS", icon: "close-circle-outline" },
        ].map((option) => {
          const active = hasAccess === option.value;

          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.choiceButton, active && styles.choiceButtonActive]}
              activeOpacity={0.8}
              onPress={() => {
                setFieldValue("accessData.access.hasAccess", option.value);

                if (option.value === "yes") {
                  setFieldValue("accessData.access.reason", "NAv");
                  setFieldValue(
                    "accessData.access.reasonSelect",
                    makeEmptySelectWithOther(),
                  );
                }
              }}
            >
              <MaterialCommunityIcons
                name={option.icon}
                size={17}
                color={active ? "#ffffff" : "#2563eb"}
              />
              <Text
                style={[
                  styles.choiceButtonText,
                  active && styles.choiceButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Surface>
  );
}

function OfficeInstructionSection({
  title = "Inspection Instruction",
  icon = "clipboard-search-outline",
  color = "#2563eb",
  instruction = {},
  media = [],
}) {
  const [activeMedia, setActiveMedia] = useState(null);

  const cleanMedia = useMemo(() => {
    return (Array.isArray(media) ? media : []).filter(
      (item) => item?.url || item?.uri,
    );
  }, [media]);

  const hasMedia = cleanMedia.length > 0;
  const activeUrl = getMediaPreviewUrl(activeMedia);

  async function openActiveMediaExternal() {
    if (!activeUrl) return;

    try {
      await Linking.openURL(activeUrl);
    } catch (_error) {
      Alert.alert(
        "Open Media Failed",
        "Could not open this instruction media item.",
      );
    }
  }

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      <View style={styles.readOnlyBox}>
        <Text style={styles.readOnlyLabel}>Instruction</Text>
        <Text style={styles.readOnlyValue}>{instruction?.text || "NAv"}</Text>

        <Text style={styles.readOnlyLabel}>Instruction Notes</Text>
        <Text style={styles.readOnlyValue}>
          {instruction?.notes || "No notes captured."}
        </Text>

        <Text style={styles.readOnlyLabel}>Instruction Media</Text>

        {!hasMedia ? (
          <Text style={styles.readOnlyValue}>
            No instruction media captured.
          </Text>
        ) : (
          <View style={styles.readOnlyMediaList}>
            {cleanMedia.map((item, index) => {
              const itemUrl = item?.url || item?.uri || "";
              const isImage =
                String(item?.type || "").toLowerCase() === "image" ||
                itemUrl.toLowerCase().includes(".jpg") ||
                itemUrl.toLowerCase().includes(".jpeg") ||
                itemUrl.toLowerCase().includes(".png") ||
                itemUrl.toLowerCase().includes(".webp");

              return (
                <TouchableOpacity
                  key={`${itemUrl || "instruction-media"}-${index}`}
                  style={styles.mediaReadOnlyRow}
                  activeOpacity={0.8}
                  onPress={() => setActiveMedia(item)}
                >
                  <View style={styles.mediaReadOnlyThumbWrap}>
                    {isImage ? (
                      <Image
                        source={{ uri: getMediaPreviewUrl(item) }}
                        style={styles.mediaReadOnlyThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name="file-eye-outline"
                        size={20}
                        color="#2563EB"
                      />
                    )}
                  </View>

                  <View style={styles.mediaReadOnlyMain}>
                    <Text style={styles.mediaReadOnlyText}>
                      {item?.tag || "instructionMedia"} •{" "}
                      {item?.type || "media"}
                    </Text>

                    {!!item?.created?.byUser && (
                      <Text style={styles.mediaReadOnlyMeta}>
                        Uploaded by {item.created.byUser}
                      </Text>
                    )}

                    <Text style={styles.mediaReadOnlyHint}>Tap to preview</Text>
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color="#2563EB"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <Portal>
        <Modal
          visible={Boolean(activeMedia)}
          onDismiss={() => setActiveMedia(null)}
          style={styles.centeredPortalModal}
          contentContainerStyle={styles.instructionMediaModal}
        >
          <View style={styles.instructionMediaModalHeader}>
            <View style={styles.instructionMediaModalIcon}>
              <MaterialCommunityIcons
                name="image-multiple-outline"
                size={22}
                color="#2563EB"
              />
            </View>

            <View style={styles.instructionMediaModalTitleWrap}>
              <Text style={styles.instructionMediaModalTitle}>
                Instruction Media
              </Text>
              <Text style={styles.instructionMediaModalSub}>
                {activeMedia?.tag || "instructionMedia"} •{" "}
                {activeMedia?.type || "media"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.instructionMediaModalClose}
              onPress={() => setActiveMedia(null)}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          {activeUrl ? (
            <>
              <View style={styles.instructionMediaPreviewFrame}>
                <Image
                  source={{ uri: activeUrl }}
                  style={styles.instructionMediaPreviewImage}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.instructionMediaMetaBox}>
                <Text style={styles.instructionMediaMetaText}>
                  Uploaded by: {activeMedia?.created?.byUser || "NAv"}
                </Text>
                <Text style={styles.instructionMediaMetaText}>
                  Tag: {activeMedia?.tag || "NAv"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.openInstructionMediaButton}
                onPress={openActiveMediaExternal}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons
                  name="open-in-new"
                  size={17}
                  color="#FFFFFF"
                />
                <Text style={styles.openInstructionMediaButtonText}>
                  OPEN FULL IMAGE
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.instructionMediaEmptyBox}>
              <MaterialCommunityIcons
                name="image-off-outline"
                size={34}
                color="#94A3B8"
              />
              <Text style={styles.readOnlyValue}>No media URL found.</Text>
            </View>
          )}
        </Modal>
      </Portal>
    </Surface>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "NAv"}</Text>
    </View>
  );
}

function SameDeleteTextField({
  label,
  value,
  lastKnownValue,
  onChangeText,
  onSame,
  onDelete,
  keyboardType = "default",
  errorText = "",
}) {
  const cleanValue = String(value || "").trim();
  const hasValue = Boolean(cleanValue);
  const hasLastKnown = hasMeaningfulExistingValue(lastKnownValue);
  const isDifferent = isDifferentFromExisting({ value, lastKnownValue });

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.lastKnownRow}>
        <Text style={styles.lastKnownText}>
          Existing iREPS value: {lastKnownValue || "NAv"}
        </Text>

        {isDifferent && (
          <View style={styles.differentPill}>
            <Text style={styles.differentPillText}>DIFFERENT</Text>
          </View>
        )}
      </View>

      <View style={isDifferent ? styles.differentFieldFrame : null}>
        <TextInput
          mode="outlined"
          label={label}
          value={value || ""}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          style={styles.input}
        />
      </View>

      <View style={styles.sameDeleteRow}>
        {!hasValue && hasLastKnown && (
          <TouchableOpacity style={styles.sameButton} onPress={onSame}>
            <Text style={styles.sameButtonText}>SAME</Text>
          </TouchableOpacity>
        )}

        {hasValue && (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
            <Text style={styles.deleteButtonText}>DELETE</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
    </View>
  );
}

function SameDeleteSelectField({
  label,
  value,
  lastKnownValue,
  options = [],
  lookup = {},
  onChange,
  onSame,
  onDelete,
  errorText = "",
}) {
  const displayText = selectWithOtherToText(value);
  const hasValue = Boolean(String(displayText || "").trim());
  const hasLastKnown = hasMeaningfulExistingValue(lastKnownValue);
  const isDifferent = isDifferentFromExisting({
    value: displayText,
    lastKnownValue,
  });

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.lastKnownRow}>
        <Text style={styles.lastKnownText}>
          Existing iREPS value: {lastKnownValue || "NAv"}
        </Text>

        {isDifferent && (
          <View style={styles.differentPill}>
            <Text style={styles.differentPillText}>DIFFERENT</Text>
          </View>
        )}
      </View>

      <View style={isDifferent ? styles.differentFieldFrame : null}>
        <IrepsSelectWithOther
          label={label}
          placeholder={`Select ${label.toLowerCase()}`}
          options={options}
          includeOther={lookup.allowOther}
          otherCode={lookup.otherCode}
          otherLabel={lookup.otherLabel}
          loading={lookup.loading}
          value={value}
          onChange={onChange}
          errorText={errorText}
        />
      </View>

      <View style={styles.sameDeleteRow}>
        {!hasValue && hasLastKnown && (
          <TouchableOpacity style={styles.sameButton} onPress={onSame}>
            <Text style={styles.sameButtonText}>SAME</Text>
          </TouchableOpacity>
        )}

        {hasValue && (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
            <Text style={styles.deleteButtonText}>DELETE</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ComparisonModal({
  visible,
  comparison,
  onClose,
  onConfirm,
  submitting = false,
}) {
  const differences = comparison?.differences || [];

  return (
    <Portal>
      <Modal
        visible={visible}
        dismissable={false}
        style={styles.centeredPortalModal}
        contentContainerStyle={styles.comparisonModal}
      >
        <View style={styles.comparisonHeader}>
          <View style={styles.comparisonIcon}>
            <MaterialCommunityIcons
              name="compare-horizontal"
              size={24}
              color="#ffffff"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.comparisonTitle}>Confirm Differences</Text>
            <Text style={styles.comparisonSub}>
              iREPS found {differences.length} field difference(s).
            </Text>
          </View>
        </View>

        <ScrollView style={styles.comparisonList}>
          {differences.map((difference, index) => (
            <View
              key={`${difference.fieldPath}-${index}`}
              style={styles.diffCard}
            >
              <Text style={styles.diffTitle}>{difference.label}</Text>

              <Text style={styles.diffText}>
                iREPS:{" "}
                {typeof difference.lastKnownValue === "object"
                  ? formatGpsPoint(difference.lastKnownValue)
                  : difference.lastKnownValue}
              </Text>

              <Text style={styles.diffText}>
                Captured:{" "}
                {typeof difference.capturedValue === "object"
                  ? formatGpsPoint(difference.capturedValue)
                  : difference.capturedValue}
              </Text>

              {difference.distanceMeters != null && (
                <Text style={styles.diffHint}>
                  Distance: {difference.distanceMeters}m • Tolerance:{" "}
                  {difference.toleranceMeters}m
                </Text>
              )}
            </View>
          ))}
        </ScrollView>

        <Text style={styles.confirmWarning}>
          Confirm only if these are true field differences and not capture
          mistakes.
        </Text>

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={styles.correctButton}
            onPress={onClose}
            disabled={submitting}
          >
            <Text style={styles.correctButtonText}>GO BACK AND CORRECT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={onConfirm}
            disabled={submitting}
          >
            <Text style={styles.confirmButtonText}>
              {submitting ? "SUBMITTING" : "CONFIRM AND SUBMIT"}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Portal>
  );
}

export default function InspectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { all } = useWarehouse();
  const { user, profile } = useAuth();

  const queueItemId = Array.isArray(params?.queueItemId)
    ? params.queueItemId[0]
    : params?.queueItemId;

  const action = useMemo(
    () => safeParseJson(params?.action, {}),
    [params?.action],
  );

  const instructionTrnId = readFirstString(
    params?.instructionTrnId,
    params?.trnId,
    action?.instructionTrnId,
    action?.trnId,
    action?.id,
  );

  const sourceAstId = readFirstString(
    params?.sourceAstId,
    action?.sourceAstId,
    action?.astId,
    getActionAstSnapshot(action)?.astData?.astId,
  );

  const astDoc = useMemo(() => {
    const meters = Array.isArray(all?.meters) ? all.meters : [];

    return (
      meters.find((meter) => meter?.id === sourceAstId) ||
      meters.find((meter) => meter?.ast?.astData?.astId === sourceAstId) ||
      action?.raw ||
      action ||
      null
    );
  }, [all?.meters, sourceAstId, action]);

  const officeInstruction = getOfficeInstruction(action);
  const officeInstructionMedia = Array.isArray(action?.officeInstructionMedia)
    ? action.officeInstructionMedia
    : Array.isArray(action?.media)
      ? action.media.filter((media) => media?.tag === "instructionMedia")
      : [];

  const agentUid = user?.uid || profile?.uid || "unknown_uid";
  const agentName =
    profile?.profile?.displayName || profile?.profile?.email || "Field Agent";

  const [editQueueItem, setEditQueueItem] = useState(undefined);
  const [inProgress, setInProgress] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [comparisonReview, setComparisonReview] = useState({
    visible: false,
    comparison: null,
    submitting: false,
  });
  const confirmedComparisonSignatureRef = useRef("");
  const pendingComparisonSubmitValuesRef = useRef(null);
  const [submitOutcome, setSubmitOutcome] = useState({
    visible: false,
    type: null,
    title: "",
    message: "",
  });

  useEffect(() => {
    let active = true;

    async function loadQueueItem() {
      if (!queueItemId) {
        if (active) setEditQueueItem(null);
        return;
      }

      const queueItem = await getSubmissionQueueItemById(queueItemId);
      if (active) setEditQueueItem(queueItem || null);
    }

    loadQueueItem();

    return () => {
      active = false;
    };
  }, [queueItemId]);

  const noReadingLookup = lookupState(
    useIrepsLookupOptions("METER_NO_READING_REASON"),
  );
  const anomalyLookup = lookupState(useIrepsLookupOptions("METER_ANOMALY"));
  const anomalyDetailLookup = lookupState(
    useIrepsLookupOptions("ANOMALY_DETAIL"),
  );
  const normalisationLookup = lookupState(
    useIrepsLookupOptions("METER_NORMALISATION_ACTION"),
  );
  const placementLookup = lookupState(useIrepsLookupOptions("METER_PLACEMENT"));
  const cbSizeLookup = lookupState(useIrepsLookupOptions("METER_CB_SIZE"));
  const phaseLookup = lookupState(useIrepsLookupOptions("METER_PHASE"));
  const manufacturerLookup = lookupState(
    useIrepsLookupOptions("METER_MANUFACTURER"),
  );
  const connectionStatusLookup = lookupState(
    useIrepsLookupOptions("METER_CONNECTION_STATUS"),
  );

  const lastKnown = useMemo(
    () => buildLastKnownSnapshot({ action, astDoc, sourceAstId }),
    [action, astDoc, sourceAstId],
  );

  const meterType = normalizeLower(
    action?.meterType || astDoc?.meterType || lastKnown?.meterType,
  );

  const lastKnownMeterKind =
    lastKnown?.ast?.astData?.meter?.type || action?.meterKind || "NAv";

  const isConventional = isConventionalMeterKind(lastKnownMeterKind);
  const isPrepaid = isPrepaidMeterKind(lastKnownMeterKind);
  const isKnownMeterKind = isKnownInspectionMeterKind(lastKnownMeterKind);

  const manufacturerOptions = useMemo(() => {
    return (manufacturerLookup.options || []).filter((option) => {
      if (!Array.isArray(option?.appliesTo) || option.appliesTo.length === 0) {
        return true;
      }

      return option.appliesTo
        .map((item) => normalizeLower(item))
        .includes(meterType);
    });
  }, [manufacturerLookup.options, meterType]);

  const statusIsEligible = !["DECOMMISSIONED"].includes(
    normalizeUpper(lastKnown?.status?.state || action?.meterPreStatus),
  );

  const isEligible = statusIsEligible && isKnownMeterKind;

  const eligibilityBlockMessage = !statusIsEligible
    ? "DECOMMISSIONED meters cannot be inspected."
    : !isKnownMeterKind
      ? "Inspection is blocked because the existing iREPS meter kind is unknown. Update the meter record before creating an INSPECTION."
      : "";

  const gpsNeighbourhood = useMemo(() => {
    const accessData = getActionAccessData(action) || astDoc?.accessData || {};

    const center =
      readCoordinateFromAny(
        lastKnown?.ast?.location?.gps,
        getActionAstSnapshot(action)?.location?.gps,
        astDoc?.ast?.location?.gps,
        astDoc?.location?.gps,
      ) || null;

    const erfs = Array.isArray(all?.erfs) ? all.erfs : [];
    const premises = Array.isArray(all?.prems) ? all.prems : [];
    const meters = Array.isArray(all?.meters) ? all.meters : [];

    const currentErfId = String(
      accessData?.erfId || astDoc?.accessData?.erfId || "",
    );

    const currentErfNo = String(
      accessData?.erfNo || astDoc?.accessData?.erfNo || action?.erfNo || "",
    );

    const currentErf =
      erfs.find((erf) => String(erf?.id || "") === currentErfId) ||
      erfs.find(
        (erf) =>
          String(
            erf?.erfNo ||
              erf?.erf_no ||
              erf?.erfNumber ||
              erf?.sg?.erfNo ||
              erf?.sg?.parcelNo ||
              erf?.parcelNo ||
              erf?.code ||
              "",
          ) === currentErfNo,
      ) ||
      null;

    const currentBoundaryGeo =
      all?.geoLibrary?.[currentErf?.id] ||
      all?.geoEntries?.[currentErf?.id] ||
      all?.geoLibrary?.[currentErfId] ||
      all?.geoEntries?.[currentErfId] ||
      null;

    const currentBoundary =
      getSafeCoords(currentBoundaryGeo?.geometry) ||
      normalizeBoundaryCoordinates(currentErf);

    const currentCentroid =
      readCoordinateFromAny(
        currentErf?.geometry?.centroid,
        currentBoundaryGeo?.centroid,
        getBoundaryCentroid(currentBoundary),
        center,
      ) || null;

    const nearbyErfs = erfs
      .filter((item) => String(item?.id || "") !== currentErfId)
      .map((item) => {
        const boundaryGeo =
          all?.geoLibrary?.[item?.id] || all?.geoEntries?.[item?.id] || null;

        const boundary =
          getSafeCoords(boundaryGeo?.geometry) ||
          normalizeBoundaryCoordinates(item);

        const coordinate = readCoordinateFromAny(
          item?.geometry?.centroid,
          boundaryGeo?.centroid,
          item?.centroid,
          item?.coordinate,
          getBoundaryCentroid(boundary),
        );

        const distance = calculateDistanceMeters(center, coordinate);

        return {
          id: item?.id || item?.erfId || item?.erfNo || "NAv",
          erfNo:
            item?.erfNo ||
            item?.erf_no ||
            item?.erfNumber ||
            item?.sg?.erfNo ||
            item?.sg?.parcelNo ||
            item?.parcelNo ||
            item?.code ||
            "NAv",
          coordinate,
          centroid: coordinate,
          boundary,
          distance,
        };
      })
      .filter(
        (item) =>
          item.coordinate &&
          Array.isArray(item.boundary) &&
          item.boundary.length > 0 &&
          item.distance !== null &&
          item.distance <= GPS_NEIGHBOURHOOD_RADIUS_METERS,
      )
      .slice(0, 80);

    const nearbyPremises = premises
      .map((premise) => {
        const coordinate = getPremiseCoordinate(premise);
        const distance = calculateDistanceMeters(center, coordinate);

        return {
          ...normalizeNearbyPremise(premise),
          distance,
        };
      })
      .filter(
        (premise) =>
          premise &&
          premise.coordinate &&
          premise.distance !== null &&
          premise.distance <= GPS_NEIGHBOURHOOD_RADIUS_METERS,
      )
      .slice(0, 120);

    const nearbyMeters = meters
      .map((meter) => {
        const coordinate = getMeterCoordinate(meter);
        const distance = calculateDistanceMeters(center, coordinate);
        const normalized = normalizeNearbyMeter(meter);

        if (!normalized) return null;

        return {
          ...normalized,
          coordinate,
          distance,
          meterType:
            meter?.meterType ||
            meter?.ast?.meterType ||
            meter?.ast?.astData?.meter?.category ||
            meter?.astData?.meter?.category ||
            "NAv",
        };
      })
      .filter(
        (meter) =>
          meter &&
          meter.coordinate &&
          meter.distance !== null &&
          meter.distance <= GPS_NEIGHBOURHOOD_RADIUS_METERS,
      )
      .slice(0, 160);

    return {
      center,
      erfBoundary: currentBoundary,
      erfCentroid: currentCentroid,
      nearbyErfs,
      nearbyPremises,
      nearbyMeters,
    };
  }, [
    action,
    all?.erfs,
    all?.geoEntries,
    all?.geoLibrary,
    all?.meters,
    all?.prems,
    astDoc,
    lastKnown?.ast?.location?.gps,
  ]);

  const serviceProvider =
    action?.serviceProvider ||
    astDoc?.serviceProvider ||
    action?.raw?.serviceProvider ||
    {};

  function buildTrnSystemFields() {
    const accessData = getActionAccessData(action) || astDoc?.accessData || {};

    return {
      erfId: accessData?.erfId || "NAv",
      erfNo: accessData?.erfNo || action?.erfNo || "NAv",
      trnType: "METER_INSPECTION",
      parents: accessData?.parents || {},
      premise: accessData?.premise || {
        id: params?.premiseId || action?.premiseId || "NAv",
        address: action?.address || "NAv",
        propertyType: "NAv",
      },
    };
  }

  function buildQueueContext(values, baseSystemFields) {
    return {
      formType: "METER_INSPECTION",
      trnType: "METER_INSPECTION",
      trnId: instructionTrnId,
      sourceAstId,
      meterNo:
        values?.inspection?.captured?.ast?.astData?.astNo ||
        lastKnown?.ast?.astData?.astNo ||
        "NAv",
      meterType: values?.meterType || meterType || "NAv",
      erfNo: baseSystemFields?.erfNo || "NAv",
      premiseId: baseSystemFields?.premise?.id || "NAv",
      lmPcode: baseSystemFields?.parents?.lmPcode || "NAv",
      wardPcode: baseSystemFields?.parents?.wardPcode || "NAv",
    };
  }

  function buildExecutionPayload(values, mediaOverride) {
    const baseSystemFields = buildTrnSystemFields();
    const noAccess = isNoAccess(values);
    const noAccessReason = noAccess
      ? selectWithOtherToText(values?.accessData?.access?.reasonSelect)
      : "NAv";
    const capturedMeterKind =
      values?.inspection?.captured?.ast?.astData?.meter?.type ||
      values?.inspection?.lastKnown?.ast?.astData?.meter?.type ||
      lastKnownMeterKind;
    const payloadIsConventional = isConventionalMeterKind(capturedMeterKind);

    const capturedAst = values?.inspection?.captured?.ast || {};
    const comparison = values?.inspection?.comparison || {};

    const finalInspection = {
      ...values.inspection,
      inspectedAt: values?.inspection?.inspectedAt || new Date().toISOString(),
      lastKnown: values?.inspection?.lastKnown,
      captured: {
        ...values?.inspection?.captured,
        ast: {
          ...capturedAst,
          normalisation: {
            ...capturedAst?.normalisation,
            actionTaken:
              capturedAst?.normalisation?.actionSelect?.code ||
              capturedAst?.normalisation?.actionTaken ||
              "NONE",
            actionText:
              selectWithOtherToText(capturedAst?.normalisation?.actionSelect) ||
              capturedAst?.normalisation?.actionText ||
              "None",
          },
        },
        mreading: buildCapturedMreading(values, {
          isConventional: payloadIsConventional,
        }),
      },
      comparison,
    };

    const executionOutcome = noAccess
      ? {
          outcome: "NO_ACCESS",
          success: false,
        }
      : {
          outcome: "SUCCESS",
          success: true,
        };

    return removeUndefined({
      id: instructionTrnId,
      instructionTrnId,
      sourceAstId: astDoc?.id || sourceAstId || "NAv",
      trnType: "METER_INSPECTION",

      accessData: {
        ...baseSystemFields,
        access: {
          hasAccess: values?.accessData?.access?.hasAccess || "yes",
          reason: noAccessReason || "NAv",
          reasonSelect: values?.accessData?.access?.reasonSelect,
        },
      },

      // Common MLCT shell remains present.
      ast: getActionAstSnapshot(action) || astDoc?.ast || null,

      // INSPECTION-specific captured data.
      inspection: finalInspection,

      executionOutcome,

      assignment: buildAssignmentPayload({
        assignment: values.assignment,
        officeInstruction,
      }),

      meterType: values?.meterType || meterType || "NAv",
      media: filterInspectionExecutionMedia(
        mediaOverride || values.media || [],
        {
          includeReadingMedia: payloadIsConventional,
        },
      ),
      status: {
        state: values?.status?.state || "NAv",
        id: values?.status?.id || values?.accessData?.parents?.lmPcode || "NAv",
        detail:
          values?.status?.detail ||
          values?.accessData?.parents?.lmPcode ||
          "NAv",
      },
      serviceProvider,

      origin: {
        channel: "OFFICE",
        source: "WMS",
        parentInspectionTrnId: action?.origin?.parentInspectionTrnId || null,
      },

      workflow: values?.workflow,
    });
  }

  async function syncInspectionMedia(values) {
    const storage = getStorage();
    const capturedMeterKind =
      values?.inspection?.captured?.ast?.astData?.meter?.type ||
      values?.inspection?.lastKnown?.ast?.astData?.meter?.type ||
      lastKnownMeterKind;
    const media = filterInspectionExecutionMedia(values?.media || [], {
      includeReadingMedia: isConventionalMeterKind(capturedMeterKind),
    });

    return await Promise.all(
      media.map(async (mediaItem) => {
        if (!mediaItem?.uri || mediaItem?.url) {
          return stripLocalUri(mediaItem);
        }

        const extension = getMediaExtension(mediaItem);
        const fileName = `${instructionTrnId}_${mediaItem?.tag || "inspectionEvidence"}_${Date.now()}.${extension}`;

        return await uploadLocalMediaItem({
          storage,
          mediaItem,
          storagePath: `meters/lifecycle/inspection/${fileName}`,
        });
      }),
    );
  }

  async function saveDraftToQueue(
    values,
    messageTitle,
    messageBody,
    queueStatus = "IN_PROGRESS",
  ) {
    const baseSystemFields = buildTrnSystemFields();
    const cleanPayload = buildExecutionPayload(values, values?.media || []);
    const nextContext = buildQueueContext(values, baseSystemFields);

    let queueResult = null;

    if (queueItemId) {
      const existingSync = editQueueItem?.sync || {
        attempts: 0,
        lastAttemptAt: "NAv",
        nextRetryAt: "NAv",
      };

      queueResult = await updateSubmissionQueueItem(
        queueItemId,
        {
          payload: cleanPayload,
          context: nextContext,
          status: queueStatus,
          result: {
            success: false,
            code:
              queueStatus === "PENDING"
                ? "SUBMISSION_NOT_CONFIRMED"
                : "LOCAL_SAVE_ONLY",
            message:
              queueStatus === "PENDING"
                ? "Submission was not confirmed by backend. Draft remains pending for retry."
                : "Saved locally only. Not submitted.",
            trnId: instructionTrnId || "NAv",
          },
          sync: {
            ...existingSync,
            nextRetryAt: "NAv",
          },
        },
        agentUid,
        agentName,
      );
    } else {
      queueResult = await addSubmissionQueueItem({
        formType: "METER_INSPECTION",
        payload: cleanPayload,
        context: nextContext,
        status: queueStatus,
        createdByUid: agentUid,
        createdByUser: agentName,
      });
    }

    if (!queueResult?.success) {
      Alert.alert(
        "Draft Save Failed",
        "Failed to save inspection draft locally.",
      );
      return false;
    }

    setSubmitOutcome({
      visible: false,
      type: null,
      title: "",
      message: "",
    });

    routeBackToMyWorkorders(router);

    return true;
  }

  async function handleSaveInspection(values) {
    try {
      setSaveInProgress(true);

      await saveDraftToQueue(
        values,
        "SAVED LOCALLY",
        "This INSP execution form was saved locally only. It was not submitted and no backend update was made.",
      );

      setSaveInProgress(false);
    } catch (error) {
      setSaveInProgress(false);

      Alert.alert(
        "Save Failed",
        error?.message || "Failed to save this INSP form locally.",
      );
    }
  }

  async function handleSubmitInspection(values, helpers) {
    if (!instructionTrnId) {
      setInProgress(false);
      Alert.alert(
        "Missing Instruction",
        "This INSP execution form must be opened from an accepted WMS instruction.",
      );
      helpers?.setSubmitting?.(false);
      return;
    }

    if (!astDoc) {
      setInProgress(false);
      Alert.alert("Error", "AST data not found.");
      helpers?.setSubmitting?.(false);
      return;
    }

    if (!isEligible) {
      Alert.alert(
        "Not Eligible",
        eligibilityBlockMessage || "This meter cannot be inspected.",
      );
      setInProgress(false);
      helpers?.setSubmitting?.(false);
      return;
    }

    const noAccess = isNoAccess(values);
    const skipComparisonReview = helpers?.skipComparisonReview === true;
    let comparison = helpers?.confirmedComparison || null;

    if (!skipComparisonReview) {
      comparison = buildComparison({
        values,
        actorUid: agentUid,
        actorName: agentName,
      });
    } else if (!comparison) {
      comparison = values?.inspection?.comparison || {};
    }

    const comparisonSignature = buildComparisonSignature(comparison);

    if (skipComparisonReview && comparison?.hasDifferences) {
      comparison = {
        ...comparison,
        confirmation: {
          ...(comparison.confirmation || {}),
          required: true,
          confirmed: true,
          confirmedAt:
            comparison?.confirmation?.confirmedAt &&
            comparison.confirmation.confirmedAt !== "NAv"
              ? comparison.confirmation.confirmedAt
              : new Date().toISOString(),
          confirmedByUid:
            comparison?.confirmation?.confirmedByUid &&
            comparison.confirmation.confirmedByUid !== "NAv"
              ? comparison.confirmation.confirmedByUid
              : agentUid || "NAv",
          confirmedByUser:
            comparison?.confirmation?.confirmedByUser &&
            comparison.confirmation.confirmedByUser !== "NAv"
              ? comparison.confirmation.confirmedByUser
              : agentName || "NAv",
        },
      };
      confirmedComparisonSignatureRef.current =
        buildComparisonSignature(comparison);
    } else if (comparison?.hasDifferences) {
      const matchesConfirmedComparison =
        confirmedComparisonSignatureRef.current &&
        confirmedComparisonSignatureRef.current === comparisonSignature;

      if (matchesConfirmedComparison) {
        comparison.confirmation = {
          ...(comparison.confirmation || {}),
          required: true,
          confirmed: true,
          confirmedAt:
            comparison?.confirmation?.confirmedAt &&
            comparison.confirmation.confirmedAt !== "NAv"
              ? comparison.confirmation.confirmedAt
              : new Date().toISOString(),
          confirmedByUid:
            comparison?.confirmation?.confirmedByUid &&
            comparison.confirmation.confirmedByUid !== "NAv"
              ? comparison.confirmation.confirmedByUid
              : agentUid || "NAv",
          confirmedByUser:
            comparison?.confirmation?.confirmedByUser &&
            comparison.confirmation.confirmedByUser !== "NAv"
              ? comparison.confirmation.confirmedByUser
              : agentName || "NAv",
        };
      } else {
        comparison.confirmation = {
          ...(comparison.confirmation || {}),
          required: true,
          confirmed: false,
          confirmedAt: "NAv",
          confirmedByUid: "NAv",
          confirmedByUser: "NAv",
        };
      }
    } else {
      confirmedComparisonSignatureRef.current = "";
    }

    const comparisonForSubmit = noAccess
      ? values?.inspection?.comparison || comparison
      : comparison;

    const submitValues = {
      ...values,
      inspection: {
        ...(values?.inspection || {}),
        comparison: comparisonForSubmit,
      },
    };

    if (
      !noAccess &&
      (!comparison?.hasDifferences ||
        comparison?.confirmation?.confirmed === true)
    ) {
      helpers?.setFieldValue?.("inspection.comparison", comparison, false);
    }

    if (
      !skipComparisonReview &&
      !noAccess &&
      comparison?.hasDifferences &&
      comparison?.confirmation?.confirmed !== true
    ) {
      pendingComparisonSubmitValuesRef.current = submitValues;
      setComparisonReview({
        visible: true,
        comparison,
        submitting: false,
      });

      setInProgress(false);
      helpers?.setSubmitting?.(false);
      return;
    }

    const hasConfirmedDifferences =
      !noAccess &&
      comparison?.hasDifferences &&
      comparison?.confirmation?.confirmed === true;

    try {
      setInProgress(true);

      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable;

      if (!isOnline) {
        if (hasConfirmedDifferences) {
          await saveDraftToQueue(
            submitValues,
            "SAVED LOCALLY",
            "You are offline. The confirmed INSP form was saved locally and marked pending for submission when network connectivity returns.",
            "PENDING",
          );
        } else {
          Alert.alert(
            "Offline",
            "You are offline. Use SAVE to keep this INSP execution form locally, then submit when online.",
          );
        }

        setInProgress(false);
        helpers?.setSubmitting?.(false);
        return;
      }

      const syncedMedia = await syncInspectionMedia(submitValues);
      const cleanPayload = buildExecutionPayload(submitValues, syncedMedia);

      const onMeterLifecycleTrnCallable = httpsCallable(
        functions,
        "onMeterLifecycleTrnCallable",
      );

      let result = null;

      try {
        const callableResult = await withSubmitTimeout(
          onMeterLifecycleTrnCallable(cleanPayload),
          INSP_SUBMIT_TIMEOUT_MS,
        );

        result = callableResult?.data || {};
      } catch (error) {
        if (error?.message === "SUBMISSION_TIMEOUT") {
          await saveDraftToQueue(
            submitValues,
            "SAVED LOCALLY",
            "The submission took too long. The INSP form was saved locally only and was not confirmed by the backend.",
            "PENDING",
          );

          setInProgress(false);
          helpers?.setSubmitting?.(false);
          return;
        }

        setInProgress(false);
        helpers?.setSubmitting?.(false);

        Alert.alert(
          "Submission Failed",
          error?.message || "Meter inspection submission failed.",
        );

        return;
      }

      if (!result?.success) {
        setInProgress(false);
        helpers?.setSubmitting?.(false);

        Alert.alert(
          "Submission Failed",
          result?.message || "Meter inspection submission failed.",
        );

        return;
      }

      if (queueItemId) {
        await updateSubmissionQueueItem(
          queueItemId,
          {
            status: "SUCCESS",
            result: {
              success: true,
              code: result?.code || "SUCCESS",
              message:
                result?.message || "Meter inspection synced successfully.",
              trnId: result?.trnId || instructionTrnId || "NAv",
            },
            sync: {
              ...(editQueueItem?.sync || {}),
              nextRetryAt: "NAv",
            },
          },
          agentUid,
          agentName,
        );

      }

      setInProgress(false);
      helpers?.setSubmitting?.(false);

      routeBackToMyWorkorders(router);
    } catch (error) {
      Alert.alert("Error", error?.message || "Submission failed");
      setInProgress(false);
      helpers?.setSubmitting?.(false);
    }
  }

  const getInitialValues = useCallback(() => {
    const editPayload = editQueueItem?.payload || null;

    if (editPayload) {
      return {
        ...editPayload,
        accessData: {
          ...editPayload?.accessData,
          access: {
            hasAccess:
              editPayload?.accessData?.access?.hasAccess === "no"
                ? "no"
                : "yes",
            reason: editPayload?.accessData?.access?.reason || "NAv",
            reasonSelect:
              editPayload?.accessData?.access?.reasonSelect ||
              makeEmptySelectWithOther(),
          },
        },
      };
    }

    return {
      id: instructionTrnId,
      instructionTrnId,
      sourceAstId: astDoc?.id || sourceAstId || "NAv",
      trnType: "METER_INSPECTION",
      meterType: meterType || "NAv",

      accessData: {
        ...buildTrnSystemFields(),
        access: {
          hasAccess: "yes",
          reason: "NAv",
          reasonSelect: makeEmptySelectWithOther(),
        },
      },

      ast: getActionAstSnapshot(action) || astDoc?.ast || null,

      inspection: {
        inspectedAt: new Date().toISOString(),
        lastKnown,
        captured: {
          ast: {
            ...cloneAstForInspection({}),
            normalisation: {
              actionTaken: "NONE",
              actionText: "None",
              actionSelect: {
                code: "NONE",
                label: "None",
                otherText: "",
              },
              childTrnId: "NAv",
              childTrnType: "NAv",
              childTrnStatus: "NOT_REQUIRED",
            },
          },
          mreading: {
            reading: "",
            readingAt: "",
            noReadingReason: makeEmptySelectWithOther(),
          },
        },
        comparison: {
          checkedAt: "NAv",
          gpsToleranceMeters: GPS_TOLERANCE_METERS,
          hasDifferences: false,
          differenceCount: 0,
          differences: [],
          confirmation: {
            required: false,
            confirmed: false,
            confirmedAt: "NAv",
            confirmedByUid: "NAv",
            confirmedByUser: "NAv",
          },
        },
      },

      executionOutcome: {
        outcome: "SUCCESS",
        success: true,
      },

      assignment: getActionAssignment(action),
      media: [],
      status: {
        ...(lastKnown?.status || {}),
        stateSelect: makeSelectFromText(
          lastKnown?.status?.state || action?.meterPreStatus,
          connectionStatusLookup.options,
        ),
      },
      serviceProvider,
      workflow: action?.workflow || action?.raw?.workflow || {},
      origin: action?.origin || action?.raw?.origin || {},
    };
  }, [
    action,
    astDoc,
    editQueueItem?.payload,
    instructionTrnId,
    lastKnown,
    meterType,
    serviceProvider,
    sourceAstId,
    connectionStatusLookup.options,
  ]);

  const actionInit = useMemo(() => getInitialValues(), [getInitialValues]);

  if (queueItemId && editQueueItem === undefined) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loaderText}>Loading draft.</Text>
      </View>
    );
  }

  if (!instructionTrnId) {
    return (
      <ScrollView style={styles.container}>
        <Stack.Screen
          options={{
            title: "Meter Inspection",
            headerTitleStyle: { fontSize: 14, fontWeight: "900" },
          }}
        />
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={42}
            color="#ef4444"
          />
          <Text style={styles.emptyTitle}>Missing instruction</Text>
          <Text style={styles.emptyText}>
            INSPECTION must be opened from an accepted office-originated WMS
            instruction.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
      <ScreenLock
        visible={inProgress}
        title="SYNCING"
        status="Submitting meter inspection."
      />

      <Formik
        initialValues={actionInit}
        validationSchema={InspectionSchema}
        onSubmit={handleSubmitInspection}
        enableReinitialize={true}
        validateOnMount={true}
        validateOnChange={true}
        validateOnBlur={true}
      >
        {({
            values,
            errors,
            isValid,
            handleSubmit,
            resetForm,
            validateForm,
            setFieldValue,
            setSubmitting,
        }) => {
          const noAccess = isNoAccess(values);
          const capturedAst = values?.inspection?.captured?.ast || {};
          const astData = capturedAst?.astData || {};
          const meter = astData?.meter || {};
          const lastKnownAst = values?.inspection?.lastKnown?.ast || {};
          const accessErrors = errors?.accessData?.access || {};
          const inspectionErrors = errors?.inspection || {};
          const capturedErrors = inspectionErrors?.captured?.ast || {};
          const statusErrors = errors?.status || {};
          const selectedAnomalyCode =
            capturedAst?.anomalies?.anomalySelect?.code || "";

          const anomalyDetailOptions = selectedAnomalyCode
            ? (anomalyDetailLookup.options || []).filter((option) =>
                anomalyParentMatches(option, selectedAnomalyCode),
              )
            : [];

          const summaryAstData = lastKnownAst?.astData || {};
          const summaryMeter = summaryAstData?.meter || {};
          const summaryMeterNo = readFirstString(
            summaryAstData?.astNo,
            action?.meterNo,
            "NAv",
          );
          const summaryManufacturer = readFirstString(
            summaryAstData?.astManufacturer,
            "NAv",
          );
          const summaryModel = readFirstString(summaryAstData?.astName, "NAv");
          const summaryMeterType = readFirstString(
            values?.meterType,
            action?.meterType,
            summaryMeter?.category,
            "NAv",
          );
          const summaryMeterKind = readFirstString(
            summaryMeter?.type,
            action?.meterKind,
            "NAv",
          ).toLowerCase();
          const isElectricityInspectionService = isElectricityMeterService(
            values?.meterType || action?.meterType || meterType,
          );
          const isWaterInspectionService = isWaterMeterService(
            values?.meterType || action?.meterType || meterType,
          );
          const summaryCurrentStatus = normalizeUpper(
            readFirstString(
              values?.status?.state,
              action?.meterPreStatus,
              "UNKNOWN",
            ),
          );
          const summaryErfNo = readFirstString(
            values?.accessData?.erfNo,
            action?.erfNo,
            "NAv",
          );
          const summaryPremiseAddress = readFirstString(
            values?.accessData?.premise?.address,
            action?.address,
            "NAv",
          );

          return (
            <ScrollView
              style={styles.container}
              contentContainerStyle={styles.content}
            >
              <Stack.Screen
                options={{
                  title: "Meter Inspection",
                  headerTitleStyle: { fontSize: 14, fontWeight: "900" },
                }}
              />

              <Surface style={styles.card} elevation={1}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons
                    name="counter"
                    size={18}
                    color="#2563eb"
                  />
                  <Text style={styles.sectionTitle}>Meter Summary</Text>
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>TRN</Text>
                    <Text style={styles.summaryValue}>
                      {instructionTrnId || "INSP"}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Meter No</Text>
                    <Text style={styles.summaryValue}>{summaryMeterNo}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Manufacturer</Text>
                    <Text style={styles.summaryValue}>
                      {summaryManufacturer}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Model</Text>
                    <Text style={styles.summaryValue}>{summaryModel}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Meter Type</Text>
                    <Text style={styles.summaryValue}>{summaryMeterType}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Meter Kind</Text>
                    <Text style={styles.summaryValue}>{summaryMeterKind}</Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Current Status</Text>
                    <Text style={styles.summaryValue}>
                      {summaryCurrentStatus}
                    </Text>
                  </View>
                </View>

                <Divider style={{ marginVertical: 12 }} />

                <View style={styles.addressRow}>
                  <MaterialCommunityIcons
                    name="map-marker-outline"
                    size={16}
                    color="#64748b"
                  />
                  <Text style={styles.addressText}>
                    ERF {summaryErfNo} • {summaryPremiseAddress}
                  </Text>
                </View>
              </Surface>

              <OfficeInstructionSection
                title="Inspection Instruction"
                icon="clipboard-search-outline"
                color="#2563eb"
                instruction={officeInstruction}
                media={officeInstructionMedia}
              />

              {!isKnownMeterKind && (
                <Surface style={styles.blockedCard} elevation={1}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="alert-octagon-outline"
                      size={18}
                      color="#dc2626"
                    />
                    <Text style={styles.blockedTitle}>Inspection Blocked</Text>
                  </View>
                  <Text style={styles.blockedText}>
                    The existing iREPS meter kind is unknown. Unknown meter kind
                    must not be inspected. Update the meter record before
                    creating or completing an INSPECTION.
                  </Text>
                </Surface>
              )}

              {isPrepaid && (
                <Surface style={styles.infoCard} elevation={1}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="information-outline"
                      size={18}
                      color="#2563eb"
                    />
                    <Text style={styles.infoTitle}>Prepaid Meter Rule</Text>
                  </View>
                  <Text style={styles.infoText}>
                    This is a prepaid meter. INSPECTION is allowed, but meter
                    reading is not required, the reading field is hidden, and
                    AST.mreadings must not be updated.
                  </Text>
                </Surface>
              )}

              {isWaterInspectionService && (
                <Surface style={styles.infoCard} elevation={1}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="water-outline"
                      size={18}
                      color="#2563eb"
                    />
                    <Text style={styles.infoTitle}>Water Meter Rule</Text>
                  </View>
                  <Text style={styles.infoText}>
                    This is a water meter. Sprint 1 INSPECTION captures shared
                    water fields only. Phase, CB, keypad, seal, placement, and
                    off-grid supply are not active for water inspection.
                  </Text>
                </Surface>
              )}

              <AccessOutcomeCard
                value={values?.accessData?.access?.hasAccess || "yes"}
                setFieldValue={setFieldValue}
              />

              <Surface style={styles.card} elevation={1}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons
                    name="clipboard-check-outline"
                    size={18}
                    color="#2563eb"
                  />
                  <Text style={styles.sectionTitle}>Inspection Capture</Text>
                </View>

                {noAccess ? (
                  <IrepsNoAccessSection
                    visible={true}
                    value={values?.accessData?.access?.reasonSelect}
                    onChange={(nextValue) => {
                      setFieldValue(
                        "accessData.access.reasonSelect",
                        nextValue,
                      );
                      setFieldValue(
                        "accessData.access.reason",
                        selectWithOtherToText(nextValue),
                      );
                    }}
                    mediaName="media"
                    mediaTag="noAccessPhoto"
                    agentName={agentName}
                    agentUid={agentUid}
                    fallbackGps={lastKnownAst?.location?.gps || null}
                    reasonErrorText={
                      typeof accessErrors?.reasonSelect === "string"
                        ? accessErrors.reasonSelect
                        : ""
                    }
                    mediaErrorText={
                      typeof errors?.media === "string" &&
                      errors.media.toLowerCase().includes("access")
                        ? errors.media
                        : ""
                    }
                  />
                ) : (
                  <>
                    <Surface style={styles.questionCard} elevation={1}>
                      <SameDeleteTextField
                        label="Meter Number"
                        value={astData?.astNo}
                        lastKnownValue={lastKnownAst?.astData?.astNo}
                        onChangeText={(text) =>
                          setFieldValue(
                            "inspection.captured.ast.astData.astNo",
                            text,
                          )
                        }
                        onSame={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.astNo",
                            lastKnownAst?.astData?.astNo || "",
                          )
                        }
                        onDelete={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.astNo",
                            "",
                          )
                        }
                        errorText={
                          typeof capturedErrors?.astData?.astNo === "string"
                            ? capturedErrors.astData.astNo
                            : ""
                        }
                      />

                      <View style={styles.evidenceSlot}>
                        <IrepsMedia
                          name="media"
                          tag="astNoPhoto"
                          agentName={agentName}
                          agentUid={agentUid}
                          fallbackGps={capturedAst?.location?.gps || null}
                          required={true}
                        />
                      </View>
                    </Surface>

                    <Surface style={styles.questionCard} elevation={1}>
                      <SameDeleteSelectField
                        label="Manufacturer"
                        value={astData?.astManufacturerSelect}
                        lastKnownValue={lastKnownAst?.astData?.astManufacturer}
                        options={manufacturerOptions}
                        lookup={manufacturerLookup}
                        onChange={(nextValue) => {
                          setFieldValue(
                            "inspection.captured.ast.astData.astManufacturerSelect",
                            nextValue,
                          );
                          setFieldValue(
                            "inspection.captured.ast.astData.astManufacturer",
                            selectWithOtherToText(nextValue),
                          );
                        }}
                        onSame={() => {
                          const nextValue = makeSelectFromText(
                            lastKnownAst?.astData?.astManufacturer,
                            manufacturerOptions,
                          );
                          setFieldValue(
                            "inspection.captured.ast.astData.astManufacturerSelect",
                            nextValue,
                          );
                          setFieldValue(
                            "inspection.captured.ast.astData.astManufacturer",
                            selectWithOtherToText(nextValue),
                          );
                        }}
                        onDelete={() => {
                          setFieldValue(
                            "inspection.captured.ast.astData.astManufacturerSelect",
                            makeEmptySelectWithOther(),
                          );
                          setFieldValue(
                            "inspection.captured.ast.astData.astManufacturer",
                            "",
                          );
                        }}
                        errorText={getErrorText(
                          errors,
                          "inspection.captured.ast.astData.astManufacturer",
                        )}
                      />
                    </Surface>

                    <Surface style={styles.questionCard} elevation={1}>
                      <SameDeleteTextField
                        label="Meter Model / Name"
                        value={astData?.astName}
                        lastKnownValue={lastKnownAst?.astData?.astName}
                        onChangeText={(text) =>
                          setFieldValue(
                            "inspection.captured.ast.astData.astName",
                            text,
                          )
                        }
                        onSame={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.astName",
                            lastKnownAst?.astData?.astName || "",
                          )
                        }
                        onDelete={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.astName",
                            "",
                          )
                        }
                        errorText={
                          typeof capturedErrors?.astData?.astName === "string"
                            ? capturedErrors.astData.astName
                            : ""
                        }
                      />
                    </Surface>

                    <Surface style={styles.questionCard} elevation={1}>
                      <SameDeleteTextField
                        label="Meter Kind"
                        value={meter?.type}
                        lastKnownValue={lastKnownAst?.astData?.meter?.type}
                        onChangeText={(text) =>
                          setFieldValue(
                            "inspection.captured.ast.astData.meter.type",
                            text,
                          )
                        }
                        onSame={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.meter.type",
                            lastKnownAst?.astData?.meter?.type || "",
                          )
                        }
                        onDelete={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.meter.type",
                            "",
                          )
                        }
                        errorText={
                          typeof capturedErrors?.astData?.meter?.type ===
                          "string"
                            ? capturedErrors.astData.meter.type
                            : ""
                        }
                      />
                    </Surface>

                    <Surface style={styles.questionCard} elevation={1}>
                      <SameDeleteTextField
                        label="Meter Category"
                        value={meter?.category}
                        lastKnownValue={lastKnownAst?.astData?.meter?.category}
                        onChangeText={(text) =>
                          setFieldValue(
                            "inspection.captured.ast.astData.meter.category",
                            text,
                          )
                        }
                        onSame={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.meter.category",
                            lastKnownAst?.astData?.meter?.category || "",
                          )
                        }
                        onDelete={() =>
                          setFieldValue(
                            "inspection.captured.ast.astData.meter.category",
                            "",
                          )
                        }
                        errorText={getErrorText(
                          errors,
                          "inspection.captured.ast.astData.meter.category",
                        )}
                      />
                    </Surface>

                    {isElectricityInspectionService && (
                      <>
                        <Surface style={styles.questionCard} elevation={1}>
                          <SameDeleteSelectField
                            label="Phase"
                            value={meter?.phaseSelect}
                            lastKnownValue={lastKnownAst?.astData?.meter?.phase}
                            options={phaseLookup.options}
                            lookup={phaseLookup}
                            onChange={(nextValue) => {
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.phaseSelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.phase",
                                selectWithOtherToText(nextValue),
                              );
                            }}
                            onSame={() => {
                              const nextValue = makeSelectFromText(
                                lastKnownAst?.astData?.meter?.phase,
                                phaseLookup.options,
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.phaseSelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.phase",
                                selectWithOtherToText(nextValue),
                              );
                            }}
                            onDelete={() => {
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.phaseSelect",
                                makeEmptySelectWithOther(),
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.phase",
                                "",
                              );
                            }}
                            errorText={getErrorText(
                              errors,
                              "inspection.captured.ast.astData.meter.phaseSelect",
                            )}
                          />
                        </Surface>

                        <Surface style={styles.questionCard} elevation={1}>
                          <SameDeleteSelectField
                            label="CB Size"
                            value={meter?.cb?.sizeSelect}
                            lastKnownValue={
                              lastKnownAst?.astData?.meter?.cb?.size
                            }
                            options={cbSizeLookup.options}
                            lookup={cbSizeLookup}
                            onChange={(nextValue) => {
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.cb.sizeSelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.cb.size",
                                selectWithOtherToText(nextValue),
                              );
                            }}
                            onSame={() => {
                              const nextValue = makeSelectFromText(
                                lastKnownAst?.astData?.meter?.cb?.size,
                                cbSizeLookup.options,
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.cb.sizeSelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.cb.size",
                                selectWithOtherToText(nextValue),
                              );
                            }}
                            onDelete={() => {
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.cb.sizeSelect",
                                makeEmptySelectWithOther(),
                              );
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.cb.size",
                                "",
                              );
                            }}
                            errorText={getErrorText(
                              errors,
                              "inspection.captured.ast.astData.meter.cb.sizeSelect",
                            )}
                          />
                        </Surface>

                        <Surface style={styles.questionCard} elevation={1}>
                          <SameDeleteTextField
                            label="Seal Number"
                            value={meter?.seal?.sealNo}
                            lastKnownValue={
                              lastKnownAst?.astData?.meter?.seal?.sealNo
                            }
                            onChangeText={(text) =>
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.seal.sealNo",
                                text,
                              )
                            }
                            onSame={() =>
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.seal.sealNo",
                                lastKnownAst?.astData?.meter?.seal?.sealNo ||
                                  "",
                              )
                            }
                            onDelete={() =>
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.seal.sealNo",
                                "",
                              )
                            }
                          />
                        </Surface>

                        <Surface style={styles.questionCard} elevation={1}>
                          <SameDeleteTextField
                            label="Keypad Serial Number"
                            value={meter?.keypad?.serialNo}
                            lastKnownValue={
                              lastKnownAst?.astData?.meter?.keypad?.serialNo
                            }
                            onChangeText={(text) =>
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.keypad.serialNo",
                                text,
                              )
                            }
                            onSame={() =>
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.keypad.serialNo",
                                lastKnownAst?.astData?.meter?.keypad
                                  ?.serialNo || "",
                              )
                            }
                            onDelete={() =>
                              setFieldValue(
                                "inspection.captured.ast.astData.meter.keypad.serialNo",
                                "",
                              )
                            }
                            errorText={getErrorText(
                              errors,
                              "inspection.captured.ast.astData.meter.keypad.serialNo",
                            )}
                          />
                        </Surface>

                        <Surface style={styles.questionCard} elevation={1}>
                          <SameDeleteSelectField
                            label="Placement"
                            value={capturedAst?.location?.placementSelect}
                            lastKnownValue={lastKnownAst?.location?.placement}
                            options={placementLookup.options}
                            lookup={placementLookup}
                            onChange={(nextValue) => {
                              setFieldValue(
                                "inspection.captured.ast.location.placementSelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.location.placement",
                                selectWithOtherToText(nextValue),
                              );
                            }}
                            onSame={() => {
                              const nextValue = makeSelectFromText(
                                lastKnownAst?.location?.placement,
                                placementLookup.options,
                              );
                              setFieldValue(
                                "inspection.captured.ast.location.placementSelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.location.placement",
                                selectWithOtherToText(nextValue),
                              );
                            }}
                            onDelete={() => {
                              setFieldValue(
                                "inspection.captured.ast.location.placementSelect",
                                makeEmptySelectWithOther(),
                              );
                              setFieldValue(
                                "inspection.captured.ast.location.placement",
                                "",
                              );
                            }}
                            errorText={getErrorText(
                              errors,
                              "inspection.captured.ast.location.placementSelect",
                            )}
                          />
                        </Surface>

                        <Surface style={styles.questionCard} elevation={1}>
                          <SameDeleteSelectField
                            label="Off-grid Supply"
                            value={capturedAst?.ogs?.hasOffGridSupplySelect}
                            lastKnownValue={lastKnownAst?.ogs?.hasOffGridSupply}
                            options={OFF_GRID_SUPPLY_OPTIONS}
                            lookup={{
                              options: OFF_GRID_SUPPLY_OPTIONS,
                              allowOther: false,
                              otherCode: "OTHER",
                              otherLabel: "",
                              loading: false,
                            }}
                            onChange={(nextValue) => {
                              setFieldValue(
                                "inspection.captured.ast.ogs.hasOffGridSupplySelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.ogs.hasOffGridSupply",
                                nextValue?.code ||
                                  selectWithOtherToText(nextValue),
                              );
                            }}
                            onSame={() => {
                              const nextValue = makeSelectFromText(
                                lastKnownAst?.ogs?.hasOffGridSupply,
                                OFF_GRID_SUPPLY_OPTIONS,
                              );
                              setFieldValue(
                                "inspection.captured.ast.ogs.hasOffGridSupplySelect",
                                nextValue,
                              );
                              setFieldValue(
                                "inspection.captured.ast.ogs.hasOffGridSupply",
                                nextValue?.code ||
                                  selectWithOtherToText(nextValue),
                              );
                            }}
                            onDelete={() => {
                              setFieldValue(
                                "inspection.captured.ast.ogs.hasOffGridSupplySelect",
                                makeEmptySelectWithOther(),
                              );
                              setFieldValue(
                                "inspection.captured.ast.ogs.hasOffGridSupply",
                                "",
                              );
                            }}
                            errorText={getErrorText(
                              errors,
                              "inspection.captured.ast.ogs.hasOffGridSupplySelect",
                            )}
                          />
                        </Surface>
                      </>
                    )}

                    <Surface style={styles.questionCard} elevation={1}>
                      <View style={styles.questionHeader}>
                        <Text style={styles.questionTitle}>Meter GPS</Text>
                        <Text style={styles.questionDescription}>
                          Existing:{" "}
                          {formatGpsPoint(lastKnownAst?.location?.gps)}
                        </Text>
                        <Text style={styles.questionDescription}>
                          Captured: {formatGpsPoint(capturedAst?.location?.gps)}
                        </Text>
                        <Text style={styles.questionDescription}>
                          Distance:{" "}
                          {formatGpsDistanceBetween(
                            lastKnownAst?.location?.gps,
                            capturedAst?.location?.gps,
                          )}
                        </Text>
                      </View>

                      <SovereignLocationPicker
                        label="METER GPS CAPTURE"
                        name="inspection.captured.ast.location.gps"
                        initialGps={
                          capturedAst?.location?.gps ||
                          lastKnownAst?.location?.gps ||
                          gpsNeighbourhood.center ||
                          null
                        }
                        referenceBoundary={gpsNeighbourhood.erfBoundary}
                        erfNo={
                          values?.accessData?.erfNo ||
                          values?.accessData?.premise?.erfNo ||
                          "NAv"
                        }
                        erfCentroid={
                          gpsNeighbourhood.erfCentroid ||
                          lastKnownAst?.location?.gps ||
                          null
                        }
                        icon="crosshairs-gps"
                        nearbyErfs={gpsNeighbourhood.nearbyErfs}
                        nearbyPremises={gpsNeighbourhood.nearbyPremises}
                        nearbyMeters={gpsNeighbourhood.nearbyMeters}
                      />
                    </Surface>

                    <Divider style={styles.divider} />

                    <Surface style={styles.questionCard} elevation={1}>
                      <View style={styles.questionHeader}>
                        <Text style={styles.questionTitle}>Anomaly</Text>
                        <Text style={styles.questionDescription}>
                          Select the anomaly and matching detail.
                        </Text>
                      </View>

                      <IrepsSelectWithOther
                        label="Meter Anomaly"
                        placeholder="Select anomaly"
                        options={anomalyLookup.options}
                        includeOther={anomalyLookup.allowOther}
                        otherCode={anomalyLookup.otherCode}
                        otherLabel={anomalyLookup.otherLabel}
                        loading={anomalyLookup.loading}
                        value={capturedAst?.anomalies?.anomalySelect}
                        onChange={(nextValue) => {
                          setFieldValue(
                            "inspection.captured.ast.anomalies.anomalySelect",
                            nextValue,
                          );
                          setFieldValue(
                            "inspection.captured.ast.anomalies.anomaly",
                            selectWithOtherToText(nextValue),
                          );
                          setFieldValue(
                            "inspection.captured.ast.anomalies.anomalyDetailSelect",
                            makeEmptySelectWithOther(),
                          );
                          setFieldValue(
                            "inspection.captured.ast.anomalies.anomalyDetail",
                            "",
                          );
                        }}
                        errorText={
                          typeof capturedErrors?.anomalies?.anomalySelect ===
                          "string"
                            ? capturedErrors.anomalies.anomalySelect
                            : ""
                        }
                      />

                      <IrepsSelectWithOther
                        label="Anomaly Detail"
                        placeholder={
                          selectedAnomalyCode
                            ? "Select anomaly detail"
                            : "Select anomaly first"
                        }
                        options={anomalyDetailOptions}
                        includeOther={anomalyDetailLookup.allowOther}
                        otherCode={anomalyDetailLookup.otherCode}
                        otherLabel={anomalyDetailLookup.otherLabel}
                        loading={anomalyDetailLookup.loading}
                        value={capturedAst?.anomalies?.anomalyDetailSelect}
                        onChange={(nextValue) => {
                          setFieldValue(
                            "inspection.captured.ast.anomalies.anomalyDetailSelect",
                            nextValue,
                          );
                          setFieldValue(
                            "inspection.captured.ast.anomalies.anomalyDetail",
                            selectWithOtherToText(nextValue),
                          );
                        }}
                        errorText={
                          typeof capturedErrors?.anomalies
                            ?.anomalyDetailSelect === "string"
                            ? capturedErrors.anomalies.anomalyDetailSelect
                            : ""
                        }
                      />

                      {shouldRequireAnomalyPhoto(values) && (
                        <View style={styles.evidenceSlot}>
                          <IrepsMedia
                            name="media"
                            tag="anomalyPhoto"
                            agentName={agentName}
                            agentUid={agentUid}
                            fallbackGps={capturedAst?.location?.gps || null}
                            required={true}
                          />
                        </View>
                      )}
                    </Surface>

                    {!noAccess && (
                      // <Surface style={styles.card} elevation={1}>
                      //   <View style={styles.sectionHeader}>
                      //     <MaterialCommunityIcons
                      //       name="progress-check"
                      //       size={18}
                      //       color="#2563eb"
                      //     />
                      //     <Text style={styles.sectionTitle}>Meter Status</Text>
                      //   </View>

                      <Surface style={styles.questionCard} elevation={1}>
                        <SameDeleteSelectField
                          label="Current Status"
                          value={values?.status?.stateSelect}
                          lastKnownValue={
                            values?.inspection?.lastKnown?.status?.state
                          }
                          options={connectionStatusLookup.options}
                          lookup={connectionStatusLookup}
                          onChange={(nextValue) => {
                            setFieldValue("status.stateSelect", nextValue);
                            setFieldValue(
                              "status.state",
                              nextValue?.code ||
                                selectWithOtherToText(nextValue),
                            );
                            setFieldValue(
                              "status.id",
                              values?.status?.id ||
                                values?.accessData?.parents?.lmPcode ||
                                "NAv",
                            );
                            setFieldValue(
                              "status.detail",
                              values?.status?.detail ||
                                values?.accessData?.parents?.lmPcode ||
                                "NAv",
                            );
                          }}
                          onSame={() => {
                            const nextValue = makeSelectFromText(
                              values?.inspection?.lastKnown?.status?.state,
                              connectionStatusLookup.options,
                            );
                            setFieldValue("status.stateSelect", nextValue);
                            setFieldValue(
                              "status.state",
                              nextValue?.code ||
                                selectWithOtherToText(nextValue),
                            );
                          }}
                          onDelete={() => {
                            setFieldValue(
                              "status.stateSelect",
                              makeEmptySelectWithOther(),
                            );
                            setFieldValue("status.state", "");
                          }}
                          errorText={
                            typeof statusErrors?.stateSelect === "string"
                              ? statusErrors.stateSelect
                              : ""
                          }
                        />
                      </Surface>
                      // </Surface>
                    )}

                    <Surface style={styles.questionCard} elevation={1}>
                      <View style={styles.questionHeader}>
                        <Text style={styles.questionTitle}>Normalisation</Text>
                        <Text style={styles.questionDescription}>
                          Select what was done after inspection.
                        </Text>
                      </View>

                      <IrepsSelectWithOther
                        label="Normalisation Action"
                        placeholder="Select normalisation action"
                        options={normalisationLookup.options}
                        includeOther={normalisationLookup.allowOther}
                        otherCode={normalisationLookup.otherCode}
                        otherLabel={normalisationLookup.otherLabel}
                        loading={normalisationLookup.loading}
                        value={capturedAst?.normalisation?.actionSelect}
                        onChange={(nextValue) => {
                          setFieldValue(
                            "inspection.captured.ast.normalisation.actionSelect",
                            nextValue,
                          );
                          setFieldValue(
                            "inspection.captured.ast.normalisation.actionTaken",
                            nextValue?.code || "OTHER",
                          );
                          setFieldValue(
                            "inspection.captured.ast.normalisation.actionText",
                            selectWithOtherToText(nextValue),
                          );
                        }}
                        errorText={
                          typeof capturedErrors?.normalisation?.actionSelect ===
                          "string"
                            ? capturedErrors.normalisation.actionSelect
                            : ""
                        }
                      />

                      {shouldRequireNormalisationPhoto(values) && (
                        <View style={styles.evidenceSlot}>
                          <IrepsMedia
                            name="media"
                            tag="normalisationPhoto"
                            agentName={agentName}
                            agentUid={agentUid}
                            fallbackGps={capturedAst?.location?.gps || null}
                            required={true}
                          />
                        </View>
                      )}
                    </Surface>

                    {isConventional && (
                      <Surface style={styles.questionCard} elevation={1}>
                        <View style={styles.questionHeader}>
                          <Text style={styles.questionTitle}>
                            Conventional Meter Reading
                          </Text>
                          <Text style={styles.questionDescription}>
                            Required for conventional electricity/water meters.
                            If no reading is available, select a no-reading
                            reason.
                          </Text>
                        </View>

                        <TextInput
                          mode="outlined"
                          label="Meter Reading"
                          value={
                            values?.inspection?.captured?.mreading?.reading
                          }
                          onChangeText={(text) => {
                            const cleanText = text.replace(/[^\d.]/g, "");
                            setFieldValue(
                              "inspection.captured.mreading.reading",
                              cleanText,
                            );

                            if (cleanText) {
                              setFieldValue(
                                "inspection.captured.mreading.readingAt",
                                new Date().toISOString(),
                              );
                              setFieldValue(
                                "inspection.captured.mreading.noReadingReason",
                                makeEmptySelectWithOther(),
                              );
                            }
                          }}
                          keyboardType="numeric"
                          style={styles.input}
                        />

                        {!!getErrorText(
                          errors,
                          "inspection.captured.mreading.readingAt",
                        ) && (
                          <Text style={styles.errorText}>
                            {getErrorText(
                              errors,
                              "inspection.captured.mreading.readingAt",
                            )}
                          </Text>
                        )}

                        {!String(
                          values?.inspection?.captured?.mreading?.reading || "",
                        ).trim() &&
                          !!getErrorText(
                            errors,
                            "inspection.captured.mreading.noReadingReason",
                          ) && (
                            <Text style={styles.errorText}>
                              {getErrorText(
                                errors,
                                "inspection.captured.mreading.noReadingReason",
                              )}
                            </Text>
                          )}

                        {!!String(
                          values?.inspection?.captured?.mreading?.reading || "",
                        ).trim() && (
                          <View style={styles.evidenceSlot}>
                            <IrepsMedia
                              name="media"
                              tag="meterReadingPhoto"
                              agentName={agentName}
                              agentUid={agentUid}
                              fallbackGps={capturedAst?.location?.gps || null}
                              required={true}
                            />
                          </View>
                        )}

                        {!String(
                          values?.inspection?.captured?.mreading?.reading || "",
                        ).trim() && (
                          <IrepsSelectWithOther
                            label="No Reading Reason"
                            placeholder="Select reason if no reading"
                            options={noReadingLookup.options}
                            includeOther={noReadingLookup.allowOther}
                            otherCode={noReadingLookup.otherCode}
                            otherLabel={noReadingLookup.otherLabel}
                            loading={noReadingLookup.loading}
                            value={
                              values?.inspection?.captured?.mreading
                                ?.noReadingReason
                            }
                            onChange={(nextValue) =>
                              setFieldValue(
                                "inspection.captured.mreading.noReadingReason",
                                nextValue,
                              )
                            }
                            errorText={getErrorText(
                              errors,
                              "inspection.captured.mreading.noReadingReason",
                            )}
                          />
                        )}
                      </Surface>
                    )}

                    {typeof errors?.media === "string" && (
                      <Text style={styles.errorText}>{errors.media}</Text>
                    )}

                    {typeof inspectionErrors?.comparison?.confirmation
                      ?.confirmed === "string" && (
                      <Text style={styles.errorText}>
                        {inspectionErrors.comparison.confirmation.confirmed}
                      </Text>
                    )}
                  </>
                )}
              </Surface>

              <IrepsFormActions
                resetLabel="RESET"
                saveLabel="SAVE"
                submitLabel="SUBMIT INSP"
                canSave={true}
                canSubmit={isValid && isEligible}
                loading={inProgress}
                saveLoading={saveInProgress}
                onReset={() => {
                  Alert.alert(
                    "Reset Form?",
                    "This will clear your changes and return the form to the state it had when it first loaded.",
                    [
                      { text: "KEEP EDITING", style: "cancel" },
                      {
                        text: "RESET",
                        style: "destructive",
                        onPress: () => {
                          resetForm();

                          setTimeout(() => {
                            validateForm();
                          }, 0);
                        },
                      },
                    ],
                  );
                }}
                onSave={() => handleSaveInspection(values)}
                onSubmit={handleSubmit}
                disabledReason={
                  eligibilityBlockMessage ||
                  "Complete all required fields before submitting."
                }
              />

              <ComparisonModal
                visible={comparisonReview.visible}
                comparison={comparisonReview.comparison}
                submitting={comparisonReview.submitting}
                onClose={() => {
                  if (comparisonReview.submitting) return;

                  confirmedComparisonSignatureRef.current = "";
                  pendingComparisonSubmitValuesRef.current = null;
                  setComparisonReview({
                    visible: false,
                    comparison: null,
                    submitting: false,
                  });
                }}
                onConfirm={() => {
                  if (comparisonReview.submitting) return;

                  if (!comparisonReview?.comparison) {
                    setComparisonReview({
                      visible: false,
                      comparison: null,
                      submitting: false,
                    });
                    return;
                  }

                  const confirmedComparison = {
                    ...comparisonReview.comparison,
                    confirmation: {
                      ...(comparisonReview.comparison?.confirmation || {}),
                      required: true,
                      confirmed: true,
                      confirmedAt: new Date().toISOString(),
                      confirmedByUid: agentUid || "NAv",
                      confirmedByUser: agentName || "NAv",
                    },
                  };

                  confirmedComparisonSignatureRef.current =
                    buildComparisonSignature(confirmedComparison);

                  const pendingValues =
                    pendingComparisonSubmitValuesRef.current || values;

                  const confirmedValues = {
                    ...pendingValues,
                    inspection: {
                      ...(pendingValues?.inspection || {}),
                      comparison: confirmedComparison,
                    },
                  };

                  setFieldValue(
                    "inspection.comparison",
                    confirmedComparison,
                    false,
                  );
                  pendingComparisonSubmitValuesRef.current = null;
                  setInProgress(true);
                  setComparisonReview({
                    visible: true,
                    comparison: confirmedComparison,
                    submitting: true,
                  });
                  setSubmitting(true);

                  setTimeout(() => {
                    setComparisonReview({
                      visible: false,
                      comparison: null,
                      submitting: false,
                    });

                    handleSubmitInspection(confirmedValues, {
                      setFieldValue,
                      setSubmitting,
                      skipComparisonReview: true,
                      confirmedComparison,
                    });
                  }, 80);
                }}
              />

              <Portal>
                <Modal
                  visible={submitOutcome.visible}
                  dismissable={false}
                  style={styles.centeredPortalModal}
                  contentContainerStyle={styles.successModal}
                >
                  <View style={styles.successContent}>
                    <View style={styles.successIconCircle}>
                      <Feather
                        name={
                          submitOutcome.type === "savedLocally"
                            ? "download-cloud"
                            : "check"
                        }
                        size={42}
                        color="#fff"
                      />
                    </View>

                    <Text style={styles.successTitle}>
                      {submitOutcome.title}
                    </Text>

                    <Text style={styles.outcomeMessage}>
                      {submitOutcome.message}
                    </Text>

                    <TouchableOpacity
                      style={styles.continueBtn}
                      onPress={() => {
                        setSubmitOutcome({
                          visible: false,
                          type: null,
                          title: "",
                          message: "",
                        });

                        router.replace(
                          "/(tabs)/admin/operations/my-workorders",
                        );
                      }}
                    >
                      <Text style={styles.continueBtnText}>CONTINUE</Text>
                    </TouchableOpacity>
                  </View>
                </Modal>
              </Portal>
            </ScrollView>
          );
        }}
      </Formik>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  content: {
    padding: 14,
    paddingBottom: 40,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  loaderText: {
    marginTop: 10,
    color: "#475569",
    fontWeight: "700",
  },
  emptyState: {
    margin: 16,
    padding: 24,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
  },
  emptyText: {
    marginTop: 6,
    textAlign: "center",
    color: "#64748b",
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryItem: {
    width: "48%",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "800",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  addressText: {
    marginLeft: 6,
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    margin: 12,
    padding: 14,
  },
  blockedCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 16,
    margin: 12,
    padding: 14,
  },
  blockedTitle: {
    fontWeight: "900",
    color: "#991B1B",
    fontSize: 15,
  },
  blockedText: {
    color: "#7F1D1D",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  infoCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: 16,
    margin: 12,
    padding: 14,
  },
  infoTitle: {
    fontWeight: "900",
    color: "#1E3A8A",
    fontSize: 15,
  },
  infoText: {
    color: "#1E40AF",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: "900",
    color: "#0f172a",
    fontSize: 15,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 5,
  },
  infoLabel: {
    color: "#64748b",
    fontWeight: "700",
    fontSize: 12,
  },
  infoValue: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
  },
  helperText: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 8,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 10,
  },
  choiceButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  choiceButtonActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  choiceButtonText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 12,
  },
  choiceButtonTextActive: {
    color: "#ffffff",
  },
  fieldBlock: {
    marginBottom: 0,
  },
  lastKnownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 5,
  },
  lastKnownText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  differentPill: {
    borderWidth: 1,
    borderColor: "#facc15",
    backgroundColor: "#fef9c3",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  differentPillText: {
    color: "#854d0e",
    fontSize: 10,
    fontWeight: "900",
  },
  differentFieldFrame: {
    borderRightWidth: 3,
    borderRightColor: "#facc15",
    borderRadius: 8,
    paddingRight: 4,
  },
  input: {
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  sameDeleteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sameButton: {
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  sameButtonText: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: "#fee2e2",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  deleteButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    fontSize: 12,
  },
  captureButton: {
    alignSelf: "flex-start",
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  captureButtonText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 12,
  },
  questionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  questionHeader: {
    marginBottom: 10,
  },
  questionTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 14,
  },
  questionDescription: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  evidenceSlot: {
    marginTop: 8,
  },
  divider: {
    marginVertical: 10,
  },
  errorText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 6,
  },

  centeredPortalModal: {
    justifyContent: "center",
    alignItems: "center",
    margin: 0,
  },

  readOnlyBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },

  readOnlyLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748B",
    textTransform: "uppercase",
  },

  readOnlyValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 18,
  },

  readOnlyMediaList: {
    gap: 8,
  },

  mediaReadOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 9,
  },

  mediaReadOnlyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },

  mediaReadOnlyMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
  },

  mediaReadOnlyThumbWrap: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  mediaReadOnlyThumb: {
    width: "100%",
    height: "100%",
  },

  mediaReadOnlyMain: {
    flex: 1,
    minWidth: 0,
  },

  mediaReadOnlyHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "900",
    color: "#2563EB",
  },

  instructionMediaModal: {
    backgroundColor: "#FFFFFF",
    margin: 18,
    borderRadius: 20,
    padding: 14,
    maxHeight: "88%",
    width: "92%",
  },

  instructionMediaModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  instructionMediaModalIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionMediaModalTitleWrap: {
    flex: 1,
  },

  instructionMediaModalTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },

  instructionMediaModalSub: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  instructionMediaModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionMediaPreviewFrame: {
    height: 330,
    borderRadius: 16,
    backgroundColor: "#020617",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionMediaPreviewImage: {
    width: "100%",
    height: "100%",
  },

  instructionMediaMetaBox: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 9,
  },

  instructionMediaMetaText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2,
  },

  openInstructionMediaButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  openInstructionMediaButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  instructionMediaEmptyBox: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  comparisonModal: {
    backgroundColor: "#fff",
    margin: 18,
    borderRadius: 22,
    padding: 16,
    maxHeight: "82%",
  },
  comparisonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  comparisonIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
  },
  comparisonTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 17,
  },
  comparisonSub: {
    color: "#64748b",
    marginTop: 2,
  },
  comparisonList: {
    maxHeight: 360,
  },
  diffCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 14,
    padding: 11,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  diffTitle: {
    color: "#9a3412",
    fontWeight: "900",
    marginBottom: 5,
  },
  diffText: {
    color: "#0f172a",
    fontSize: 12,
    marginTop: 2,
  },
  diffHint: {
    color: "#9a3412",
    fontSize: 12,
    marginTop: 5,
    fontWeight: "700",
  },
  confirmWarning: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  modalActions: {
    gap: 8,
  },
  correctButton: {
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  correctButtonText: {
    color: "#0f172a",
    fontWeight: "900",
  },
  confirmButton: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontWeight: "900",
  },
  successModal: {
    backgroundColor: "#fff",
    margin: 24,
    borderRadius: 24,
    padding: 22,
  },
  successContent: {
    alignItems: "center",
  },
  successIconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  successTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center",
  },
  outcomeMessage: {
    color: "#475569",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 18,
  },
  continueBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: "100%",
    alignItems: "center",
  },
  continueBtnText: {
    color: "#fff",
    fontWeight: "900",
  },
});
