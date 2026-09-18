import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { listenActorTeams, listenWhereIn } from "./firestoreListeners";
import {
  LIVE_STREAM_STATUS,
  MY_WORK_ORDERS_KEEP_SECONDS,
  createLiveDataStore,
  followActorAllocatedDocuments,
} from "./liveSubscription";

// TB-R052: one live BGO batch list per worker and service provider.
const bgoBucketKey = (args = {}) =>
  `${String(args?.actorUid || "").trim()}:${String(args?.actorSpId || "").trim()}`;
const bgoBucketLiveData = createLiveDataStore();

const BGO_STREAM_LIMIT = 200;

const BGO_RELEASE_STATES = {
  WAITING: "WAITING_BATCH_ACCEPTANCE",
  RELEASED: "RELEASED_TO_EXECUTION",
  REJECTED: "BATCH_REJECTED",
};

const EMPTY_BGO_BUCKET_DATA = {
  buckets: [],
  summary: {
    total: 0,
    waiting: 0,
    released: 0,
    rejected: 0,
    cancelled: 0,
  },
  meta: {
    source: "BGO_BUCKET_STREAM",
    updatedAt: null,
    streamLimit: BGO_STREAM_LIMIT,
    stream: LIVE_STREAM_STATUS.CONNECTING,
    actorTeamIds: [],
  },
};

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function cleanText(value, fallback = "NAv") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCreatedAt(batch = {}) {
  return batch?.metadata?.createdAt || batch?.createdAt || null;
}

function getUpdatedAt(batch = {}) {
  return batch?.metadata?.updatedAt || batch?.updatedAt || getCreatedAt(batch);
}

function getAgeSeconds(value) {
  const ms = toMillis(value);
  if (!ms) return 0;
  return Math.max(Math.floor((Date.now() - ms) / 1000), 0);
}

function normalizeTarget(target = {}) {
  return {
    type: normalizeUpper(target?.type),
    id: String(target?.id || "").trim(),
    name: cleanText(target?.name || target?.title || target?.id),
  };
}

function getBatchTarget(batch = {}) {
  const assignmentTargets = safeArray(batch?.assignment?.targets);
  const firstAssignmentTarget = assignmentTargets[0] || null;

  return normalizeTarget(
    firstAssignmentTarget ||
      batch?.target ||
      batch?.bgo?.target ||
      batch?.refs?.target ||
      {},
  );
}

function getTargetText(target = {}) {
  if (!target?.type || !target?.id) return "NAv";
  return `${target.type}: ${target.name || target.id}`;
}

function normalizeGeofenceRef(ref = {}) {
  const id = String(ref?.id || ref?.geofenceId || ref?.geoFenceId || "").trim();
  const name = String(ref?.name || ref?.label || ref?.description || id).trim();

  if (!id) {
    return {
      id: "NAv",
      name: "NAv",
    };
  }

  return {
    id,
    name: name || id,
  };
}

function getBatchGeofenceRef(batch = {}) {
  const geofenceRefs = safeArray(batch?.geofenceRefs);

  return normalizeGeofenceRef(
    batch?.geofenceRef ||
      batch?.bgo?.geofenceRef ||
      batch?.geofence ||
      batch?.refs?.geofenceRef ||
      geofenceRefs[0] ||
      {},
  );
}

function getBatchTrnType(batch = {}) {
  return normalizeUpper(
    batch?.operationType ||
      batch?.accessData?.trnType ||
      batch?.bgo?.trnType ||
      batch?.assignment?.instruction?.code ||
      batch?.trnType ||
      "",
  );
}

function getBatchTrnCode(batch = {}) {
  return normalizeUpper(
    batch?.trnCode ||
      batch?.operationCode ||
      batch?.bgo?.trnCode ||
      batch?.summary?.trnCode ||
      "",
  );
}

function getTrnTypeLabel(trnType = "") {
  switch (normalizeUpper(trnType)) {
    case "METER_INSPECTION":
      return "Bulk Inspection Batch";
    case "METER_DISCONNECTION":
      return "Bulk Disconnection Batch";
    case "METER_RECONNECTION":
      return "Bulk Reconnection Batch";
    case "METER_REMOVAL":
      return "Bulk Removal Batch";
    case "METER_READING":
      return "Bulk Meter Reading Batch";
    case "METER_DISCOVERY":
      return "Bulk Discovery Batch";
    case "METER_INSTALLATION":
      return "Bulk Installation Batch";
    default:
      return trnType || "Bulk Geofence Batch";
  }
}

function getBatchWorkflowState(batch = {}) {
  return normalizeUpper(batch?.workflow?.state || batch?.workflowState);
}

function getBatchReleaseState(batch = {}) {
  return normalizeUpper(batch?.bgo?.releaseState || batch?.releaseState);
}

function isBmdBgoBatch(batch = {}) {
  const batchMode = normalizeUpper(batch?.bgo?.batchMode);
  const operationType = normalizeUpper(batch?.operationType);
  const sourceModule = normalizeUpper(batch?.origin?.sourceModule);
  const createsChildTrnsUpfront = batch?.bgo?.createsChildTrnsUpfront;

  return (
    batchMode === "BMD" ||
    sourceModule === "BULK_METER_DISCOVERY" ||
    (operationType === "METER_DISCOVERY" && createsChildTrnsUpfront === false)
  );
}

function getBmdWorklistCount(batch = {}) {
  const worklistCount = Array.isArray(batch?.worklist?.erfRefs)
    ? batch.worklist.erfRefs.length
    : 0;

  return readNumber(
    batch?.summary?.erfCount,
    batch?.summary?.totalRows,
    batch?.batchReleaseSummary?.totalRows,
    worklistCount,
  );
}

function getBatchTrnIds(batch = {}) {
  return [
    ...new Set(
      [
        ...safeArray(batch?.trnIds),
        ...safeArray(batch?.refs?.trnIds),
        ...safeArray(batch?.bgo?.trnIds),
        ...safeArray(batch?.childTrnIds),
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
}

function readOptionalNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function readNumber(...values) {
  const number = readOptionalNumber(...values);
  return number === null ? 0 : number;
}

function hasDerivedExecutionSummary(summary = {}) {
  return [
    "totalChildTrns",
    "totalTrns",
    "totalIssued",
    "totalAccepted",
    "totalInProgress",
    "totalCompleted",
    "totalCancelled",
    "totalRejected",
    "totalNotExecuted",
    "totalSuccess",
    "totalNoAccess",
    "totalNoReading",
    "totalUnsuccessful",
  ].some((key) => readOptionalNumber(summary?.[key]) !== null);
}

function getBatchCounts(batch = {}, trnIds = []) {
  const derivedExecutionSummary = batch?.derivedExecutionSummary || {};
  const batchReleaseSummary = batch?.batchReleaseSummary || {};
  const summary = batch?.summary || {};
  const counts = batch?.counts || {};
  const bgoSummary = batch?.bgo?.summary || {};
  const workflowState = getBatchWorkflowState(batch);
  const releaseState = getBatchReleaseState(batch);
  const hasDerivedSummary = hasDerivedExecutionSummary(derivedExecutionSummary);
  const isBmdBatch = isBmdBgoBatch(batch);

  if (isBmdBatch) {
    const totalErfs = getBmdWorklistCount(batch);
    const totalPremises = readNumber(batch?.summary?.premiseCount);
    const totalMeters = readNumber(batch?.summary?.meterCount);
    const discoveryTrns = readNumber(
      derivedExecutionSummary?.totalChildTrns,
      batch?.summary?.totalChildTrns,
      batch?.summary?.totalTrnsCreated,
      batchReleaseSummary?.totalTrnsCreated,
      trnIds.length,
    );
    const completed = readNumber(derivedExecutionSummary?.totalCompleted);
    const success = readNumber(derivedExecutionSummary?.totalSuccess);
    const noAccess = readNumber(derivedExecutionSummary?.totalNoAccess);
    const noReading = readNumber(derivedExecutionSummary?.totalNoReading);
    const rejected =
      workflowState === "REJECTED" || releaseState === BGO_RELEASE_STATES.REJECTED
        ? totalErfs
        : readNumber(derivedExecutionSummary?.totalRejected);
    const cancelled =
      workflowState === "CANCELLED"
        ? totalErfs
        : readNumber(derivedExecutionSummary?.totalCancelled);
    const waiting = releaseState === BGO_RELEASE_STATES.WAITING ? totalErfs : 0;
    const accepted =
      workflowState === "ACCEPTED" && releaseState === BGO_RELEASE_STATES.RELEASED
        ? totalErfs
        : 0;

    return {
      total: totalErfs,
      waiting,
      accepted,
      inProgress: readNumber(derivedExecutionSummary?.totalInProgress),
      completed,
      executed: completed,
      rejected,
      cancelled,
      notExecuted: Math.max(totalErfs - completed - rejected - cancelled, 0),
      success,
      noAccess,
      noReading,
      unsuccessful: noAccess + noReading,
      erfs: totalErfs,
      premises: totalPremises,
      meters: totalMeters,
      discoveryTrns,
      summarySource: "bmdBatchSummary",
    };
  }

  const fallbackTotal = readNumber(
    batchReleaseSummary?.totalTrnsCreated,
    batchReleaseSummary?.totalChildTrns,
    batchReleaseSummary?.totalRows,
    summary?.totalTrns,
    summary?.totalTrnsCreated,
    summary?.totalChildTrns,
    summary?.trnCount,
    summary?.rowCount,
    summary?.totalRows,
    counts?.total,
    counts?.totalTrns,
    counts?.totalTrnsCreated,
    counts?.trnCount,
    counts?.rowCount,
    bgoSummary?.totalTrns,
    bgoSummary?.totalTrnsCreated,
    bgoSummary?.totalChildTrns,
    bgoSummary?.trnCount,
    bgoSummary?.rowCount,
    batch?.totalTrns,
    batch?.trnCount,
    batch?.rowCount,
    trnIds.length,
  );

  // IMPORTANT:
  // BGOB landing cards must be summary-first. If the backend has stamped
  // derivedExecutionSummary, execution stats come from that object only.
  // Release/current-design fields remain fallback only for old or just-created
  // batches where derivedExecutionSummary has not been stamped yet.
  const total = hasDerivedSummary
    ? readNumber(
        derivedExecutionSummary?.totalChildTrns,
        derivedExecutionSummary?.totalTrns,
        fallbackTotal,
      )
    : fallbackTotal;

  const completed = hasDerivedSummary
    ? readNumber(derivedExecutionSummary?.totalCompleted)
    : readNumber(
        counts?.executed,
        counts?.completedCount,
        counts?.completed,
        counts?.totalCompleted,
        summary?.completedCount,
        summary?.completed,
        summary?.totalCompleted,
        bgoSummary?.completedCount,
        bgoSummary?.completed,
        bgoSummary?.totalCompleted,
      );

  const inProgress = hasDerivedSummary
    ? readNumber(derivedExecutionSummary?.totalInProgress)
    : readNumber(
        counts?.inProgressCount,
        counts?.inProgress,
        counts?.totalInProgress,
        summary?.inProgressCount,
        summary?.inProgress,
        summary?.totalInProgress,
        bgoSummary?.inProgressCount,
        bgoSummary?.inProgress,
        bgoSummary?.totalInProgress,
      );

  const rejectedFromData = hasDerivedSummary
    ? readNumber(derivedExecutionSummary?.totalRejected)
    : readNumber(
        counts?.rejectedCount,
        counts?.rejected,
        counts?.totalRejected,
        summary?.rejectedCount,
        summary?.rejected,
        summary?.totalRejected,
        batchReleaseSummary?.totalRejectedAtBatch,
        bgoSummary?.rejectedCount,
        bgoSummary?.rejected,
        bgoSummary?.totalRejected,
      );

  const rejected =
    workflowState === "REJECTED" || releaseState === BGO_RELEASE_STATES.REJECTED
      ? rejectedFromData || total
      : rejectedFromData;

  const cancelled = hasDerivedSummary
    ? readNumber(derivedExecutionSummary?.totalCancelled)
    : readNumber(
        counts?.cancelledCount,
        counts?.cancelled,
        counts?.totalCancelled,
        summary?.cancelledCount,
        summary?.cancelled,
        summary?.totalCancelled,
        batchReleaseSummary?.totalCancelledAtBatch,
        bgoSummary?.cancelledCount,
        bgoSummary?.cancelled,
        bgoSummary?.totalCancelled,
      );

  const waitingFromData = hasDerivedSummary
    ? readNumber(
        derivedExecutionSummary?.totalWaitingBatchAcceptance,
        derivedExecutionSummary?.totalWaiting,
        derivedExecutionSummary?.totalIssued,
      )
    : readNumber(
        batchReleaseSummary?.totalWaitingBatchAcceptance,
        summary?.waitingCount,
        summary?.waiting,
        summary?.totalWaitingBatchAcceptance,
        counts?.waitingCount,
        counts?.waiting,
        counts?.totalWaitingBatchAcceptance,
        bgoSummary?.waitingCount,
        bgoSummary?.waiting,
        bgoSummary?.totalWaitingBatchAcceptance,
      );

  const waiting =
    releaseState === BGO_RELEASE_STATES.WAITING
      ? waitingFromData || total
      : 0;

  const acceptedFromData = hasDerivedSummary
    ? readOptionalNumber(derivedExecutionSummary?.totalAccepted)
    : readOptionalNumber(
        counts?.acceptedCount,
        counts?.accepted,
        counts?.totalAccepted,
        summary?.acceptedCount,
        summary?.accepted,
        summary?.totalAccepted,
        batchReleaseSummary?.totalAcceptedForExecution,
        batchReleaseSummary?.totalReleased,
        summary?.totalReleased,
        counts?.totalReleased,
        bgoSummary?.acceptedCount,
        bgoSummary?.accepted,
        bgoSummary?.totalAccepted,
        bgoSummary?.totalReleased,
      );

  const accepted =
    acceptedFromData !== null
      ? acceptedFromData
      : workflowState === "ACCEPTED" && releaseState === BGO_RELEASE_STATES.RELEASED
        ? Math.max(total - inProgress - completed - rejected - cancelled, 0)
        : 0;

  const success = hasDerivedSummary
    ? readNumber(derivedExecutionSummary?.totalSuccess)
    : readNumber(
        counts?.success,
        counts?.successful,
        counts?.totalSuccess,
        summary?.success,
        summary?.successful,
        summary?.totalSuccess,
        bgoSummary?.success,
        bgoSummary?.successful,
        bgoSummary?.totalSuccess,
      );

  const noAccess = hasDerivedSummary
    ? readNumber(derivedExecutionSummary?.totalNoAccess)
    : readNumber(
        counts?.noAccess,
        counts?.totalNoAccess,
        summary?.noAccess,
        summary?.totalNoAccess,
        bgoSummary?.noAccess,
        bgoSummary?.totalNoAccess,
      );

  const noReading = hasDerivedSummary
    ? readNumber(derivedExecutionSummary?.totalNoReading)
    : readNumber(
        counts?.noReading,
        counts?.totalNoReading,
        summary?.noReading,
        summary?.totalNoReading,
        bgoSummary?.noReading,
        bgoSummary?.totalNoReading,
      );

  const notExecuted = hasDerivedSummary
    ? readNumber(
        derivedExecutionSummary?.totalNotExecuted,
        accepted + inProgress + waiting,
        Math.max(total - completed - rejected - cancelled, 0),
      )
    : readNumber(
        counts?.notExecuted,
        counts?.totalNotExecuted,
        summary?.notExecuted,
        summary?.totalNotExecuted,
        accepted + inProgress + waiting,
      );

  const unsuccessful = hasDerivedSummary
    ? readNumber(
        derivedExecutionSummary?.totalUnsuccessful,
        noAccess + noReading,
        Math.max(completed - success, 0),
      )
    : readNumber(
        counts?.unsuccessful,
        counts?.totalUnsuccessful,
        summary?.unsuccessful,
        summary?.totalUnsuccessful,
        noAccess + noReading,
        Math.max(completed - success, 0),
      );

  return {
    total,
    waiting,
    accepted,
    inProgress,
    completed,
    executed: completed,
    rejected,
    cancelled,
    notExecuted,
    success,
    noAccess,
    noReading,
    unsuccessful,
    summarySource: hasDerivedSummary ? "derivedExecutionSummary" : "batchFallback",
  };
}

function getIssuedBy(batch = {}) {
  return {
    uid: cleanText(batch?.metadata?.createdByUid || batch?.issuedBy?.uid, null),
    name: cleanText(
      batch?.metadata?.createdByUser ||
        batch?.issuedBy?.name ||
        batch?.assignment?.issuedByUser,
    ),
  };
}

function normalizeBgoBucket(batch = {}) {
  const id = batch?.id || "NAv";
  const trnType = getBatchTrnType(batch);
  const trnCode = getBatchTrnCode(batch);
  const workflowState = getBatchWorkflowState(batch);
  const releaseState = getBatchReleaseState(batch);
  const target = getBatchTarget(batch);
  const geofenceRef = getBatchGeofenceRef(batch);
  const trnIds = getBatchTrnIds(batch);
  const counts = getBatchCounts(batch, trnIds);
  const createdAt = getCreatedAt(batch);
  const updatedAt = getUpdatedAt(batch);
  const isBmdBgo = isBmdBgoBatch(batch);

  return {
    id,
    bucketType: "BGOB",
    itemKind: "BGO_BATCH",
    title: isBmdBgo ? "Bulk Meter Discovery" : getTrnTypeLabel(trnType),
    subtitle: isBmdBgo
      ? `${geofenceRef?.name || "MD-BGO"} • ${counts.erfs || 0} ERFs`
      : geofenceRef?.name || "Bulk Geofence Batch",
    trnType,
    trnCode,
    trnTypeLabel: getTrnTypeLabel(trnType),

    workflowState,
    releaseState,
    hiddenUntilBatchAccepted: batch?.bgo?.hiddenUntilBatchAccepted === true,
    isBmdBgo,
    batchMode: isBmdBgo ? "BMD" : normalizeUpper(batch?.bgo?.batchMode),
    workUnitLabel: isBmdBgo ? "ERFs" : "TRNs",

    target,
    targetText: getTargetText(target),
    geofenceRef,
    geofenceName: geofenceRef?.name || "NAv",
    geofenceId: geofenceRef?.id || "NAv",

    counts,
    totalTrns: counts.total,
    childTrnIds: trnIds,

    tcId: readFirstString(batch?.tcId, batch?.bgo?.tcId, batch?.refs?.tcId),
    tcUploadId: readFirstString(
      batch?.tcUploadId,
      batch?.bgo?.tcUploadId,
      batch?.refs?.tcUploadId,
      batch?.tcId,
    ),

    issuedBy: getIssuedBy(batch),
    issuedAt: createdAt,
    updatedAt,
    ageSeconds: getAgeSeconds(createdAt),

    permissions: {
      canAccept:
        workflowState === "ISSUED" &&
        releaseState === BGO_RELEASE_STATES.WAITING,
      canReject:
        workflowState === "ISSUED" &&
        releaseState === BGO_RELEASE_STATES.WAITING,
      canViewTrns:
        !isBmdBgo &&
        workflowState === "ACCEPTED" &&
        releaseState === BGO_RELEASE_STATES.RELEASED,
      canViewErfs:
        isBmdBgo &&
        workflowState === "ACCEPTED" &&
        releaseState === BGO_RELEASE_STATES.RELEASED,
      canReverseAcceptance:
        !isBmdBgo &&
        workflowState === "ACCEPTED" &&
        releaseState === BGO_RELEASE_STATES.RELEASED,
    },

    raw: batch,
  };
}

// TB-R052: updatedAt is set once the worker's BGO batches have been read; stream says whether the live list is
// connecting, live or failed; actorTeamIds are the teams the batches were read for.
function buildBgoBucketData({
  batches = [],
  streamLimit = BGO_STREAM_LIMIT,
  loaded = true,
  stream = LIVE_STREAM_STATUS.LIVE,
  actorTeamIds = [],
}) {
  const buckets = batches
    .map(normalizeBgoBucket)
    .sort(
      (a, b) =>
        toMillis(b.updatedAt || b.issuedAt) -
        toMillis(a.updatedAt || a.issuedAt),
    );

  const summary = buckets.reduce(
    (acc, bucket) => {
      acc.total += 1;

      if (bucket.releaseState === BGO_RELEASE_STATES.WAITING) {
        acc.waiting += 1;
      } else if (bucket.releaseState === BGO_RELEASE_STATES.RELEASED) {
        acc.released += 1;
      } else if (bucket.releaseState === BGO_RELEASE_STATES.REJECTED) {
        acc.rejected += 1;
      } else if (bucket.workflowState === "CANCELLED") {
        acc.cancelled += 1;
      }

      return acc;
    },
    {
      total: 0,
      waiting: 0,
      released: 0,
      rejected: 0,
      cancelled: 0,
    },
  );

  return {
    buckets,
    summary,
    meta: {
      source: "BGO_BUCKET_STREAM",
      updatedAt: loaded ? new Date().toISOString() : null,
      streamLimit,
      stream,
      actorTeamIds,
    },
  };
}

export const bgoApi = createApi({
  reducerPath: "bgoApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["BGO"],
  endpoints: (builder) => ({
    getBgoBuckets: builder.query({
      // TB-R052: a refetch answers with the live list's last data, never an empty list.
      queryFn(args = {}) {
        return { data: bgoBucketLiveData.read(bgoBucketKey(args), EMPTY_BGO_BUCKET_DATA) };
      },

      // TB-R052: only the BGO batches assigned to the worker, their teams or their service provider are read,
      // and the live list is kept for up to 24 hours after the worker leaves My Work Orders.
      async onCacheEntryAdded(
        args = {},
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) {
        let stopBgoBatches = () => {};
        const liveData = bgoBucketLiveData.open(bgoBucketKey(args));

        try {
          await cacheDataLoaded;

          stopBgoBatches = followActorAllocatedDocuments({
            uid: args?.actorUid,
            spId: args?.actorSpId,
            includeUid: true,
            listenTeams: listenActorTeams,
            listenAllocated: (values, onDocs, onError) =>
              listenWhereIn(
                {
                  collectionName: "bgo_batches",
                  field: "bgo.targetId",
                  values,
                  label: "BGO_BUCKET",
                },
                onDocs,
                onError,
              ),
            onChange: ({ docs, loaded, stream, teamIds }) => {
              const data = liveData.publish(
                buildBgoBucketData({
                  batches: docs,
                  loaded,
                  stream,
                  actorTeamIds: teamIds,
                }),
              );
              updateCachedData(() => data);
            },
          });
        } catch (error) {
          console.error("❌ [BGO_BUCKET_STREAM_SETUP_ERROR]:", error);
        }

        await cacheEntryRemoved;
        stopBgoBatches();
        liveData.close();
      },
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}:${bgoBucketKey(queryArgs)}`,
      keepUnusedDataFor: MY_WORK_ORDERS_KEEP_SECONDS,
      providesTags: ["BGO"],
    }),

    acceptRejectBgoBatch: builder.mutation({
      async queryFn(payload) {
        try {
          const callable = httpsCallable(
            functions,
            "onAcceptRejectBgoBatchCallable",
          );

          const result = await callable(payload);
          const data = result?.data || {};

          if (!data?.success) {
            return {
              error: {
                code: data?.code || "ACCEPT_REJECT_BGO_BATCH_FAILED",
                message:
                  data?.message || "Could not accept/reject BGO batch.",
                data,
              },
            };
          }

          return { data };
        } catch (error) {
          console.log("acceptRejectBgoBatch ERROR", error);

          return {
            error: {
              code: error?.code || "ACCEPT_REJECT_BGO_BATCH_ERROR",
              message:
                error?.message ||
                "Unexpected error accepting/rejecting BGO batch.",
              error,
            },
          };
        }
      },
      invalidatesTags: ["BGO"],
    }),

    reverseBgoBatchAcceptance: builder.mutation({
      async queryFn(payload) {
        try {
          const callable = httpsCallable(
            functions,
            "onReverseBgoBatchAcceptanceCallable",
          );

          const result = await callable(payload);
          const data = result?.data || {};

          if (!data?.success) {
            return {
              error: {
                code: data?.code || "REVERSE_BGO_ACCEPTANCE_FAILED",
                message:
                  data?.message || "Could not reverse BGO batch acceptance.",
                data,
              },
            };
          }

          return { data };
        } catch (error) {
          console.log("reverseBgoBatchAcceptance ERROR", error);

          return {
            error: {
              code: error?.code || "REVERSE_BGO_ACCEPTANCE_ERROR",
              message:
                error?.message ||
                "Unexpected error reversing BGO batch acceptance.",
              error,
            },
          };
        }
      },
      invalidatesTags: ["BGO"],
    }),
  }),
});

export const {
  useGetBgoBucketsQuery,
  useAcceptRejectBgoBatchMutation,
  useReverseBgoBatchAcceptanceMutation,
} = bgoApi;
