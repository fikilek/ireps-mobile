import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  collection,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "../firebase";
import { appendUniqueTargetedBatchRows } from "../features/targetedBatches/targetedBatchActions";

const TARGETED_BATCH_STREAM_LIMIT = 200;
const EMPTY_TARGETED_BATCH_BUCKET_DATA = {
  buckets: [],
  summary: {
    total: 0,
    waiting: 0,
    accepted: 0,
    rejected: 0,
  },
  meta: {
    source: "TARGETED_BATCH_BUCKET_STREAM",
    updatedAt: null,
    streamLimit: TARGETED_BATCH_STREAM_LIMIT,
  },
};

function normalizeUpper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function cleanText(value, fallback = "") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function readFirstString(...values) {
  for (const value of values) {
    const clean = cleanText(value);
    if (clean) return clean;
  }

  return "";
}

function readNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;

    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return 0;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAgeSeconds(value) {
  const ms = toMillis(value);
  if (!ms) return 0;
  return Math.max(Math.floor((Date.now() - ms) / 1000), 0);
}

function getTargetedBatchTarget(batch = {}) {
  const allocation = batch?.allocation || {};
  const nestedTarget = allocation?.target || {};

  const type = normalizeUpper(allocation?.targetType || nestedTarget?.type);
  const id = cleanText(allocation?.targetId || nestedTarget?.id);
  const name = readFirstString(
    allocation?.targetName,
    nestedTarget?.name,
    nestedTarget?.title,
    id,
  );

  return {
    type,
    id,
    name: name || "NAv",
  };
}

function getTargetText(target = {}) {
  if (!target?.type || !target?.id) return "NAv";
  return `${target.type}: ${target.name || target.id}`;
}

function getAcceptanceStatus(batch = {}) {
  const explicitStatus = normalizeUpper(batch?.acceptance?.status);

  if (explicitStatus) return explicitStatus;

  if (normalizeUpper(batch?.allocation?.status) === "ALLOCATED") {
    return "WAITING";
  }

  return "NOT_READY";
}

function getCreatedAt(batch = {}) {
  return batch?.metadata?.createdAt || batch?.createdAt || null;
}

function getUpdatedAt(batch = {}) {
  return (
    batch?.metadata?.updatedAt ||
    batch?.updatedAt ||
    getCreatedAt(batch)
  );
}

function getTargetedBatchCounts(batch = {}) {
  const counts = batch?.counts || {};
  const total = readNumber(
    counts?.totalRows,
    counts?.acceptedRows,
    batch?.creation?.expectedRows,
  );
  const started = readNumber(
    counts?.executionStartedRows,
    counts?.inProgressRows,
  );
  const completed = readNumber(counts?.completedRows);
  const inProgress = Math.max(started - completed, 0);
  const allocated = readNumber(counts?.allocatedRows);
  const unallocated = readNumber(
    counts?.unallocatedRows,
    Math.max(total - allocated, 0),
  );

  return {
    total,
    allocated,
    unallocated,
    notStarted: Math.max(total - started, 0),
    inProgress,
    completed,
  };
}

function normalizeTargetedBatchBucket(batch = {}) {
  const id = cleanText(batch?.id, "NAv");
  const target = getTargetedBatchTarget(batch);
  const acceptanceStatus = getAcceptanceStatus(batch);
  const allocationStatus = normalizeUpper(batch?.allocation?.status);
  const executionStatus = normalizeUpper(
    batch?.execution?.status || "NOT_STARTED",
  );
  const counts = getTargetedBatchCounts(batch);
  const createdAt = getCreatedAt(batch);
  const updatedAt = getUpdatedAt(batch);
  const executionStartedRows = readNumber(
    batch?.counts?.executionStartedRows,
  );
  const executionStarted =
    executionStatus !== "NOT_STARTED" ||
    Boolean(batch?.execution?.startedAt) ||
    executionStartedRows > 0;
  const waitingDecision =
    allocationStatus === "ALLOCATED" &&
    acceptanceStatus === "WAITING" &&
    !executionStarted;

  const selectionReason = readFirstString(
    batch?.selection?.reason,
    batch?.source?.label,
    "Sales targeted field work",
  );
  const sourceLabel = readFirstString(
    batch?.source?.fileName,
    batch?.source?.label,
    batch?.source?.type,
  );

  return {
    id,
    bucketType: "TBB",
    itemKind: "TARGETED_BATCH",
    title: "Targeted Batch",
    subtitle: sourceLabel
      ? `${selectionReason} • ${sourceLabel}`
      : selectionReason,

    status: normalizeUpper(batch?.status),
    acceptanceStatus,
    allocationStatus,
    executionStatus,

    target,
    targetText: getTargetText(target),
    scope: batch?.scope || {},
    selection: batch?.selection || {},
    source: batch?.source || {},
    counts,
    totalRows: counts.total,

    createdAt,
    updatedAt,
    ageSeconds: getAgeSeconds(createdAt),

    permissions: {
      canAccept: waitingDecision,
      canReject: waitingDecision,
      canViewRows:
        allocationStatus === "ALLOCATED" &&
        acceptanceStatus === "ACCEPTED",
    },

    raw: batch,
  };
}

function buildTargetedBatchBucketData({
  batches = [],
  streamLimit = TARGETED_BATCH_STREAM_LIMIT,
}) {
  const buckets = batches
    .map(normalizeTargetedBatchBucket)
    .filter((bucket) => bucket?.allocationStatus === "ALLOCATED")
    .sort(
      (a, b) =>
        toMillis(b.updatedAt || b.createdAt) -
        toMillis(a.updatedAt || a.createdAt),
    );

  const summary = buckets.reduce(
    (acc, bucket) => {
      acc.total += 1;

      if (bucket.acceptanceStatus === "WAITING") acc.waiting += 1;
      if (bucket.acceptanceStatus === "ACCEPTED") acc.accepted += 1;
      if (bucket.acceptanceStatus === "REJECTED") acc.rejected += 1;

      return acc;
    },
    {
      total: 0,
      waiting: 0,
      accepted: 0,
      rejected: 0,
    },
  );

  return {
    buckets,
    summary,
    meta: {
      source: "TARGETED_BATCH_BUCKET_STREAM",
      updatedAt: new Date().toISOString(),
      streamLimit,
    },
  };
}

function normalizeTargetedBatchRow(row = {}) {
  const refs = row?.refs || {};
  const executionStatus = normalizeUpper(
    row?.execution?.status || "NOT_STARTED",
  );

  return {
    id: cleanText(row?.id, "NAv"),
    tbId: cleanText(row?.tbId),
    rowNo: readNumber(row?.rowNo),
    erfId: cleanText(refs?.erfId),
    erfNo: readFirstString(
      row?.property?.erfNo,
      row?.erf?.erfNo,
      row?.erfNo,
    ),
    premiseId: cleanText(refs?.premiseId),
    meterId: cleanText(refs?.meterId),
    trnId: cleanText(refs?.trnId),
    salesDocId: cleanText(row?.salesDocId) || null,
    noAccessCount:
      row?.noAccessCount === null ? null : Number(row?.noAccessCount || 0),
    noAccessSourceStatus: normalizeUpper(row?.noAccessSourceStatus),

    meterNo: readFirstString(
      row?.meter?.numberRaw,
      row?.meter?.numberNormalized,
      row?.salesAllMeterId,
      "NAv",
    ),
    accountNumber: readFirstString(
      row?.customer?.accountNumber,
      "NAv",
    ),
    customerName: readFirstString(
      row?.customer?.customerName,
      "NAv",
    ),
    address: readFirstString(
      row?.location?.addressLine1,
      row?.location?.town,
      "NAv",
    ),
    town: readFirstString(row?.location?.town, "NAv"),
    sgCode: readFirstString(row?.location?.sgCode, "NAv"),
    wardNumberLabel: readFirstString(
      row?.location?.wardNumberLabel,
      "NAv",
    ),

    allocationStatus: normalizeUpper(row?.allocation?.status),
    executionStatus,
    executionOutcome: cleanText(row?.execution?.outcome),
    scope: row?.scope || {},
    refs,
    raw: row,
  };
}

export function buildTargetedBatchRowsData({
  tbId,
  rows = [],
  streamLimit = null,
  pagination = {},
  diagnostics = {},
}) {
  const normalizedRows = rows
    .map(normalizeTargetedBatchRow)
    .sort((a, b) => {
      const rowDifference = Number(a?.rowNo || 0) - Number(b?.rowNo || 0);
      if (rowDifference !== 0) return rowDifference;

      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });

  const summary = normalizedRows.reduce(
    (acc, row) => {
      acc.total += 1;

      if (row.executionStatus === "COMPLETED") {
        acc.completed += 1;
      } else if (row.executionStatus === "IN_PROGRESS") {
        acc.inProgress += 1;
      } else {
        acc.notStarted += 1;
      }

      return acc;
    },
    {
      total: 0,
      notStarted: 0,
      inProgress: 0,
      completed: 0,
    },
  );

  return {
    rows: normalizedRows,
    summary,
    meta: {
      source: "TARGETED_BATCH_ROWS_CALLABLE",
      updatedAt: new Date().toISOString(),
      tbId,
      streamLimit,
    },
    pagination: {
      limit: Number(pagination?.limit || streamLimit || 0),
      hasMore: pagination?.hasMore === true,
      nextCursor: pagination?.nextCursor || null,
    },
    diagnostics,
  };
}

export const targetedBatchApi = createApi({
  reducerPath: "targetedBatchApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["TargetedBatch"],
  endpoints: (builder) => ({
    getTargetedBatchBuckets: builder.query({
      queryFn() {
        return { data: EMPTY_TARGETED_BATCH_BUCKET_DATA };
      },

      async onCacheEntryAdded(
        args = {},
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) {
        /* eslint-disable no-unreachable */
        let unsubscribeTargetedBatches = () => {};

        try {
          await cacheDataLoaded;

          const streamLimit = Number(
            args?.limit || TARGETED_BATCH_STREAM_LIMIT,
          );

          const targetedBatchQuery = query(
            collection(db, "tb_uploads"),
            orderBy("metadata.createdAt", "desc"),
            firestoreLimit(streamLimit),
          );

          unsubscribeTargetedBatches = onSnapshot(
            targetedBatchQuery,
            (snapshot) => {
              const batches = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }));

              updateCachedData(() =>
                buildTargetedBatchBucketData({
                  batches,
                  streamLimit,
                }),
              );
            },
            (error) => {
              console.error(
                "❌ [TARGETED_BATCH_BUCKET_STREAM_ERROR]:",
                error,
              );
            },
          );
        } catch (error) {
          console.error(
            "❌ [TARGETED_BATCH_BUCKET_STREAM_SETUP_ERROR]:",
            error,
          );
        }

        await cacheEntryRemoved;
        unsubscribeTargetedBatches();
      },
      providesTags: ["TargetedBatch"],
    }),

    getTargetedBatchRows: builder.query({
      async queryFn(args = {}) {
        try {
          const tbId = cleanText(args?.tbId);
          if (!tbId) return { error: { code: "TARGETED_BATCH_ID_REQUIRED", message: "Targeted Batch is required." } };
          const pageLimit = Number(args?.limit || 100);
          const callable = httpsCallable(functions, "getTargetedBatchRowsCallable");
          const result = await callable({ tbId, limit: pageLimit, cursor: args?.cursor || null });
          const data = result?.data || {};
          if (!data?.success) return { error: { code: data?.code || "TARGETED_BATCH_ROWS_FAILED", message: data?.message || "Could not load Targeted Batch rows." } };
          return { data: buildTargetedBatchRowsData({ tbId, rows: data.rows, streamLimit: pageLimit, pagination: data.pagination, diagnostics: data.diagnostics }) };
        } catch (error) {
          console.log("getTargetedBatchRowsCallable ERROR", { code: error?.code, message: error?.message });
          return { error: { code: error?.code || "TARGETED_BATCH_ROWS_ERROR", message: error?.message || "Could not load Targeted Batch rows." } };
        }
      },

      async onCacheEntryAdded(
        args = {},
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) {
        // Rows are callable-backed. Keep this lifecycle only to preserve the
        // existing endpoint shape while the cache entry remains subscribed.
        await cacheEntryRemoved;
        return;
        /* c8 ignore start -- retired direct listener retained temporarily */
        let unsubscribeRows = () => {};

        try {
          await cacheDataLoaded;

          const tbId = cleanText(args?.tbId);
          const streamLimit = Number(args?.limit || 0);

          if (!tbId) {
            await cacheEntryRemoved;
            return;
          }

          const rowsQuery =
            streamLimit > 0
              ? query(
                  collection(db, "tb_rows"),
                  where("tbId", "==", tbId),
                  firestoreLimit(streamLimit),
                )
              : query(
                  collection(db, "tb_rows"),
                  where("tbId", "==", tbId),
                );

          unsubscribeRows = onSnapshot(
            rowsQuery,
            (snapshot) => {
              const rows = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }));

              updateCachedData(() =>
                buildTargetedBatchRowsData({
                  tbId,
                  rows,
                  streamLimit,
                }),
              );
            },
            (error) => {
              console.error(
                "❌ [TARGETED_BATCH_ROWS_STREAM_ERROR]:",
                error,
              );
            },
          );
        } catch (error) {
          console.error(
            "❌ [TARGETED_BATCH_ROWS_STREAM_SETUP_ERROR]:",
            error,
          );
        }

        await cacheEntryRemoved;
        unsubscribeRows();
        /* c8 ignore stop */
        /* eslint-enable no-unreachable */
      },
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}:${cleanText(queryArgs?.tbId)}`,
      merge(currentCache, newPage, { arg }) {
        if (!arg?.cursor) return newPage;
        const rows = appendUniqueTargetedBatchRows(currentCache?.rows, newPage?.rows);
        Object.assign(currentCache, buildTargetedBatchRowsData({ tbId: arg.tbId, rows, streamLimit: arg.limit, pagination: newPage.pagination, diagnostics: newPage.diagnostics }));
      },
      forceRefetch({ currentArg, previousArg }) {
        return JSON.stringify(currentArg?.cursor || null) !== JSON.stringify(previousArg?.cursor || null) || currentArg?.reloadKey !== previousArg?.reloadKey;
      },
      providesTags: ["TargetedBatch"],
    }),

    acceptRejectTargetedBatch: builder.mutation({
      async queryFn(payload = {}) {
        try {
          const callable = httpsCallable(
            functions,
            "onAcceptRejectTargetedBatchCallable",
          );

          const result = await callable(payload);
          const data = result?.data || {};

          if (!data?.success) {
            return {
              error: {
                code:
                  data?.code ||
                  "ACCEPT_REJECT_TARGETED_BATCH_FAILED",
                message:
                  data?.message ||
                  "Could not accept/reject Targeted Batch.",
                data,
              },
            };
          }

          return { data };
        } catch (error) {
          console.log("acceptRejectTargetedBatch ERROR", error);

          return {
            error: {
              code:
                error?.code ||
                "ACCEPT_REJECT_TARGETED_BATCH_ERROR",
              message:
                error?.message ||
                "Unexpected error accepting/rejecting Targeted Batch.",
              error,
            },
          };
        }
      },
      invalidatesTags: ["TargetedBatch"],
    }),
  }),
});

export const {
  useGetTargetedBatchBucketsQuery,
  useGetTargetedBatchRowsQuery,
  useAcceptRejectTargetedBatchMutation,
} = targetedBatchApi;
