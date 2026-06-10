import { getScopeDatasetSyncMetaByWard } from "../../storage/wardScopeStorage";

export const WARD_ERF_SYNC_STATUS = {
  READY: "READY",
  SYNCING: "SYNCING",
  ERROR: "ERROR",
  MISSING: "MISSING",
};

export function getWardPcode(ward) {
  return ward?.pcode || ward?.id || null;
}

export function getWardErfQueryCacheKey(lmPcode, wardPcode) {
  return `getErfsByLmPcodeWardPcode(${lmPcode}__${wardPcode})`;
}

export function getWardErfLocalMetaByWard(lmPcode) {
  if (!lmPcode) return new Map();

  return getScopeDatasetSyncMetaByWard({
    lmPcode,
    dataset: "erfs",
  });
}

export function getWardErfQueriesRevision(erfsQueries = {}) {
  return Object.entries(erfsQueries || {})
    .map(([queryKey, queryState]) => {
      const sync = queryState?.data?.sync || {};

      return [
        queryKey,
        queryState?.status || "",
        sync?.status || "",
        sync?.refreshStatus || "",
        sync?.wardCacheKey || sync?.packKey || sync?.key || "",
        sync?.size || 0,
        sync?.lastSyncAt || 0,
        sync?.persistedAt || 0,
        sync?.lastError || "",
      ].join(":");
    })
    .join("|");
}

function readSize(...values) {
  for (const value of values) {
    const size = Number(value);
    if (Number.isFinite(size)) return size;
  }

  return 0;
}

function normalizeStatus(status) {
  const clean = String(status || "").toLowerCase();

  if (clean === "ready") return WARD_ERF_SYNC_STATUS.READY;
  if (clean === "syncing") return WARD_ERF_SYNC_STATUS.SYNCING;
  if (clean === "error") return WARD_ERF_SYNC_STATUS.ERROR;

  return WARD_ERF_SYNC_STATUS.MISSING;
}

export function getWardErfSyncInfo({
  erfsQueries = {},
  localMetaByPcode,
  lmPcode,
  wardPcode,
}) {
  if (!lmPcode || !wardPcode) {
    return {
      status: WARD_ERF_SYNC_STATUS.MISSING,
      size: 0,
      queryKey: null,
      source: "none",
      sync: null,
      localMeta: null,
    };
  }

  const queryKey = getWardErfQueryCacheKey(lmPcode, wardPcode);
  const queryState = erfsQueries?.[queryKey] || null;
  const sync = queryState?.data?.sync || null;
  const localMeta = localMetaByPcode?.get?.(wardPcode) || null;

  const expectedPackKey = `${lmPcode}__${wardPcode}`;
  const syncPackKey = sync?.wardCacheKey || sync?.packKey || sync?.key || null;
  const queryMatchesScope = !syncPackKey || syncPackKey === expectedPackKey;
  const queryStatus = queryMatchesScope
    ? normalizeStatus(sync?.status)
    : WARD_ERF_SYNC_STATUS.MISSING;
  const localStatus = normalizeStatus(localMeta?.status);

  if (queryStatus === WARD_ERF_SYNC_STATUS.READY) {
    return {
      status: WARD_ERF_SYNC_STATUS.READY,
      size: readSize(sync?.size, localMeta?.size),
      queryKey,
      source: sync?.source || "rtk",
      sync,
      localMeta,
    };
  }

  if (localStatus === WARD_ERF_SYNC_STATUS.READY) {
    return {
      status: WARD_ERF_SYNC_STATUS.READY,
      size: readSize(localMeta?.size, sync?.size),
      queryKey,
      source: "mmkv",
      sync,
      localMeta,
    };
  }

  if (queryStatus === WARD_ERF_SYNC_STATUS.SYNCING) {
    return {
      status: WARD_ERF_SYNC_STATUS.SYNCING,
      size: readSize(sync?.size, localMeta?.size),
      queryKey,
      source: "rtk",
      sync,
      localMeta,
    };
  }

  if (queryStatus === WARD_ERF_SYNC_STATUS.ERROR) {
    return {
      status: WARD_ERF_SYNC_STATUS.ERROR,
      size: readSize(sync?.size, localMeta?.size),
      queryKey,
      source: "rtk",
      sync,
      localMeta,
    };
  }

  return {
    status: WARD_ERF_SYNC_STATUS.MISSING,
    size: readSize(localMeta?.size, sync?.size),
    queryKey,
    source: "none",
    sync,
    localMeta,
  };
}

export function isWardErfReady(params) {
  return getWardErfSyncInfo(params).status === WARD_ERF_SYNC_STATUS.READY;
}
