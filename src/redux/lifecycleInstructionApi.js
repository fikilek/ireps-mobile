import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  collection,
  documentId,
  limit as firestoreLimit,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import {
  getPendingReconcilableTrnIds,
  reconcileSubmissionQueueWithServerTrns,
} from "../utils/submissionQueue";
import { listenActorTeams, listenQuery } from "./firestoreListeners";
import {
  LIVE_STREAM_STATUS,
  MY_WORK_ORDERS_KEEP_SECONDS,
  combineLiveStatuses,
  createFollowingSubscription,
  createLiveDataStore,
  idsFromKey,
  idsKey,
  listenInChunks,
} from "./liveSubscription";

const WMS_LCT_TYPES = [
  "METER_INSPECTION",
  "METER_DISCONNECTION",
  "METER_RECONNECTION",
  "METER_REMOVAL",
  "METER_READING",
];

const WMS_WORKFLOW_STATES = [
  "ISSUED",
  "REASSIGNED",
  "ACCEPTED",
  "REJECTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

const WMS_DEMO_STREAM_LIMIT = 500;

// TB-R052: office work orders are read by type and state, split so each query stays within Firestore's limit
// of 30 combinations: open work orders (types × open states), and Completed or Cancelled ones from office
// channels (types × channels).
const WMS_OPEN_WORKFLOW_STATES = [
  "ISSUED",
  "REASSIGNED",
  "ACCEPTED",
  "REJECTED",
  "IN_PROGRESS",
];
const WMS_FINISHED_WORKFLOW_STATES = ["COMPLETED", "CANCELLED"];

// TB-R052: every channel the server gives a TRN except FIELD (a field form is never an office work order).
const WMS_OFFICE_CHANNELS = ["OFFICE", "API", "AMI", "INTEGRATION"];

// TB-R052: how often a kept list re-checks which finished work orders are still within 30 days.
const WMS_LISTED_CHECK_MS = 60 * 60 * 1000;

// TB-R052: a finished work order is listed for 30 days after it last changed.
const WMS_FINISHED_LISTED_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// TB-R052: how often the phone's queue is checked for items waiting on the server.
const WMS_QUEUE_CHECK_MS = 30000;

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

const EMPTY_WMS_DATA = {
  items: [],
  groups: WMS_GROUPS.map((group) => ({
    ...group,
    total: 0,
    counts: buildEmptyStateCounts(),
  })),
  tabs: {
    myWork: 0,
    teamWork: 0,
    spWork: 0,
    supervisorQueue: 0,
    allVisible: 0,
  },
  summary: buildEmptyStateCounts(),
  supervisorQueue: {
    items: [],
    rejected: 0,
  },
  meta: {
    source: "WMS_STREAM",
    updatedAt: null,
    streamLimit: WMS_DEMO_STREAM_LIMIT,
    stream: LIVE_STREAM_STATUS.CONNECTING,
  },
};

function buildEmptyStateCounts() {
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

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

function cleanText(value, fallback = "NAv") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStateCountKey(state) {
  switch (normalizeUpper(state)) {
    case "ISSUED":
      return "issued";
    case "REASSIGNED":
      return "reassigned";
    case "ACCEPTED":
      return "accepted";
    case "REJECTED":
      return "rejected";
    case "IN_PROGRESS":
      return "inProgress";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    default:
      return null;
  }
}

function incrementStateCount(counts, state) {
  const key = getStateCountKey(state);
  if (key) counts[key] += 1;
  counts.total += 1;
}

function getTrnType(trn = {}) {
  return normalizeUpper(
    trn?.accessData?.trnType ||
      trn?.trnType ||
      trn?.assignment?.instruction?.code,
  );
}

function getWorkflowState(trn = {}) {
  return normalizeUpper(trn?.workflow?.state || trn?.workflowState);
}

function getBgoBatchIdFromTrn(trn = {}) {
  return readFirstString(
    trn?.bgo?.batchId,
    trn?.bucket?.batchId,
    trn?.refs?.bgoBatchId,
    trn?.bgoBatchId,
    trn?.batchId,
  );
}

function getCreatedAt(trn = {}) {
  return trn?.metadata?.createdAt || trn?.createdAt || null;
}

function getUpdatedAt(trn = {}) {
  return trn?.metadata?.updatedAt || trn?.updatedAt || getCreatedAt(trn);
}

function getTrnTypeMeta(trnType) {
  return (
    WMS_GROUPS.find((group) => group.key === trnType) || {
      key: trnType,
      title: trnType || "Lifecycle Work Item",
      short: "TRN",
      icon: "clipboard-text-outline",
    }
  );
}

function normalizeAssignmentTarget(target = {}) {
  return {
    type: normalizeUpper(target?.type),
    id: String(target?.id || "").trim(),
    name: cleanText(target?.name || target?.title || target?.id),
  };
}

function getAssignmentTargets(trn = {}) {
  const targets = Array.isArray(trn?.assignment?.targets)
    ? trn.assignment.targets
    : [];

  return targets
    .map(normalizeAssignmentTarget)
    .filter(
      (target) =>
        ["USER", "TEAM", "SP"].includes(target.type) &&
        Boolean(target.id) &&
        Boolean(target.name),
    );
}

function getTeamMemberIds(team = {}) {
  const ids = new Set();
  const addId = (value) => {
    const clean = String(value || "").trim();
    if (clean) ids.add(clean);
  };

  if (Array.isArray(team?.memberUids)) team.memberUids.forEach(addId);
  if (Array.isArray(team?.scope?.memberUserIds)) {
    team.scope.memberUserIds.forEach(addId);
  }

  [team?.members, team?.users].forEach((members) => {
    if (!Array.isArray(members)) return;

    members.forEach((member) => {
      if (typeof member === "string") {
        addId(member);
        return;
      }

      addId(member?.uid);
      addId(member?.id);
      addId(member?.userId);
    });
  });

  return [...ids];
}

function getProfileDisplayName(profile = {}) {
  const fullName =
    `${profile?.profile?.name || ""} ${profile?.profile?.surname || ""}`
      .trim()
      .replace(/\s+/g, " ");

  return readFirstString(
    profile?.profile?.displayName,
    fullName,
    profile?.profile?.email,
    profile?.email,
    profile?.identity?.email,
    profile?.uid,
  );
}

function getActorFromArgsOrState(args = {}, getState) {
  const state = typeof getState === "function" ? getState() : {};
  const authQueries = state?.authApi?.queries || {};

  const authCache = Object.values(authQueries).find(
    (entry) => entry?.data?.auth || entry?.data?.profile || entry?.data?.claims,
  );

  const auth = authCache?.data?.auth || {};
  const profile = authCache?.data?.profile || {};
  const claims = authCache?.data?.claims || {};

  const role = normalizeUpper(
    readFirstString(
      args?.actorRole,
      args?.role,
      claims?.role,
      claims?.userRole,
      claims?.employmentRole,
      profile?.employment?.role,
      profile?.role,
    ),
  );

  const uid = readFirstString(
    args?.actorUid,
    args?.uid,
    auth?.uid,
    profile?.uid,
  );

  const serviceProvider = profile?.employment?.serviceProvider || {};

  const spId = readFirstString(
    args?.actorSpId,
    args?.spId,
    claims?.spId,
    claims?.serviceProviderId,
    serviceProvider?.id,
    profile?.serviceProvider?.id,
  );

  return {
    uid,
    role,
    spId,
    name: readFirstString(args?.actorName, getProfileDisplayName(profile), uid),
    profile,
    claims,
  };
}

function getServiceProviderName(sp = {}) {
  return cleanText(
    sp?.profile?.tradingName ||
      sp?.profile?.registeredName ||
      sp?.profile?.name ||
      sp?.name ||
      sp?.id,
  );
}

function serviceProviderLooksMnc(sp = {}) {
  const classification = normalizeUpper(
    sp?.profile?.classification || sp?.classification || sp?.type,
  );

  if (classification === "MNC") return true;

  const clients = Array.isArray(sp?.clients) ? sp.clients : [];

  return clients.some(
    (client) =>
      normalizeUpper(client?.clientType) === "LM" &&
      normalizeUpper(client?.relationshipType) === "MNC",
  );
}

function getParentMncId(sp = {}) {
  const clients = Array.isArray(sp?.clients) ? sp.clients : [];

  const parent = clients.find(
    (client) =>
      normalizeUpper(client?.clientType) === "SP" &&
      normalizeUpper(client?.relationshipType) === "SUBC",
  );

  return parent?.id || null;
}

function buildMncSubcMap(serviceProviders = []) {
  const map = {};

  serviceProviders.forEach((sp) => {
    if (!sp?.id) return;

    if (serviceProviderLooksMnc(sp)) {
      map[sp.id] = {
        mncId: sp.id,
        subcIds: [],
      };
    }
  });

  serviceProviders.forEach((sp) => {
    if (!sp?.id) return;

    const parentMncId = getParentMncId(sp);

    if (parentMncId && map[parentMncId]) {
      map[parentMncId].subcIds.push(sp.id);
    }
  });

  return map;
}

function getAllowedServiceProviderIds({ actor, serviceProviders = [] }) {
  const actorSpId = actor?.spId || null;
  const actorRole = normalizeUpper(actor?.role);

  if (!actorSpId) return [];

  if (actorRole === "SPU" || actorRole === "ADM") {
    return serviceProviders.map((sp) => sp?.id).filter(Boolean);
  }

  const actorSp = serviceProviders.find((sp) => sp?.id === actorSpId) || null;

  if (!actorSp) return [actorSpId];

  const mncSubcMap = buildMncSubcMap(serviceProviders);

  if (serviceProviderLooksMnc(actorSp)) {
    return [actorSpId, ...(mncSubcMap[actorSpId]?.subcIds || [])].filter(
      Boolean,
    );
  }

  const parentMncId = getParentMncId(actorSp);

  if ((actorRole === "MNG" || actorRole === "SPV") && parentMncId) {
    return [parentMncId, ...(mncSubcMap[parentMncId]?.subcIds || [])].filter(
      Boolean,
    );
  }

  return [actorSpId];
}

function isMncSupervisor({ actor, serviceProviders = [] }) {
  if (normalizeUpper(actor?.role) !== "SPV") return false;

  const actorSp = serviceProviders.find((sp) => sp?.id === actor?.spId) || null;
  return serviceProviderLooksMnc(actorSp || {});
}

function isSubcSupervisor({ actor, serviceProviders = [] }) {
  if (normalizeUpper(actor?.role) !== "SPV") return false;

  const actorSp = serviceProviders.find((sp) => sp?.id === actor?.spId) || null;
  if (!actorSp) return false;

  const parentMncId = getParentMncId(actorSp);

  return Boolean(parentMncId) && !serviceProviderLooksMnc(actorSp);
}

function isFieldExecutionActor({ actor, serviceProviders = [] }) {
  const role = normalizeUpper(actor?.role);

  if (role === "FWR") return true;

  if (role === "SPV") {
    return isSubcSupervisor({ actor, serviceProviders });
  }

  return false;
}

function isManagerScopeActor({ actor, serviceProviders = [] }) {
  const role = normalizeUpper(actor?.role);
  return (
    role === "MNG" ||
    role === "ADM" ||
    role === "SPU" ||
    isMncSupervisor({ actor, serviceProviders })
  );
}

function getTrnServiceProviderId(trn = {}) {
  return readFirstString(
    trn?.serviceProvider?.id,
    trn?.assignment?.serviceProvider?.id,
    trn?.metadata?.serviceProvider?.id,
  );
}

function isInManagementScope({ trn, allowedSpIds }) {
  const trnSpId = getTrnServiceProviderId(trn);
  if (!trnSpId) return false;
  return allowedSpIds.includes(trnSpId);
}

function getAssignmentVisibility({ trn, actor, teamMap }) {
  const targets = getAssignmentTargets(trn);
  const actorUid = actor?.uid || null;
  const actorSpId = actor?.spId || null;

  const directlyAssigned = targets.some(
    (target) => target.type === "USER" && target.id === actorUid,
  );

  const teamAssigned = targets.some((target) => {
    if (target.type !== "TEAM") return false;
    const team = teamMap.get(target.id) || {};
    return getTeamMemberIds(team).includes(actorUid);
  });

  const spAssigned = targets.some(
    (target) => target.type === "SP" && target.id === actorSpId,
  );

  return {
    directlyAssigned,
    teamAssigned,
    spAssigned,
    assignedToActor: directlyAssigned || teamAssigned || spAssigned,
  };
}

function getScopeBucket({ trn, actor, teamMap, managerCanSee }) {
  const visibility = getAssignmentVisibility({ trn, actor, teamMap });

  if (visibility.directlyAssigned) return "MY_WORK";
  if (visibility.teamAssigned) return "TEAM_WORK";
  if (visibility.spAssigned) return "SP_WORK";
  if (managerCanSee) return "MANAGEMENT_SCOPE";

  return "HIDDEN";
}

function getMeterNo(trn = {}) {
  return cleanText(
    trn?.ast?.astData?.astNo ||
      trn?.astData?.astNo ||
      trn?.accessData?.meterNo ||
      trn?.accessData?.astNo ||
      trn?.meterNo,
  );
}

function getMeterKind(trn = {}) {
  return cleanText(
    trn?.ast?.astData?.meter?.type ||
      trn?.astData?.meter?.type ||
      trn?.meterKind,
  );
}

function getAddress(trn = {}) {
  return cleanText(
    trn?.accessData?.premise?.address ||
      trn?.accessData?.address ||
      trn?.premise?.address,
  );
}

function getErfNo(trn = {}) {
  return cleanText(trn?.accessData?.erfNo || trn?.erfNo || trn?.premise?.erfNo);
}

function getMeterPreStatus(trn = {}) {
  return cleanText(
    trn?.status?.state ||
      trn?.accessData?.meterPreStatus ||
      trn?.accessData?.astStatusBefore ||
      trn?.astStatusBefore,
  );
}

function getIssuedBy(trn = {}) {
  return {
    uid: cleanText(trn?.metadata?.createdByUid, null),
    name: cleanText(
      trn?.metadata?.createdByUser || trn?.assignment?.issuedByUser,
    ),
  };
}

function getAgeSeconds(value) {
  const ms = toMillis(value);
  if (!ms) return 0;
  return Math.max(Math.floor((Date.now() - ms) / 1000), 0);
}

function buildDecision(trn = {}) {
  const state = getWorkflowState(trn);

  if (state !== "ACCEPTED" && state !== "REJECTED") {
    return {
      action: null,
      by: null,
      at: null,
      reason: "",
    };
  }

  return {
    action: state === "ACCEPTED" ? "ACCEPT" : "REJECT",
    by: {
      uid: trn?.assignment?.acceptedRejectedUid || null,
      name: trn?.assignment?.acceptedRejectedUser || null,
    },
    at: trn?.assignment?.acceptedRejectedAt || null,
    reason: String(trn?.assignment?.rejectReason || ""),
  };
}

function normalizeWmsWorkItem({
  trn,
  actor,
  teamMap,
  managerCanSee,
  serviceProviders = [],
}) {
  const trnType = getTrnType(trn);
  const workflowState = getWorkflowState(trn);
  const typeMeta = getTrnTypeMeta(trnType);
  const scopeBucket = getScopeBucket({ trn, actor, teamMap, managerCanSee });
  const decision = buildDecision(trn);
  const targets = getAssignmentTargets(trn);

  const isFieldExecutor = isFieldExecutionActor({
    actor,
    serviceProviders,
  });

  const canFieldAct = ["MY_WORK", "TEAM_WORK", "SP_WORK"].includes(scopeBucket);

  const canAcceptReject =
    isFieldExecutor &&
    canFieldAct &&
    ["ISSUED", "REASSIGNED"].includes(workflowState);

  const canExecute =
    isFieldExecutor &&
    canFieldAct &&
    ["ACCEPTED", "IN_PROGRESS"].includes(workflowState);

  return {
    id: trn?.id || "NAv",
    trnType,
    trnTypeLabel: typeMeta.title,
    trnTypeShort: typeMeta.short,
    workflowState,
    scopeBucket,

    meterNo: getMeterNo(trn),
    meterType: cleanText(trn?.meterType),
    meterKind: getMeterKind(trn),
    meterPreStatus: getMeterPreStatus(trn),

    erfNo: getErfNo(trn),
    premiseId: cleanText(trn?.accessData?.premise?.id, null),
    address: getAddress(trn),
    lmPcode: cleanText(trn?.accessData?.parents?.lmPcode, null),
    wardPcode: cleanText(trn?.accessData?.parents?.wardPcode, null),

    assignment: {
      targets,
      targetText: targets
        .map((target) => `${target.type}: ${target.name}`)
        .join(" • "),
      instructionText: cleanText(trn?.assignment?.instruction?.text),
      instructionNotes: cleanText(trn?.assignment?.instruction?.notes, ""),
      mediaRequired: trn?.assignment?.instruction?.mediaRequired === true,
      rejectReason: String(trn?.assignment?.rejectReason || ""),
    },

    issuedBy: getIssuedBy(trn),
    issuedAt: getCreatedAt(trn),
    updatedAt: getUpdatedAt(trn),
    ageSeconds: getAgeSeconds(getCreatedAt(trn)),

    acceptedBy:
      ["ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(workflowState) &&
      trn?.assignment?.acceptedRejectedUid
        ? {
            uid: trn?.assignment?.acceptedRejectedUid || null,
            name: trn?.assignment?.acceptedRejectedUser || null,
            at: trn?.assignment?.acceptedRejectedAt || null,
          }
        : null,

    rejectedBy:
      workflowState === "REJECTED"
        ? {
            uid: decision?.by?.uid || null,
            name: decision?.by?.name || null,
            at: decision?.at || null,
            reason: decision?.reason || "",
          }
        : null,

    decision,

    execution: {
      startedByUid: trn?.workflow?.executionStartedByUid || null,
      startedByUser: trn?.workflow?.executionStartedByUser || null,
      startedAt: trn?.workflow?.executionStartedAt || null,
      completedByUid: trn?.workflow?.completedByUid || null,
      completedByUser: trn?.workflow?.completedByUser || null,
      completedAt: trn?.workflow?.completedAt || null,
    },

    serviceProvider: {
      id: cleanText(trn?.serviceProvider?.id, null),
      name: cleanText(
        trn?.serviceProvider?.name ||
          getServiceProviderName(trn?.serviceProvider || {}),
      ),
    },

    permissions: {
      canAccept: canAcceptReject,
      canReject: canAcceptReject,
      canExecute,
      canReassign:
        managerCanSee &&
        ["ISSUED", "REJECTED", "REASSIGNED"].includes(workflowState),
      canCancel:
        managerCanSee &&
        ["ISSUED", "REASSIGNED", "REJECTED", "ACCEPTED"].includes(
          workflowState,
        ),
    },

    raw: trn,
  };
}

// TB-R052: a finished work order (Completed or Cancelled) is listed for 30 days after it last changed; an open
// one is always listed.
function isListedWorkOrder(trn = {}, nowMs = Date.now()) {
  if (!WMS_FINISHED_WORKFLOW_STATES.includes(getWorkflowState(trn))) return true;

  const changedAt = toMillis(getUpdatedAt(trn));
  return changedAt > 0 && nowMs - changedAt <= WMS_FINISHED_LISTED_DAYS * DAY_MS;
}

// TB-R052: updatedAt is set once the work orders, teams and service providers have all been read; stream says
// whether the live lists are connecting, live or failed.
function buildWmsData({
  trns = [],
  teams = [],
  serviceProviders = [],
  actor,
  mode = "INDIVIDUAL",
  bgoBatchId = null,
  loaded = true,
  stream = LIVE_STREAM_STATUS.LIVE,
  nowMs = Date.now(),
}) {
  if (!actor?.uid) return EMPTY_WMS_DATA;

  const cleanMode = normalizeUpper(mode || "INDIVIDUAL");
  const selectedBgoBatchId = readFirstString(bgoBatchId);

  const teamMap = new Map();
  teams.forEach((team) => {
    if (team?.id) teamMap.set(team.id, team);
  });

  const allowedSpIds = getAllowedServiceProviderIds({
    actor,
    serviceProviders,
  });
  const isManager = isManagerScopeActor({ actor, serviceProviders });

  const items = trns
    .filter((trn) => WMS_LCT_TYPES.includes(getTrnType(trn)))
    .filter((trn) => WMS_WORKFLOW_STATES.includes(getWorkflowState(trn)))
    .filter((trn) => cleanMode !== "INDIVIDUAL" || isListedWorkOrder(trn, nowMs))
    .filter((trn) => normalizeUpper(trn?.origin?.channel) !== "FIELD")
    .filter((trn) => {
      const trnBgoBatchId = getBgoBatchIdFromTrn(trn);

      if (cleanMode === "BGO_BUCKET") {
        return Boolean(selectedBgoBatchId) && trnBgoBatchId === selectedBgoBatchId;
      }

      return !trnBgoBatchId;
    })
    .map((trn) => {
      const managerCanSee =
        isManager && isInManagementScope({ trn, allowedSpIds });

      return normalizeWmsWorkItem({
        trn,
        actor,
        teamMap,
        managerCanSee,
        serviceProviders,
      });
    })
    .filter((item) => item.scopeBucket !== "HIDDEN")
    .sort(
      (a, b) =>
        toMillis(b.updatedAt || b.issuedAt) -
        toMillis(a.updatedAt || a.issuedAt),
    );

  const summary = buildEmptyStateCounts();
  items.forEach((item) => incrementStateCount(summary, item.workflowState));

  const groups = WMS_GROUPS.map((group) => {
    const groupItems = items.filter((item) => item.trnType === group.key);
    const counts = buildEmptyStateCounts();
    groupItems.forEach((item) =>
      incrementStateCount(counts, item.workflowState),
    );

    return {
      ...group,
      total: groupItems.length,
      counts,
    };
  });

  const supervisorItems = items.filter(
    (item) => item.workflowState === "REJECTED" && item.permissions.canReassign,
  );

  return {
    items,
    groups,
    tabs: {
      myWork: items.filter((item) => item.scopeBucket === "MY_WORK").length,
      teamWork: items.filter((item) => item.scopeBucket === "TEAM_WORK").length,
      spWork: items.filter((item) => item.scopeBucket === "SP_WORK").length,
      supervisorQueue: supervisorItems.length,
      allVisible: items.length,
    },
    summary,
    supervisorQueue: {
      items: supervisorItems,
      rejected: supervisorItems.length,
    },
    meta: {
      source: "WMS_STREAM",
      actor: {
        uid: actor.uid,
        role: actor.role,
        spId: actor.spId,
        name: actor.name,
      },
      allowedSpIds,
      updatedAt: loaded ? new Date(nowMs).toISOString() : null,
      streamLimit: WMS_DEMO_STREAM_LIMIT,
      stream,
      mode: cleanMode,
      bgoBatchId: selectedBgoBatchId || null,
    },
  };
}

// TB-R052: one live work order list per worker, role, service provider, mode and BGO batch; the worker's name
// never opens another.
function wmsWorkItemsKey(args = {}) {
  return [
    readFirstString(args?.actorUid),
    normalizeUpper(args?.actorRole),
    readFirstString(args?.actorSpId),
    normalizeUpper(args?.mode || "INDIVIDUAL"),
    readFirstString(args?.bgoBatchId, args?.batchId),
  ].join(":");
}

const wmsLiveData = createLiveDataStore();

// TB-R052: a refetch (a mutation's tag invalidation, or a manual refetch) answers with the live list's last
// data, never an empty list.
const WMS_INDIVIDUAL_ENDPOINT = "getWmsLifecycleWorkItems";
const WMS_BGO_BATCH_ENDPOINT = "getWmsBgoBatchWorkItems";

// TB-R052: the cache key of a work order entry: the endpoint and its list, so the two endpoints never share one.
export function wmsWorkItemsCacheKey(endpointName, args = {}) {
  return `${endpointName}:${wmsWorkItemsKey(args)}`;
}

function readWmsWorkItemsFor(endpointName) {
  return (args = {}) => ({
    data: wmsLiveData.read(wmsWorkItemsCacheKey(endpointName, args), EMPTY_WMS_DATA),
  });
}

// TB-R052: office work orders are read by type and state (never the newest TRNs of all workers), with the
// worker's teams and the service providers; the phone keeps the worker's, their team's and their service
// provider's. An opened BGO batch reads its own TRNs.
async function streamWmsWorkItems(
  args = {},
  { updateCachedData, cacheDataLoaded, cacheEntryRemoved, getState },
  endpointName = WMS_INDIVIDUAL_ENDPOINT,
) {
  const cleanMode = normalizeUpper(args?.mode || "INDIVIDUAL");
  const selectedBgoBatchId = readFirstString(args?.bgoBatchId, args?.batchId);
  const actorUid = readFirstString(args?.actorUid);
  const liveData = wmsLiveData.open(wmsWorkItemsCacheKey(endpointName, args));

  const latest = {
    trns: { docs: [], loaded: false, status: LIVE_STREAM_STATUS.CONNECTING },
    teams: { docs: [], loaded: false, status: LIVE_STREAM_STATUS.CONNECTING },
    serviceProviders: { docs: [], loaded: false, status: LIVE_STREAM_STATUS.CONNECTING },
  };
  const subscriptions = [];
  let active = true;
  let queueTimer = null;
  let listedTimer = null;

  const rebuild = () => {
    if (!active) return;
    const actor = getActorFromArgsOrState(args, getState);
    const parts = Object.values(latest);

    const data = liveData.publish(
      buildWmsData({
        trns: latest.trns.docs,
        teams: latest.teams.docs,
        serviceProviders: latest.serviceProviders.docs,
        actor,
        mode: cleanMode,
        bgoBatchId: selectedBgoBatchId || null,
        loaded: parts.every((part) => part.loaded),
        stream: combineLiveStatuses(parts.map((part) => part.status)),
      }),
    );
    updateCachedData(() => data);
  };

  const listenTrns = (constraints, label, onDocs, onError) =>
    listenQuery(query(collection(db, "trns"), ...constraints), label, onDocs, onError);

  // One live part of the screen: its documents, whether the server has answered them, and its status.
  const follow = (name, key, subscribe) => {
    const subscription = createFollowingSubscription({
      subscribe: (currentKey, handlers) =>
        subscribe(
          currentKey,
          (docs, meta) => {
            if (!handlers.isCurrent()) return;
            latest[name].docs = docs;
            if (meta?.fromCache !== true) latest[name].loaded = true;
            handlers.live(meta);
          },
          handlers.fail,
        ),
      onStatus: (status) => {
        latest[name].status = status;
        rebuild();
      },
    });
    subscriptions.push(subscription);
    subscription.setKey(key);
  };

  try {
    await cacheDataLoaded;

    if (cleanMode === "BGO_BUCKET" && selectedBgoBatchId) {
      const streamLimit = Number(args?.limit || WMS_DEMO_STREAM_LIMIT);
      follow("trns", `BGO:${selectedBgoBatchId}`, (_key, onDocs, onError) =>
        listenTrns(
          [
            where("bgo.batchId", "==", selectedBgoBatchId),
            firestoreLimit(streamLimit),
          ],
          "WMS_BGO_TRN",
          onDocs,
          onError,
        ),
      );
    } else {
      // Open office work orders, and finished ones from office channels only: a completed field form of the
      // same type is not an office work order and is never read. The list is read when all three have answered.
      follow("trns", "WORK_ORDERS", (_key, onDocs, onError) => {
        const byType = where("accessData.trnType", "in", WMS_LCT_TYPES);
        const fromOffice = where("origin.channel", "in", WMS_OFFICE_CHANNELS);
        const groups = {
          open: [byType, where("workflow.state", "in", WMS_OPEN_WORKFLOW_STATES)],
          completed: [byType, where("workflow.state", "==", "COMPLETED"), fromOffice],
          cancelled: [byType, where("workflow.state", "==", "CANCELLED"), fromOffice],
        };
        const names = Object.keys(groups);
        const answers = {};
        const unsubscribes = names.map((group) =>
          listenTrns(
            groups[group],
            `WMS_${group.toUpperCase()}_TRN`,
            (docs, meta) => {
              answers[group] = { docs, fromCache: meta?.fromCache === true };
              if (!names.every((name) => answers[name])) return;
              onDocs(
                names.flatMap((name) => answers[name].docs),
                { fromCache: names.some((name) => answers[name].fromCache) },
              );
            },
            onError,
          ),
        );
        return () => {
          for (const unsubscribe of unsubscribes) unsubscribe();
        };
      });

      // TB-R052: queued forms waiting on the server are confirmed from exactly their own TRNs.
      const queueTrns = createFollowingSubscription({
        subscribe: (key, handlers) =>
          listenInChunks({
            ids: idsFromKey(key),
            listen: (values, onDocs, onError) =>
              listenTrns([where(documentId(), "in", values)], "WMS_QUEUE_TRN", onDocs, onError),
            next: (docs, meta) => {
              if (!handlers.isCurrent()) return;
              handlers.live(meta);
              reconcileSubmissionQueueWithServerTrns({
                trns: docs,
                updatedByUid: "WMS_TRN_STREAM",
                updatedByUser: "WMS TRN Stream",
              })
                .then((result) => {
                  if (result?.changedCount > 0) {
                    console.log("✅ [WMS_QUEUE_RECONCILED]", result);
                  }
                })
                .catch((error) => {
                  console.log("❌ [WMS_QUEUE_RECONCILE_ERROR]", error);
                });
            },
            error: handlers.fail,
          }),
      });
      subscriptions.push(queueTrns);
      const followQueue = () => {
        if (active) queueTrns.setKey(idsKey(getPendingReconcilableTrnIds()));
      };
      followQueue();
      queueTimer = setInterval(followQueue, WMS_QUEUE_CHECK_MS);

      // TB-R052: a finished work order leaves the list 30 days after it last changed, even while nothing else changes.
      listedTimer = setInterval(rebuild, WMS_LISTED_CHECK_MS);
    }

    if (actorUid) {
      follow("teams", actorUid, listenActorTeams);
    } else {
      latest.teams = { docs: [], loaded: true, status: LIVE_STREAM_STATUS.LIVE };
    }

    follow("serviceProviders", "ALL", (_key, onDocs, onError) =>
      listenQuery(query(collection(db, "serviceProviders")), "WMS_SP", onDocs, onError),
    );
  } catch (error) {
    console.error("❌ [WMS_STREAM_SETUP_ERROR]:", error);
  }

  await cacheEntryRemoved;
  active = false;
  clearInterval(queueTimer);
  clearInterval(listedTimer);
  for (const subscription of subscriptions) subscription.stop();
  liveData.close();
}

export const lifecycleInstructionApi = createApi({
  reducerPath: "lifecycleInstructionApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["LifecycleInstruction", "WMS"],
  endpoints: (builder) => ({
    // TB-R052: the worker's office work orders stay live for up to 24 hours after the worker leaves My Work Orders.
    getWmsLifecycleWorkItems: builder.query({
      queryFn: readWmsWorkItemsFor(WMS_INDIVIDUAL_ENDPOINT),
      onCacheEntryAdded: (args, lifecycleApi) =>
        streamWmsWorkItems(args, lifecycleApi, WMS_INDIVIDUAL_ENDPOINT),
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        wmsWorkItemsCacheKey(endpointName, queryArgs),
      keepUnusedDataFor: MY_WORK_ORDERS_KEEP_SECONDS,
      providesTags: ["LifecycleInstruction", "WMS"],
    }),

    // TB-R052: the TRNs of an opened BGO batch. The three most recently opened BGO batches are kept live by
    // workOrderKeepers.js; the entry itself keeps the default short wait.
    getWmsBgoBatchWorkItems: builder.query({
      queryFn: readWmsWorkItemsFor(WMS_BGO_BATCH_ENDPOINT),
      onCacheEntryAdded: (args, lifecycleApi) =>
        streamWmsWorkItems(args, lifecycleApi, WMS_BGO_BATCH_ENDPOINT),
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        wmsWorkItemsCacheKey(endpointName, queryArgs),
      providesTags: ["LifecycleInstruction", "WMS"],
    }),

    createLifecycleInstruction: builder.mutation({
      async queryFn(payload) {
        try {
          const callable = httpsCallable(
            functions,
            "onCreateMeterLifecycleInstructionCallable",
          );

          const result = await callable(payload);

          const data = result?.data || {};

          if (!data?.success) {
            return {
              error: {
                code: data?.code || "CREATE_LIFECYCLE_INSTRUCTION_FAILED",
                message:
                  data?.message || "Could not create lifecycle instruction.",
                data,
              },
            };
          }

          return { data };
        } catch (error) {
          console.log("createLifecycleInstruction ERROR", error);

          return {
            error: {
              code: error?.code || "CREATE_LIFECYCLE_INSTRUCTION_ERROR",
              message:
                error?.message ||
                "Unexpected error creating lifecycle instruction.",
              error,
            },
          };
        }
      },
      invalidatesTags: ["LifecycleInstruction", "WMS"],
    }),

    acceptRejectLifecycleInstruction: builder.mutation({
      async queryFn(payload) {
        try {
          const callable = httpsCallable(
            functions,
            "onAcceptRejectLifecycleInstructionCallable",
          );

          const result = await callable(payload);

          const data = result?.data || {};

          if (!data?.success) {
            return {
              error: {
                code: data?.code || "ACCEPT_REJECT_LIFECYCLE_FAILED",
                message:
                  data?.message ||
                  "Could not accept or reject lifecycle instruction.",
                data,
              },
            };
          }

          return { data };
        } catch (error) {
          console.log("acceptRejectLifecycleInstruction ERROR", error);

          return {
            error: {
              code: error?.code || "ACCEPT_REJECT_LIFECYCLE_ERROR",
              message:
                error?.message ||
                "Unexpected error accepting/rejecting lifecycle instruction.",
              error,
            },
          };
        }
      },
      invalidatesTags: ["LifecycleInstruction", "WMS"],
    }),

    manageLifecycleInstruction: builder.mutation({
      async queryFn(payload) {
        try {
          const callable = httpsCallable(
            functions,
            "onManageLifecycleInstructionCallable",
          );

          const result = await callable(payload);

          const data = result?.data || {};

          if (!data?.success) {
            return {
              error: {
                code: data?.code || "MANAGE_LIFECYCLE_INSTRUCTION_FAILED",
                message:
                  data?.message || "Could not manage lifecycle instruction.",
                data,
              },
            };
          }

          return { data };
        } catch (error) {
          console.log("manageLifecycleInstruction ERROR", error);

          return {
            error: {
              code: error?.code || "MANAGE_LIFECYCLE_INSTRUCTION_ERROR",
              message:
                error?.message ||
                "Unexpected error managing lifecycle instruction.",
              error,
            },
          };
        }
      },
      invalidatesTags: ["LifecycleInstruction", "WMS"],
    }),
  }),
});

export const {
  useGetWmsLifecycleWorkItemsQuery,
  useGetWmsBgoBatchWorkItemsQuery,
  useCreateLifecycleInstructionMutation,
  useAcceptRejectLifecycleInstructionMutation,
  useManageLifecycleInstructionMutation,
} = lifecycleInstructionApi;
