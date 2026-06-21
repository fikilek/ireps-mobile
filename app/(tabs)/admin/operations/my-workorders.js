import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Formik } from "formik";
import { FlashList } from "@shopify/flash-list";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
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
import { object, string } from "yup";

import { useGeo } from "../../../../src/context/GeoContext";
import { useWarehouse } from "../../../../src/context/WarehouseContext";
import { useAuth } from "../../../../src/hooks/useAuth";
import {
  useAcceptRejectLifecycleInstructionMutation,
  useGetWmsLifecycleWorkItemsQuery,
} from "../../../../src/redux/lifecycleInstructionApi";
import {
  useAcceptRejectBgoBatchMutation,
  useGetBgoBucketsQuery,
  useReverseBgoBatchAcceptanceMutation,
} from "../../../../src/redux/bgoApi";
import { useGetTeamsQuery } from "../../../../src/redux/teamsApi";
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

function addCleanId(set, value) {
  const id = cleanId(value);
  if (id) set.add(id);
}

function getTeamMemberIds(team = {}) {
  const ids = new Set();

  if (Array.isArray(team?.memberUids)) {
    team.memberUids.forEach((uid) => addCleanId(ids, uid));
  }

  if (Array.isArray(team?.memberIds)) {
    team.memberIds.forEach((uid) => addCleanId(ids, uid));
  }

  if (Array.isArray(team?.userIds)) {
    team.userIds.forEach((uid) => addCleanId(ids, uid));
  }

  if (Array.isArray(team?.scope?.memberUserIds)) {
    team.scope.memberUserIds.forEach((uid) => addCleanId(ids, uid));
  }

  if (Array.isArray(team?.members)) {
    team.members.forEach((member) => {
      if (typeof member === "string") {
        addCleanId(ids, member);
        return;
      }

      addCleanId(ids, member?.uid);
      addCleanId(ids, member?.id);
      addCleanId(ids, member?.userId);
    });
  }

  if (Array.isArray(team?.users)) {
    team.users.forEach((member) => {
      if (typeof member === "string") {
        addCleanId(ids, member);
        return;
      }

      addCleanId(ids, member?.uid);
      addCleanId(ids, member?.id);
      addCleanId(ids, member?.userId);
    });
  }

  return [...ids];
}

function getActorTeamIds({ teams = [], actorUid }) {
  const uid = cleanId(actorUid);

  if (!uid) return [];

  return teams
    .filter((team) => getTeamMemberIds(team).includes(uid))
    .map((team) => cleanId(team?.id || team?.teamId))
    .filter(Boolean);
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

function getServiceProviderRelationshipType(profile = {}) {
  return normalizeUpper(
    readFirstString(
      profile?.employment?.serviceProvider?.relationshipType,
      profile?.employment?.serviceProvider?.clientRelationshipType,
      profile?.employment?.relationshipType,
      profile?.serviceProvider?.relationshipType,
      profile?.serviceProvider?.clientRelationshipType,
    ),
  );
}

function isFieldWorkorderActor({ actorRole, profile }) {
  const cleanRole = normalizeUpper(actorRole);

  if (cleanRole === "FWR") return true;

  if (cleanRole !== "SPV") return false;

  const relationshipType = getServiceProviderRelationshipType(profile);

  // If the app profile knows this SPV is MNC-side, block this field screen.
  // Some current user profiles only carry role + serviceProvider id, so unknown
  // relationship remains allowed and the backend still performs final authority.
  if (relationshipType === "MNC") return false;

  return true;
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
  const { all } = useWarehouse();
  const { user, profile } = useAuth();

  const actorUid = user?.uid || profile?.uid || null;
  const actorRole = profile?.employment?.role || profile?.role || "NAv";
  const actorSpId = profile?.employment?.serviceProvider?.id || null;
  const actorName =
    profile?.profile?.displayName || user?.email || actorUid || "NAv";

  const fieldWorkorderActor = isFieldWorkorderActor({ actorRole, profile });

  const [selectedBucket, setSelectedBucket] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [stateFilter, setStateFilter] = useState("ALL");
  const [rejectItem, setRejectItem] = useState(null);
  const [preparingBgoDetail, setPreparingBgoDetail] = useState(false);
  const [processingBgoBucketAction, setProcessingBgoBucketAction] = useState(null);

  const selectedBgoBatchId =
    selectedBucket?.bucketType === "BGOB" && !isBmdBgoBucket(selectedBucket)
      ? selectedBucket?.id || null
      : null;

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

  const {
    data: wmsData,
    isLoading,
    error,
    refetch,
  } = useGetWmsLifecycleWorkItemsQuery(
    {
      actorUid,
      actorRole,
      actorSpId,
      actorName,
      mode: "INDIVIDUAL",
      limit: 500,
    },
    { skip: !fieldWorkorderActor },
  );

  const {
    data: bgoDetailData,
    isLoading: isLoadingBgoDetailTrns,
    isFetching: isFetchingBgoDetailTrns,
    error: bgoDetailError,
    refetch: refetchBgoDetail,
  } = useGetWmsLifecycleWorkItemsQuery(
    {
      actorUid,
      actorRole,
      actorSpId,
      actorName,
      mode: "BGO_BUCKET",
      bgoBatchId: selectedBgoBatchId,
      limit: 2000,
    },
    { skip: !fieldWorkorderActor || !selectedBgoBatchId },
  );

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

  const { data: teamsData = [] } = useGetTeamsQuery(undefined, {
    skip: !fieldWorkorderActor,
  });

  const [acceptRejectLifecycleInstruction, { isLoading: deciding }] =
    useAcceptRejectLifecycleInstructionMutation();

  const [acceptRejectBgoBatch, { isLoading: decidingBgo }] =
    useAcceptRejectBgoBatchMutation();

  const [reverseBgoBatchAcceptance, { isLoading: reversingBgo }] =
    useReverseBgoBatchAcceptanceMutation();

  const actionBusy = deciding || decidingBgo || reversingBgo;

  // My Workorders is now a field execution screen only.
  // Manager reversal must move to a manager control surface later.
  const managerActor = false;

  const allItems = useMemo(() => {
    return Array.isArray(wmsData?.items) ? wmsData.items : [];
  }, [wmsData?.items]);

  const bgoDetailItems = useMemo(() => {
    return Array.isArray(bgoDetailData?.items) ? bgoDetailData.items : [];
  }, [bgoDetailData?.items]);

  const individualItems = useMemo(() => {
    return allItems.filter(
      (item) => item.scopeBucket === "MY_WORK" && !isBgoChildItem(item),
    );
  }, [allItems]);

  const actorTeamIds = useMemo(() => {
    return getActorTeamIds({
      teams: Array.isArray(teamsData) ? teamsData : [],
      actorUid,
    });
  }, [teamsData, actorUid]);

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
          actorTeamIds,
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
    actorTeamIds,
    all?.prems,
    all?.meters,
    all?.trns,
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
    return [individualBucket, ...bgoBuckets];
  }, [individualBucket, bgoBuckets]);

  useEffect(() => {
    if (!selectedBucket?.id) return;

    const freshBucket = bucketCards.find((bucket) => bucket?.id === selectedBucket.id);
    if (!freshBucket || freshBucket === selectedBucket) return;

    setSelectedBucket(freshBucket);
  }, [bucketCards, selectedBucket]);

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
      ((isLoadingBgoDetailTrns || isFetchingBgoDetailTrns) &&
        allVisibleBucketItems.length === 0 &&
        Number(selectedBucket?.totalTrns || selectedBucket?.counts?.total || 0) > 0));

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
    }
  }

  function openGroup(group) {
    setSelectedGroup(group);
    setStateFilter("ALL");
  }

  function backToBuckets() {
    setPreparingBgoDetail(false);
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

  const showBmdErfWorklist =
    selectedBucket?.bucketType === "BGOB" && isBmdBgoBucket(selectedBucket);

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
          <Text style={styles.headerCountText}>Buckets {bucketCards.length}</Text>
        </View>
      </View>

      {!selectedBucket ? (
        <BucketLanding
          isLoadingIndividual={isLoading && !wmsData}
          isLoadingBgo={isLoadingBgo || !bgoData?.meta?.updatedAt}
          individualBucket={individualBucket}
          bgoBuckets={bgoBuckets}
          error={error}
          bgoError={bgoError}
          deciding={actionBusy}
          processingBgoBucketAction={processingBgoBucketAction}
          managerActor={managerActor}
          fieldWorkorderActor={fieldWorkorderActor}
          onOpenBucket={openBucket}
          onAcceptBgoBucket={handleAcceptBgoBucket}
          onRejectBgoBucket={setRejectItem}
          onReverseBgoBucket={handleReverseBgoBucket}
        />
      ) : showIndividualGroups ? (
        <GroupLanding
          isLoading={isLoading}
          error={error}
          groups={groups}
          onOpenGroup={openGroup}
          onBack={backToBuckets}
        />
      ) : showBmdErfWorklist ? (
        <MdBgoErfWorklist
          bucket={selectedBucket}
          onBack={backToBuckets}
          onOpenErf={handleOpenBmdErf}
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

function BucketLanding({
  isLoadingIndividual,
  isLoadingBgo,
  individualBucket,
  bgoBuckets = [],
  error,
  bgoError,
  deciding,
  processingBgoBucketAction,
  managerActor,
  fieldWorkorderActor,
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
      <Text style={styles.sectionEyebrow}>Assigned Work Queue</Text>
      <Text style={styles.sectionTitle}>My Work Buckets</Text>

      <View style={styles.bucketList}>
        <BucketCard
          key={individualBucket.id}
          bucket={individualBucket}
          deciding={deciding}
          processingBgoBucketAction={processingBgoBucketAction}
          managerActor={managerActor}
          fieldWorkorderActor={fieldWorkorderActor}
          onOpenBucket={onOpenBucket}
          onAcceptBgoBucket={onAcceptBgoBucket}
          onRejectBgoBucket={onRejectBgoBucket}
          onReverseBgoBucket={onReverseBgoBucket}
        />

        {isLoadingIndividual ? (
          <InlineStatusCard
            icon="account-hard-hat-outline"
            title="Loading individual work..."
            text="Individual counts will update as the work stream arrives."
            showSpinner
          />
        ) : null}

        {error ? (
          <InlineStatusCard
            icon="alert-circle-outline"
            title="Individual work stream failed"
            text={error?.message || "Could not load individual WMS work."}
            tone="error"
          />
        ) : null}

        <View style={styles.bucketSectionDivider}>
          <Text style={styles.bucketSectionTitle}>BGO Buckets</Text>
        </View>

        {isLoadingBgo ? (
          <InlineStatusCard
            icon="map-marker-radius-outline"
            title="Loading BGO buckets..."
            text="Preparing BGO execution summary..."
            showSpinner
          />
        ) : null}

        {bgoError ? (
          <InlineStatusCard
            icon="alert-circle-outline"
            title="BGO bucket stream failed"
            text={bgoError?.message || "Could not load BGO buckets."}
            tone="error"
          />
        ) : null}

        {!isLoadingBgo && !bgoError && bgoBuckets.length === 0 ? (
          <InlineStatusCard
            icon="playlist-remove"
            title="No BGO buckets available"
            text="There are no BGO buckets assigned to you right now. New BGO batches will appear here after they are created for your user, team, or service provider."
          />
        ) : null}

        {bgoBuckets.map((bucket) => (
          <BucketCard
            key={bucket.id}
            bucket={bucket}
            deciding={deciding}
            processingBgoBucketAction={processingBgoBucketAction}
            managerActor={managerActor}
            fieldWorkorderActor={fieldWorkorderActor}
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
        <Text style={styles.inlineStatusText}>{text}</Text>
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

function GroupLanding({ isLoading, error, groups, onOpenGroup, onBack }) {
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
  onBack,
  onAccept,
  onReject,
  onExecute,
}) {
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
  const isAcceptedWorkItem = normalizeUpper(item?.workflowState) === "ACCEPTED";
  const title = isBgoBucket
    ? "Reject BGO Bucket"
    : isAcceptedWorkItem
      ? "Reject Accepted Work"
      : "Reject Work Item";
  const placeholder = isBgoBucket
    ? "Explain why this BGO bucket cannot be accepted"
    : isAcceptedWorkItem
      ? "Explain why this accepted work item cannot be executed"
      : "Explain why this work item cannot be accepted";
  const submitText = isBgoBucket
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
});
