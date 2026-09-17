import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  snapshotEqual,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "../firebase";
import { resolveTargetedBatchSalesPoint } from "../features/targetedBatches/targetedBatchMapPoints";

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
    schemaVersion: cleanText(batch?.schemaVersion) || null,
    // TB-R051, TB-R043: the batch map draws this geofence, or "No geofence" when there is none.
    geofenceId: cleanText(batch?.geofenceId) || null,
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

function buildTargetedBatchBucketData({ batches = [] }) {
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
    },
  };
}

// TB-R051: whether the row's Sales record has been read: LOADING (no snapshot yet), LOADED (it exists),
// MISSING (it does not exist, or the row has no Sales ID) or ERROR (the Sales listener failed).
// Only LOADED may be trusted as checked; an unknown value fails closed as ERROR.
function readSalesLoadState(value, fallback) {
  const state = normalizeUpper(value);
  if (!state) return fallback;
  return ["LOADING", "LOADED", "MISSING", "ERROR"].includes(state) ? state : "ERROR";
}

export function normalizeTargetedBatchRow(row = {}) {
  const refs = row?.refs || {};
  const executionStatus = normalizeUpper(
    row?.execution?.status || "NOT_STARTED",
  );
  const salesVisibility = normalizeUpper(row?.salesVisibility) || null;
  // TB-R051: a meter is Completed on the phone when its Sales record is VISIBLE or its row is COMPLETED.
  const displayStatus =
    salesVisibility === "VISIBLE" || executionStatus === "COMPLETED"
      ? "COMPLETED"
      : executionStatus;

  return {
    id: cleanText(row?.id, "NAv"),
    tbId: cleanText(row?.tbId),
    rowNo: readNumber(row?.rowNo),
    erfId: cleanText(refs?.erfId),
    erfNo: readFirstString(
      row?.property?.erfNo,
      row?.erf?.erfNo,
      row?.erfNo,
      row?.location?.erfNo,
    ),
    premiseId: cleanText(refs?.premiseId),
    meterId: cleanText(refs?.meterId),
    trnId: cleanText(refs?.trnId),
    salesDocId: cleanText(row?.salesDocId) || null,
    noAccessCount:
      row?.noAccessCount === null ? null : Number(row?.noAccessCount || 0),
    noAccessSourceStatus: normalizeUpper(row?.noAccessSourceStatus),
    fieldWorkMeterId: cleanText(row?.fieldWorkMeterId) || null,

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
    addressLine1: cleanText(row?.location?.addressLine1) || null,
    town: readFirstString(row?.location?.town, "NAv"),
    sgCode: readFirstString(row?.location?.sgCode, "NAv"),
    wardNumberLabel: readFirstString(
      row?.location?.wardNumberLabel,
      "NAv",
    ),

    allocationStatus: normalizeUpper(row?.allocation?.status),
    executionStatus,
    displayStatus,
    salesVisibility,
    // TB-R051: a row that was never joined to Sales has not loaded its Sales record.
    salesLoadState: readSalesLoadState(
      row?.salesLoadState,
      cleanText(row?.salesDocId || row?.salesAllMeterId) ? "LOADING" : "MISSING",
    ),
    salesPoint: row?.salesPoint || null,
    executionOutcome: cleanText(row?.execution?.outcome),
    scope: row?.scope || {},
    refs,
    raw: row,
  };
}

// Sales tbRefs entries carry the batch ID in `id`; the legacy `tbId` key is still read (Sales schema TB8).
function readTbRefBatchId(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) return "";
  return normalizeUpper(readFirstString(reference.id, reference.tbId));
}

export function enrichTargetedBatchRowFromSales(row = {}, sales = null, salesLoadState = sales ? "LOADED" : "MISSING") {
  const salesDocId = cleanText(row?.salesAllMeterId);
  const rowTbId = normalizeUpper(row?.tbId);
  let noAccessSourceStatus = "OK";
  let noAccessCount = 0;
  let fieldWorkMeterId = null;
  if (!salesDocId) noAccessSourceStatus = "SALES_DOCUMENT_ID_MISSING";
  else if (!sales) noAccessSourceStatus = "SALES_DOCUMENT_MISSING";
  else if (sales.tbRefs != null && !Array.isArray(sales.tbRefs)) noAccessSourceStatus = "TB_REFERENCES_INVALID";
  else {
    // Exactly one entry may link this meter to the row's batch; never pick a winner among several (TB-R037).
    const matches = rowTbId
      ? (sales.tbRefs || []).filter((item) => readTbRefBatchId(item) === rowTbId)
      : [];
    const tbRef = matches.length === 1 ? matches[0] : null;
    if (matches.length > 1) noAccessSourceStatus = "TB_REFERENCE_AMBIGUOUS";
    else if (!tbRef) noAccessSourceStatus = "TB_REFERENCE_MISSING";
    else if (tbRef.fieldWork != null && (typeof tbRef.fieldWork !== "object" || Array.isArray(tbRef.fieldWork))) {
      noAccessSourceStatus = "FIELDWORK_INVALID";
    } else {
      const fieldWork = tbRef.fieldWork || {};
      fieldWorkMeterId = cleanText(fieldWork.meterId) || null;
      if (fieldWork.noAccess != null && !Array.isArray(fieldWork.noAccess)) noAccessSourceStatus = "FIELDWORK_INVALID";
      else noAccessCount = fieldWork.noAccess?.length || 0;
    }
  }
  // TB-R051: Sales visibility sets the phone status; the Sales point is for the batch map only (never evidence).
  const linkedSales = salesDocId && sales ? sales : null;
  const visibility = linkedSales?.master?.visibility;
  const salesVisibility = typeof visibility === "string" ? normalizeUpper(visibility) || null : null;
  const salesPoint = resolveTargetedBatchSalesPoint(linkedSales);
  // TB-R051: a row with no Sales ID has nothing to load, and LOADED needs the Sales record itself.
  const loadState = readSalesLoadState(salesLoadState, sales ? "LOADED" : "MISSING");
  const resolvedSalesLoadState = !salesDocId || (loadState === "LOADED" && !sales) ? "MISSING" : loadState;
  return { ...row, salesDocId: salesDocId || null, noAccessCount, fieldWorkMeterId, noAccessSourceStatus, salesVisibility, salesPoint, salesLoadState: resolvedSalesLoadState };
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

      // TB-R051: the header counts use the status the phone shows.
      if (row.displayStatus === "COMPLETED") {
        acc.completed += 1;
      } else if (row.displayStatus === "IN_PROGRESS") {
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
      source: "TARGETED_BATCH_ROWS_STREAM",
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
        let unsubscribeTargetedBatches = () => {};

        try {
          await cacheDataLoaded;

          const targetedBatchQuery = query(
            collection(db, "tb_uploads"),
            orderBy("metadata.createdAt", "desc"),
          );

          unsubscribeTargetedBatches = onSnapshot(
            targetedBatchQuery,
            (snapshot) => {
              const batches = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }));

              updateCachedData(() =>
                buildTargetedBatchBucketData({ batches }),
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
      queryFn(args = {}) {
        const tbId = cleanText(args?.tbId);
        if (!tbId) return { error: { code: "TARGETED_BATCH_ID_REQUIRED", message: "Targeted Batch is required." } };
        return { data: buildTargetedBatchRowsData({ tbId, rows: [] }) };
      },

      async onCacheEntryAdded(
        args = {},
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) {
        // TB-R051: a failed Sales listener is subscribed again after this wait while the batch stays open.
        const SALES_LISTENER_RETRY_MS = 15000;
        let unsubscribeRows = () => {};
        const salesListeners = new Map();
        const salesDocuments = new Map();
        // TB-R051: the last Sales snapshot per Sales ID, to skip an event that changes nothing on the phone.
        const salesSnapshots = new Map();
        // TB-R051: per Sales ID, LOADED or MISSING once a snapshot has said so, ERROR once its listener failed.
        const salesLoadStates = new Map();
        let currentRows = [];
        let active = true;
        let publishTimer = null;
        let salesRetryTimer = null;

        const publish = () => {
          if (!active) return;
          const rows = currentRows.map((row) => {
            const salesId = cleanText(row?.salesAllMeterId);
            // TB-R051: until its Sales snapshot arrives a row is LOADING, never read as open or missing.
            const salesLoadState = salesId ? salesLoadStates.get(salesId) || "LOADING" : "MISSING";
            return enrichTargetedBatchRowFromSales(row, salesDocuments.get(salesId) || null, salesLoadState);
          });
          updateCachedData(() => buildTargetedBatchRowsData({ tbId: cleanText(args?.tbId), rows }));
        };

        // TB-R051: listener events publish once per burst. Firestore runs each listener callback in its own
        // setTimeout(0), so a microtask would still publish per event; this timer runs after the whole burst.
        const schedulePublish = () => {
          if (!active || publishTimer !== null) return;
          publishTimer = setTimeout(() => {
            publishTimer = null;
            publish();
          }, 0);
        };

        const scheduleSalesRetry = () => {
          if (!active || salesRetryTimer !== null) return;
          salesRetryTimer = setTimeout(() => {
            salesRetryTimer = null;
            if (active) reconcileSalesListeners();
          }, SALES_LISTENER_RETRY_MS);
        };

        const reconcileSalesListeners = () => {
          const requiredIds = new Set(currentRows.map((row) => cleanText(row?.salesAllMeterId)).filter(Boolean));
          // A failed Sales ID has no listener but keeps its state, so both are forgotten when its rows leave.
          for (const id of new Set([...salesListeners.keys(), ...salesLoadStates.keys()])) {
            if (requiredIds.has(id)) continue;
            const unsubscribe = salesListeners.get(id);
            if (unsubscribe) unsubscribe();
            salesListeners.delete(id);
            salesDocuments.delete(id);
            salesSnapshots.delete(id);
            salesLoadStates.delete(id);
          }
          for (const id of requiredIds) {
            if (salesListeners.has(id)) continue;
            let unsubscribe = null;
            // TB-R051: a callback from a listener that no longer holds its Sales ID (removed or failed) is ignored.
            const isCurrent = () => active && salesListeners.get(id) === unsubscribe;
            // Metadata changes are included so a cache-only "does not exist" is confirmed or replaced once the server answers.
            unsubscribe = onSnapshot(doc(db, "sales-all-meters", id), { includeMetadataChanges: true }, (snapshot) => {
              if (!isCurrent()) return;
              const exists = snapshot.exists();
              // TB-R051: offline, the cache cannot say a Sales record does not exist; it has not loaded yet.
              const loadState = exists ? "LOADED" : snapshot.metadata?.fromCache ? "LOADING" : "MISSING";
              const previous = salesSnapshots.get(id);
              salesSnapshots.set(id, snapshot);
              // TB-R051: an event that changes neither the record nor its load state (going offline or online) publishes nothing.
              if (previous && snapshotEqual(previous, snapshot) && salesLoadStates.get(id) === loadState) return;
              if (exists) salesDocuments.set(id, snapshot.data() || {});
              else salesDocuments.delete(id);
              salesLoadStates.set(id, loadState);
              schedulePublish();
            }, (error) => {
              console.error("[TARGETED_BATCH_SALES_STREAM_ERROR]", { id, error });
              if (!isCurrent()) return;
              // TB-R051: the failed listener is ended and forgotten, so the next rows snapshot or the retry subscribes again.
              unsubscribe();
              salesListeners.delete(id);
              scheduleSalesRetry();
              // TB-R051: a failed Sales listener fails closed; the last Sales data read, if any, is kept for the status.
              if (salesLoadStates.get(id) === "ERROR") return;
              salesLoadStates.set(id, "ERROR");
              schedulePublish();
            });
            salesListeners.set(id, unsubscribe);
          }
        };

        try {
          await cacheDataLoaded;

          const tbId = cleanText(args?.tbId);
          if (!tbId) {
            await cacheEntryRemoved;
            return;
          }

          const rowsQuery = query(collection(db, "tb_rows"), where("tbId", "==", tbId));

          unsubscribeRows = onSnapshot(
            rowsQuery,
            (snapshot) => {
              // TB-R051: after the entry is removed a late rows event opens no Sales listener.
              if (!active) return;
              currentRows = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }));
              reconcileSalesListeners();
              schedulePublish();
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
        active = false;
        clearTimeout(publishTimer);
        clearTimeout(salesRetryTimer);
        unsubscribeRows();
        for (const unsubscribe of salesListeners.values()) unsubscribe();
        salesListeners.clear();
      },
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}:${cleanText(queryArgs?.tbId)}`,
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
