import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNetInfo } from "@react-native-community/netinfo";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Formik } from "formik";
import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActivityIndicator } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch } from "react-redux";
import { object, string } from "yup";

import { useGeo } from "../../../../src/context/GeoContext";
import { useWarehouse } from "../../../../src/context/WarehouseContext";
import { useAuth } from "../../../../src/hooks/useAuth";
import {
  buildTargetedBatchContextFromRow,
  serializeTargetedBatchContext,
} from "../../../../src/features/premises/targetedBatchPremiseContext";
import TargetedBatchActionTile from "../../../../src/features/targetedBatches/TargetedBatchActionTile";
import TargetedBatchMapModal from "../../../../src/features/targetedBatches/TargetedBatchMapModal";
import { isFieldWorkorderActor } from "../../../../src/features/targetedBatches/fieldWorkorderActor";
import {
  getTargetedBatchRowActionState,
  isTargetedBatchFoundMeterIntent,
  isTargetedBatchWorkIntent,
  snapshotTargetedBatchRefs,
  targetedBatchRefsMatch,
  TARGETED_BATCH_INTENTS,
} from "../../../../src/features/targetedBatches/targetedBatchActions";
import { BATCH_DISCOVERY_REASONS } from "../../../../src/features/targetedBatches/targetedBatchContextCarry";
import { buildTargetedBatchNoAccessContext } from "../../../../src/features/targetedBatches/targetedBatchNoAccess";
import {
  filterTargetedBatchRowsByStatus,
  nextTargetedBatchStatusFilter,
  searchTargetedBatchRows,
  sortTargetedBatchRowsOpenFirst,
  TARGETED_BATCH_STATUS_FILTERS,
} from "../../../../src/features/targetedBatches/targetedBatchRowSearch";
import {
  chooseFoundMeter,
  foundMeterMessage,
} from "../../../../src/features/targetedBatches/foundMeter";
import { findMetersByNumber } from "../../../../src/features/targetedBatches/findMetersByNumber";
import { MAP_STATUS_COLORS } from "../../../../src/features/targetedBatches/targetedBatchMapLayers";
import {
  useAcceptRejectLifecycleInstructionMutation,
  useGetWmsBgoBatchWorkItemsQuery,
  useGetWmsLifecycleWorkItemsQuery,
} from "../../../../src/redux/lifecycleInstructionApi";
import {
  useAcceptRejectBgoBatchMutation,
  useGetBgoBucketsQuery,
  useReverseBgoBatchAcceptanceMutation,
} from "../../../../src/redux/bgoApi";
import {
  useAcceptRejectTargetedBatchMutation,
  useGetTargetedBatchBucketsQuery,
  useGetTargetedBatchRowsQuery,
} from "../../../../src/redux/targetedBatchApi";
import { isLiveStreamOutOfDate } from "../../../../src/redux/liveSubscription";
import {
  keepBgoBatchWorkItems,
  keepTargetedBatchRows,
} from "../../../../src/redux/workOrderKeepers";
import { removeSubmissionQueueItemsByInstructionTrnId } from "../../../../src/utils/submissionQueue";

const WMS_GROUPS = [
  {
    key: "METER_INSPECTION",
    title: "Inspections",
    short: "INSP",
    icon: "clipboard-search-outline",
  },
  {
    key: "METER_DISCONNECTION",
    title: "Disconnections",
    short: "DCN",
    icon: "power-plug-off-outline",
  },
  {
    key: "METER_RECONNECTION",
    title: "Reconnections",
    short: "RCN",
    icon: "power-plug-outline",
  },
  {
    key: "METER_REMOVAL",
    title: "Removals",
    short: "REM",
    icon: "countertop-outline",
  },
  {
    key: "METER_READING",
    title: "Meter Readings",
    short: "MREAD",
    icon: "counter",
  },
];

const STATE_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ISSUED", label: "Issued" },
  { key: "REASSIGNED", label: "Reassigned" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CANCELLED", label: "Cancelled" },
];

const EXECUTION_ROUTES = {
  METER_INSPECTION: "/asts/inspection",
  METER_REMOVAL: "/asts/removal",
  METER_DISCONNECTION: "/asts/disconnection",
  METER_RECONNECTION: "/asts/reconnection",
  METER_READING: "/asts/meter-reading",
};

// TB-R051: online only; with no connection the screen says so instead of saying there is no work.
const WMS_OFFLINE_MESSAGE = "No connection — your work orders are not loaded";

// TB-R052: work already on the screen stays when the connection drops, and says it is from before.
const WMS_OFFLINE_KEPT_MESSAGE =
  "No connection — showing your work orders from before the connection was lost";

// TB-R052: a live list that failed says so while it reconnects; its last copy is never shown as current.
const WMS_NOT_UP_TO_DATE_MESSAGE = "Not up to date — reconnecting";

// TB-R051: a button preparing a batch action gives up after 30 seconds.
const TARGETED_BATCH_ACTION_TIMEOUT_MS = 30000;

// TB-R051: no false errors; a meter whose Sales record could not be read is refused in field language.
const TARGETED_BATCH_SALES_NOT_READABLE_TITLE = "Sales record not readable";
const TARGETED_BATCH_SALES_NOT_READABLE_MESSAGE =
  "The meter's Sales record could not be read. Leave the batch and open it again; if it keeps failing, report it.";

// TB-R051: a batch meter's buttons act only while it is still in this worker's work orders, the same as Discover.
const TARGETED_BATCH_NOT_IN_WORK_ORDERS_TITLE = "Batch meter";
const TARGETED_BATCH_NOT_IN_WORK_ORDERS_MESSAGE = `${BATCH_DISCOVERY_REASONS.NOT_IN_WORK_ORDERS}.`;

// TB-R051: no silent waits; the banner names the button that is preparing.
const TARGETED_BATCH_INTENT_LABELS = Object.freeze({
  [TARGETED_BATCH_INTENTS.OPEN_PREMISE]: "Premise",
  [TARGETED_BATCH_INTENTS.START_METER_DISCOVERY]: "Meter",
  [TARGETED_BATCH_INTENTS.OPEN_AST]: "Meter",
  [TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS]: "No Access",
  [TARGETED_BATCH_INTENTS.OPEN_ERF]: "ERF",
  [TARGETED_BATCH_INTENTS.OPEN_FOUND_METER]: "Meter",
  [TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE]: "Premise",
});

// TB-R051 (1.3.42): the batch header's four filters, left to right, with the status colours of the batch map.
const TARGETED_BATCH_STATUS_FILTER_BUTTONS = [
  { key: TARGETED_BATCH_STATUS_FILTERS.TOTAL, label: "Total", summaryKey: "total", color: "#0f172a" },
  { key: TARGETED_BATCH_STATUS_FILTERS.NOT_STARTED, label: "Not Started", summaryKey: "notStarted", color: MAP_STATUS_COLORS.NOT_STARTED },
  { key: TARGETED_BATCH_STATUS_FILTERS.IN_PROGRESS, label: "In Progress", summaryKey: "inProgress", color: MAP_STATUS_COLORS.IN_PROGRESS },
  { key: TARGETED_BATCH_STATUS_FILTERS.COMPLETED, label: "Completed", summaryKey: "completed", color: MAP_STATUS_COLORS.COMPLETED },
];

// TB-R051 (1.3.42): nothing starts work on a Completed meter.
const TARGETED_BATCH_COMPLETED_TITLE = "Meter completed";
const TARGETED_BATCH_COMPLETED_MESSAGE =
  "This meter is Completed: it has been found. Nothing can be started on it; you can open its meter, premise and ERF.";

const RejectSchema = object().shape({
  rejectReason: string()
    .trim()
    .min(5, "Give a short but useful reason")
    .max(500, "Keep the reason below 500 characters")
    .required("Reject reason is required"),
});

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function formatAge(seconds = 0) {
  const total = Number(seconds || 0);

  if (!total) return "NAv";

  const minutes = Math.floor(total / 60);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatDateTime(value) {
  if (!value) return "NAv";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NAv";

  return date.toLocaleString();
}

function emptyCounts() {
  return {
    issued: 0,
    reassigned: 0,
    accepted: 0,
    rejected: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };
}

function countItems(items = []) {
  return items.reduce((acc, item) => {
    acc.total += 1;

    if (item.workflowState === "ISSUED") acc.issued += 1;
    if (item.workflowState === "REASSIGNED") acc.reassigned += 1;
    if (item.workflowState === "ACCEPTED") acc.accepted += 1;
    if (item.workflowState === "REJECTED") acc.rejected += 1;
    if (item.workflowState === "IN_PROGRESS") acc.inProgress += 1;
    if (item.workflowState === "COMPLETED") acc.completed += 1;
    if (item.workflowState === "CANCELLED") acc.cancelled += 1;

    return acc;
  }, emptyCounts());
}

function stateCount(items = [], state) {
  if (state === "ALL") return items.length;
  return items.filter((item) => item.workflowState === state).length;
}

function getExecutionOutcomeCode(item = {}) {
  return normalizeUpper(
    item?.raw?.executionOutcome?.outcome ||
      item?.raw?.executionOutcome?.code ||
      item?.executionOutcome?.outcome ||
      item?.executionOutcome?.code ||
      item?.executionOutcomeCode,
  );
}

function getHasAccessValue(item = {}) {
  return normalizeUpper(
    item?.raw?.accessData?.access?.hasAccess ||
      item?.accessData?.access?.hasAccess ||
      item?.hasAccess,
  );
}

function getWorkItemAccessOutcome(item = {}) {
  if (normalizeUpper(item?.workflowState) !== "COMPLETED") return null;

  const outcomeCode = getExecutionOutcomeCode(item);
  const hasAccess = getHasAccessValue(item);

  if (
    outcomeCode === "NO_ACCESS" ||
    hasAccess === "NO" ||
    hasAccess === "FALSE"
  ) {
    return "NO ACCESS";
  }

  return "ACCESS";
}

function getAccessOutcomeBadgeStyle(outcome = "") {
  return outcome === "NO ACCESS"
    ? styles.accessOutcomeNoAccess
    : styles.accessOutcomeAccess;
}

function getStateBadgeStyle(state) {
  switch (normalizeUpper(state)) {
    case "ISSUED":
    case "REASSIGNED":
      return styles.badgeBlue;
    case "ACCEPTED":
    case "COMPLETED":
      return styles.badgeGreen;
    case "IN_PROGRESS":
      return styles.badgeOrange;
    case "REJECTED":
    case "CANCELLED":
      return styles.badgeRed;
    default:
      return styles.badgeMuted;
  }
}

function getStateBadgeTextStyle(state) {
  switch (normalizeUpper(state)) {
    case "ISSUED":
    case "REASSIGNED":
      return styles.badgeBlueText;
    case "ACCEPTED":
    case "COMPLETED":
      return styles.badgeGreenText;
    case "IN_PROGRESS":
      return styles.badgeOrangeText;
    case "REJECTED":
    case "CANCELLED":
      return styles.badgeRedText;
    default:
      return styles.badgeMutedText;
  }
}

function isPhotoMedia(media = {}) {
  const type = String(media?.type || media?.mimeType || "").toLowerCase();
  const url = getMediaUrl(media).toLowerCase();

  return (
    type.includes("image") ||
    url.includes(".jpg") ||
    url.includes(".jpeg") ||
    url.includes(".png") ||
    url.includes(".webp")
  );
}

function getBgoBatchIdFromItem(item = {}) {
  return (
    item?.raw?.bgo?.batchId ||
    item?.raw?.bucket?.batchId ||
    item?.bgo?.batchId ||
    item?.bucket?.batchId ||
    item?.batchId ||
    ""
  );
}

function isBgoChildItem(item = {}) {
  return Boolean(getBgoBatchIdFromItem(item));
}

function cleanId(value) {
  return String(value || "").trim();
}


function getBgoBucketTarget(bucket = {}) {
  const assignmentTargets = Array.isArray(bucket?.raw?.assignment?.targets)
    ? bucket.raw.assignment.targets
    : [];

  const target =
    bucket?.target ||
    assignmentTargets[0] ||
    bucket?.raw?.target ||
    bucket?.raw?.bgo?.target ||
    {};

  return {
    type: normalizeUpper(target?.type || bucket?.raw?.bgo?.targetType),
    id: cleanId(target?.id || bucket?.raw?.bgo?.targetId),
    name: cleanId(target?.name || bucket?.raw?.bgo?.targetName),
  };
}

function canActorSeeBgoBucket({ bucket, actorUid, actorSpId, actorTeamIds }) {
  const target = getBgoBucketTarget(bucket);

  if (target.type === "USER") {
    return target.id === cleanId(actorUid);
  }

  if (target.type === "SP") {
    return target.id === cleanId(actorSpId);
  }

  if (target.type === "TEAM") {
    return actorTeamIds.includes(target.id);
  }

  return false;
}

function isBmdBgoBucket(bucket = {}) {
  const batchMode = normalizeUpper(bucket?.batchMode || bucket?.raw?.bgo?.batchMode);
  const operationType = normalizeUpper(bucket?.trnType || bucket?.raw?.operationType);
  const sourceModule = normalizeUpper(bucket?.raw?.origin?.sourceModule);
  const createsChildTrnsUpfront = bucket?.raw?.bgo?.createsChildTrnsUpfront;

  return (
    bucket?.isBmdBgo === true ||
    batchMode === "BMD" ||
    sourceModule === "BULK_METER_DISCOVERY" ||
    (operationType === "METER_DISCOVERY" && createsChildTrnsUpfront === false)
  );
}

function getBmdErfRefsFromBucket(bucket = {}) {
  const refs = Array.isArray(bucket?.raw?.worklist?.erfRefs)
    ? bucket.raw.worklist.erfRefs
    : Array.isArray(bucket?.worklist?.erfRefs)
      ? bucket.worklist.erfRefs
      : [];

  return refs.reduce((acc, ref, index) => {
    const id = cleanId(ref?.id || ref?.erfId);
    if (!id) return acc;

    acc.push({
      id,
      erfId: id,
      erfNo: readFirstString(ref?.erfNo, ref?.number, `#${index + 1}`),
      erfType: readFirstString(ref?.erfType, ref?.type, "NAv"),
      raw: ref,
      listIndex: index + 1,
    });

    return acc;
  }, []);
}

function getBmdBucketScope(bucket = {}) {
  const scope = bucket?.raw?.scope || bucket?.scope || {};

  const lmPcode = readFirstString(scope?.lmPcode, scope?.lmId);
  const wardPcode = readFirstString(scope?.wardPcode, scope?.wardId);

  return {
    lmPcode,
    lmName: readFirstString(scope?.lmName, lmPcode, "NAv"),
    wardPcode,
    wardName: readFirstString(scope?.wardName, wardPcode, "NAv"),
  };
}

function buildBmdSelectedErf({ erf = {}, bucket = {}, warehouseErf = null }) {
  const scope = getBmdBucketScope(bucket);
  const geofence = bucket?.geofenceRef || bucket?.raw?.geofenceRef || {};
  const bgo = bucket?.raw?.bgo || {};

  return {
    ...(warehouseErf || {}),
    ...erf,
    id: erf?.id || warehouseErf?.id || "NAv",
    erfId: erf?.id || warehouseErf?.id || "NAv",
    erfNo: readFirstString(erf?.erfNo, warehouseErf?.erfNo, "NAv"),
    erfType: readFirstString(erf?.erfType, warehouseErf?.erfType, "NAv"),
    admin: warehouseErf?.admin || {
      localMunicipality: {
        pcode: scope.lmPcode || null,
        name: scope.lmName || null,
      },
      ward: {
        pcode: scope.wardPcode || null,
        name: scope.wardName || null,
      },
    },
    bmdContext: {
      batchId: bucket?.id || bgo?.batchId || "NAv",
      batchMode: "BMD",
      sourceModule: "BULK_METER_DISCOVERY",
      operationType: "METER_DISCOVERY",
      geofenceId: geofence?.id || bgo?.geofenceId || "NAv",
      geofenceName: geofence?.name || bgo?.geofenceName || "NAv",
      targetType: bgo?.targetType || bucket?.target?.type || "NAv",
      targetId: bgo?.targetId || bucket?.target?.id || "NAv",
      targetName: bgo?.targetName || bucket?.target?.name || "NAv",
    },
  };
}

function getGeoPcode(entity = {}) {
  return cleanId(entity?.pcode || entity?.id);
}

function getTargetedBatchWardScope({ bucket = {}, row = {} }) {
  const batchScope = bucket?.scope || bucket?.raw?.scope || {};
  const rowScope = row?.scope || row?.raw?.scope || {};

  return {
    lmPcode: readFirstString(
      batchScope?.lmPcode,
      batchScope?.lmId,
      rowScope?.lmPcode,
      rowScope?.lmId,
    ),
    lmName: readFirstString(
      batchScope?.lmName,
      rowScope?.lmName,
      "NAv",
    ),
    wardPcode: readFirstString(
      batchScope?.wardPcode,
      batchScope?.wardId,
      batchScope?.ward?.pcode,
      batchScope?.ward?.id,
      rowScope?.wardPcode,
      rowScope?.wardId,
      rowScope?.ward?.pcode,
      rowScope?.ward?.id,
    ),
    wardNumber: readFirstString(
      batchScope?.wardNumber,
      rowScope?.wardNumber,
    ),
    wardName: readFirstString(
      batchScope?.wardName,
      rowScope?.wardName,
      row?.wardNumberLabel,
      "NAv",
    ),
    rowLmPcode: readFirstString(
      rowScope?.lmPcode,
      rowScope?.lmId,
    ),
    rowWardPcode: readFirstString(
      rowScope?.wardPcode,
      rowScope?.wardId,
      rowScope?.ward?.pcode,
      rowScope?.ward?.id,
    ),
  };
}

function findWardByPcode(wards = [], wardPcode = "") {
  const targetWardPcode = cleanId(wardPcode);
  if (!targetWardPcode || !Array.isArray(wards)) return null;

  return (
    wards.find((ward) => getGeoPcode(ward) === targetWardPcode) ||
    null
  );
}

function findWarehouseErfById(erfs = [], erfId = "") {
  const targetErfId = cleanId(erfId);
  if (!targetErfId || !Array.isArray(erfs)) return null;

  return (
    erfs.find(
      (erf) => cleanId(erf?.id || erf?.erfId) === targetErfId,
    ) || null
  );
}

function buildTargetedBatchSelectedErf({
  row = {},
  bucket = {},
  warehouseErf = null,
}) {
  const erfId = cleanId(row?.erfId || row?.refs?.erfId);
  const scope = getTargetedBatchWardScope({ bucket, row });
  const targetedBatchContext = buildTargetedBatchContextFromRow({
    row,
    bucket,
  });

  return {
    ...(warehouseErf || {}),
    id: erfId || warehouseErf?.id || "NAv",
    erfId: erfId || warehouseErf?.id || "NAv",
    erfNo: readFirstString(
      row?.erfNo,
      row?.raw?.property?.erfNo,
      warehouseErf?.erfNo,
      warehouseErf?.erfNumber,
      "NAv",
    ),
    erfType: readFirstString(warehouseErf?.erfType, "NAv"),
    admin: warehouseErf?.admin || {
      localMunicipality: {
        pcode: scope?.lmPcode || null,
        name: scope?.lmName || null,
      },
      ward: {
        pcode: scope?.wardPcode || null,
        name: scope?.wardName || null,
      },
    },
    targetedBatchContext,
  };
}

// TB-R051 (1.3.42): the same ERF selection with no batch on it (a key that is present, even empty, means a batch).
function withoutTargetedBatchContext(selectedErf = {}) {
  const { targetedBatchContext: _batch, ...plain } = selectedErf || {};
  return plain;
}

function getTargetedBatchStatusText(bucket = {}) {
  switch (normalizeUpper(bucket?.acceptanceStatus)) {
    case "WAITING":
      return "Waiting Acceptance";
    case "ACCEPTED":
      return "Accepted";
    case "REJECTED":
      return "Rejected";
    case "NOT_READY":
      return "Not Ready";
    default:
      return normalizeUpper(bucket?.status) || "NAv";
  }
}

function getTargetedBatchPeriodText(bucket = {}) {
  const selection = bucket?.selection || bucket?.raw?.selection || {};
  const from = readFirstString(selection?.salesPeriodFrom);
  const to = readFirstString(selection?.salesPeriodTo);

  if (from && to) return `${from} to ${to}`;
  return from || to || "NAv";
}

function toActivityMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEntityLatestActivityMs(entity = {}) {
  return Math.max(
    toActivityMillis(entity?.metadata?.updatedAt),
    toActivityMillis(entity?.metadata?.createdAt),
    toActivityMillis(entity?.updatedAt),
    toActivityMillis(entity?.createdAt),
    toActivityMillis(entity?.workflow?.completedAt),
    toActivityMillis(entity?.workflow?.acceptedAt),
    toActivityMillis(entity?.workflow?.issuedAt),
  );
}

function getPremiseId(premise = {}) {
  return cleanId(premise?.id || premise?.premiseId || premise?.accessData?.premise?.id);
}

function getPremiseErfId(premise = {}) {
  return cleanId(
    premise?.erfId ||
      premise?.accessData?.erfId ||
      premise?.refs?.erfId ||
      premise?.parent?.erfId,
  );
}

function getMeterPremiseId(meter = {}) {
  return cleanId(
    meter?.premiseId ||
      meter?.accessData?.premise?.id ||
      meter?.accessData?.premiseId ||
      meter?.refs?.premiseId ||
      meter?.premise?.id,
  );
}

function getMeterErfId(meter = {}, premiseIdToErfId = new Map()) {
  const directErfId = cleanId(
    meter?.erfId ||
      meter?.accessData?.erfId ||
      meter?.refs?.erfId ||
      meter?.premise?.erfId,
  );

  if (directErfId) return directErfId;

  const premiseId = getMeterPremiseId(meter);
  return premiseIdToErfId.get(premiseId) || "";
}

function getTrnErfId(trn = {}) {
  return cleanId(
    trn?.erfId ||
      trn?.accessData?.erfId ||
      trn?.accessData?.erf?.id ||
      trn?.refs?.erfId ||
      trn?.premise?.erfId,
  );
}

function isMeterDiscoveryTrn(trn = {}) {
  return normalizeUpper(
    trn?.trnType || trn?.accessData?.trnType || trn?.operationType,
  ) === "METER_DISCOVERY";
}

function createEmptyMdBgoErfStats() {
  return {
    premiseCount: 0,
    meterCount: 0,
    discoveryTrnCount: 0,
    latestActivityAt: null,
    latestActivityMs: 0,
  };
}

function bumpMdBgoErfActivity(stats, activityMs = 0) {
  if (!stats || !activityMs) return;

  if (activityMs > Number(stats.latestActivityMs || 0)) {
    stats.latestActivityMs = activityMs;
    stats.latestActivityAt = new Date(activityMs).toISOString();
  }
}

function sortMdBgoErfWorkItems(a = {}, b = {}) {
  const aMs = Number(a?.liveStats?.latestActivityMs || 0);
  const bMs = Number(b?.liveStats?.latestActivityMs || 0);

  if (aMs !== bMs) return bMs - aMs;

  const aNo = Number(String(a?.erfNo || "").replace(/\D/g, ""));
  const bNo = Number(String(b?.erfNo || "").replace(/\D/g, ""));

  if (Number.isFinite(aNo) && Number.isFinite(bNo) && aNo !== bNo) {
    return aNo - bNo;
  }

  return String(a?.erfNo || a?.id || "").localeCompare(
    String(b?.erfNo || b?.id || ""),
  );
}

function buildMdBgoLiveStatsForBucket({
  bucket = {},
  premises = [],
  meters = [],
  trns = [],
}) {
  const erfRefs = getBmdErfRefsFromBucket(bucket);
  const erfIdSet = new Set(erfRefs.map((erf) => cleanId(erf?.id)).filter(Boolean));
  const byErfId = {};

  erfRefs.forEach((erf) => {
    if (!erf?.id) return;
    byErfId[erf.id] = createEmptyMdBgoErfStats();
  });

  const premiseIdToErfId = new Map();
  let premiseCount = 0;
  let meterCount = 0;
  let discoveryTrnCount = 0;
  let latestActivityMs = 0;

  const updateBatchActivity = (activityMs) => {
    if (activityMs > latestActivityMs) latestActivityMs = activityMs;
  };

  (Array.isArray(premises) ? premises : []).forEach((premise) => {
    const premiseId = getPremiseId(premise);
    const erfId = getPremiseErfId(premise);

    if (premiseId && erfId) premiseIdToErfId.set(premiseId, erfId);
    if (!erfIdSet.has(erfId)) return;

    const stats = byErfId[erfId] || createEmptyMdBgoErfStats();
    stats.premiseCount += 1;

    const activityMs = getEntityLatestActivityMs(premise);
    bumpMdBgoErfActivity(stats, activityMs);
    updateBatchActivity(activityMs);

    byErfId[erfId] = stats;
    premiseCount += 1;
  });

  (Array.isArray(meters) ? meters : []).forEach((meter) => {
    const erfId = getMeterErfId(meter, premiseIdToErfId);
    if (!erfIdSet.has(erfId)) return;

    const stats = byErfId[erfId] || createEmptyMdBgoErfStats();
    stats.meterCount += 1;

    const activityMs = getEntityLatestActivityMs(meter);
    bumpMdBgoErfActivity(stats, activityMs);
    updateBatchActivity(activityMs);

    byErfId[erfId] = stats;
    meterCount += 1;
  });

  (Array.isArray(trns) ? trns : []).forEach((trn) => {
    if (!isMeterDiscoveryTrn(trn)) return;

    const erfId = getTrnErfId(trn);
    if (!erfIdSet.has(erfId)) return;

    const stats = byErfId[erfId] || createEmptyMdBgoErfStats();
    stats.discoveryTrnCount += 1;

    const activityMs = getEntityLatestActivityMs(trn);
    bumpMdBgoErfActivity(stats, activityMs);
    updateBatchActivity(activityMs);

    byErfId[erfId] = stats;
    discoveryTrnCount += 1;
  });

  return {
    erfs: erfRefs.length,
    premises: premiseCount,
    meters: meterCount,
    discoveryTrns: discoveryTrnCount,
    latestActivityMs,
    latestActivityAt: latestActivityMs ? new Date(latestActivityMs).toISOString() : null,
    byErfId,
  };
}

function withMdBgoLiveStats({ bucket = {}, premises = [], meters = [], trns = [] }) {
  if (!isBmdBgoBucket(bucket)) return bucket;

  const liveStats = buildMdBgoLiveStatsForBucket({
    bucket,
    premises,
    meters,
    trns,
  });

  const counts = {
    ...(bucket?.counts || {}),
    total: liveStats.erfs,
    erfs: liveStats.erfs,
    premises: liveStats.premises,
    meters: liveStats.meters,
    discoveryTrns: liveStats.discoveryTrns,
  };

  return {
    ...bucket,
    counts,
    totalTrns: liveStats.erfs,
    mdBgoLiveStats: liveStats,
    latestActivityAt: liveStats.latestActivityAt || bucket?.updatedAt || bucket?.issuedAt || null,
  };
}

function getBgoBucketStatusText(bucket = {}) {
  const workflowState = normalizeUpper(bucket?.workflowState);
  const releaseState = normalizeUpper(bucket?.releaseState);

  if (workflowState === "REJECTED" || releaseState === "BATCH_REJECTED") {
    return "Rejected";
  }

  if (workflowState === "CANCELLED") {
    return "Cancelled";
  }

  if (workflowState === "ACCEPTED" && releaseState === "RELEASED_TO_EXECUTION") {
    return "Accepted";
  }

  if (releaseState === "WAITING_BATCH_ACCEPTANCE") {
    return "Waiting Acceptance";
  }

  return workflowState || releaseState || "NAv";
}

function isExecutableWorkflowState(state) {
  return ["ACCEPTED", "IN_PROGRESS"].includes(normalizeUpper(state));
}

function isManagerRole(role) {
  const cleanRole = normalizeUpper(role);
  return ["SPU", "ADM", "MNG", "SPV"].includes(cleanRole);
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

// TB-R051: a batch meter's buttons act only while its row is allocated and its batch is in the live batch
// list with its rows open (allocated and accepted for this worker), the same as Discover and a new batch premise.
function isTargetedBatchRowInWorkOrders({ buckets, bucketId, row }) {
  if (normalizeUpper(row?.allocationStatus) !== "ALLOCATED") return false;

  return (Array.isArray(buckets) ? buckets : []).some(
    (bucket) =>
      Boolean(bucketId) &&
      bucket?.id === bucketId &&
      bucket?.permissions?.canViewRows === true,
  );
}

function getActionErrorMessage(error = {}, fallback = "Action failed.") {
  return (
    error?.data?.message ||
    error?.message ||
    error?.error?.message ||
    fallback
  );
}

function safeRefetch(refetchFn, label = "query") {
  if (typeof refetchFn !== "function") return;

  try {
    const result = refetchFn();

    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        console.log(`WMS ${label} refetch skipped`, {
          message: error?.message || String(error || ""),
        });
      });
    }
  } catch (error) {
    console.log(`WMS ${label} refetch skipped`, {
      message: error?.message || String(error || ""),
    });
  }
}

export default function WorkorderManagementSystem() {
  const router = useRouter();
  const { geoState, updateGeo } = useGeo();
  const {
    all,
    loading: warehouseLoading,
    sync: warehouseSync,
  } = useWarehouse();
  const { user, profile } = useAuth();

  const actorUid = user?.uid || profile?.uid || null;
  const actorRole = profile?.employment?.role || profile?.role || "NAv";
  const actorSpId = profile?.employment?.serviceProvider?.id || null;
  const actorName =
    profile?.profile?.displayName || user?.email || actorUid || "NAv";

  const fieldWorkorderActor = isFieldWorkorderActor({ actorRole, profile });

  const [selectedBucket, setSelectedBucket] = useState(null);
  const [selectedBucketCategory, setSelectedBucketCategory] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [stateFilter, setStateFilter] = useState("ALL");
  const [rejectItem, setRejectItem] = useState(null);
  const [preparingBgoDetail, setPreparingBgoDetail] = useState(false);
  const [processingBgoBucketAction, setProcessingBgoBucketAction] = useState(null);
  const [
    processingTargetedBatchAction,
    setProcessingTargetedBatchAction,
  ] = useState(null);
  const [openingTargetedBatchId, setOpeningTargetedBatchId] = useState(null);
  const [
    pendingTargetedBatchAction,
    setPendingTargetedBatchAction,
  ] = useState(null);
  const [targetedBatchSearchText, setTargetedBatchSearchText] = useState("");
  // TB-R051 (1.3.42): the batch header's status filter; Total shows every meter.
  const [targetedBatchStatusFilter, setTargetedBatchStatusFilter] = useState(
    TARGETED_BATCH_STATUS_FILTERS.TOTAL,
  );
  const handleTargetedBatchStatusFilterPress = useCallback((tapped) => {
    setTargetedBatchStatusFilter((current) =>
      nextTargetedBatchStatusFilter(current, tapped),
    );
  }, []);
  const [targetedBatchMapOpen, setTargetedBatchMapOpen] = useState(false);
  const netInfo = useNetInfo();
  // TB-R051: online only.
  const offline =
    netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const targetedBatchPendingWaitRef = useRef(null);
  const hardwareBackHandlerRef = useRef(null);
  // TB-R051: the row-card handlers stay stable across live updates and read these when tapped.
  const prepareTargetedBatchActionRef = useRef(null);
  const targetedBatchRowsRef = useRef([]);
  const selectedBucketRef = useRef(null);
  const openingTargetedBatchIdRef = useRef(null);
  const targetedBatchCardOpenPaintFrameRef = useRef(null);
  const targetedBatchCardOpenPreparationFrameRef = useRef(null);
  const targetedBatchBucketsRef = useRef([]);
  // TB-R051: the open batch last seen with its rows open in the live batch list, and whether the
  // "not in your work orders" message still has to be shown when this screen is next in front.
  const targetedBatchSeenOpenIdRef = useRef(null);
  const targetedBatchClosedNoticeRef = useRef(false);
  const workordersScreenFocusedRef = useRef(false);
  const targetedBatchRequestSequence = useRef(0);
  const targetedBatchRequestKeyRef = useRef(null);
  const targetedBatchPaintFrameRef = useRef(null);
  const targetedBatchPreparationFrameRef = useRef(null);
  const targetedBatchScreenMountedRef = useRef(true);

  const cancelTargetedBatchCardOpeningFrames = useCallback(() => {
    if (targetedBatchCardOpenPaintFrameRef.current !== null) {
      cancelAnimationFrame(targetedBatchCardOpenPaintFrameRef.current);
      targetedBatchCardOpenPaintFrameRef.current = null;
    }

    if (targetedBatchCardOpenPreparationFrameRef.current !== null) {
      cancelAnimationFrame(targetedBatchCardOpenPreparationFrameRef.current);
      targetedBatchCardOpenPreparationFrameRef.current = null;
    }
  }, []);

  const clearOpeningTargetedBatch = useCallback(
    (targetedBatchId = null) => {
      if (
        targetedBatchId &&
        openingTargetedBatchIdRef.current !== targetedBatchId
      ) {
        return false;
      }

      cancelTargetedBatchCardOpeningFrames();
      openingTargetedBatchIdRef.current = null;

      if (targetedBatchScreenMountedRef.current) {
        setOpeningTargetedBatchId((current) => {
          if (targetedBatchId && current !== targetedBatchId) {
            return current;
          }

          return null;
        });
      }

      return true;
    },
    [cancelTargetedBatchCardOpeningFrames],
  );

  const cancelTargetedBatchPreparationFrames = useCallback(() => {
    if (targetedBatchPaintFrameRef.current !== null) {
      cancelAnimationFrame(targetedBatchPaintFrameRef.current);
      targetedBatchPaintFrameRef.current = null;
    }

    if (targetedBatchPreparationFrameRef.current !== null) {
      cancelAnimationFrame(targetedBatchPreparationFrameRef.current);
      targetedBatchPreparationFrameRef.current = null;
    }
  }, []);

  const clearPendingTargetedBatchAction = useCallback(
    (requestKey = null) => {
      if (
        requestKey &&
        targetedBatchRequestKeyRef.current !== requestKey
      ) {
        return false;
      }

      cancelTargetedBatchPreparationFrames();
      targetedBatchRequestKeyRef.current = null;

      if (targetedBatchScreenMountedRef.current) {
        setPendingTargetedBatchAction((current) => {
          if (requestKey && current?.requestKey !== requestKey) {
            return current;
          }

          return null;
        });
      }

      return true;
    },
    [cancelTargetedBatchPreparationFrames],
  );

  const selectedBgoBatchId =
    selectedBucket?.bucketType === "BGOB" && !isBmdBgoBucket(selectedBucket)
      ? selectedBucket?.id || null
      : null;

  const selectedTargetedBatchId =
    selectedBucket?.bucketType === "TBB"
      ? selectedBucket?.id || null
      : null;

  useEffect(() => {
    targetedBatchScreenMountedRef.current = true;
    console.log("[MY WORKORDERS][MOUNT]");

    return () => {
      targetedBatchScreenMountedRef.current = false;
      cancelTargetedBatchCardOpeningFrames();
      openingTargetedBatchIdRef.current = null;
      cancelTargetedBatchPreparationFrames();
      targetedBatchRequestKeyRef.current = null;
      console.log("[MY WORKORDERS][UNMOUNT]");
    };
  }, [
    cancelTargetedBatchCardOpeningFrames,
    cancelTargetedBatchPreparationFrames,
  ]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        clearOpeningTargetedBatch();
        clearPendingTargetedBatchAction();
        // TB-R051: the batch map closes whenever the screen loses focus. A detached tab dismisses the
        // map's Modal on Android, and a map still marked open would swallow back and never show again.
        if (targetedBatchScreenMountedRef.current) {
          setTargetedBatchMapOpen(false);
        }
      };
    }, [clearOpeningTargetedBatch, clearPendingTargetedBatchAction]),
  );

  useEffect(() => {
    console.log("[MY WORKORDERS][ACTOR STATE]", {
      actorUid,
      actorRole,
      actorSpId,
      actorName,
      fieldWorkorderActor,
      selectedTargetedBatchId,
      selectedBucketType: selectedBucket?.bucketType || null,
      selectedBucketId: selectedBucket?.id || null,
    });
  }, [
    actorUid,
    actorRole,
    actorSpId,
    actorName,
    fieldWorkorderActor,
    selectedTargetedBatchId,
    selectedBucket?.bucketType,
    selectedBucket?.id,
  ]);

  useEffect(() => {
    if (!actorUid || fieldWorkorderActor) return;

    Alert.alert(
      "WMS Access Blocked",
      "My Workorders is only available to FWR and SPV(SUBC) users.",
      [
        {
          text: "OK",
          onPress: () => {
            if (router?.canGoBack?.()) {
              router.back();
            }
          },
        },
      ],
    );
  }, [actorUid, actorRole, fieldWorkorderActor, router]);

  // TB-R052: office work orders are read by type and state, not the newest TRNs of all workers.
  const {
    data: wmsData,
    error,
    refetch,
  } = useGetWmsLifecycleWorkItemsQuery(
    {
      actorUid,
      actorRole,
      actorSpId,
      actorName,
      mode: "INDIVIDUAL",
    },
    { skip: !fieldWorkorderActor },
  );

  // TB-R052: an opened BGO batch reads its own TRNs; the three most recently opened stay live (see below).
  const bgoDetailArgs = useMemo(
    () => ({
      actorUid,
      actorRole,
      actorSpId,
      actorName,
      mode: "BGO_BUCKET",
      bgoBatchId: selectedBgoBatchId,
      limit: 2000,
    }),
    [actorUid, actorRole, actorSpId, actorName, selectedBgoBatchId],
  );
  const bgoDetailQuerySkipped = !fieldWorkorderActor || !selectedBgoBatchId;
  const {
    data: bgoDetailData,
    isLoading: isLoadingBgoDetailTrns,
    isFetching: isFetchingBgoDetailTrns,
    error: bgoDetailError,
    refetch: refetchBgoDetail,
  } = useGetWmsBgoBatchWorkItemsQuery(bgoDetailArgs, {
    skip: bgoDetailQuerySkipped,
  });

  const {
    data: bgoData,
    isLoading: isLoadingBgo,
    error: bgoError,
    refetch: refetchBgo,
  } = useGetBgoBucketsQuery(
    {
      actorUid,
      actorRole,
      actorSpId,
      actorName,
      limit: 200,
    },
    { skip: !fieldWorkorderActor },
  );

  const {
    data: targetedBatchData,
    error: targetedBatchError,
  } = useGetTargetedBatchBucketsQuery(
    {
      actorUid,
      actorRole,
      actorSpId,
      actorName,
      limit: 200,
    },
    { skip: !fieldWorkorderActor },
  );

  const targetedBatchRowsQuerySkipped =
    !fieldWorkorderActor ||
    !selectedTargetedBatchId ||
    selectedBucket?.permissions?.canViewRows !== true;

  const {
    data: targetedBatchRowsData,
    error: targetedBatchRowsError,
  } = useGetTargetedBatchRowsQuery(
    {
      tbId: selectedTargetedBatchId,
    },
    {
      skip: targetedBatchRowsQuerySkipped,
    },
  );

  // TB-R052: the three most recently opened batches stay live for up to 24 hours: a targeted batch's meters and
  // a BGO batch's TRNs.
  const dispatch = useDispatch();
  useEffect(() => {
    if (targetedBatchRowsQuerySkipped) return;
    keepTargetedBatchRows(dispatch, selectedTargetedBatchId);
  }, [dispatch, selectedTargetedBatchId, targetedBatchRowsQuerySkipped]);
  useEffect(() => {
    if (bgoDetailQuerySkipped) return;
    keepBgoBatchWorkItems(dispatch, bgoDetailArgs);
  }, [dispatch, bgoDetailArgs, bgoDetailQuerySkipped]);

  useEffect(() => {
    clearPendingTargetedBatchAction();
  }, [selectedTargetedBatchId, clearPendingTargetedBatchAction]);

  // TB-R051: another batch starts with an empty search, Total (1.3.42) and the map closed.
  useEffect(() => {
    setTargetedBatchSearchText("");
    setTargetedBatchStatusFilter(TARGETED_BATCH_STATUS_FILTERS.TOTAL);
    setTargetedBatchMapOpen(false);
  }, [selectedTargetedBatchId]);


  const [acceptRejectLifecycleInstruction, { isLoading: deciding }] =
    useAcceptRejectLifecycleInstructionMutation();

  const [acceptRejectBgoBatch, { isLoading: decidingBgo }] =
    useAcceptRejectBgoBatchMutation();

  const [reverseBgoBatchAcceptance, { isLoading: reversingBgo }] =
    useReverseBgoBatchAcceptanceMutation();

  const [
    acceptRejectTargetedBatch,
    { isLoading: decidingTargetedBatch },
  ] = useAcceptRejectTargetedBatchMutation();

  const actionBusy =
    deciding ||
    decidingBgo ||
    reversingBgo ||
    decidingTargetedBatch;

  // My Workorders is now a field execution screen only.
  // Manager reversal must move to a manager control surface later.
  const managerActor = false;

  const allItems = useMemo(() => {
    return Array.isArray(wmsData?.items) ? wmsData.items : [];
  }, [wmsData?.items]);

  const bgoDetailItems = useMemo(() => {
    return Array.isArray(bgoDetailData?.items) ? bgoDetailData.items : [];
  }, [bgoDetailData?.items]);

  const targetedBatchRows = useMemo(() => {
    const rows = Array.isArray(targetedBatchRowsData?.rows)
      ? targetedBatchRowsData.rows
      : [];
    const erfs = Array.isArray(all?.erfs) ? all.erfs : [];

    return rows.map((row) => {
      const erfId = cleanId(row?.erfId || row?.refs?.erfId);
      const warehouseErf =
        erfs.find((erf) => cleanId(erf?.id || erf?.erfId) === erfId) ||
        all?.geoLibrary?.[erfId] ||
        null;
      const erfNo = readFirstString(
        row?.erfNo,
        row?.raw?.property?.erfNo,
        warehouseErf?.erfNo,
        warehouseErf?.erfNumber,
      );

      return {
        ...row,
        erfId,
        erfNo,
      };
    });
  }, [
    targetedBatchRowsData?.rows,
    all?.erfs,
    all?.geoLibrary,
  ]);

  // TB-R051: search by meter number, ERF number or street address, inside the header's status filter (1.3.42);
  // open work is listed first.
  const visibleTargetedBatchRows = useMemo(
    () =>
      sortTargetedBatchRowsOpenFirst(
        searchTargetedBatchRows(
          filterTargetedBatchRowsByStatus(targetedBatchRows, targetedBatchStatusFilter),
          targetedBatchSearchText,
        ),
      ),
    [targetedBatchRows, targetedBatchStatusFilter, targetedBatchSearchText],
  );

  const targetedBatchErfIdsKey = useMemo(
    () =>
      JSON.stringify(
        [
          ...new Set(
            targetedBatchRows
              .map((row) => cleanId(row?.erfId || row?.refs?.erfId))
              .filter(Boolean),
          ),
        ].sort(),
      ),
    [targetedBatchRows],
  );

  // TB-R051: ERF centres (E) for the batch map, from the phone's geoLibrary.
  const targetedBatchErfCentroidById = useMemo(() => {
    const geoLibrary = all?.geoLibrary || {};

    return JSON.parse(targetedBatchErfIdsKey).reduce((acc, erfId) => {
      if (geoLibrary[erfId]) acc[erfId] = geoLibrary[erfId];
      return acc;
    }, {});
  }, [targetedBatchErfIdsKey, all?.geoLibrary]);

  useEffect(() => {
    const pending = pendingTargetedBatchAction;
    if (!pending || pending.preparationStarted !== true) return;

    // TB-R051: record what the action is waiting for (null = the Ward's ERFs) for the 30-second message.
    const waitFor = (what = null) => {
      targetedBatchPendingWaitRef.current = {
        requestKey: pending.requestKey,
        what,
      };
    };

    const activeLmPcode = getGeoPcode(geoState?.selectedLm);
    const activeWardPcode = getGeoPcode(geoState?.selectedWard);

    if (
      activeLmPcode !== pending.lmPcode ||
      activeWardPcode !== pending.wardPcode
    ) {
      waitFor();
      return;
    }

    const wardErfsSync = warehouseSync?.erfs || {};
    const syncStatus = normalizeUpper(wardErfsSync?.status);
    const refreshStatus = normalizeUpper(
      wardErfsSync?.refreshStatus,
    );
    const syncLmPcode = cleanId(wardErfsSync?.lmPcode);
    const syncWardPcode = cleanId(wardErfsSync?.wardPcode);
    const syncPackKey = cleanId(wardErfsSync?.wardCacheKey);
    const expectedPackKey = `${pending.lmPcode}__${pending.wardPcode}`;
    const targetWarehouseMatches =
      syncLmPcode === pending.lmPcode &&
      syncWardPcode === pending.wardPcode &&
      (!syncPackKey || syncPackKey === expectedPackKey);

    if (!targetWarehouseMatches) {
      waitFor();
      return;
    }

    const warehouseErf = findWarehouseErfById(
      all?.erfs,
      pending.erfId,
    );

    if (warehouseErf) {
      if (targetedBatchRequestKeyRef.current !== pending.requestKey) return;
      const currentRow = targetedBatchRows.find((row) => row?.id === pending.rowId);
      if (selectedTargetedBatchId !== pending.bucketId || !currentRow) {
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert(currentRow ? "Targeted Batch no longer available." : "Targeted Batch row no longer available.");
        return;
      }
      if (!targetedBatchRefsMatch(currentRow, pending.refsSnapshot)) {
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert("Targeted Batch row changed", "The row linkage changed while the action was preparing. Please try again.");
        return;
      }
      // TB-R051 (1.3.42): nothing starts work on a Completed meter, also when it became Completed while the
      // action was waiting. Opening its meter, premise or ERF goes on.
      const currentRowCompleted = getTargetedBatchRowActionState(currentRow).completed;
      const becameCompletedWithoutPremise =
        currentRowCompleted &&
        pending.intent === TARGETED_BATCH_INTENTS.OPEN_PREMISE &&
        !cleanId(currentRow?.refs?.premiseId);
      if (
        currentRowCompleted &&
        (isTargetedBatchWorkIntent(pending.intent) || becameCompletedWithoutPremise)
      ) {
        console.log("[MY WORKORDERS][TB ACTION COMPLETED]", {
          requestKey: pending.requestKey,
          rowId: pending.rowId,
          intent: pending.intent,
          displayStatus: currentRow?.displayStatus || null,
          salesLoadState: currentRow?.salesLoadState || null,
        });
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert(
          TARGETED_BATCH_COMPLETED_TITLE,
          becameCompletedWithoutPremise
            ? "This meter became Completed while it was opening. Tap Premise again to open its premise."
            : TARGETED_BATCH_COMPLETED_MESSAGE,
        );
        return;
      }
      // TB-R051: also when the row was unallocated or the batch left this worker's work orders while waiting.
      if (
        !isTargetedBatchRowInWorkOrders({
          buckets: targetedBatchBucketsRef.current,
          bucketId: pending.bucketId,
          row: currentRow,
        })
      ) {
        console.log("[MY WORKORDERS][TB ACTION NOT IN WORK ORDERS]", {
          requestKey: pending.requestKey,
          rowId: pending.rowId,
          intent: pending.intent,
          allocationStatus: currentRow?.allocationStatus || null,
        });
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert(
          TARGETED_BATCH_NOT_IN_WORK_ORDERS_TITLE,
          TARGETED_BATCH_NOT_IN_WORK_ORDERS_MESSAGE,
        );
        return;
      }
      // TB-R051: the lock is only known once the meter's Sales record is read; never assume the meter is open.
      if (currentRow?.salesLoadState === "LOADING") {
        waitFor("the meter's Sales record");
        return;
      }
      if (currentRow?.salesLoadState === "ERROR") {
        console.log("[MY WORKORDERS][TB ACTION SALES NOT CHECKED]", {
          requestKey: pending.requestKey,
          rowId: pending.rowId,
          intent: pending.intent,
          salesDocId: currentRow?.salesDocId || null,
        });
        clearPendingTargetedBatchAction(pending.requestKey);
        // TB-R051: no false errors; a Sales listener error is not a lost connection, so never blame it.
        Alert.alert(
          TARGETED_BATCH_SALES_NOT_READABLE_TITLE,
          TARGETED_BATCH_SALES_NOT_READABLE_MESSAGE,
        );
        return;
      }
      const canonicalErf = {
        ...(all?.geoLibrary?.[pending.erfId] || {}),
        ...warehouseErf,
      };
      const batchSelectedErf = buildTargetedBatchSelectedErf({
        row: currentRow,
        bucket: selectedBucket,
        warehouseErf: canonicalErf,
      });
      // TB-R051 (1.3.42): a Completed meter is opened without carrying the batch, since nothing may start on it.
      const selectedErf = currentRowCompleted
        ? withoutTargetedBatchContext(batchSelectedErf)
        : batchSelectedErf;

      // TB-R051 (1.3.42): a Completed meter found outside this batch (no meter linked to its row) is opened from
      // its meter record, looked up by its meter number: when that record is in the batch's Ward it opens, with no
      // batch carried; otherwise the worker is told where it was found.
      if (isTargetedBatchFoundMeterIntent(pending.intent)) {
        const lookup = pending.foundMeterLookup;
        if (!lookup || lookup.status === "LOOKING") {
          waitFor("the meter's record");
          return;
        }
        if (lookup.status === "ERROR") {
          clearPendingTargetedBatchAction(pending.requestKey);
          // TB-R051: no false errors; only a failure to reach the server blames the connection.
          const connectionFailed =
            lookup.code === "unavailable" || lookup.code === "deadline-exceeded";
          Alert.alert(
            "Meter not looked up",
            `Meter ${lookup.meterNo || "of this row"} could not be looked up. ${
              connectionFailed
                ? "Check your connection and try again."
                : "Try again; if it keeps failing, tell the office."
            }`,
          );
          return;
        }
        const choice = chooseFoundMeter(lookup.found, {
          lmPcode: pending.lmPcode,
          wardPcode: pending.wardPcode,
        });
        if (choice.outcome !== "OPEN") {
          clearPendingTargetedBatchAction(pending.requestKey);
          Alert.alert("Meter found outside this batch", foundMeterMessage(choice, lookup.meterNo));
          return;
        }
        const foundMeter = (all?.meters || []).find(
          (item) => cleanId(item?.ast?.astData?.astId || item?.id) === choice.meter.id,
        );
        // Its record says it is in this Ward: wait for it to reach the phone (within the 30-second limit).
        if (!foundMeter) {
          waitFor("the meter");
          return;
        }
        const foundPremiseId = getMeterPremiseId(foundMeter) || choice.meter.premiseId;
        const foundPremise = foundPremiseId
          ? (all?.prems || []).find((item) => getPremiseId(item) === foundPremiseId)
          : null;
        if (pending.intent === TARGETED_BATCH_INTENTS.OPEN_FOUND_METER_PREMISE) {
          if (!foundPremiseId) {
            clearPendingTargetedBatchAction(pending.requestKey);
            Alert.alert(
              "No premise",
              `Meter ${lookup.meterNo || "of this row"} was found outside this batch, and its record has no premise.`,
            );
            return;
          }
          if (!foundPremise) {
            waitFor("the meter's premise");
            return;
          }
        }
        const premiseErfIds = new Map((all?.prems || []).map((item) => [getPremiseId(item), getPremiseErfId(item)]));
        const foundErfId =
          getMeterErfId(foundMeter, premiseErfIds) ||
          (foundPremise ? getPremiseErfId(foundPremise) : "") ||
          choice.meter.erfId;
        // The ERF selection narrows the premise list to this ERF; an ERF not (yet) in the Ward's list on the phone
        // is still selected by its ID, never left empty (an empty selection lists the whole Ward).
        const foundErf = foundErfId
          ? {
              ...(all?.geoLibrary?.[foundErfId] || {}),
              ...(findWarehouseErfById(all?.erfs, foundErfId) || {}),
              id: foundErfId,
            }
          : null;
        const openMeter = pending.intent === TARGETED_BATCH_INTENTS.OPEN_FOUND_METER;

        try {
          updateGeo({
            selectedWard: pending.ward,
            selectedErf: foundErf || null,
            selectedPremise: foundPremise || null,
            selectedMeter: openMeter ? foundMeter : null,
            lastSelectionType: openMeter ? "METER" : "PREMISE",
          });
          setTargetedBatchMapOpen(false);
          router.push(openMeter ? "/(tabs)/asts" : "/(tabs)/premises");
        } catch (error) {
          clearPendingTargetedBatchAction(pending.requestKey);
          Alert.alert(
            "Targeted Batch Navigation Failed",
            error?.message || "The meter could not be opened.",
          );
        }
        return;
      }

      const premiseId = cleanId(currentRow?.refs?.premiseId);
      const meterId = cleanId(currentRow?.refs?.meterId);
      const fieldWorkMeterId = cleanId(
        currentRow?.fieldWorkMeterId || currentRow?.raw?.fieldWorkMeterId,
      );
      if (
        pending.intent === TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS &&
        fieldWorkMeterId
      ) {
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert(
          "Discovery Complete",
          "A meter is already linked. No Access cannot be recorded.",
        );
        return;
      }
      const premise = premiseId ? (all?.prems || []).find((item) => getPremiseId(item) === premiseId) : null;
      // TB-R051: a linked premise that has not reached the phone yet is waited for, not a linkage error.
      if (premiseId && !premise) {
        waitFor("the linked premise");
        return;
      }
      if (premiseId && getPremiseErfId(premise) !== pending.erfId) {
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert("Premise Linkage Error", "The exact linked premise belongs to another ERF.");
        return;
      }
      const meter = meterId ? (all?.meters || []).find((item) => cleanId(item?.ast?.astData?.astId || item?.id) === meterId) : null;
      if (pending.intent === TARGETED_BATCH_INTENTS.OPEN_AST) {
        // TB-R051: the same for a linked meter that has not reached the phone yet.
        if (meterId && !meter) {
          waitFor("the linked meter");
          return;
        }
        const premiseErfs = new Map((all?.prems || []).map((item) => [getPremiseId(item), getPremiseErfId(item)]));
        if (!meter || getMeterErfId(meter, premiseErfs) !== pending.erfId || (premiseId && getMeterPremiseId(meter) !== premiseId)) {
          clearPendingTargetedBatchAction(pending.requestKey);
          Alert.alert("AST Linkage Error", "The exact linked AST could not be safely validated.");
          return;
        }
      }

      let navigationTarget;

      try {
        if (pending.intent === TARGETED_BATCH_INTENTS.OPEN_ERF) {
          navigationTarget = "/(tabs)/erfs";
        } else if (
          pending.intent === TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS
        ) {
          navigationTarget = {
            pathname: "/(tabs)/admin/operations/targeted-batch-no-access",
            params: {
              context: JSON.stringify(
                buildTargetedBatchNoAccessContext({
                  bucket: selectedBucket,
                  row: currentRow,
                }),
              ),
            },
          };
        } else if (pending.intent === TARGETED_BATCH_INTENTS.OPEN_AST) {
          navigationTarget = "/(tabs)/asts";
        } else if (
          pending.intent ===
          TARGETED_BATCH_INTENTS.START_METER_DISCOVERY
        ) {
          if (!premise) {
            clearPendingTargetedBatchAction(pending.requestKey);
            Alert.alert("Meter Discovery requires a premise.");
            return;
          }

          const targetedBatchContext = buildTargetedBatchContextFromRow({
            bucket: selectedBucket,
            row: currentRow,
          });
          const serializedTargetedBatchContext =
            serializeTargetedBatchContext(targetedBatchContext);

          if (!serializedTargetedBatchContext) {
            clearPendingTargetedBatchAction(pending.requestKey);
            Alert.alert(
              "Targeted Batch Row Not Ready",
              "The Meter Discovery context could not be prepared.",
            );
            return;
          }

          navigationTarget = {
            pathname: "/(tabs)/premises/form",
            params: {
              premiseId,
              action: JSON.stringify({
                access: "yes",
                meterType: "electricity",
              }),
              targetedBatchContext: serializedTargetedBatchContext,
            },
          };
        } else {
          navigationTarget = "/(tabs)/premises";
        }
      } catch (error) {
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert(
          "Targeted Batch Row Not Ready",
          error?.message || "Required action context is missing.",
        );
        return;
      }

      try {
        updateGeo({
          selectedWard: pending.ward,
          selectedErf,
          selectedPremise: premise || null,
          selectedMeter:
            pending.intent === TARGETED_BATCH_INTENTS.OPEN_AST
              ? meter
              : null,
          lastSelectionType:
            pending.intent === TARGETED_BATCH_INTENTS.OPEN_AST
              ? "METER"
              : premise
                ? "PREMISE"
                : "ERF",
        });

        // TB-R051: the batch map never stays marked open behind the screen the action opens.
        setTargetedBatchMapOpen(false);
        router.push(navigationTarget);
      } catch (error) {
        clearPendingTargetedBatchAction(pending.requestKey);
        Alert.alert(
          "Targeted Batch Navigation Failed",
          error?.message ||
            "The selected Targeted Batch action could not be opened.",
        );
      }

      return;
    }

    if (syncStatus === "ERROR") {
      clearPendingTargetedBatchAction(pending.requestKey);

      Alert.alert(
        "Targeted Batch Ward Failed",
        readFirstString(
          wardErfsSync?.lastError,
          `The ERFs for ${pending.wardName} could not be loaded.`,
        ),
      );
      return;
    }

    const targetWarehouseRefreshing = [
      "PENDING",
      "REFRESHING",
    ].includes(refreshStatus);

    if (
      warehouseLoading ||
      syncStatus !== "READY" ||
      targetWarehouseRefreshing
    ) {
      waitFor();
      return;
    }

    clearPendingTargetedBatchAction(pending.requestKey);

    Alert.alert(
      "Targeted Batch ERF Not Found",
      `ERF ${pending.erfId} was not found inside the batch ward ${pending.wardName}.`,
    );
  }, [
    pendingTargetedBatchAction,
    geoState?.selectedLm,
    geoState?.selectedWard,
    all?.erfs,
    all?.geoLibrary,
    all?.prems,
    all?.meters,
    targetedBatchRows,
    selectedTargetedBatchId,
    selectedBucket,
    warehouseLoading,
    warehouseSync?.erfs,
    router,
    updateGeo,
    clearPendingTargetedBatchAction,
  ]);

  const pendingTargetedBatchRequestKey =
    pendingTargetedBatchAction?.requestKey || null;
  const pendingTargetedBatchStartedAt =
    pendingTargetedBatchAction?.startedAt || null;
  const pendingTargetedBatchWardName =
    pendingTargetedBatchAction?.wardName || null;

  // TB-R051: no silent waits; the action gives up after 30 seconds and says what did not load.
  useEffect(() => {
    if (!pendingTargetedBatchRequestKey) return;

    const requestKey = pendingTargetedBatchRequestKey;
    const startedAt = Number(pendingTargetedBatchStartedAt) || Date.now();
    const remainingMs = Math.max(
      TARGETED_BATCH_ACTION_TIMEOUT_MS - (Date.now() - startedAt),
      0,
    );

    const timer = setTimeout(() => {
      if (
        !targetedBatchScreenMountedRef.current ||
        targetedBatchRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      const wait = targetedBatchPendingWaitRef.current;
      const waitingFor =
        wait?.requestKey === requestKey && wait?.what
          ? wait.what
          : `The ERFs for ward ${pendingTargetedBatchWardName || "NAv"}`;
      const what = `${waitingFor.charAt(0).toUpperCase()}${waitingFor.slice(1)}`;

      console.log("[MY WORKORDERS][TB ACTION TIMEOUT]", {
        requestKey,
        waitingFor,
        elapsedMs: Date.now() - startedAt,
      });

      clearPendingTargetedBatchAction(requestKey);
      Alert.alert(
        "Could not open the batch action",
        `${what} did not load within 30 seconds. Check your connection and try again.`,
      );
    }, remainingMs);

    return () => clearTimeout(timer);
  }, [
    pendingTargetedBatchRequestKey,
    pendingTargetedBatchStartedAt,
    pendingTargetedBatchWardName,
    clearPendingTargetedBatchAction,
  ]);

  const individualItems = useMemo(() => {
    return allItems.filter(
      (item) => item.scopeBucket === "MY_WORK" && !isBgoChildItem(item),
    );
  }, [allItems]);

  // TB-R052: each list is read for the worker's teams and says which teams those were.
  const bgoTeamIds = useMemo(
    () =>
      Array.isArray(bgoData?.meta?.actorTeamIds) ? bgoData.meta.actorTeamIds : [],
    [bgoData?.meta?.actorTeamIds],
  );
  const targetedBatchTeamIds = useMemo(
    () =>
      Array.isArray(targetedBatchData?.meta?.actorTeamIds)
        ? targetedBatchData.meta.actorTeamIds
        : [],
    [targetedBatchData?.meta?.actorTeamIds],
  );

  const bgoBuckets = useMemo(() => {
    const allBgoBuckets = Array.isArray(bgoData?.buckets)
      ? bgoData.buckets
      : [];

    return allBgoBuckets
      .filter((bucket) =>
        canActorSeeBgoBucket({
          bucket,
          actorUid,
          actorSpId,
          actorTeamIds: bgoTeamIds,
        }),
      )
      .map((bucket) => {
        const liveBucket = withMdBgoLiveStats({
          bucket,
          premises: all?.prems || [],
          meters: all?.meters || [],
          trns: all?.trns || [],
        });
        const counts = liveBucket?.counts || {};

        return {
          ...liveBucket,
          counts,
          totalTrns: liveBucket?.totalTrns || counts.total || 0,
        };
      });
  }, [
    bgoData?.buckets,
    actorUid,
    actorSpId,
    bgoTeamIds,
    all?.prems,
    all?.meters,
    all?.trns,
  ]);

  const targetedBatchBuckets = useMemo(() => {
    const allTargetedBatchBuckets = Array.isArray(targetedBatchData?.buckets)
      ? targetedBatchData.buckets
      : [];

    return allTargetedBatchBuckets.filter((bucket) =>
      canActorSeeBgoBucket({
        bucket,
        actorUid,
        actorSpId,
        actorTeamIds: targetedBatchTeamIds,
      }),
    );
  }, [
    targetedBatchData?.buckets,
    actorUid,
    actorSpId,
    targetedBatchTeamIds,
  ]);

  useEffect(() => {
    const openingId = openingTargetedBatchIdRef.current;

    if (!openingId) return;

    const liveBucket = targetedBatchBuckets.find(
      (bucket) => bucket?.id === openingId,
    );

    if (!liveBucket) {
      clearOpeningTargetedBatch(openingId);
      Alert.alert(
        "Targeted Batch Unavailable",
        "This Targeted Batch is no longer available in your allocated worklist.",
      );
      return;
    }

    if (liveBucket?.permissions?.canViewRows !== true) {
      clearOpeningTargetedBatch(openingId);
      Alert.alert(
        "Targeted Batch Locked",
        "This Targeted Batch is no longer available for field execution.",
      );
    }
  }, [
    targetedBatchBuckets,
    openingTargetedBatchId,
    clearOpeningTargetedBatch,
  ]);

  const groups = useMemo(() => {
    return WMS_GROUPS.map((group) => {
      const groupItems = individualItems.filter(
        (item) => item.trnType === group.key,
      );
      const counts = countItems(groupItems);

      return {
        ...group,
        total: groupItems.length,
        counts,
      };
    });
  }, [individualItems]);

  const individualBucket = useMemo(() => {
    const counts = countItems(individualItems);

    return {
      id: "INDVG",
      bucketType: "INDVG",
      itemKind: "INDIVIDUAL_BUCKET",
      title: "Individual Work Bucket",
      subtitle: "Individually issued lifecycle TRNs",
      trnTypeLabel: "Individual Work",
      workflowState: "ACTIVE",
      releaseState: "NAv",
      targetText: "Direct user work",
      geofenceName: "NAv",
      counts,
      totalTrns: individualItems.length,
      permissions: {
        canViewTrns: true,
        canAccept: false,
        canReject: false,
        canReverseAcceptance: false,
      },
    };
  }, [individualItems]);

  const bucketCards = useMemo(() => {
    return [
      individualBucket,
      ...targetedBatchBuckets,
      ...bgoBuckets,
    ];
  }, [individualBucket, targetedBatchBuckets, bgoBuckets]);

  // TB-R052: a list is ready once it has been read; before that it is loading, never "no work".
  const individualBucketReady = Boolean(wmsData?.meta?.updatedAt);
  const targetedBatchBucketReady = Boolean(
    targetedBatchData?.meta?.updatedAt,
  );
  const bgoBucketReady = Boolean(bgoData?.meta?.updatedAt);

  // TB-R052: a live list that failed, or that only the phone's memory answers after the server did (the open
  // batch's rows and the open BGO batch too), is reconnecting and says so.
  const workOrderListsFailed = [
    wmsData,
    targetedBatchData,
    bgoData,
    targetedBatchRowsQuerySkipped ? null : targetedBatchRowsData,
    bgoDetailQuerySkipped ? null : bgoDetailData,
  ].some((data) => isLiveStreamOutOfDate(data?.meta?.stream));
  // TB-R052: with no connection, work already on the screen stays and says it is from before.
  const workOrdersOnScreen =
    individualItems.length > 0 ||
    targetedBatchBuckets.length > 0 ||
    bgoBuckets.length > 0;

  useEffect(() => {
    if (!selectedBucket?.id) {
      targetedBatchSeenOpenIdRef.current = null;
      return;
    }

    const freshBucket = bucketCards.find((bucket) => bucket?.id === selectedBucket.id);

    // TB-R051: a batch that leaves this worker's work orders (unallocated, or no longer accepted) closes its
    // rows screen back to the batch list with the reason, instead of keeping the old batch open. Only once its
    // rows were seen open in the live list, so a just-accepted batch is kept until the list catches up.
    if (selectedBucket.bucketType === "TBB" && targetedBatchBucketReady) {
      if (freshBucket?.permissions?.canViewRows === true) {
        targetedBatchSeenOpenIdRef.current = selectedBucket.id;
      } else if (targetedBatchSeenOpenIdRef.current === selectedBucket.id) {
        console.log("[MY WORKORDERS][TB BATCH LEFT WORK ORDERS]", {
          bucketId: selectedBucket.id,
          listed: Boolean(freshBucket),
          allocationStatus: freshBucket?.allocationStatus || null,
          acceptanceStatus: freshBucket?.acceptanceStatus || null,
        });
        targetedBatchSeenOpenIdRef.current = null;
        // The same as the rows screen's back button (backToBuckets).
        setPreparingBgoDetail(false);
        clearOpeningTargetedBatch();
        clearPendingTargetedBatchAction();
        setSelectedBucket(null);
        setSelectedGroup(null);
        setStateFilter("ALL");

        // Shown now, or when My Work Orders is next in front if the worker is on another screen.
        if (workordersScreenFocusedRef.current) {
          Alert.alert(
            TARGETED_BATCH_NOT_IN_WORK_ORDERS_TITLE,
            TARGETED_BATCH_NOT_IN_WORK_ORDERS_MESSAGE,
          );
        } else {
          targetedBatchClosedNoticeRef.current = true;
        }
        return;
      }
    }

    if (!freshBucket || freshBucket === selectedBucket) return;

    const selectedAcceptanceStatus = normalizeUpper(
      selectedBucket?.acceptanceStatus,
    );
    const freshAcceptanceStatus = normalizeUpper(
      freshBucket?.acceptanceStatus,
    );

    if (
      selectedBucket?.bucketType === "TBB" &&
      selectedAcceptanceStatus === "ACCEPTED" &&
      freshAcceptanceStatus !== "ACCEPTED"
    ) {
      return;
    }

    setSelectedBucket(freshBucket);
  }, [
    bucketCards,
    selectedBucket,
    targetedBatchBucketReady,
    clearOpeningTargetedBatch,
    clearPendingTargetedBatchAction,
  ]);

  const visibleItems = useMemo(() => {
    let baseItems = [];

    if (selectedBucket?.bucketType === "BGOB") {
      baseItems = bgoDetailItems.filter(
        (item) => getBgoBatchIdFromItem(item) === selectedBucket.id,
      );
    } else if (selectedBucket?.bucketType === "INDVG" && selectedGroup?.key) {
      baseItems = individualItems.filter(
        (item) => item.trnType === selectedGroup.key,
      );
    }

    if (stateFilter === "ALL") return baseItems;

    return baseItems.filter((item) => item.workflowState === stateFilter);
  }, [
    bgoDetailItems,
    individualItems,
    selectedBucket,
    selectedGroup,
    stateFilter,
  ]);

  const allVisibleBucketItems = useMemo(() => {
    if (selectedBucket?.bucketType === "BGOB") {
      return bgoDetailItems.filter(
        (item) => getBgoBatchIdFromItem(item) === selectedBucket.id,
      );
    }

    if (selectedBucket?.bucketType === "INDVG" && selectedGroup?.key) {
      return individualItems.filter(
        (item) => item.trnType === selectedGroup.key,
      );
    }

    return [];
  }, [bgoDetailItems, individualItems, selectedBucket, selectedGroup]);

  useEffect(() => {
    if (selectedBucket?.bucketType !== "BGOB") {
      setPreparingBgoDetail(false);
      return;
    }

    if (allVisibleBucketItems.length > 0) {
      setPreparingBgoDetail(false);
      return;
    }

    const timeout = setTimeout(() => {
      setPreparingBgoDetail(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, [selectedBucket?.bucketType, selectedBucket?.id, allVisibleBucketItems.length]);

  const isPreparingBgoDetail =
    selectedBucket?.bucketType === "BGOB" &&
    (preparingBgoDetail ||
      ((isLoadingBgoDetailTrns ||
        isFetchingBgoDetailTrns ||
        // TB-R052: until the server has answered, an opened BGO batch is loading, never empty.
        !bgoDetailData?.meta?.updatedAt) &&
        allVisibleBucketItems.length === 0 &&
        Number(selectedBucket?.totalTrns || selectedBucket?.counts?.total || 0) > 0));

  function openBucketCategory(bucketType) {
    clearOpeningTargetedBatch();

    if (bucketType === "INDVG") {
      if (!individualBucketReady || error) return;

      setSelectedBucketCategory(null);
      openBucket(individualBucket);
      return;
    }

    if (bucketType === "TBB") {
      if (!targetedBatchBucketReady || targetedBatchError) return;

      setSelectedBucketCategory("TBB");
      setSelectedBucket(null);
      setSelectedGroup(null);
      setStateFilter("ALL");
      return;
    }

    if (bucketType === "BGOB") {
      if (!bgoBucketReady || bgoError) return;

      setSelectedBucketCategory("BGOB");
      setSelectedBucket(null);
      setSelectedGroup(null);
      setStateFilter("ALL");
    }
  }

  function openBucket(bucket) {
    if (bucket?.bucketType === "INDVG") {
      setPreparingBgoDetail(false);
      setSelectedBucket(bucket);
      setSelectedGroup(null);
      setStateFilter("ALL");
      return;
    }

    if (bucket?.bucketType === "BGOB") {
      const isBmd = isBmdBgoBucket(bucket);
      const canOpen = isBmd
        ? bucket?.permissions?.canViewErfs === true
        : bucket?.permissions?.canViewTrns === true;

      if (!canOpen) {
        Alert.alert(
          "BGO Bucket Locked",
          isBmd
            ? "This MD-BGO bucket must be accepted before its ERF worklist can be opened."
            : "This BGO bucket must be accepted before its TRNs can be viewed for execution.",
        );
        return;
      }

      setPreparingBgoDetail(!isBmd);
      setSelectedBucket(bucket);
      setSelectedGroup(null);
      setStateFilter("ALL");
      return;
    }

    if (bucket?.bucketType === "TBB") {
      const targetedBatchId = String(bucket?.id || "").trim();

      if (!targetedBatchId || actionBusy || openingTargetedBatchIdRef.current) {
        return;
      }

      const liveBucket = targetedBatchBucketsRef.current.find(
        (candidate) => candidate?.id === targetedBatchId,
      );

      if (!liveBucket) {
        Alert.alert(
          "Targeted Batch Unavailable",
          "This Targeted Batch is no longer available in your allocated worklist.",
        );
        return;
      }

      if (liveBucket?.permissions?.canViewRows !== true) {
        Alert.alert(
          "Targeted Batch Locked",
          "This Targeted Batch must be accepted before its rows can be opened for field execution.",
        );
        return;
      }

      cancelTargetedBatchCardOpeningFrames();
      openingTargetedBatchIdRef.current = targetedBatchId;
      setOpeningTargetedBatchId(targetedBatchId);

      targetedBatchCardOpenPaintFrameRef.current = requestAnimationFrame(() => {
        targetedBatchCardOpenPaintFrameRef.current = null;

        if (
          !targetedBatchScreenMountedRef.current ||
          openingTargetedBatchIdRef.current !== targetedBatchId
        ) {
          return;
        }

        targetedBatchCardOpenPreparationFrameRef.current =
          requestAnimationFrame(() => {
            targetedBatchCardOpenPreparationFrameRef.current = null;

            if (
              !targetedBatchScreenMountedRef.current ||
              openingTargetedBatchIdRef.current !== targetedBatchId
            ) {
              return;
            }

            const latestBucket = targetedBatchBucketsRef.current.find(
              (candidate) => candidate?.id === targetedBatchId,
            );

            if (!latestBucket) {
              clearOpeningTargetedBatch(targetedBatchId);
              Alert.alert(
                "Targeted Batch Unavailable",
                "This Targeted Batch is no longer available in your allocated worklist.",
              );
              return;
            }

            if (latestBucket?.permissions?.canViewRows !== true) {
              clearOpeningTargetedBatch(targetedBatchId);
              Alert.alert(
                "Targeted Batch Locked",
                "This Targeted Batch is no longer available for field execution.",
              );
              return;
            }

            setPreparingBgoDetail(false);
            setSelectedBucket(latestBucket);
            setSelectedGroup(null);
            setStateFilter("ALL");
            clearOpeningTargetedBatch(targetedBatchId);
          });
      });
    }
  }

  function openGroup(group) {
    setSelectedGroup(group);
    setStateFilter("ALL");
  }

  function backToBucketCategories() {
    setPreparingBgoDetail(false);
    clearOpeningTargetedBatch();
    clearPendingTargetedBatchAction();
    setSelectedBucketCategory(null);
    setSelectedBucket(null);
    setSelectedGroup(null);
    setStateFilter("ALL");
  }

  function backToBuckets() {
    setPreparingBgoDetail(false);
    clearOpeningTargetedBatch();
    clearPendingTargetedBatchAction();
    setSelectedBucket(null);
    setSelectedGroup(null);
    setStateFilter("ALL");
  }

  function backToIndividualGroups() {
    setSelectedGroup(null);
    setStateFilter("ALL");
  }

  async function submitDecision({ item, action, rejectReason = "" }) {
    if (!item?.id || actionBusy) return false;

    try {
      const result = await acceptRejectLifecycleInstruction({
        trnIds: [item.id],
        action,
        rejectReason: String(rejectReason || "").trim(),
      }).unwrap();

      Alert.alert(
        action === "ACCEPT" ? "Work Accepted" : "Work Rejected",
        result?.message ||
          (action === "ACCEPT"
            ? "Lifecycle work item accepted."
            : "Lifecycle work item rejected."),
      );

      return true;
    } catch (err) {
      console.log("WMS decision ERROR", err);

      Alert.alert(
        "Action Failed",
        err?.data?.message || err?.message || "Could not update work item.",
      );

      return false;
    }
  }

  async function submitBgoDecision({ bucket, action, rejectReason = "" }) {
    if (!bucket?.id || actionBusy) return false;

    setProcessingBgoBucketAction({
      bucketId: bucket.id,
      action: normalizeUpper(action),
    });

    try {
      const result = await acceptRejectBgoBatch({
        batchId: bucket.id,
        action,
        rejectReason: String(rejectReason || "").trim(),
      }).unwrap();

      if (result?.success === false) {
        throw {
          data: result,
          message: result?.message || "BGO action failed.",
        };
      }

      const isBmdBucket = isBmdBgoBucket(bucket);

      Alert.alert(
        action === "ACCEPT"
          ? isBmdBucket
            ? "MD-BGO Bucket Accepted"
            : "BGO Bucket Accepted"
          : isBmdBucket
            ? "MD-BGO Bucket Rejected"
            : "BGO Bucket Rejected",
        result?.message ||
          (action === "ACCEPT"
            ? isBmdBucket
              ? "MD-BGO bucket accepted. The ERF worklist is now ready for field discovery."
              : "BGO bucket accepted and child TRNs released to execution."
            : isBmdBucket
              ? "MD-BGO bucket rejected."
              : "BGO bucket rejected."),
      );

      safeRefetch(refetchBgo, "BGO buckets");
      safeRefetch(refetch, "individual work");
      safeRefetch(refetchBgoDetail, "BGO detail TRNs");

      return true;
    } catch (err) {
      console.log("BGO bucket decision ERROR", err);

      Alert.alert(
        "BGO Action Failed",
        getActionErrorMessage(err, "Could not update BGO bucket."),
      );

      return false;
    } finally {
      setProcessingBgoBucketAction((current) =>
        current?.bucketId === bucket.id ? null : current,
      );
    }
  }

  async function submitTargetedBatchDecision({
    bucket,
    action,
    rejectReason = "",
  }) {
    if (!bucket?.id || actionBusy) return false;

    setProcessingTargetedBatchAction({
      bucketId: bucket.id,
      action: normalizeUpper(action),
    });

    try {
      const result = await acceptRejectTargetedBatch({
        tbId: bucket.id,
        action,
        rejectReason: String(rejectReason || "").trim(),
      }).unwrap();

      if (result?.success === false) {
        throw {
          data: result,
          message: result?.message || "Targeted Batch action failed.",
        };
      }

      if (normalizeUpper(action) === "ACCEPT") {
        const acceptedBucket = {
          ...bucket,
          acceptanceStatus: "ACCEPTED",
          permissions: {
            ...(bucket?.permissions || {}),
            canAccept: false,
            canReject: false,
            canViewRows: true,
          },
        };

        Alert.alert(
          "Targeted Batch Accepted",
          result?.message ||
            "The Targeted Batch row worklist is now ready for field execution.",
          [
            {
              text: "LATER",
              style: "cancel",
            },
            {
              text: "VIEW TRANSACTIONS",
              onPress: () => {
                setPreparingBgoDetail(false);
                setSelectedBucket(acceptedBucket);
                setSelectedGroup(null);
                setStateFilter("ALL");
              },
            },
          ],
        );
      } else {
        Alert.alert(
          "Targeted Batch Rejected",
          result?.message ||
            "The Targeted Batch was rejected before execution started.",
        );
      }

      return true;
    } catch (err) {
      console.log("Targeted Batch decision ERROR", err);

      Alert.alert(
        "Targeted Batch Action Failed",
        getActionErrorMessage(
          err,
          "Could not update the Targeted Batch.",
        ),
      );

      return false;
    } finally {
      setProcessingTargetedBatchAction((current) =>
        current?.bucketId === bucket.id ? null : current,
      );
    }
  }

  function handleAccept(item) {
    Alert.alert("Accept Work", `Accept ${item?.id || "this work item"}?`, [
      { text: "CANCEL", style: "cancel" },
      {
        text: "ACCEPT",
        onPress: () => submitDecision({ item, action: "ACCEPT" }),
      },
    ]);
  }

  function handleAcceptBgoBucket(bucket) {
    if (!fieldWorkorderActor) {
      Alert.alert(
        "WMS Access Blocked",
        "Only FWR and SPV(SUBC) users may accept BGO buckets from My Workorders.",
      );
      return;
    }

    const isBmdBucket = isBmdBgoBucket(bucket);

    Alert.alert(
      isBmdBucket ? "Accept MD-BGO Bucket" : "Accept BGO Bucket",
      isBmdBucket
        ? `Accept ${bucket?.title || "this MD-BGO bucket"}? The ERF worklist will be released for field discovery.`
        : `Accept ${bucket?.title || "this BGO bucket"}? All child TRNs will become executable.`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "ACCEPT",
          onPress: () =>
            submitBgoDecision({ bucket, action: "ACCEPT" }),
        },
      ],
    );
  }

  function handleAcceptTargetedBatch(bucket) {
    if (!fieldWorkorderActor) {
      Alert.alert(
        "WMS Access Blocked",
        "Only FWR and SPV(SUBC) users may accept Targeted Batches from My Workorders.",
      );
      return;
    }

    Alert.alert(
      "Accept Targeted Batch",
      `Accept ${bucket?.id || "this Targeted Batch"}? Its rows will be opened for premise and meter discovery work.`,
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "ACCEPT",
          onPress: () =>
            submitTargetedBatchDecision({
              bucket,
              action: "ACCEPT",
            }),
        },
      ],
    );
  }

  function handleReverseBgoBucket(bucket) {
    Alert.alert(
      "Reverse BGO Acceptance",
      "This is online-only and will only work if no child TRN has started execution. Reverse this BGO bucket acceptance?",
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "REVERSE",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await reverseBgoBatchAcceptance({
                batchId: bucket.id,
                reason: "Manager reversed BGO acceptance before execution started",
              }).unwrap();

              if (result?.success === false) {
                throw {
                  data: result,
                  message: result?.message || "Reverse acceptance failed.",
                };
              }

              Alert.alert(
                "BGO Acceptance Reversed",
                result?.message || "BGO bucket acceptance was reversed.",
              );

              safeRefetch(refetchBgo, "BGO buckets");
              safeRefetch(refetch, "individual work");
              safeRefetch(refetchBgoDetail, "BGO detail TRNs");
              backToBuckets();
            } catch (err) {
              console.log("BGO reverse acceptance ERROR", err);

              Alert.alert(
                "Reverse Failed",
                getActionErrorMessage(err, "Could not reverse BGO acceptance."),
              );
            }
          },
        },
      ],
    );
  }

  async function handleReject(values, helpers) {
    if (rejectItem?.itemKind === "TARGETED_BATCH") {
      if (!fieldWorkorderActor) {
        Alert.alert(
          "WMS Access Blocked",
          "Only FWR and SPV(SUBC) users may reject Targeted Batches from My Workorders.",
        );
        helpers.setSubmitting(false);
        return;
      }

      const success = await submitTargetedBatchDecision({
        bucket: rejectItem,
        action: "REJECT",
        rejectReason: values.rejectReason,
      });

      helpers.setSubmitting(false);

      if (success) {
        helpers.resetForm();
        setRejectItem(null);
      }

      return;
    }

    if (rejectItem?.itemKind === "BGO_BATCH") {
      if (!fieldWorkorderActor) {
        Alert.alert(
          "WMS Access Blocked",
          "Only FWR and SPV(SUBC) users may reject BGO buckets from My Workorders.",
        );
        helpers.setSubmitting(false);
        return;
      }

      const success = await submitBgoDecision({
        bucket: rejectItem,
        action: "REJECT",
        rejectReason: values.rejectReason,
      });

      helpers.setSubmitting(false);

      if (success) {
        helpers.resetForm();
        setRejectItem(null);
      }

      return;
    }

    const rejectedInstructionTrnId = rejectItem?.id || "NAv";

    const success = await submitDecision({
      item: rejectItem,
      action: "REJECT",
      rejectReason: values.rejectReason,
    });

    helpers.setSubmitting(false);

    if (success) {
      try {
        const mmkvRemoveResult =
          await removeSubmissionQueueItemsByInstructionTrnId(
            rejectedInstructionTrnId,
            {
              updatedByUid: actorUid || "SYSTEM",
              updatedByUser: actorName || "SYSTEM",
            },
          );

        console.log("WMS reject -- local MMKV cleanup result", {
          rejectedInstructionTrnId,
          removedCount: mmkvRemoveResult?.removedCount || 0,
          removedItemIds: mmkvRemoveResult?.removedItemIds || [],
          result: mmkvRemoveResult,
        });
      } catch (error) {
        console.log("WMS reject -- local MMKV cleanup error", {
          rejectedInstructionTrnId,
          code: error?.code,
          message: error?.message,
          stack: error?.stack,
          raw: error,
        });
      }

      helpers.resetForm();
      setRejectItem(null);
      safeRefetch(refetch, "individual work");
    }
  }

  function handleExecute(item) {
    if (!isExecutableWorkflowState(item?.workflowState)) {
      Alert.alert(
        "TRN Not Executable",
        "Only ACCEPTED or IN_PROGRESS work items can be opened for execution.",
      );
      return;
    }

    const pathname = EXECUTION_ROUTES[item?.trnType];

    if (!pathname) {
      Alert.alert(
        "Execution Route",
        "This work type can be issued and accepted, but execution is not enabled on this screen yet.",
      );
      return;
    }

    const instructionTrnId = item?.id || null;

    const sourceAstId =
      item?.raw?.ast?.astData?.astId || item?.raw?.astData?.astId || null;

    const premiseId =
      item?.premiseId || item?.raw?.accessData?.premise?.id || null;

    if (!instructionTrnId) {
      Alert.alert(
        "Work Item Not Ready",
        "This WMS item does not have a lifecycle instruction TRN id.",
      );
      return;
    }

    const action = {
      source: "WMS",

      // ✅ This is the accepted WMS work item / lifecycle instruction TRN.
      id: instructionTrnId,
      trnId: instructionTrnId,
      instructionTrnId,

      // ✅ This is only the referenced AST/installing TRN id used by backend AST updates.
      sourceAstId,
      astId: sourceAstId,

      trnType: item.trnType,
      premiseId,
      meterNo: item.meterNo,
      meterType: item.meterType,
      meterKind: item.meterKind,
      meterPreStatus: item.meterPreStatus,
      erfNo: item.erfNo,
      address: item.address,
      accessData: item?.raw?.accessData || null,
      ast: item?.raw?.ast || null,
      status: item?.raw?.status || null,
      assignment: item?.raw?.assignment || null,
      media: Array.isArray(item?.raw?.media) ? item.raw.media : [],
      officeInstruction: item?.raw?.assignment?.instruction || {
        code: item.trnType,
        text: item.assignment?.instructionText || "",
        notes: item.assignment?.instructionNotes || "",
        mediaRequired: false,
      },
      officeInstructionMedia: Array.isArray(item?.raw?.media)
        ? item.raw.media.filter((media) => media?.tag === "instructionMedia")
        : [],
      instructionText: item.assignment?.instructionText || "",
      instructionNotes: item.assignment?.instructionNotes || "",
      assignedTargetText: item.assignment?.targetText || "",
      issuedBy: item.issuedBy || null,
      serviceProvider: item.serviceProvider || null,
    };

    console.log("🧭 [WMS EXECUTE TAP]", {
      route: pathname,
      instructionTrnId,
      sourceAstId,
      premiseId,
      trnType: item?.trnType,
      meterNo: item?.meterNo,
    });

    router.push({
      pathname,
      params: {
        // ✅ Primary WMS execution id.
        trnId: instructionTrnId,
        instructionTrnId,

        // ✅ Asset reference, not the WMS work id.
        sourceAstId: sourceAstId || "",

        premiseId: premiseId || "",
        returnTo: "/(tabs)/admin/operations/my-workorders",
        action: JSON.stringify(action),
        source: "WMS",
      },
    });
  }

  function handleOpenBmdErf({ bucket, erf }) {
    if (!bucket?.id || !erf?.id) {
      Alert.alert(
        "MD-BGO ERF Not Ready",
        "This ERF work item is missing its batch or ERF reference.",
      );
      return;
    }

    const warehouseErf = Array.isArray(all?.erfs)
      ? all.erfs.find((item) => item?.id === erf.id)
      : null;

    const selectedErf = buildBmdSelectedErf({
      erf,
      bucket,
      warehouseErf,
    });

    // Keep GeoContext as the single selection authority.
    // We only select the ERF here; GeoContext handles the cascade that clears
    // selectedPremise/selectedMeter and bumps flightSignal.
    updateGeo({
      selectedErf,
      lastSelectionType: "ERF",
    });

    router.push("/(tabs)/premises");
  }

  // TB-R051: returns true only when the action is now pending (preparing); false when it was refused.
  function prepareTargetedBatchAction({ bucket, row, intent }) {
    const erfId = cleanId(row?.erfId || row?.refs?.erfId);
    const scope = getTargetedBatchWardScope({ bucket, row });
    const actions = getTargetedBatchRowActionState(row);

    console.log("[MY WORKORDERS][TB ACTION TAP]", {
      bucketId: bucket?.id || null,
      rowId: row?.id || null,
      meterNo: row?.meterNo || null,
      intent,
      salesAllMeterId: row?.salesAllMeterId || null,
      salesDocId: row?.salesDocId || null,
      noAccessCount: row?.noAccessCount ?? null,
      fieldWorkMeterId: row?.fieldWorkMeterId || row?.raw?.fieldWorkMeterId || null,
      noAccessSourceStatus: row?.noAccessSourceStatus || null,
      refs: row?.refs || null,
      actionState: actions,
      scope,
    });

    // TB-R051 (1.3.42): a Completed meter opens its meter, premise and ERF, but nothing starts work on it.
    if (actions.completed && isTargetedBatchWorkIntent(intent)) {
      Alert.alert(TARGETED_BATCH_COMPLETED_TITLE, TARGETED_BATCH_COMPLETED_MESSAGE);
      return false;
    }

    // TB-R051: refused at once, before any Ward switch, when the row is no longer allocated or its batch is no
    // longer in this worker's work orders (unallocated, or no longer accepted); the map stays open under the message.
    if (
      !isTargetedBatchRowInWorkOrders({
        buckets: targetedBatchBucketsRef.current,
        bucketId: bucket?.id,
        row,
      })
    ) {
      console.log("[MY WORKORDERS][TB ACTION NOT IN WORK ORDERS]", {
        bucketId: bucket?.id || null,
        rowId: row?.id || null,
        intent,
        allocationStatus: row?.allocationStatus || null,
      });
      Alert.alert(
        TARGETED_BATCH_NOT_IN_WORK_ORDERS_TITLE,
        TARGETED_BATCH_NOT_IN_WORK_ORDERS_MESSAGE,
      );
      return false;
    }

    // TB-R051: no false errors; a meter whose Sales record could not be read is refused at once,
    // before any Ward switch, because waiting or trying again cannot read it.
    if (row?.salesLoadState === "ERROR") {
      console.log("[MY WORKORDERS][TB ACTION SALES NOT CHECKED]", {
        bucketId: bucket?.id || null,
        rowId: row?.id || null,
        intent,
        salesDocId: row?.salesDocId || null,
      });
      Alert.alert(
        TARGETED_BATCH_SALES_NOT_READABLE_TITLE,
        TARGETED_BATCH_SALES_NOT_READABLE_MESSAGE,
      );
      return false;
    }

    if (
      intent === TARGETED_BATCH_INTENTS.RECORD_NO_ACCESS &&
      actions.noAccess.disabled
    ) {
      Alert.alert(
        "Discovery Complete",
        "A meter is already linked. No Access cannot be recorded.",
      );
      return false;
    }

    if (!bucket?.id || !row?.id || !erfId) {
      Alert.alert(
        "Targeted Batch Row Not Ready",
        "This row is missing its Targeted Batch or ERF reference.",
      );
      return false;
    }

    if (!scope.lmPcode || !scope.wardPcode) {
      Alert.alert(
        "Targeted Batch Ward Scope Missing",
        "This Targeted Batch does not carry its required LM and ward scope.",
      );
      return false;
    }

    if (
      scope.rowLmPcode &&
      scope.rowLmPcode !== scope.lmPcode
    ) {
      Alert.alert(
        "Targeted Batch LM Scope Conflict",
        "This row does not match the Targeted Batch municipality scope.",
      );
      return false;
    }

    if (
      scope.rowWardPcode &&
      scope.rowWardPcode !== scope.wardPcode
    ) {
      Alert.alert(
        "Targeted Batch Ward Scope Conflict",
        "This row does not match the Targeted Batch ward scope.",
      );
      return false;
    }

    const activeLmPcode = getGeoPcode(geoState?.selectedLm);

    if (activeLmPcode !== scope.lmPcode) {
      Alert.alert(
        "Targeted Batch Workbase Mismatch",
        `This batch belongs to ${scope.lmPcode}, but the active workbase is ${activeLmPcode || "NAv"}.`,
      );
      return false;
    }

    const targetWard = findWardByPcode(
      all?.wards,
      scope.wardPcode,
    );

    if (!targetWard) {
      Alert.alert(
        "Targeted Batch Ward Not Available",
        `Ward ${scope.wardPcode} is not available in the active ${scope.lmPcode} workbase.`,
      );
      return false;
    }

    cancelTargetedBatchPreparationFrames();

    const requestKey = `${bucket.id}__${row.id}__${++targetedBatchRequestSequence.current}`;
    targetedBatchRequestKeyRef.current = requestKey;
    targetedBatchPendingWaitRef.current = null;
    setPendingTargetedBatchAction({
      requestKey,
      // TB-R051: the 30-second limit counts from the tap.
      startedAt: Date.now(),
      bucketId: bucket.id,
      rowId: row.id,
      refsSnapshot: snapshotTargetedBatchRefs(row),
      erfId,
      lmPcode: scope.lmPcode,
      wardPcode: scope.wardPcode,
      wardName: readFirstString(
        scope.wardName,
        targetWard?.name,
        scope.wardPcode,
      ),
      ward: targetWard,
      intent,
      preparationStarted: false,
      // TB-R051 (1.3.42): a meter found outside this batch is looked up by its meter number, once, while the
      // batch's Ward loads.
      foundMeterLookup: isTargetedBatchFoundMeterIntent(intent)
        ? { status: "LOOKING" }
        : null,
    });

    if (isTargetedBatchFoundMeterIntent(intent)) {
      const meterNo = readFirstString(row?.salesDocId, row?.meterNo);
      const answer = (lookup) =>
        setPendingTargetedBatchAction((current) =>
          current?.requestKey === requestKey
            ? { ...current, foundMeterLookup: lookup }
            : current,
        );
      findMetersByNumber(meterNo)
        .then((found) => answer({ status: "DONE", meterNo, found }))
        .catch((error) => {
          console.log("[MY WORKORDERS][TB FOUND METER LOOKUP FAILED]", {
            requestKey,
            meterNo,
            message: error?.message || String(error),
          });
          answer({ status: "ERROR", meterNo, code: error?.code || null });
        });
    }

    targetedBatchPaintFrameRef.current = requestAnimationFrame(() => {
      targetedBatchPaintFrameRef.current = null;

      if (
        !targetedBatchScreenMountedRef.current ||
        targetedBatchRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      targetedBatchPreparationFrameRef.current = requestAnimationFrame(() => {
        targetedBatchPreparationFrameRef.current = null;

        if (
          !targetedBatchScreenMountedRef.current ||
          targetedBatchRequestKeyRef.current !== requestKey
        ) {
          return;
        }

        setPendingTargetedBatchAction((current) =>
          current?.requestKey === requestKey
            ? { ...current, preparationStarted: true }
            : current,
        );

        updateGeo({
          selectedWard: targetWard,
          selectedErf: null,
          selectedPremise: null,
          selectedMeter: null,
          lastSelectionType: "WARD",
        });
      });
    });

    return true;
  }

  const showBmdErfWorklist =
    selectedBucket?.bucketType === "BGOB" && isBmdBgoBucket(selectedBucket);

  const showTargetedBatchRows =
    selectedBucket?.bucketType === "TBB";

  const showIndividualGroups =
    selectedBucket?.bucketType === "INDVG" && !selectedGroup;

  const showTrnDetail =
    (selectedBucket?.bucketType === "BGOB" && !showBmdErfWorklist) ||
    (selectedBucket?.bucketType === "INDVG" && selectedGroup);

  const detailTitle =
    selectedBucket?.bucketType === "BGOB"
      ? selectedBucket?.title || "BGO Bucket TRNs"
      : selectedGroup?.title || "My Allocated Work";

  const detailBackLabel =
    selectedBucket?.bucketType === "BGOB" ? "Buckets" : "Types";

  const targetedBatchMapVisible =
    targetedBatchMapOpen && showTargetedBatchRows;

  // TB-R051: the phone's back button goes up one level (map, rows, batches, work types) before leaving the screen.
  // Mirrors the render below: each level runs the same handler as its on-screen back button.
  hardwareBackHandlerRef.current = () => {
    if (targetedBatchMapVisible) {
      setTargetedBatchMapOpen(false);
      return true;
    }

    if (!selectedBucket && !selectedBucketCategory) return false;

    if (
      !selectedBucket &&
      (selectedBucketCategory === "TBB" || selectedBucketCategory === "BGOB")
    ) {
      backToBucketCategories();
      return true;
    }

    if (showIndividualGroups || showBmdErfWorklist || showTargetedBatchRows) {
      backToBuckets();
      return true;
    }

    if (showTrnDetail) {
      if (selectedBucket?.bucketType === "BGOB") {
        backToBuckets();
      } else {
        backToIndividualGroups();
      }
      return true;
    }

    return false;
  };

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => hardwareBackHandlerRef.current?.() === true,
      );

      return () => subscription.remove();
    }, []),
  );

  // TB-R051: the "not in your work orders" message deferred while the worker was on another screen.
  useFocusEffect(
    useCallback(() => {
      workordersScreenFocusedRef.current = true;

      if (targetedBatchClosedNoticeRef.current) {
        targetedBatchClosedNoticeRef.current = false;
        Alert.alert(
          TARGETED_BATCH_NOT_IN_WORK_ORDERS_TITLE,
          TARGETED_BATCH_NOT_IN_WORK_ORDERS_MESSAGE,
        );
      }

      return () => {
        workordersScreenFocusedRef.current = false;
      };
    }, []),
  );

  prepareTargetedBatchActionRef.current = prepareTargetedBatchAction;
  targetedBatchRowsRef.current = targetedBatchRows;
  selectedBucketRef.current = selectedBucket;
  // TB-R051: set while rendering, so the action checks in the effects of this render read this batch list.
  targetedBatchBucketsRef.current = targetedBatchBuckets;

  // TB-R051: one stable handler for every row card, so a live Sales or row update re-renders only the cards
  // whose shown fields changed. A memoised card can hold an older row object, so the tap acts on the latest
  // row and batch, as a re-rendered card would have passed.
  const handleTargetedBatchRowAction = useCallback((args = {}) => {
    const rowId = args?.row?.id;
    const latestRow =
      (rowId &&
        targetedBatchRowsRef.current.find((item) => item?.id === rowId)) ||
      args?.row;
    const latestBucket =
      args?.bucket?.id && selectedBucketRef.current?.id === args.bucket.id
        ? selectedBucketRef.current
        : args?.bucket;

    return (
      prepareTargetedBatchActionRef.current?.({
        ...args,
        bucket: latestBucket,
        row: latestRow,
      }) === true
    );
  }, []);

  const handleTargetedBatchMapRowAction = useCallback(
    (args) => {
      // TB-R051: the map stays open when the action is refused, so the message shows over the map.
      if (!handleTargetedBatchRowAction(args)) return false;

      // The map is a Modal and would cover the screen the action opens.
      setTargetedBatchMapOpen(false);
      // TB-R051: no silent waits; the banner under the search box says what is opening, and an empty
      // search (and Total, 1.3.42) keeps the row's tile spinner in the list.
      setTargetedBatchSearchText("");
      setTargetedBatchStatusFilter(TARGETED_BATCH_STATUS_FILTERS.TOTAL);
      return true;
    },
    [handleTargetedBatchRowAction],
  );

  const pendingTargetedBatchRowId = pendingTargetedBatchAction?.rowId || null;
  const pendingTargetedBatchIntent = pendingTargetedBatchAction?.intent || null;

  const renderTargetedBatchMapRowCard = useCallback(
    (row) => (
      <TargetedBatchRowCard
        row={row}
        bucket={selectedBucket}
        openingIntent={
          pendingTargetedBatchRowId && pendingTargetedBatchRowId === row?.id
            ? pendingTargetedBatchIntent
            : null
        }
        onAction={handleTargetedBatchMapRowAction}
      />
    ),
    [
      selectedBucket,
      pendingTargetedBatchRowId,
      pendingTargetedBatchIntent,
      handleTargetedBatchMapRowAction,
    ],
  );

  // TB-R052: until the server has answered its rows, an opened batch is loading, never empty.
  const targetedBatchRowsLoading =
    !targetedBatchRowsQuerySkipped &&
    !targetedBatchRowsError &&
    !targetedBatchRowsData?.meta?.updatedAt;

  if (!fieldWorkorderActor) {
    return (
      <AccessDeniedWorkorders
        actorRole={actorRole}
        onBack={() => {
          if (router?.canGoBack?.()) {
            router.back();
          }
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: "Workorder Management System",
          headerTitleStyle: { fontSize: 15, fontWeight: "900" },
        }}
      />

      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons
            name="clipboard-list-outline"
            size={26}
            color="#ffffff"
          />
        </View>

        <View style={styles.headerMain}>
          <Text style={styles.headerTitle}>WMS</Text>
          <Text style={styles.headerSub}>My allocated lifecycle work</Text>
        </View>

        <View style={styles.headerCountBadge}>
          <Text style={styles.headerCountText}>Buckets 3</Text>
        </View>
      </View>

      {offline ? (
        <View style={styles.wmsOfflineBanner} accessibilityRole="alert">
          <MaterialCommunityIcons name="wifi-off" size={16} color="#991b1b" />
          <Text style={styles.wmsOfflineBannerText}>
            {workOrdersOnScreen ? WMS_OFFLINE_KEPT_MESSAGE : WMS_OFFLINE_MESSAGE}
          </Text>
        </View>
      ) : workOrderListsFailed ? (
        <View style={styles.wmsOfflineBanner} accessibilityRole="alert">
          <MaterialCommunityIcons name="sync-alert" size={16} color="#991b1b" />
          <Text style={styles.wmsOfflineBannerText}>
            {WMS_NOT_UP_TO_DATE_MESSAGE}
          </Text>
        </View>
      ) : null}

      {!selectedBucket && !selectedBucketCategory ? (
        <BucketTypeLanding
          individualReady={individualBucketReady}
          individualLoading={!individualBucketReady && !error}
          individualError={error}
          individualCount={individualItems.length}
          targetedReady={targetedBatchBucketReady}
          targetedLoading={
            !targetedBatchBucketReady && !targetedBatchError
          }
          targetedError={targetedBatchError}
          targetedCount={targetedBatchBuckets.length}
          bgoReady={bgoBucketReady}
          bgoLoading={!bgoBucketReady && !bgoError}
          bgoError={bgoError}
          bgoCount={bgoBuckets.length}
          onOpen={openBucketCategory}
        />
      ) : !selectedBucket && selectedBucketCategory === "TBB" ? (
        <TargetedBatchBucketLanding
          isLoading={!targetedBatchBucketReady && !targetedBatchError}
          error={targetedBatchError}
          buckets={targetedBatchBuckets}
          deciding={actionBusy}
          processingTargetedBatchAction={processingTargetedBatchAction}
          openingTargetedBatchId={openingTargetedBatchId}
          fieldWorkorderActor={fieldWorkorderActor}
          offline={offline}
          onBack={backToBucketCategories}
          onOpenBucket={openBucket}
          onAcceptTargetedBatch={handleAcceptTargetedBatch}
          onRejectTargetedBatch={setRejectItem}
        />
      ) : !selectedBucket && selectedBucketCategory === "BGOB" ? (
        <BgoBucketLanding
          isLoading={!bgoBucketReady && !bgoError}
          error={bgoError}
          buckets={bgoBuckets}
          deciding={actionBusy}
          processingBgoBucketAction={processingBgoBucketAction}
          managerActor={managerActor}
          fieldWorkorderActor={fieldWorkorderActor}
          offline={offline}
          onBack={backToBucketCategories}
          onOpenBucket={openBucket}
          onAcceptBgoBucket={handleAcceptBgoBucket}
          onRejectBgoBucket={setRejectItem}
          onReverseBgoBucket={handleReverseBgoBucket}
        />
      ) : showIndividualGroups ? (
        <GroupLanding
          isLoading={!individualBucketReady && !error}
          error={error}
          groups={groups}
          offline={offline}
          onOpenGroup={openGroup}
          onBack={backToBuckets}
        />
      ) : showBmdErfWorklist ? (
        <MdBgoErfWorklist
          bucket={selectedBucket}
          onBack={backToBuckets}
          onOpenErf={handleOpenBmdErf}
        />
      ) : showTargetedBatchRows ? (
        <TargetedBatchRowsWorklist
          bucket={selectedBucket}
          rows={visibleTargetedBatchRows}
          allRows={targetedBatchRows}
          totalRowCount={targetedBatchRows.length}
          summary={targetedBatchRowsData?.summary}
          isLoading={targetedBatchRowsLoading}
          error={targetedBatchRowsError}
          searchText={targetedBatchSearchText}
          onSearchTextChange={setTargetedBatchSearchText}
          statusFilter={targetedBatchStatusFilter}
          onStatusFilterPress={handleTargetedBatchStatusFilterPress}
          offline={offline}
          onOpenMap={() => {
            // TB-R051: the map does not open while a batch action is preparing.
            if (pendingTargetedBatchAction) return;
            Keyboard.dismiss();
            setTargetedBatchMapOpen(true);
          }}
          onBack={backToBuckets}
          onAction={handleTargetedBatchRowAction}
          openingAction={pendingTargetedBatchAction}
          hasMore={false}
        />
      ) : showTrnDetail ? (
        <GroupDetail
          title={detailTitle}
          backLabel={detailBackLabel}
          stateFilter={stateFilter}
          setStateFilter={setStateFilter}
          allGroupItems={allVisibleBucketItems}
          items={visibleItems}
          deciding={actionBusy}
          isBgoBucketView={selectedBucket?.bucketType === "BGOB"}
          isPreparingBgoDetail={isPreparingBgoDetail}
          detailError={selectedBucket?.bucketType === "BGOB" ? bgoDetailError : null}
          offline={offline}
          onBack={
            selectedBucket?.bucketType === "BGOB"
              ? backToBuckets
              : backToIndividualGroups
          }
          onAccept={handleAccept}
          onReject={setRejectItem}
          onExecute={handleExecute}
        />
      ) : null}

      <RejectModal
        visible={Boolean(rejectItem)}
        item={rejectItem}
        busy={actionBusy}
        onClose={() => setRejectItem(null)}
        onSubmit={handleReject}
      />

      <TargetedBatchMapModal
        visible={targetedBatchMapVisible}
        bucket={selectedBucket}
        rows={targetedBatchRows}
        erfCentroidById={targetedBatchErfCentroidById}
        offline={offline}
        loading={targetedBatchRowsLoading}
        error={targetedBatchRowsError}
        onClose={() => setTargetedBatchMapOpen(false)}
        renderRowCard={renderTargetedBatchMapRowCard}
      />
    </SafeAreaView>
  );
}

function AccessDeniedWorkorders({ actorRole, onBack }) {
  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: "Workorder Management System",
          headerTitleStyle: { fontSize: 15, fontWeight: "900" },
        }}
      />

      <View style={styles.stateWrap}>
        <MaterialCommunityIcons
          name="lock-alert-outline"
          size={42}
          color="#dc2626"
        />

        <Text style={styles.stateTitle}>My Workorders is field-only</Text>
        <Text style={styles.stateText}>
          This screen is only available to FWR and SPV(SUBC) users. Current role: {actorRole || "NAv"}.
        </Text>

        <Pressable style={styles.accessBackButton} onPress={onBack}>
          <Text style={styles.accessBackButtonText}>GO BACK</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function BucketTypeLanding({
  individualReady,
  individualLoading,
  individualError,
  individualCount,
  targetedReady,
  targetedLoading,
  targetedError,
  targetedCount,
  bgoReady,
  bgoLoading,
  bgoError,
  bgoCount,
  onOpen,
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.sectionEyebrow}>Assigned Work Queue</Text>
      <Text style={styles.sectionTitle}>My Work Buckets</Text>

      <View style={styles.bucketTypeList}>
        <BucketTypeCard
          title="Individual Work"
          subtitle="Individually issued lifecycle TRNs"
          icon="account-hard-hat-outline"
          count={individualCount}
          countLabel="TRNs"
          ready={individualReady}
          loading={individualLoading}
          error={individualError}
          onPress={() => onOpen("INDVG")}
        />

        <BucketTypeCard
          title="Targeted Batches"
          subtitle="Allocated sales-targeted field work"
          icon="target-account"
          count={targetedCount}
          countLabel="Batches"
          ready={targetedReady}
          loading={targetedLoading}
          error={targetedError}
          onPress={() => onOpen("TBB")}
        />

        <BucketTypeCard
          title="BGO Buckets"
          subtitle="Bulk geofence originated work"
          icon="map-marker-radius-outline"
          count={bgoCount}
          countLabel="Buckets"
          ready={bgoReady}
          loading={bgoLoading}
          error={bgoError}
          onPress={() => onOpen("BGOB")}
        />
      </View>
    </ScrollView>
  );
}

function BucketTypeCard({
  title,
  subtitle,
  icon,
  count,
  countLabel,
  ready,
  loading,
  error,
  onPress,
}) {
  const disabled = !ready || Boolean(error);
  const statusText = error ? "FAILED" : ready ? "READY" : "LOADING";

  return (
    <Pressable
      style={[
        styles.bucketTypeCard,
        disabled && styles.bucketTypeCardDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.bucketTypeTopRow}>
        <View style={styles.bucketTypeIcon}>
          <MaterialCommunityIcons name={icon} size={26} color="#2563eb" />
        </View>

        <View
          style={[
            styles.bucketTypeStatusBadge,
            ready && styles.bucketTypeStatusReady,
            error && styles.bucketTypeStatusError,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : null}
          <Text
            style={[
              styles.bucketTypeStatusText,
              ready && styles.bucketTypeStatusTextReady,
              error && styles.bucketTypeStatusTextError,
            ]}
          >
            {statusText}
          </Text>
        </View>
      </View>

      <Text style={styles.bucketTypeTitle}>{title}</Text>
      <Text style={styles.bucketTypeSubtitle}>{subtitle}</Text>

      {error ? (
        <Text style={styles.bucketTypeErrorText} numberOfLines={2}>
          {error?.message || "This work stream could not be loaded."}
        </Text>
      ) : null}

      <View style={styles.bucketTypeFooter}>
        <View style={styles.bucketTypeCountBox}>
          <Text style={styles.bucketTypeCountValue}>{ready ? count : "—"}</Text>
          <Text style={styles.bucketTypeCountLabel}>{countLabel}</Text>
        </View>

        <View
          style={[
            styles.bucketTypeOpenBox,
            !ready && styles.bucketTypeOpenBoxWaiting,
            error && styles.bucketTypeOpenBoxError,
          ]}
        >
          {ready ? (
            <>
              <Text style={styles.bucketTypeOpenText}>OPEN</Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color="#ffffff"
              />
            </>
          ) : error ? (
            <Text style={styles.bucketTypeUnavailableText}>UNAVAILABLE</Text>
          ) : (
            <>
              <ActivityIndicator size="small" color="#64748b" />
              <Text style={styles.bucketTypeLoadingText}>PREPARING</Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function TargetedBatchBucketLanding({
  isLoading,
  error,
  buckets = [],
  deciding,
  processingTargetedBatchAction,
  openingTargetedBatchId,
  fieldWorkorderActor,
  offline = false,
  onBack,
  onOpenBucket,
  onAcceptTargetedBatch,
  onRejectTargetedBatch,
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Pressable style={styles.backPill} onPress={onBack}>
        <MaterialCommunityIcons
          name="chevron-left"
          size={20}
          color="#0f172a"
        />
        <Text style={styles.backPillText}>Work Buckets</Text>
      </Pressable>

      <Text style={[styles.sectionEyebrow, { marginTop: 10 }]}>Targeted Work</Text>
      <Text style={styles.sectionTitle}>Targeted Batches</Text>

      <View style={styles.bucketList}>
        {isLoading ? (
          <InlineStatusCard
            icon="target-account"
            title="Loading Targeted Batches..."
            text="Preparing allocated sales row worklists..."
            showSpinner
          />
        ) : null}

        {error ? (
          <InlineStatusCard
            icon="alert-circle-outline"
            title="Targeted Batch stream failed"
            text={error?.message || "Could not load Targeted Batches."}
            tone="error"
          />
        ) : null}

        {!isLoading && !error && buckets.length === 0 ? (
          offline ? (
            // TB-R051: with no connection, never say there is no work.
            <InlineStatusCard icon="wifi-off" title={WMS_OFFLINE_MESSAGE} />
          ) : (
            <InlineStatusCard
              icon="target-variant"
              title="No Targeted Batches available"
              text="There are no Targeted Batches allocated to your team or service provider right now."
            />
          )
        ) : null}

        {buckets.map((bucket) => (
          <TargetedBatchCard
            key={bucket.id}
            bucket={bucket}
            deciding={deciding}
            processingTargetedBatchAction={processingTargetedBatchAction}
            openingTargetedBatchId={openingTargetedBatchId}
            fieldWorkorderActor={fieldWorkorderActor}
            onOpenBucket={onOpenBucket}
            onAcceptTargetedBatch={onAcceptTargetedBatch}
            onRejectTargetedBatch={onRejectTargetedBatch}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function BgoBucketLanding({
  isLoading,
  error,
  buckets = [],
  deciding,
  processingBgoBucketAction,
  managerActor,
  fieldWorkorderActor,
  offline = false,
  onBack,
  onOpenBucket,
  onAcceptBgoBucket,
  onRejectBgoBucket,
  onReverseBgoBucket,
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Pressable style={styles.backPill} onPress={onBack}>
        <MaterialCommunityIcons
          name="chevron-left"
          size={20}
          color="#0f172a"
        />
        <Text style={styles.backPillText}>Work Buckets</Text>
      </Pressable>

      <Text style={[styles.sectionEyebrow, { marginTop: 10 }]}>Bulk Work</Text>
      <Text style={styles.sectionTitle}>BGO Buckets</Text>

      <View style={styles.bucketList}>
        {isLoading ? (
          <InlineStatusCard
            icon="map-marker-radius-outline"
            title="Loading BGO buckets..."
            text="Preparing BGO execution summary..."
            showSpinner
          />
        ) : null}

        {error ? (
          <InlineStatusCard
            icon="alert-circle-outline"
            title="BGO bucket stream failed"
            text={error?.message || "Could not load BGO buckets."}
            tone="error"
          />
        ) : null}

        {!isLoading && !error && buckets.length === 0 ? (
          offline ? (
            // TB-R051: with no connection, never say there is no work.
            <InlineStatusCard icon="wifi-off" title={WMS_OFFLINE_MESSAGE} />
          ) : (
            <InlineStatusCard
              icon="playlist-remove"
              title="No BGO buckets available"
              text="There are no BGO buckets assigned to you right now. New BGO batches will appear here after they are created for your user, team, or service provider."
            />
          )
        ) : null}

        {buckets.map((bucket) => (
          <BucketCard
            key={bucket.id}
            bucket={bucket}
            deciding={deciding}
            processingBgoBucketAction={processingBgoBucketAction}
            managerActor={managerActor}
            fieldWorkorderActor={fieldWorkorderActor}
            offline={offline}
            onOpenBucket={onOpenBucket}
            onAcceptBgoBucket={onAcceptBgoBucket}
            onRejectBgoBucket={onRejectBgoBucket}
            onReverseBgoBucket={onReverseBgoBucket}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function TargetedBatchCard({
  bucket,
  deciding,
  processingTargetedBatchAction,
  openingTargetedBatchId,
  fieldWorkorderActor,
  onOpenBucket,
  onAcceptTargetedBatch,
  onRejectTargetedBatch,
}) {
  const counts = bucket?.counts || {};
  const statusText = getTargetedBatchStatusText(bucket);
  const canAccept = bucket?.permissions?.canAccept === true;
  const canReject = bucket?.permissions?.canReject === true;
  const canView = bucket?.permissions?.canViewRows === true;
  const processingThisBatch =
    processingTargetedBatchAction?.bucketId === bucket?.id;
  const processingAction = normalizeUpper(
    processingTargetedBatchAction?.action,
  );
  const openingThisBatch = openingTargetedBatchId === bucket?.id;
  const anyTargetedBatchOpening = Boolean(openingTargetedBatchId);
  const disabled =
    deciding ||
    processingThisBatch ||
    anyTargetedBatchOpening ||
    !fieldWorkorderActor;

  return (
    <View style={styles.bucketCard}>
      <View style={styles.groupTopRow}>
        <View style={styles.groupIcon}>
          <MaterialCommunityIcons
            name="target-account"
            size={23}
            color="#2563eb"
          />
        </View>

        <View style={styles.bucketStatusBadge}>
          <Text style={styles.bucketStatusText}>{statusText}</Text>
        </View>
      </View>

      <Text style={styles.groupTitle}>
        Targeted Batch • {bucket?.id || "NAv"}
      </Text>
      <Text style={styles.groupSub}>
        {bucket?.subtitle || "Sales targeted field work"}
      </Text>

      <View style={styles.bucketMetaGrid}>
        <InfoLine
          icon="format-list-numbered"
          label="Total Rows"
          value={counts?.total ?? bucket?.totalRows ?? 0}
        />

        <InfoLine
          icon="account-hard-hat-outline"
          label="Target"
          value={bucket?.targetText || "NAv"}
        />

        <InfoLine
          icon="map-marker-outline"
          label="Municipality"
          value={
            bucket?.scope?.lmName ||
            bucket?.scope?.lmPcode ||
            "NAv"
          }
        />

        <InfoLine
          icon="calendar-range"
          label="Sales Period"
          value={getTargetedBatchPeriodText(bucket)}
        />

        <InfoLine
          icon="text-box-outline"
          label="Selection Reason"
          value={bucket?.selection?.reason || "NAv"}
        />

        <InfoLine
          icon="clock-outline"
          label="Age"
          value={formatAge(bucket?.ageSeconds)}
        />
      </View>

      {/* TB-R051: these counts are the batch record's own counts, not the status on the phone (a Sales
          VISIBLE meter is Completed only in the batch rows header), so they carry their own caption.
          The card does not load the batch rows. */}
      <Text style={styles.tbCountsCaption}>Batch record</Text>
      <View style={styles.groupCounts}>
        <MiniCount
          label="Not Started"
          value={counts?.notStarted ?? 0}
        />
        <MiniCount
          label="In Progress"
          value={counts?.inProgress ?? 0}
        />
        <MiniCount
          label="Completed"
          value={counts?.completed ?? 0}
        />
        <MiniCount
          label="Allocated"
          value={counts?.allocated ?? 0}
        />
      </View>

      {processingThisBatch ? (
        <View style={styles.bgoProcessingBox}>
          <ActivityIndicator size="small" color="#2563eb" />
          <View style={styles.bgoProcessingTextWrap}>
            <Text style={styles.bgoProcessingTitle}>
              {processingAction === "REJECT"
                ? "Rejecting Targeted Batch..."
                : "Accepting Targeted Batch..."}
            </Text>
            <Text style={styles.bgoProcessingText}>
              Recording the whole-batch decision before field execution.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {canAccept ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.acceptBtn,
              disabled && styles.actionDisabled,
            ]}
            onPress={() => onAcceptTargetedBatch(bucket)}
            disabled={disabled}
          >
            <Text style={styles.acceptBtnText}>
              {processingThisBatch && processingAction === "ACCEPT"
                ? "ACCEPTING..."
                : "ACCEPT"}
            </Text>
          </Pressable>
        ) : null}

        {canReject ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.rejectBtn,
              disabled && styles.actionDisabled,
            ]}
            onPress={() => onRejectTargetedBatch(bucket)}
            disabled={disabled}
          >
            <Text style={styles.rejectBtnText}>
              {processingThisBatch && processingAction === "REJECT"
                ? "REJECTING..."
                : "REJECT"}
            </Text>
          </Pressable>
        ) : null}

        {canView ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.executeBtn,
              disabled && styles.actionDisabled,
            ]}
            onPress={() => onOpenBucket(bucket)}
            disabled={disabled}
          >
            {openingThisBatch ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : null}
            <Text style={styles.executeBtnText}>
              {openingThisBatch ? "OPENING..." : "VIEW ROWS"}
            </Text>
          </Pressable>
        ) : null}

        {!canAccept && !canReject && !canView ? (
          <View style={styles.noActionBox}>
            <MaterialCommunityIcons
              name="lock-check-outline"
              size={15}
              color="#64748b"
            />
            <Text style={styles.noActionText}>
              {statusText === "Rejected"
                ? "Targeted Batch rejected before execution."
                : "Targeted Batch not open for execution."}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function InlineStatusCard({
  icon,
  title,
  text,
  tone = "info",
  showSpinner = false,
}) {
  const isError = tone === "error";

  return (
    <View style={[styles.inlineStatusCard, isError && styles.inlineStatusError]}>
      {showSpinner ? <ActivityIndicator size="small" color="#2563eb" /> : null}
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={isError ? "#dc2626" : "#2563eb"}
      />
      <View style={styles.inlineStatusMain}>
        <Text style={[styles.inlineStatusTitle, isError && styles.inlineStatusTitleError]}>
          {title}
        </Text>
        {text ? <Text style={styles.inlineStatusText}>{text}</Text> : null}
      </View>
    </View>
  );
}

function BucketCard({
  bucket,
  deciding,
  processingBgoBucketAction,
  managerActor,
  fieldWorkorderActor,
  offline = false,
  onOpenBucket,
  onAcceptBgoBucket,
  onRejectBgoBucket,
  onReverseBgoBucket,
}) {
  const isIndividual = bucket?.bucketType === "INDVG";
  const isBgo = bucket?.bucketType === "BGOB";
  const isBmd = isBmdBgoBucket(bucket);
  const counts = bucket?.counts || {};
  const statusText = isIndividual ? "Open" : getBgoBucketStatusText(bucket);
  const canView = isBmd
    ? bucket?.permissions?.canViewErfs === true
    : bucket?.permissions?.canViewTrns === true;
  const canAccept = isBgo && bucket?.permissions?.canAccept === true;
  const canReject = isBgo && bucket?.permissions?.canReject === true;
  const processingThisBgoBucket =
    isBgo && processingBgoBucketAction?.bucketId === bucket?.id;
  const processingAction = normalizeUpper(processingBgoBucketAction?.action);
  const processingTitle =
    processingAction === "REJECT"
      ? "Rejecting BGO bucket..."
      : processingAction === "REVERSE"
        ? "Reversing BGO acceptance..."
        : "Accepting BGO bucket...";
  const processingText =
    processingAction === "REJECT"
      ? "Please wait while this BGOB rejection is processed."
      : processingAction === "REVERSE"
        ? "Please wait while this BGOB acceptance is reversed."
        : "Please wait while this BGOB is accepted and released for execution.";
  const acceptRejectDisabled = deciding || processingThisBgoBucket || !fieldWorkorderActor;
  const canReverse =
    isBgo &&
    managerActor &&
    bucket?.permissions?.canReverseAcceptance === true &&
    Number(counts?.inProgress || 0) === 0 &&
    Number(counts?.completed || 0) === 0;

  return (
    <View style={styles.bucketCard}>
      <View style={styles.groupTopRow}>
        <View style={styles.groupIcon}>
          <MaterialCommunityIcons
            name={isIndividual ? "account-hard-hat-outline" : "map-marker-radius-outline"}
            size={23}
            color="#2563eb"
          />
        </View>

        <View style={styles.bucketStatusBadge}>
          <Text style={styles.bucketStatusText}>{statusText}</Text>
        </View>
      </View>

      <Text style={styles.groupTitle}>{bucket.title}</Text>
      <Text style={styles.groupSub}>{bucket.subtitle || bucket.geofenceName}</Text>

      <View style={styles.bucketMetaGrid}>
        <InfoLine
          icon="counter"
          label={isBmd ? "Total ERFs" : "Total TRNs"}
          value={isBmd ? counts.erfs || counts.total || 0 : bucket.totalTrns || counts.total || 0}
        />

        <InfoLine
          icon="account-hard-hat-outline"
          label="Target"
          value={bucket.targetText || "NAv"}
        />

        {isBgo ? (
          <>
            <InfoLine
              icon="map-marker-outline"
              label="Geofence"
              value={bucket.geofenceName || "NAv"}
            />

            <InfoLine
              icon="clipboard-text-outline"
              label="TRN Type"
              value={bucket.trnTypeLabel || bucket.trnType || "NAv"}
            />

            <InfoLine
              icon="account-tie-outline"
              label="Issued By"
              value={bucket.issuedBy?.name || "NAv"}
            />

            <InfoLine
              icon="clock-outline"
              label="Age"
              value={formatAge(bucket.ageSeconds)}
            />
          </>
        ) : null}
      </View>

      <View style={styles.groupCounts}>
        {isBgo ? (
          isBmd ? (
            <>
              <MiniCount label="ERFs" value={counts.erfs ?? counts.total ?? 0} />
              <MiniCount label="Premises" value={counts.premises ?? 0} />
              <MiniCount label="Meters" value={counts.meters ?? 0} />
            </>
          ) : (
            <>
              <MiniCount
                label="Not Executed"
                value={counts.notExecuted ?? counts.waiting ?? 0}
              />
              <MiniCount
                label="Executed"
                value={counts.executed ?? counts.completed ?? 0}
              />
              <MiniCount label="Success" value={counts.success ?? 0} />
              <MiniCount
                label="Unsuccessful"
                value={counts.unsuccessful ?? 0}
              />
            </>
          )
        ) : (
          <>
            <MiniCount label="Issued" value={counts.issued || 0} />
            <MiniCount label="Accepted" value={counts.accepted || 0} />
            <MiniCount label="Progress" value={counts.inProgress || 0} />
            <MiniCount label="Completed" value={counts.completed || 0} />
          </>
        )}
      </View>

      {processingThisBgoBucket ? (
        <View style={styles.bgoProcessingBox}>
          <ActivityIndicator size="small" color="#2563eb" />
          <View style={styles.bgoProcessingTextWrap}>
            <Text style={styles.bgoProcessingTitle}>{processingTitle}</Text>
            <Text style={styles.bgoProcessingText}>{processingText}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {canAccept ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.acceptBtn,
              acceptRejectDisabled && styles.actionDisabled,
            ]}
            onPress={() => onAcceptBgoBucket(bucket)}
            disabled={acceptRejectDisabled}
          >
            {processingThisBgoBucket && processingAction === "ACCEPT" ? (
              <ActivityIndicator size="small" color="#14532d" />
            ) : null}
            <Text style={styles.acceptBtnText}>
              {processingThisBgoBucket && processingAction === "ACCEPT"
                ? "ACCEPTING..."
                : "ACCEPT"}
            </Text>
          </Pressable>
        ) : null}

        {canReject ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.rejectBtn,
              acceptRejectDisabled && styles.actionDisabled,
            ]}
            onPress={() => onRejectBgoBucket(bucket)}
            disabled={acceptRejectDisabled}
          >
            {processingThisBgoBucket && processingAction === "REJECT" ? (
              <ActivityIndicator size="small" color="#991b1b" />
            ) : null}
            <Text style={styles.rejectBtnText}>
              {processingThisBgoBucket && processingAction === "REJECT"
                ? "REJECTING..."
                : "REJECT"}
            </Text>
          </Pressable>
        ) : null}

        {canView ? (
          <Pressable
            style={[styles.actionBtn, styles.executeBtn]}
            onPress={() => onOpenBucket(bucket)}
            disabled={deciding}
          >
            <Text style={styles.executeBtnText}>{isBmd ? "VIEW ERFS" : "VIEW TRNS"}</Text>
          </Pressable>
        ) : null}

        {canReverse ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.rejectWorkBtn,
              deciding && styles.actionDisabled,
            ]}
            onPress={() => onReverseBgoBucket(bucket)}
            disabled={deciding}
          >
            <Text style={styles.rejectWorkBtnText}>REVERSE</Text>
          </Pressable>
        ) : null}

        {!canAccept && !canReject && !canView && !canReverse ? (
          <View style={styles.noActionBox}>
            <MaterialCommunityIcons
              name="lock-check-outline"
              size={15}
              color="#64748b"
            />
            <Text style={styles.noActionText}>
              {isBgo
                ? isBmd && statusText === "Accepted"
                  ? "MD-BGO accepted. ERF worklist is ready."
                  : "Bucket not open for execution."
                : offline
                  ? // TB-R051: with no connection, never say there is no work.
                    WMS_OFFLINE_MESSAGE
                  : "No TRNs in this bucket yet."}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function getWardShortLabel(scope = {}) {
  const raw = readFirstString(scope?.wardName, scope?.wardPcode, "NAv");
  if (!raw || raw === "NAv") return "Ward NAv";

  const clean = String(raw).trim();
  const wardMatch = clean.match(/ward\s*0*(\d+)/i);
  if (wardMatch?.[1]) return `Ward ${Number(wardMatch[1])}`;

  const trailingDigits = clean.match(/(\d{1,3})$/);
  if (trailingDigits?.[1]) return `Ward ${Number(trailingDigits[1])}`;

  return clean;
}

function MdBgoErfWorklist({ bucket, onBack, onOpenErf }) {
  const liveStats = bucket?.mdBgoLiveStats || {};
  const counts = bucket?.counts || {};
  const scope = getBmdBucketScope(bucket);
  const wardLabel = getWardShortLabel(scope);

  const erfItems = useMemo(() => {
    return getBmdErfRefsFromBucket(bucket)
      .reduce((acc, erf) => {
        const erfStats = liveStats?.byErfId?.[erf?.id] || createEmptyMdBgoErfStats();
        acc.push({
          ...erf,
          liveStats: erfStats,
        });
        return acc;
      }, [])
      .sort(sortMdBgoErfWorkItems);
  }, [bucket, liveStats]);

  const renderErfItem = ({ item }) => (
    <MdBgoErfCard
      erf={item}
      bucket={bucket}
      onOpenErf={onOpenErf}
    />
  );

  return (
    <View style={styles.detailWrap}>
      <View style={styles.mdBgoSummaryCard}>
        <Pressable style={styles.mdBgoBackPill} onPress={onBack}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={18}
            color="#0f172a"
          />
          <Text style={styles.backPillText}>Buckets</Text>
        </Pressable>

        <Text style={styles.mdBgoWardText} numberOfLines={1}>
          {wardLabel}
        </Text>

        <View style={styles.mdBgoCompactStat}>
          <Text style={styles.mdBgoCompactStatLabel}>ERFs</Text>
          <Text style={styles.mdBgoCompactStatValue}>{counts.erfs ?? erfItems.length}</Text>
        </View>

        <View style={styles.mdBgoCompactStat}>
          <Text style={styles.mdBgoCompactStatLabel}>Premises</Text>
          <Text style={styles.mdBgoCompactStatValue}>{counts.premises ?? 0}</Text>
        </View>

        <View style={styles.mdBgoCompactStat}>
          <Text style={styles.mdBgoCompactStatLabel}>Meters</Text>
          <Text style={styles.mdBgoCompactStatValue}>{counts.meters ?? 0}</Text>
        </View>
      </View>

      <FlashList
        data={erfItems}
        keyExtractor={(item, index) => item?.id || String(index)}
        renderItem={renderErfItem}
        estimatedItemSize={104}
        style={styles.scroll}
        contentContainerStyle={styles.flashListContent}
        ListEmptyComponent={
          <View style={styles.emptyListCard}>
            <MaterialCommunityIcons
              name="vector-square-remove"
              size={35}
              color="#94a3b8"
            />
            <Text style={styles.stateTitle}>No ERFs in this worklist</Text>
            <Text style={styles.stateText}>
              This accepted MD-BGO batch does not have ERF references stamped yet.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function MdBgoErfCard({ erf, bucket, onOpenErf }) {
  const liveStats = erf?.liveStats || createEmptyMdBgoErfStats();

  return (
    <View style={styles.mdBgoErfCard}>
      <View style={styles.mdBgoErfHeader}>
        <View style={styles.mdBgoErfIcon}>
          <MaterialCommunityIcons
            name="vector-square"
            size={21}
            color="#2563eb"
          />
        </View>

        <View style={styles.mdBgoErfMain}>
          <Text style={styles.mdBgoErfTitle}>ERF {erf?.erfNo || "NAv"}</Text>
          <Text style={styles.mdBgoErfSub} numberOfLines={1}>
            {erf?.erfType || "NAv"}
          </Text>
        </View>

        <View style={styles.mdBgoErfStatusBadge}>
          <Text style={styles.mdBgoErfStatusText}>NOT STARTED</Text>
        </View>
      </View>

      <View style={styles.mdBgoErfFooterRow}>
        <View style={styles.mdBgoErfMiniStat}>
          <Text style={styles.mdBgoErfMiniStatLabel}>Premises</Text>
          <Text style={styles.mdBgoErfMiniStatValue}>{liveStats?.premiseCount ?? 0}</Text>
        </View>

        <View style={styles.mdBgoErfMiniStat}>
          <Text style={styles.mdBgoErfMiniStatLabel}>Meters</Text>
          <Text style={styles.mdBgoErfMiniStatValue}>{liveStats?.meterCount ?? 0}</Text>
        </View>

        <Pressable
          style={styles.mdBgoOpenErfBtn}
          onPress={() => onOpenErf({ bucket, erf })}
        >
          <Text style={styles.executeBtnText}>OPEN ERF</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TargetedBatchRowsWorklist({
  bucket,
  rows = [],
  allRows,
  totalRowCount,
  summary = {},
  isLoading,
  error,
  searchText = "",
  onSearchTextChange,
  statusFilter = TARGETED_BATCH_STATUS_FILTERS.TOTAL,
  onStatusFilterPress,
  offline = false,
  onOpenMap,
  onBack,
  onAction,
  openingAction,
  hasMore,
  loadingMore,
  onLoadMore,
  onReload,
}) {
  const allRowCount = Number.isFinite(Number(totalRowCount))
    ? Number(totalRowCount)
    : rows.length;
  const searchQuery = String(searchText || "").trim();
  const searchActive = searchQuery.length > 0;
  // TB-R051 (1.3.42): a status other than Total narrows the list.
  const statusButton =
    TARGETED_BATCH_STATUS_FILTER_BUTTONS.find((button) => button.key === statusFilter) ||
    TARGETED_BATCH_STATUS_FILTER_BUTTONS[0];
  const statusFilterActive = statusButton.key !== TARGETED_BATCH_STATUS_FILTERS.TOTAL;
  // TB-R051: no false "no position" map; the map opens only once the batch rows are on the phone,
  // and not while a batch action is preparing (the action's screen would open behind it).
  const mapUnavailable =
    Boolean(isLoading) ||
    Boolean(error) ||
    allRowCount === 0 ||
    Boolean(openingAction);

  // TB-R051: no silent waits; an action started from the map, or from a row now scrolled away,
  // shows what is opening under the search box. The row is looked up in all rows, not only the matches.
  const openingRowId = openingAction?.rowId || null;
  const openingRow = openingRowId
    ? (Array.isArray(allRows) ? allRows : rows).find(
        (item) => item?.id === openingRowId,
      ) || null
    : null;
  const openingLabel = openingAction
    ? TARGETED_BATCH_INTENT_LABELS[openingAction?.intent] || "the batch action"
    : null;
  const openingMeterNo = readFirstString(openingRow?.meterNo);
  const openingText = openingAction
    ? openingMeterNo
      ? `Opening ${openingLabel} for meter ${openingMeterNo}…`
      : `Opening ${openingLabel}…`
    : null;

  const renderRow = ({ item }) => (
    <TargetedBatchRowCard
      row={item}
      bucket={bucket}
      onAction={onAction}
      openingIntent={openingAction?.rowId === item?.id ? openingAction?.intent : null}
    />
  );

  return (
    <View style={styles.detailWrap}>
      <View style={styles.mdBgoSummaryCard}>
        <Pressable style={styles.mdBgoBackPill} onPress={onBack}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={18}
            color="#0f172a"
          />
          <Text style={styles.backPillText}>Buckets</Text>
        </Pressable>

        <Text style={styles.mdBgoWardText} numberOfLines={1}>
          {bucket?.id || "Targeted Batch"}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.tbMapButton,
            mapUnavailable && styles.tbMapButtonDisabled,
            pressed && !mapUnavailable && styles.tbMapButtonPressed,
          ]}
          onPress={onOpenMap}
          disabled={mapUnavailable || typeof onOpenMap !== "function"}
          accessibilityRole="button"
          accessibilityLabel="Map of this batch"
          accessibilityState={{ disabled: mapUnavailable }}
          hitSlop={6}
        >
          <MaterialCommunityIcons
            name="map-marker-radius"
            size={18}
            color={mapUnavailable ? "#94a3b8" : "#2563eb"}
          />
        </Pressable>

      </View>

      {/* TB-R051 (1.3.42): four filters for the whole batch's counts (Sales VISIBLE counts as Completed). Total
          shows every meter; a status shows only its meters; tapping Total or the selected status again shows all. */}
      <View style={styles.tbStatusFilterRow}>
        {TARGETED_BATCH_STATUS_FILTER_BUTTONS.map((button) => {
          const selected = button.key === statusButton.key;
          const count =
            button.key === TARGETED_BATCH_STATUS_FILTERS.TOTAL
              ? summary?.total ?? allRowCount
              : summary?.[button.summaryKey] ?? 0;

          return (
            <Pressable
              key={button.key}
              style={({ pressed }) => [
                styles.tbStatusFilter,
                selected && { borderColor: button.color, backgroundColor: `${button.color}14` },
                pressed && styles.tbStatusFilterPressed,
              ]}
              onPress={() => onStatusFilterPress?.(button.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${button.label}: ${count}`}
              hitSlop={4}
            >
              {/* On a narrow phone "Not Started" wraps to two lines rather than being cut. */}
              <Text
                style={[styles.tbStatusFilterLabel, selected && { color: button.color }]}
                numberOfLines={2}
              >
                {button.label}
              </Text>
              <Text style={[styles.tbStatusFilterValue, { color: button.color }]}>
                {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* TB-R051: search by meter number, ERF number or street address. */}
      <View style={styles.tbSearchWrap}>
        <View style={styles.tbSearchBox}>
          <MaterialCommunityIcons name="magnify" size={18} color="#64748b" />
          <TextInput
            style={styles.tbSearchInput}
            value={searchText}
            onChangeText={onSearchTextChange}
            placeholder="Search meter no., ERF or street"
            placeholderTextColor="#94a3b8"
            accessibilityLabel="Search meter no., ERF or street"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchText ? (
            <Pressable
              style={styles.tbSearchClear}
              onPress={() => onSearchTextChange?.("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color="#64748b"
              />
            </Pressable>
          ) : null}
        </View>

        {searchActive || statusFilterActive ? (
          <Text style={styles.tbSearchCount}>
            Showing {rows.length} of {allRowCount}
            {statusFilterActive ? ` · ${statusButton.label}` : ""}
          </Text>
        ) : null}

        {openingText ? (
          <View
            style={styles.tbOpeningBanner}
            accessibilityRole="progressbar"
            accessibilityLiveRegion="polite"
            accessibilityLabel={openingText}
          >
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.tbOpeningBannerText} numberOfLines={2}>
              {openingText}
            </Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.detailPreparingCard}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.detailPreparingTitle}>
            Loading Targeted Batch rows...
          </Text>
          <Text style={styles.detailPreparingText}>
            Preparing the accepted ERF worklist for premise discovery.
          </Text>
        </View>
      ) : error ? (
        <View style={styles.detailPreparingCard}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={35}
            color="#dc2626"
          />
          <Text style={styles.detailPreparingTitle}>
            Targeted Batch rows failed
          </Text>
          <Text style={styles.detailPreparingText}>
            {error?.message || "Could not load the Targeted Batch rows."}
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          extraData={openingAction}
          keyExtractor={(item, index) => item?.id || String(index)}
          renderItem={renderRow}
          estimatedItemSize={122}
          style={styles.scroll}
          contentContainerStyle={styles.flashListContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            statusFilterActive && allRowCount > 0 ? (
              // TB-R051 (1.3.42): a status with no meters says so, never a blank list.
              <View style={styles.emptyListCard}>
                <MaterialCommunityIcons
                  name={searchActive ? "magnify-close" : "filter-remove-outline"}
                  size={35}
                  color="#94a3b8"
                />
                <Text style={styles.stateTitle}>
                  {searchActive
                    ? `No ${statusButton.label} meter matches ${searchQuery}`
                    : `No ${statusButton.label} meters in this batch`}
                </Text>
              </View>
            ) : searchActive && allRowCount > 0 ? (
              <View style={styles.emptyListCard}>
                <MaterialCommunityIcons
                  name="magnify-close"
                  size={35}
                  color="#94a3b8"
                />
                <Text style={styles.stateTitle}>
                  No meter matches {searchQuery}
                </Text>
              </View>
            ) : offline ? (
              // TB-R051: with no connection, never say there is no work.
              <View style={styles.emptyListCard}>
                <MaterialCommunityIcons
                  name="wifi-off"
                  size={35}
                  color="#94a3b8"
                />
                <Text style={styles.stateTitle}>{WMS_OFFLINE_MESSAGE}</Text>
              </View>
            ) : (
              <View style={styles.emptyListCard}>
                <MaterialCommunityIcons
                  name="playlist-remove"
                  size={35}
                  color="#94a3b8"
                />
                <Text style={styles.stateTitle}>
                  No Targeted Batch rows
                </Text>
                <Text style={styles.stateText}>
                  This accepted Targeted Batch does not contain any rows.
                </Text>
              </View>
            )
          }
          ListFooterComponent={hasMore ? (
            <Pressable style={[styles.mdBgoOpenErfBtn, loadingMore && styles.actionDisabled]} disabled={loadingMore} onPress={onLoadMore}>
              {loadingMore ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.executeBtnText}>LOAD MORE</Text>}
            </Pressable>
          ) : null}
        />
      )}
    </View>
  );
}

function TargetedBatchRowCardBase({
  row,
  bucket,
  onAction,
  openingIntent = null,
}) {
  // TB-R051: the status the phone shows (Sales VISIBLE or a completed row is Completed).
  const displayStatus =
    normalizeUpper(row?.displayStatus || row?.executionStatus) || "NOT_STARTED";
  const statusBadgeStyle =
    displayStatus === "COMPLETED"
      ? styles.badgeGreen
      : displayStatus === "IN_PROGRESS"
        ? styles.badgeOrange
        : null;
  const statusBadgeTextStyle =
    displayStatus === "COMPLETED"
      ? styles.badgeGreenText
      : displayStatus === "IN_PROGRESS"
        ? styles.badgeOrangeText
        : null;
  const erfId = cleanId(row?.erfId || row?.refs?.erfId);
  const erfNo = readFirstString(
    row?.erfNo,
    row?.raw?.property?.erfNo,
  );
  const hasErf = Boolean(erfId && erfNo);
  const actions = getTargetedBatchRowActionState(row);

  return (
    <View style={styles.mdBgoErfCard}>
      <View style={styles.mdBgoErfHeader}>
        <View style={styles.mdBgoErfIcon}>
          <MaterialCommunityIcons
            name="target-account"
            size={21}
            color="#2563eb"
          />
        </View>

        <View style={styles.mdBgoErfMain}>
          <Text style={styles.mdBgoErfTitle}>
            Meter {row?.meterNo || "NAv"}
          </Text>
          <Text style={styles.mdBgoErfSub} numberOfLines={1}>
            Account {row?.accountNumber || "NAv"} •{" "}
            {row?.customerName || "NAv"}
          </Text>
          <Text style={styles.mdBgoErfSub} numberOfLines={1}>
            {row?.address || row?.town || "NAv"}
          </Text>
        </View>

        <View style={[styles.mdBgoErfStatusBadge, statusBadgeStyle]}>
          <Text style={[styles.mdBgoErfStatusText, statusBadgeTextStyle]}>
            {displayStatus.replace(/_/g, " ")}
          </Text>
        </View>
      </View>

      <View style={styles.mdBgoErfFooterRow}>
        <TargetedBatchActionTile label="PREMISE" value={actions.premise.value} helperText={actions.premise.helperText} icon="home-outline"
          disabled={actions.premise.disabled}
          opening={openingIntent === actions.premise.intent} onPress={() => onAction({ bucket, row, intent: actions.premise.intent })} />
        <TargetedBatchActionTile label="AST" value={actions.ast.value} helperText={actions.ast.helperText} icon="meter-electric-outline"
          tone={actions.invalidLinkage ? "issue" : "default"} disabled={actions.ast.disabled}
          opening={openingIntent === actions.ast.intent} onPress={() => onAction({ bucket, row, intent: actions.ast.intent })} />
        <TargetedBatchActionTile label="NA" value={actions.noAccess.value} helperText={actions.noAccess.helperText} icon="account-cancel-outline"
          tone={actions.noAccess.value === null ? "issue" : "default"} disabled={actions.noAccess.disabled}
          opening={openingIntent === actions.noAccess.intent} onPress={() => onAction({ bucket, row, intent: actions.noAccess.intent })} />
        <TargetedBatchActionTile label={`ERF ${hasErf ? erfNo : ""}`} value="OPEN" helperText={actions.erf.helperText} icon="vector-square"
          disabled={actions.erf.disabled} opening={openingIntent === actions.erf.intent}
          onPress={() => onAction({ bucket, row, intent: actions.erf.intent })} />
      </View>
    </View>
  );
}

// TB-R051: every live Sales or row update rebuilds all row objects, so the card compares what it shows.
// This list must hold every row field the card and getTargetedBatchRowActionState read.
const TARGETED_BATCH_ROW_CARD_FIELDS = [
  (row) => row?.id,
  (row) => row?.displayStatus,
  (row) => row?.executionStatus,
  (row) => row?.erfId,
  (row) => row?.erfNo,
  (row) => row?.raw?.property?.erfNo,
  (row) => row?.refs?.erfId,
  (row) => row?.refs?.premiseId,
  (row) => row?.refs?.meterId,
  (row) => row?.meterNo,
  (row) => row?.accountNumber,
  (row) => row?.customerName,
  (row) => row?.address,
  (row) => row?.town,
  (row) => row?.fieldWorkMeterId,
  (row) => row?.raw?.fieldWorkMeterId,
  (row) => row?.noAccessCount,
];

// The batch is compared by id only: the card shows nothing of it, and the stable onAction
// (handleTargetedBatchRowAction) acts on the latest row and batch when tapped.
function targetedBatchRowCardPropsEqual(prev, next) {
  if (prev.onAction !== next.onAction) return false;
  if ((prev.openingIntent ?? null) !== (next.openingIntent ?? null)) return false;
  if ((prev.bucket?.id || null) !== (next.bucket?.id || null)) return false;
  if (prev.row === next.row) return true;

  return TARGETED_BATCH_ROW_CARD_FIELDS.every((read) =>
    Object.is(read(prev.row), read(next.row)),
  );
}

const TargetedBatchRowCard = memo(
  TargetedBatchRowCardBase,
  targetedBatchRowCardPropsEqual,
);
TargetedBatchRowCard.displayName = "TargetedBatchRowCard";

function GroupLanding({
  isLoading,
  error,
  groups,
  offline = false,
  onOpenGroup,
  onBack,
}) {
  // TB-R051: with no connection, empty groups are not loaded work, not "no work".
  const offlineWithoutWork =
    offline && groups.every((group) => Number(group?.total || 0) === 0);

  if (isLoading) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.stateText}>Loading your allocated work...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateWrap}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={36}
          color="#dc2626"
        />
        <Text style={styles.stateTitle}>Could not load WMS</Text>
        <Text style={styles.stateText}>
          {error?.message || "Work stream failed."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Pressable style={styles.backPill} onPress={onBack}>
        <MaterialCommunityIcons
          name="chevron-left"
          size={20}
          color="#0f172a"
        />
        <Text style={styles.backPillText}>Buckets</Text>
      </Pressable>

      <Text style={[styles.sectionEyebrow, { marginTop: 10 }]}>Individual Work</Text>
      <Text style={styles.sectionTitle}>Select TRN Type</Text>

      {offlineWithoutWork ? (
        <View style={[styles.bucketList, { marginBottom: 10 }]}>
          <InlineStatusCard icon="wifi-off" title={WMS_OFFLINE_MESSAGE} />
        </View>
      ) : null}

      <View style={styles.groupGrid}>
        {groups.map((group) => (
          <Pressable
            key={group.key}
            style={styles.groupCard}
            onPress={() => onOpenGroup(group)}
          >
            <View style={styles.groupTopRow}>
              <View style={styles.groupIcon}>
                <MaterialCommunityIcons
                  name={group.icon}
                  size={23}
                  color="#2563eb"
                />
              </View>
              <View style={styles.groupTotalBadge}>
                <Text style={styles.groupTotalText}>{group.total || 0}</Text>
              </View>
            </View>

            <Text style={styles.groupTitle}>{group.title}</Text>
            <Text style={styles.groupSub}>Tap to open allocated TRNs</Text>

            <View style={styles.groupCounts}>
              <MiniCount label="Issued" value={group?.counts?.issued || 0} />
              <MiniCount
                label="Accepted"
                value={group?.counts?.accepted || 0}
              />
              <MiniCount
                label="Progress"
                value={group?.counts?.inProgress || 0}
              />
              <MiniCount
                label="Completed"
                value={group?.counts?.completed || 0}
              />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function GroupDetail({
  title,
  backLabel = "Groups",
  stateFilter,
  setStateFilter,
  allGroupItems,
  items,
  deciding,
  isBgoBucketView = false,
  isPreparingBgoDetail = false,
  detailError = null,
  offline = false,
  onBack,
  onAccept,
  onReject,
  onExecute,
}) {
  // TB-R051: with no connection and nothing on the phone, say so instead of "No allocated TRNs".
  const offlineWithoutItems =
    offline && (Array.isArray(allGroupItems) ? allGroupItems.length : 0) === 0;

  const renderWorkItem = ({ item }) => (
    <WorkItemCard
      item={item}
      deciding={deciding}
      isBgoBucketView={isBgoBucketView}
      onAccept={onAccept}
      onReject={onReject}
      onExecute={onExecute}
    />
  );

  return (
    <View style={styles.detailWrap}>
      <View style={styles.detailHeader}>
        <Pressable style={styles.backPill} onPress={onBack}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={20}
            color="#0f172a"
          />
          <Text style={styles.backPillText}>{backLabel}</Text>
        </Pressable>

        <View style={styles.detailTitleWrap}>
          <Text style={styles.sectionEyebrow}>My Allocated Work</Text>
          <Text style={styles.detailTitle}>{title}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {STATE_FILTERS.map((filter) => {
          const active = stateFilter === filter.key;
          const count = stateCount(allGroupItems, filter.key);

          return (
            <Pressable
              key={filter.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setStateFilter(filter.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
              <Text
                style={[
                  styles.filterCountText,
                  active && styles.filterCountTextActive,
                ]}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {detailError ? (
        <View style={styles.detailPreparingCard}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={28}
            color="#dc2626"
          />
          <Text style={styles.detailPreparingTitle}>Could not prepare BGO TRNs</Text>
          <Text style={styles.detailPreparingText}>
            {detailError?.message || "The BGO TRN detail stream failed."}
          </Text>
        </View>
      ) : isPreparingBgoDetail ? (
        <View style={styles.detailPreparingCard}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.detailPreparingTitle}>Preparing BGO TRNs...</Text>
          <Text style={styles.detailPreparingText}>
            Opening the selected bucket child TRNs for execution.
          </Text>
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item, index) => item?.id || item?.raw?.id || String(index)}
          renderItem={renderWorkItem}
          estimatedItemSize={430}
          style={styles.scroll}
          contentContainerStyle={styles.flashListContent}
          ListEmptyComponent={
            offlineWithoutItems ? (
              <View style={styles.emptyListCard}>
                <MaterialCommunityIcons
                  name="wifi-off"
                  size={35}
                  color="#94a3b8"
                />
                <Text style={styles.stateTitle}>{WMS_OFFLINE_MESSAGE}</Text>
              </View>
            ) : (
              <View style={styles.emptyListCard}>
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={35}
                  color="#94a3b8"
                />
                <Text style={styles.stateTitle}>No allocated TRNs</Text>
                <Text style={styles.stateText}>
                  Change filters or issue work directly to this FWR.
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

function getMediaUrl(media = {}) {
  return (
    media?.url ||
    media?.downloadURL ||
    media?.downloadUrl ||
    media?.storageUrl ||
    media?.uri ||
    ""
  );
}

function getMediaLabel(media = {}, index = 0) {
  return (
    media?.label ||
    media?.name ||
    media?.fileName ||
    media?.filename ||
    media?.type ||
    `Instruction media ${index + 1}`
  );
}

function getInstructionMedia(item = {}) {
  const media = Array.isArray(item?.raw?.media) ? item.raw.media : [];

  return media.filter((mediaItem) => mediaItem?.tag === "instructionMedia");
}

function getInstructionMediaSummary(mediaItems = []) {
  if (!mediaItems.length) return "No instruction media";

  if (mediaItems.length === 1) return "1 instruction file";

  return `${mediaItems.length} instruction files`;
}

function getWorkItemMeterKind(item = {}) {
  return (
    item?.meterKind ||
    item?.raw?.ast?.astData?.meter?.type ||
    item?.raw?.astData?.meter?.type ||
    "NAv"
  );
}

function getCompletedInfo(item = {}) {
  if (normalizeUpper(item?.workflowState) !== "COMPLETED") return null;

  const completedByUser = readFirstString(
    item?.execution?.completedByUser,
    item?.raw?.workflow?.completedByUser,
    item?.raw?.metadata?.updatedByUser,
    item?.raw?.updatedByUser,
  );

  const completedAt =
    item?.execution?.completedAt ||
    item?.raw?.workflow?.completedAt ||
    item?.raw?.metadata?.updatedAt ||
    item?.updatedAt ||
    item?.raw?.updatedAt ||
    null;

  return {
    name: completedByUser || "NAv",
    at: completedAt,
  };
}

function WorkItemCard({
  item,
  deciding,
  isBgoBucketView = false,
  onAccept,
  onReject,
  onExecute,
}) {
  const [instructionMediaVisible, setInstructionMediaVisible] = useState(false);

  const instructionMedia = getInstructionMedia(item);
  const hasInstructionMedia = instructionMedia.length > 0;
  const isAcceptedWorkItem = normalizeUpper(item?.workflowState) === "ACCEPTED";
  const isBgoWorkItem = isBgoBucketView || isBgoChildItem(item);
  const accessOutcome = getWorkItemAccessOutcome(item);
  const completedInfo = getCompletedInfo(item);
  const canShowExecute =
    item?.permissions?.canExecute === true &&
    isExecutableWorkflowState(item?.workflowState);

  const canShowAccept = !isBgoWorkItem && item?.permissions?.canAccept === true;
  const canShowReject = !isBgoWorkItem && item?.permissions?.canReject === true;

  const canRejectAcceptedWork =
    !isBgoWorkItem &&
    item?.permissions?.canExecute === true &&
    isAcceptedWorkItem &&
    item?.permissions?.canReject !== true;

  return (
    <View style={styles.workCard}>
      <View style={styles.workHeader}>
        <View style={styles.workTypeIcon}>
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={20}
            color="#2563eb"
          />
        </View>

        <View style={styles.workHeaderMain}>
          <Text style={styles.workTitle}>{item.trnTypeLabel}</Text>
          <Text style={styles.workId} numberOfLines={1} ellipsizeMode="middle">
            {item.id}
          </Text>
        </View>

        <View style={styles.workBadgeRow}>
          {accessOutcome ? (
            <View
              style={[
                styles.accessOutcomeBadge,
                getAccessOutcomeBadgeStyle(accessOutcome),
              ]}
            >
              <Text style={styles.accessOutcomeText}>{accessOutcome}</Text>
            </View>
          ) : null}

          <View
            style={[styles.stateBadge, getStateBadgeStyle(item.workflowState)]}
          >
            <Text
              style={[
                styles.stateBadgeText,
                getStateBadgeTextStyle(item.workflowState),
              ]}
            >
              {String(item.workflowState || "NAv").replace("_", " ")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <InfoLine icon="counter" label="Meter No" value={item.meterNo} />

        <InfoLine
          icon="countertop-outline"
          label="Meter Kind"
          value={getWorkItemMeterKind(item)}
        />

        <InfoLine
          icon="map-marker-outline"
          label="Address"
          value={item.address}
          fullWidth={true}
        />

        <InfoLine icon="home-city-outline" label="ERF No" value={item.erfNo} />

        <InfoLine
          icon="gauge"
          label="Meter Pre-Status"
          value={item.meterPreStatus}
        />

        <InfoLine
          icon="account-hard-hat-outline"
          label="Assigned Target"
          value={item.assignment?.targetText || "NAv"}
        />

        <InfoLine
          icon="account-tie-outline"
          label="Issued By"
          value={item.issuedBy?.name || "NAv"}
        />

        <InfoLine
          icon="clock-outline"
          label="Age"
          value={formatAge(item.ageSeconds)}
        />

        <Pressable
          style={[
            styles.instructionMediaLine,
            !hasInstructionMedia && styles.instructionMediaLineEmpty,
          ]}
          onPress={() => {
            if (!hasInstructionMedia) return;
            setInstructionMediaVisible(true);
          }}
          disabled={!hasInstructionMedia}
        >
          <MaterialCommunityIcons
            name={hasInstructionMedia ? "paperclip" : "paperclip-off"}
            size={16}
            color={hasInstructionMedia ? "#2563eb" : "#94a3b8"}
          />

          <View style={styles.instructionMediaLineMain}>
            <Text style={styles.infoLabel}>Instruction Media</Text>
            <Text
              style={[
                styles.instructionMediaLineValue,
                !hasInstructionMedia && styles.instructionMediaLineValueEmpty,
              ]}
            >
              {getInstructionMediaSummary(instructionMedia)}
            </Text>
          </View>

          {hasInstructionMedia ? (
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color="#2563eb"
            />
          ) : null}
        </Pressable>
      </View>

      {item.acceptedBy ? (
        <View style={styles.acceptedBadgeRow}>
          <MaterialCommunityIcons
            name="check-decagram"
            size={16}
            color="#16a34a"
          />
          <Text style={styles.acceptedBadgeText}>
            Accepted by {item.acceptedBy.name || "NAv"} •{" "}
            {formatDateTime(item.acceptedBy.at)}
          </Text>
        </View>
      ) : null}

      {completedInfo ? (
        <View style={styles.completedBadgeRow}>
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={16}
            color="#166534"
          />
          <Text style={styles.completedBadgeText}>
            Completed by {completedInfo.name || "NAv"} -{" "}
            {formatDateTime(completedInfo.at)}
          </Text>
        </View>
      ) : null}

      {item.rejectedBy ? (
        <View style={styles.rejectedBox}>
          <Text style={styles.rejectedTitle}>
            Rejected by {item.rejectedBy.name || "NAv"}
          </Text>
          <Text style={styles.rejectedText}>
            {item.rejectedBy.reason || "No reason captured."}
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {canShowAccept ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.acceptBtn,
              deciding && styles.actionDisabled,
            ]}
            onPress={() => onAccept(item)}
            disabled={deciding}
          >
            <Text style={styles.acceptBtnText}>ACCEPT</Text>
          </Pressable>
        ) : null}

        {canShowReject ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.rejectBtn,
              deciding && styles.actionDisabled,
            ]}
            onPress={() => onReject(item)}
            disabled={deciding}
          >
            <Text style={styles.rejectBtnText}>REJECT</Text>
          </Pressable>
        ) : null}

        {canShowExecute ? (
          <Pressable
            style={[styles.actionBtn, styles.executeBtn]}
            onPress={() => onExecute(item)}
            disabled={deciding}
          >
            <Text style={styles.executeBtnText}>EXECUTE</Text>
          </Pressable>
        ) : null}

        {canRejectAcceptedWork ? (
          <Pressable
            style={[
              styles.actionBtn,
              styles.rejectWorkBtn,
              deciding && styles.actionDisabled,
            ]}
            onPress={() => onReject(item)}
            disabled={deciding}
          >
            <Text style={styles.rejectWorkBtnText}>REJECT WORK</Text>
          </Pressable>
        ) : null}

        {!canShowAccept &&
        !canShowReject &&
        !canShowExecute ? (
          <View style={styles.noActionBox}>
            <MaterialCommunityIcons
              name="lock-check-outline"
              size={15}
              color="#64748b"
            />
            <Text style={styles.noActionText}>
              No field action available in this state.
            </Text>
          </View>
        ) : null}
      </View>

      <InstructionMediaModal
        visible={instructionMediaVisible}
        mediaItems={instructionMedia}
        workItemId={item?.id}
        onClose={() => setInstructionMediaVisible(false)}
      />
    </View>
  );
}

function InstructionMediaModal({
  visible,
  mediaItems = [],
  workItemId,
  onClose,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedMedia = mediaItems[selectedIndex] || mediaItems[0] || null;
  const selectedUrl = getMediaUrl(selectedMedia);
  const selectedLabel = getMediaLabel(selectedMedia, selectedIndex);
  const selectedIsPhoto = isPhotoMedia(selectedMedia);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.instructionMediaSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons
                name="image-multiple-outline"
                size={22}
                color="#2563eb"
              />
            </View>

            <View style={styles.modalHeaderMain}>
              <Text style={styles.modalTitle}>Instruction Media</Text>
              <Text style={styles.modalSub}>{workItemId || "NAv"}</Text>
            </View>

            <Pressable style={styles.modalClose} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
            </Pressable>
          </View>

          {mediaItems.length === 0 ? (
            <View style={styles.instructionMediaEmpty}>
              <MaterialCommunityIcons
                name="paperclip-off"
                size={30}
                color="#94a3b8"
              />
              <Text style={styles.stateTitle}>No instruction media</Text>
              <Text style={styles.stateText}>
                This work item has no office instruction media attached.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.instructionPhotoPreviewBox}>
                {selectedIsPhoto && selectedUrl ? (
                  <>
                    <Image
                      source={{ uri: selectedUrl }}
                      style={styles.instructionPhotoPreview}
                      resizeMode="contain"
                    />

                    <Text style={styles.instructionPhotoTitle}>
                      {selectedLabel}
                    </Text>
                  </>
                ) : (
                  <View style={styles.instructionPhotoUnsupported}>
                    <MaterialCommunityIcons
                      name="file-eye-outline"
                      size={38}
                      color="#94a3b8"
                    />

                    <Text style={styles.instructionPhotoUnsupportedTitle}>
                      Preview not enabled yet
                    </Text>

                    <Text style={styles.instructionPhotoUnsupportedText}>
                      Only instruction photos are previewed in this modal for
                      now.
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.instructionMediaThumbScroll}
                contentContainerStyle={styles.instructionMediaThumbRow}
              >
                {mediaItems.map((mediaItem, index) => {
                  const active = index === selectedIndex;
                  const label = getMediaLabel(mediaItem, index);
                  const url = getMediaUrl(mediaItem);
                  const isPhoto = isPhotoMedia(mediaItem);

                  return (
                    <Pressable
                      key={`${label}-${index}`}
                      style={[
                        styles.instructionMediaThumb,
                        active && styles.instructionMediaThumbActive,
                      ]}
                      onPress={() => setSelectedIndex(index)}
                    >
                      {isPhoto && url ? (
                        <Image
                          source={{ uri: url }}
                          style={styles.instructionMediaThumbImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name="file-eye-outline"
                          size={18}
                          color={active ? "#ffffff" : "#2563eb"}
                        />
                      )}

                      <Text
                        numberOfLines={1}
                        style={[
                          styles.instructionMediaThumbText,
                          active && styles.instructionMediaThumbTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function InfoLine({ icon, label, value, fullWidth = false }) {
  return (
    <View style={[styles.infoLine, fullWidth && styles.infoLineFull]}>
      <MaterialCommunityIcons name={icon} size={15} color="#64748b" />

      <View style={styles.infoLineMain}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "NAv"}</Text>
      </View>
    </View>
  );
}

function MiniCount({ label, value }) {
  return (
    <View style={styles.miniCount}>
      <Text style={styles.miniCountValue}>{value}</Text>
      <Text style={styles.miniCountLabel}>{label}</Text>
    </View>
  );
}

function RejectModal({ visible, item, busy, onClose, onSubmit }) {
  const isBgoBucket = item?.itemKind === "BGO_BATCH";
  const isTargetedBatch = item?.itemKind === "TARGETED_BATCH";
  const isAcceptedWorkItem = normalizeUpper(item?.workflowState) === "ACCEPTED";
  const title = isTargetedBatch
    ? "Reject Targeted Batch"
    : isBgoBucket
      ? "Reject BGO Bucket"
      : isAcceptedWorkItem
        ? "Reject Accepted Work"
        : "Reject Work Item";
  const placeholder = isTargetedBatch
    ? "Explain why this Targeted Batch cannot be accepted"
    : isBgoBucket
      ? "Explain why this BGO bucket cannot be accepted"
      : isAcceptedWorkItem
        ? "Explain why this accepted work item cannot be executed"
        : "Explain why this work item cannot be accepted";
  const submitText = isTargetedBatch
    ? "REJECT BATCH"
    : isBgoBucket
      ? "REJECT BUCKET"
      : isAcceptedWorkItem
        ? "REJECT WORK"
        : "SUBMIT REJECTION";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons
                name="close-octagon-outline"
                size={22}
                color="#dc2626"
              />
            </View>

            <View style={styles.modalHeaderMain}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSub}>{item?.id || "NAv"}</Text>
            </View>

            <Pressable
              style={styles.modalClose}
              onPress={onClose}
              disabled={busy}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
            </Pressable>
          </View>

          <Formik
            initialValues={{ rejectReason: "" }}
            validationSchema={RejectSchema}
            enableReinitialize
            onSubmit={onSubmit}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              isSubmitting,
            }) => (
              <View>
                <Text style={styles.modalLabel}>Reject Reason</Text>
                <TextInput
                  value={values.rejectReason}
                  onChangeText={handleChange("rejectReason")}
                  onBlur={handleBlur("rejectReason")}
                  placeholder={placeholder}
                  placeholderTextColor="#94a3b8"
                  style={[
                    styles.rejectInput,
                    touched.rejectReason &&
                      errors.rejectReason &&
                      styles.rejectInputError,
                  ]}
                  editable={!busy && !isSubmitting}
                  multiline
                  textAlignVertical="top"
                />

                {touched.rejectReason && errors.rejectReason ? (
                  <Text style={styles.errorText}>{errors.rejectReason}</Text>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={onClose}
                    disabled={busy || isSubmitting}
                  >
                    <Text style={styles.modalCancelText}>CANCEL</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.modalButton,
                      styles.modalRejectButton,
                      (busy || isSubmitting) && styles.actionDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={busy || isSubmitting}
                  >
                    {busy || isSubmitting ? (
                      <ActivityIndicator size="small" color="#7f1d1d" />
                    ) : (
                      <Text style={styles.modalRejectText}>{submitText}</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </Formik>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bucketTypeList: {
    gap: 12,
  },
  bucketTypeCard: {
    minHeight: 164,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 14,
  },
  bucketTypeCardDisabled: {
    opacity: 0.78,
  },
  bucketTypeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  bucketTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  bucketTypeStatusBadge: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bucketTypeStatusReady: {
    backgroundColor: "#dcfce7",
  },
  bucketTypeStatusError: {
    backgroundColor: "#fee2e2",
  },
  bucketTypeStatusText: {
    color: "#1d4ed8",
    fontSize: 9,
    fontWeight: "900",
  },
  bucketTypeStatusTextReady: {
    color: "#166534",
  },
  bucketTypeStatusTextError: {
    color: "#991b1b",
  },
  bucketTypeTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  bucketTypeSubtitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  bucketTypeErrorText: {
    color: "#b91c1c",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 7,
    lineHeight: 14,
  },
  bucketTypeFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  bucketTypeCountBox: {
    minWidth: 82,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bucketTypeCountValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  bucketTypeCountLabel: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 1,
  },
  bucketTypeOpenBox: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bucketTypeOpenBoxWaiting: {
    backgroundColor: "#f1f5f9",
  },
  bucketTypeOpenBoxError: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  bucketTypeOpenText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  bucketTypeLoadingText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
  },
  bucketTypeUnavailableText: {
    color: "#991b1b",
    fontSize: 10,
    fontWeight: "900",
  },
  bucketList: {
    gap: 10,
  },
  bucketSectionDivider: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  bucketSectionTitle: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  inlineStatusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineStatusError: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  inlineStatusMain: {
    flex: 1,
  },
  inlineStatusTitle: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
  },
  inlineStatusTitleError: {
    color: "#dc2626",
  },
  inlineStatusText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  bucketCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
  },
  bucketStatusBadge: {
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  bucketStatusText: {
    color: "#1d4ed8",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  bucketMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 9,
    marginBottom: 10,
  },
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  headerCard: {
    margin: 12,
    marginBottom: 8,
    backgroundColor: "#0f172a",
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMain: {
    flex: 1,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  headerSub: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  headerCountBadge: {
    minWidth: 78,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  headerCountText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "900",
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 28,
  },
  flashListContent: {
    padding: 12,
    paddingBottom: 28,
  },
  sectionEyebrow: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
  },
  groupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  groupCard: {
    width: "48%",
    minHeight: 174,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
  },
  groupTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  groupIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  groupTotalBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  groupTotalText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900",
  },
  groupTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  groupSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 10,
  },
  groupCounts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  miniCount: {
    width: "47%",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 6,
  },
  miniCountValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  miniCountLabel: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 1,
  },
  detailWrap: {
    flex: 1,
  },
  detailPreparingCard: {
    margin: 12,
    minHeight: 180,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 7,
  },
  detailPreparingTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  detailPreparingText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
  },
  detailHeader: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backPill: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 9,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  backPillText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
  },
  detailTitleWrap: {
    flex: 1,
  },
  detailTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },

  filterScroll: {
    flexGrow: 0,
    maxHeight: 34,
    marginBottom: 6,
  },

  filterRow: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 2,
    gap: 6,
    alignItems: "center",
  },

  filterChip: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    alignSelf: "center",
  },

  filterChipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },

  filterChipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },

  filterChipTextActive: {
    color: "#ffffff",
  },

  filterCountText: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 17,
  },

  filterCountTextActive: {
    backgroundColor: "#334155",
    color: "#e2e8f0",
  },

  workCard: {
    backgroundColor: "#ffffff",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 10,
  },
  workHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 11,
  },
  workTypeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  workHeaderMain: {
    flex: 1,
  },
  workTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  workId: {
    color: "#64748b",
    fontSize: 7,
    fontWeight: "800",
    marginTop: 2,
    lineHeight: 10,
  },
  workBadgeRow: {
    alignItems: "flex-end",
    gap: 5,
  },
  accessOutcomeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  accessOutcomeAccess: {
    backgroundColor: "#dbeafe",
  },
  accessOutcomeNoAccess: {
    backgroundColor: "#fee2e2",
  },
  accessOutcomeText: {
    color: "#0f172a",
    fontSize: 8,
    fontWeight: "900",
  },
  stateBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stateBadgeText: {
    fontSize: 8,
    fontWeight: "900",
  },
  badgeBlue: { backgroundColor: "#dbeafe" },
  badgeBlueText: { color: "#1d4ed8" },
  badgeGreen: { backgroundColor: "#dcfce7" },
  badgeGreenText: { color: "#166534" },
  badgeOrange: { backgroundColor: "#ffedd5" },
  badgeOrangeText: { color: "#c2410c" },
  badgeRed: { backgroundColor: "#fee2e2" },
  badgeRedText: { color: "#991b1b" },
  badgeMuted: { backgroundColor: "#f1f5f9" },
  badgeMutedText: { color: "#475569" },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  infoLine: {
    width: "48%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },

  infoLineFull: {
    width: "100%",
  },
  infoLineMain: {
    flex: 1,
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 1,
    lineHeight: 16,
  },
  acceptedBadgeRow: {
    marginTop: 10,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  acceptedBadgeText: {
    flex: 1,
    color: "#166534",
    fontSize: 11,
    fontWeight: "800",
  },
  completedBadgeRow: {
    marginTop: 10,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  completedBadgeText: {
    flex: 1,
    color: "#166534",
    fontSize: 11,
    fontWeight: "900",
  },
  rejectedBox: {
    marginTop: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 8,
  },
  rejectedTitle: {
    color: "#991b1b",
    fontSize: 11,
    fontWeight: "900",
  },
  rejectedText: {
    color: "#7f1d1d",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
    lineHeight: 15,
  },
  bgoProcessingBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  bgoProcessingTextWrap: {
    flex: 1,
  },
  bgoProcessingTitle: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
  },
  bgoProcessingText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    lineHeight: 15,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  acceptBtn: {
    backgroundColor: "#86efac",
  },
  acceptBtnText: {
    color: "#14532d",
    fontSize: 11,
    fontWeight: "900",
  },
  rejectBtn: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  rejectBtnText: {
    color: "#991b1b",
    fontSize: 11,
    fontWeight: "900",
  },
  rejectWorkBtn: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  rejectWorkBtnText: {
    color: "#c2410c",
    fontSize: 11,
    fontWeight: "900",
  },
  executeBtn: {
    backgroundColor: "#0f172a",
  },
  executeBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  actionDisabled: {
    opacity: 0.55,
  },
  noActionBox: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  noActionText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    gap: 8,
  },
  stateTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  stateText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
  },
  emptyListCard: {
    minHeight: 220,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 7,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.48)",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 56,
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  modalIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderMain: {
    flex: 1,
  },
  modalTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },
  modalSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalLabel: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
  },
  rejectInput: {
    minHeight: 104,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "700",
  },
  rejectInputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modalButton: {
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButton: {
    flex: 0.75,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  modalRejectButton: {
    flex: 1.4,
    backgroundColor: "#fecaca",
  },
  modalCancelText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
  },
  modalRejectText: {
    color: "#7f1d1d",
    fontSize: 12,
    fontWeight: "900",
  },

  instructionMediaLine: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 9,
    paddingVertical: 9,
  },

  instructionMediaLineEmpty: {
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },

  instructionMediaLineMain: {
    flex: 1,
  },

  instructionMediaLineValue: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 1,
  },

  instructionMediaLineValueEmpty: {
    color: "#94a3b8",
  },

  instructionMediaSheet: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
    maxHeight: "72%",
  },

  instructionMediaList: {
    maxHeight: 360,
  },

  instructionMediaListContent: {
    gap: 9,
    paddingBottom: 8,
  },

  instructionMediaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 10,
  },

  instructionMediaItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },

  instructionMediaItemMain: {
    flex: 1,
  },

  instructionMediaItemTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },

  instructionMediaItemSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  instructionMediaEmpty: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 16,
  },

  instructionPhotoPreviewBox: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    minHeight: 320,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },

  instructionPhotoPreview: {
    width: "100%",
    height: 280,
    borderRadius: 12,
    backgroundColor: "#020617",
  },

  instructionPhotoTitle: {
    marginTop: 9,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  instructionPhotoUnsupported: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 8,
  },

  instructionPhotoUnsupportedTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },

  instructionPhotoUnsupportedText: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 16,
  },

  instructionMediaThumbScroll: {
    marginTop: 10,
    flexGrow: 0,
  },

  instructionMediaThumbRow: {
    gap: 8,
    paddingBottom: 2,
  },

  instructionMediaThumb: {
    minWidth: 108,
    maxWidth: 150,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  instructionMediaThumbActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },

  instructionMediaThumbImage: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "#dbeafe",
  },

  instructionMediaThumbText: {
    flex: 1,
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "900",
  },

  instructionMediaThumbTextActive: {
    color: "#ffffff",
  },

  mdBgoSummaryCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  mdBgoBackPill: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 7,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },

  mdBgoWardText: {
    flex: 1,
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },

  mdBgoCompactStat: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 42,
  },

  mdBgoCompactStatLabel: {
    color: "#64748b",
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  mdBgoCompactStatValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 1,
  },

  mdBgoErfCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    marginBottom: 8,
  },

  mdBgoErfHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  mdBgoErfIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },

  mdBgoErfMain: {
    flex: 1,
  },

  mdBgoErfTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },

  mdBgoErfSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 1,
    textTransform: "uppercase",
  },

  mdBgoErfStatusBadge: {
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  mdBgoErfStatusText: {
    color: "#475569",
    fontSize: 8,
    fontWeight: "900",
  },

  mdBgoErfFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 9,
  },

  mdBgoErfMiniStat: {
    minWidth: 72,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  mdBgoErfMiniStatLabel: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  mdBgoErfMiniStatValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 1,
  },

  mdBgoOpenErfBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },

  accessBackButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 8,
  },

  accessBackButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  wmsOfflineBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  wmsOfflineBannerText: {
    flex: 1,
    color: "#991b1b",
    fontSize: 11,
    fontWeight: "900",
  },

  tbMapButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },

  tbMapButtonPressed: {
    backgroundColor: "#dbeafe",
  },

  tbMapButtonDisabled: {
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
  },

  tbSearchWrap: {
    marginHorizontal: 12,
    marginBottom: 4,
  },

  tbSearchBox: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingLeft: 10,
    paddingRight: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  tbSearchInput: {
    flex: 1,
    minHeight: 38,
    paddingVertical: 6,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },

  tbSearchClear: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  tbSearchCount: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
    marginLeft: 4,
  },

  tbCountsCaption: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 3,
  },

  // TB-R051 (1.3.42): the batch header's four status filters, equal width across the screen.
  tbStatusFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 8,
  },

  tbStatusFilter: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },

  tbStatusFilterPressed: {
    opacity: 0.7,
  },

  tbStatusFilterLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },

  tbStatusFilterValue: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: "900",
  },

  tbOpeningBanner: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  tbOpeningBannerText: {
    flex: 1,
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
  },
});
