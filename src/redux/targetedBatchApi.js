import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  collection,
  documentId,
  onSnapshot,
  query,
  snapshotEqual,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "../firebase";
import { resolveTargetedBatchSalesPoint } from "../features/targetedBatches/targetedBatchMapPoints";
import { readRowLastWorkedMillis } from "../features/targetedBatches/rowLastWorked";
import { listenActorTeams, listenWhereIn } from "./firestoreListeners";
import {
  FIRESTORE_IN_LIMIT,
  LIVE_STREAM_STATUS,
  MY_WORK_ORDERS_KEEP_SECONDS,
  createLiveDataStore,
  followActorAllocatedDocuments,
  isDocumentId,
  readFromCache,
} from "./liveSubscription";

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
    stream: LIVE_STREAM_STATUS.CONNECTING,
    actorTeamIds: [],
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

// TB-R052: updatedAt is set once the worker's batches have been read (the list is ready); stream says whether
// the live list is connecting, live or failed; actorTeamIds are the teams the batches were read for.
function buildTargetedBatchBucketData({
  batches = [],
  loaded = true,
  stream = LIVE_STREAM_STATUS.LIVE,
  actorTeamIds = [],
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
      updatedAt: loaded ? new Date().toISOString() : null,
      stream,
      actorTeamIds,
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
    // TB-R051 (1.3.68): when this meter was last worked on, and the number found when it was not this meter.
    lastWorkedAt: readNumber(row?.lastWorkedAt) || null,
    foundMeterNo: cleanText(row?.foundMeterNo) || null,

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
  let rowFieldWork = null;
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
      rowFieldWork = fieldWork;
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
  // TB-R051 (1.3.68): the order of a batch's meters, and the number found when a different meter was
  // captured at this ERF (TB-R063). The row carries the number once the server has closed it; before
  // that the Sales record holds it. A number equal to the row's own meter is not a different meter.
  const lastWorkedAt = readRowLastWorkedMillis(row, { fieldWork: rowFieldWork, sales: linkedSales }) || null;
  const sameNumber = (a, b) => normalizeUpper(a) === normalizeUpper(b);
  const foundMeterNoRaw = cleanText(
    row?.execution?.foundMeterNo || linkedSales?.differentMeterFound?.meterNo,
  );
  const foundMeterNo =
    foundMeterNoRaw &&
    !sameNumber(foundMeterNoRaw, row?.meter?.numberNormalized) &&
    !sameNumber(foundMeterNoRaw, row?.meter?.numberRaw)
      ? foundMeterNoRaw
      : null;

  return { ...row, salesDocId: salesDocId || null, noAccessCount, fieldWorkMeterId, noAccessSourceStatus, salesVisibility, salesPoint, lastWorkedAt, foundMeterNo, salesLoadState: resolvedSalesLoadState };
}

export function buildTargetedBatchRowsData({
  tbId,
  rows = [],
  streamLimit = null,
  pagination = {},
  diagnostics = {},
  stream = LIVE_STREAM_STATUS.LIVE,
  loaded = true,
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
      // TB-R052: set once the server has answered the batch rows; before that the rows are loading, never "none".
      updatedAt: loaded ? new Date().toISOString() : null,
      tbId,
      streamLimit,
      // TB-R052: whether the batch rows are live, reconnecting after a failure, or still connecting.
      stream,
    },
    pagination: {
      limit: Number(pagination?.limit || streamLimit || 0),
      hasMore: pagination?.hasMore === true,
      nextCursor: pagination?.nextCursor || null,
    },
    diagnostics,
  };
}

// TB-R052: one live batch list per worker and service provider; one live rows stream per batch.
const targetedBatchBucketKey = (args = {}) =>
  `${cleanText(args?.actorUid)}:${cleanText(args?.actorSpId)}`;
const targetedBatchBucketLiveData = createLiveDataStore();
const targetedBatchRowsLiveData = createLiveDataStore();

export const targetedBatchApi = createApi({
  reducerPath: "targetedBatchApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["TargetedBatch"],
  endpoints: (builder) => ({
    getTargetedBatchBuckets: builder.query({
      // TB-R052: a refetch answers with the live list's last data, never an empty list.
      queryFn(args = {}) {
        return {
          data: targetedBatchBucketLiveData.read(
            targetedBatchBucketKey(args),
            EMPTY_TARGETED_BATCH_BUCKET_DATA,
          ),
        };
      },

      // TB-R052: only the batches allocated to the worker's teams or service provider are read, and the live
      // list is kept for up to 24 hours after the worker leaves My Work Orders.
      async onCacheEntryAdded(
        args = {},
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) {
        let stopTargetedBatches = () => {};
        const liveData = targetedBatchBucketLiveData.open(targetedBatchBucketKey(args));

        try {
          await cacheDataLoaded;

          stopTargetedBatches = followActorAllocatedDocuments({
            uid: args?.actorUid,
            spId: args?.actorSpId,
            listenTeams: listenActorTeams,
            listenAllocated: (values, onDocs, onError) =>
              listenWhereIn(
                {
                  collectionName: "tb_uploads",
                  field: "allocation.targetId",
                  values,
                  label: "TARGETED_BATCH_BUCKET",
                },
                onDocs,
                onError,
              ),
            onChange: ({ docs, loaded, stream, teamIds }) => {
              const data = liveData.publish(
                buildTargetedBatchBucketData({
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
          console.error(
            "❌ [TARGETED_BATCH_BUCKET_STREAM_SETUP_ERROR]:",
            error,
          );
        }

        await cacheEntryRemoved;
        stopTargetedBatches();
        liveData.close();
      },
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}:${targetedBatchBucketKey(queryArgs)}`,
      keepUnusedDataFor: MY_WORK_ORDERS_KEEP_SECONDS,
      providesTags: ["TargetedBatch"],
    }),

    getTargetedBatchRows: builder.query({
      queryFn(args = {}) {
        const tbId = cleanText(args?.tbId);
        if (!tbId) return { error: { code: "TARGETED_BATCH_ID_REQUIRED", message: "Targeted Batch is required." } };
        // TB-R052: a refetch answers with the live rows' last data, never an empty batch.
        return {
          data: targetedBatchRowsLiveData.read(
            tbId,
            buildTargetedBatchRowsData({ tbId, rows: [], stream: LIVE_STREAM_STATUS.CONNECTING, loaded: false }),
          ),
        };
      },

      async onCacheEntryAdded(
        args = {},
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved },
      ) {
        // TB-R051: a failed Sales group (and, TB-R052, a failed rows listener) is subscribed again after this wait
        // while the batch stays open.
        const SALES_LISTENER_RETRY_MS = 15000;
        let unsubscribeRows = () => {};
        let rowsGeneration = 0;
        let rowsStatus = LIVE_STREAM_STATUS.CONNECTING;
        // TB-R052: whether the server has answered the batch rows at least once.
        let rowsFromServer = false;
        let rowsRetryTimer = null;
        const liveData = targetedBatchRowsLiveData.open(cleanText(args?.tbId));
        // TB-R052: Sales records are read in groups of up to 30 meters per listener instead of one listener per meter.
        const salesGroups = new Set();
        const salesDocuments = new Map();
        // TB-R051: the last Sales document per Sales ID (null when the server or cache said it does not exist), to
        // skip an event that changes nothing on the phone.
        const salesSnapshots = new Map();
        // TB-R051: per Sales ID, LOADED or MISSING once a snapshot has said so, ERROR once its group failed.
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
          const data = liveData.publish(
            buildTargetedBatchRowsData({ tbId: cleanText(args?.tbId), rows, stream: rowsStatus, loaded: rowsFromServer }),
          );
          updateCachedData(() => data);
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

        const endSalesGroup = (group) => {
          salesGroups.delete(group);
          group.unsubscribe();
        };

        // TB-R052: one listener for up to 30 Sales IDs. Each ID keeps its own TB-R051 load state.
        const openSalesGroup = (ids) => {
          const group = { ids, unsubscribe: () => {} };
          // TB-R051: a callback from a group that no longer listens (ended or failed) is ignored.
          const isCurrent = () => active && salesGroups.has(group);

          const fail = (error) => {
            console.error("[TARGETED_BATCH_SALES_STREAM_ERROR]", { ids, error });
            if (!isCurrent()) return;
            // TB-R051: the failed group is ended and forgotten, so the next rows snapshot or the retry subscribes again.
            endSalesGroup(group);
            scheduleSalesRetry();
            // TB-R051: a failed group fails closed; the last Sales data read, if any, is kept for the status.
            let changed = false;
            for (const id of ids) {
              if (salesLoadStates.get(id) === "ERROR") continue;
              salesLoadStates.set(id, "ERROR");
              changed = true;
            }
            if (changed) schedulePublish();
          };

          salesGroups.add(group);
          try {
            // Metadata changes are included so a cache-only "does not exist" is confirmed or replaced once the server answers.
            group.unsubscribe = onSnapshot(
              query(collection(db, "sales-all-meters"), where(documentId(), "in", ids)),
              { includeMetadataChanges: true },
              (snapshot) => {
                if (!isCurrent()) return;
                const fromCache = readFromCache(snapshot);
                const found = new Map(snapshot.docs.map((docSnap) => [docSnap.id, docSnap]));
                let changed = false;
                for (const id of ids) {
                  const docSnap = found.get(id) || null;
                  // TB-R051: offline, the cache cannot say a Sales record does not exist; it has not loaded yet.
                  const loadState = docSnap ? "LOADED" : fromCache ? "LOADING" : "MISSING";
                  const previous = salesSnapshots.get(id);
                  const sameRecord =
                    previous !== undefined &&
                    (previous === null ? docSnap === null : docSnap !== null && snapshotEqual(previous, docSnap));
                  // TB-R051: an event that changes neither the record nor its load state (going offline or online) publishes nothing.
                  if (sameRecord && salesLoadStates.get(id) === loadState) continue;
                  salesSnapshots.set(id, docSnap);
                  if (docSnap) salesDocuments.set(id, docSnap.data() || {});
                  else salesDocuments.delete(id);
                  salesLoadStates.set(id, loadState);
                  changed = true;
                }
                if (changed) schedulePublish();
              },
              fail,
            );
          } catch (error) {
            fail(error);
          }
        };

        const reconcileSalesListeners = () => {
          const requiredIds = new Set(currentRows.map((row) => cleanText(row?.salesAllMeterId)).filter(Boolean));
          // TB-R052: a group holding a Sales ID whose rows left is ended; its other IDs are grouped again below and keep their state.
          for (const group of [...salesGroups]) {
            if (group.ids.every((id) => requiredIds.has(id))) continue;
            endSalesGroup(group);
          }
          // A Sales ID whose rows left is forgotten, a failed one too, so if it returns it starts LOADING.
          for (const id of [...salesLoadStates.keys()]) {
            if (requiredIds.has(id)) continue;
            salesDocuments.delete(id);
            salesSnapshots.delete(id);
            salesLoadStates.delete(id);
          }
          // TB-R052: a Sales ID that cannot be a document ID cannot be read; only its own rows fail closed as ERROR,
          // never the other meters of a group.
          for (const id of requiredIds) {
            if (isDocumentId(id) || salesLoadStates.get(id) === "ERROR") continue;
            salesLoadStates.set(id, "ERROR");
          }
          const grouped = new Set([...salesGroups].flatMap((group) => group.ids));
          const ungrouped = [...requiredIds].filter((id) => isDocumentId(id) && !grouped.has(id)).sort();
          for (let index = 0; index < ungrouped.length; index += FIRESTORE_IN_LIMIT) {
            openSalesGroup(ungrouped.slice(index, index + FIRESTORE_IN_LIMIT));
          }
        };

        // TB-R052: a failed rows listener says so (the rows stream is ERROR) and is subscribed again after the wait.
        // Metadata changes are included: rows answered only from the phone's memory are not loaded until the
        // server has answered once, and after that they are not up to date.
        const subscribeRows = (tbId) => {
          const mine = ++rowsGeneration;
          unsubscribeRows = onSnapshot(
            query(collection(db, "tb_rows"), where("tbId", "==", tbId)),
            { includeMetadataChanges: true },
            (snapshot) => {
              // TB-R051: after the entry is removed a late rows event opens no Sales listener.
              if (!active || mine !== rowsGeneration) return;
              if (readFromCache(snapshot)) {
                rowsStatus = rowsFromServer ? LIVE_STREAM_STATUS.NOT_UP_TO_DATE : LIVE_STREAM_STATUS.CONNECTING;
              } else {
                rowsFromServer = true;
                rowsStatus = LIVE_STREAM_STATUS.LIVE;
              }
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
              if (!active || mine !== rowsGeneration) return;
              rowsGeneration += 1;
              unsubscribeRows();
              unsubscribeRows = () => {};
              rowsStatus = LIVE_STREAM_STATUS.ERROR;
              schedulePublish();
              rowsRetryTimer = setTimeout(() => {
                rowsRetryTimer = null;
                if (active) subscribeRows(tbId);
              }, SALES_LISTENER_RETRY_MS);
            },
          );
        };

        try {
          await cacheDataLoaded;

          const tbId = cleanText(args?.tbId);
          if (!tbId) {
            await cacheEntryRemoved;
            liveData.close();
            return;
          }

          subscribeRows(tbId);
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
        clearTimeout(rowsRetryTimer);
        unsubscribeRows();
        liveData.close();
        for (const group of [...salesGroups]) endSalesGroup(group);
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
