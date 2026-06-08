// src/storage/wardScopeStorage.js
import { erfsKV, geoKV } from "../redux/mmkv";

const VERSION = "v1";
const PREFIX = "ireps";
const LAST_ACTIVE_DATASET = "erfs";

/*
  Ward memory design for current sprint:
  - Device-level memory, not user-level memory.
  - Synced ward ERF packs are remembered on this device across sign-ins.
  - Last active ward is remembered on this device across sign-ins.
  - We still validate LM before restoring, because a ward belongs to an LM scope.
  - UI does not read MMKV. RTK Query hydrates from this cache and feeds Warehouse/UI.
*/

function safePart(value) {
  const clean = String(value || "").trim();
  return clean || "NAv";
}

function safeJsonParse(raw, fallback = null) {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function removeKVValue(kv, key) {
  if (!key) return;
  if (typeof kv.delete === "function") return kv.delete(key);
  if (typeof kv.removeItem === "function") return kv.removeItem(key);
  if (typeof kv.remove === "function") return kv.remove(key);
  return kv.set(key, "");
}

export function makeScopeDatasetKey({ lmPcode, wardPcode, dataset }) {
  if (!lmPcode || !wardPcode || !dataset) return null;

  return [
    PREFIX,
    "scope",
    VERSION,
    safePart(lmPcode),
    safePart(wardPcode),
    safePart(dataset),
  ].join(":");
}

export function makeScopeIndexKey({ lmPcode } = {}) {
  if (!lmPcode) return null;

  return [PREFIX, "scopeIndex", VERSION, safePart(lmPcode)].join(":");
}

export function makeLastActiveScopeKey() {
  return [PREFIX, "lastActiveScope", VERSION, "device"].join(":");
}

export function loadScopeDataset(params) {
  const key = makeScopeDatasetKey(params || {});
  if (!key) return null;

  const raw = erfsKV.getString(key);
  const parsed = safeJsonParse(raw, null);

  if (!parsed?.data) return null;
  return parsed;
}

export function saveScopeDataset(params) {
  const { dataset, data } = params || {};
  const key = makeScopeDatasetKey(params || {});
  if (!key || !dataset || !data) return null;

  const persistedAt = Date.now();
  const payload = {
    version: VERSION,
    key,
    dataset,
    // These remain as audit/debug metadata only. They are not part of the key.
    uid: params.uid || null,
    activeWorkbaseId: params.activeWorkbaseId || null,
    lmPcode: params.lmPcode,
    wardPcode: params.wardPcode,
    wardCacheKey: params.wardCacheKey || `${params.lmPcode}__${params.wardPcode}`,
    persistedAt,
    data: {
      ...data,
      sync: {
        ...(data?.sync || {}),
        persistedAt,
      },
    },
  };

  erfsKV.set(key, JSON.stringify(payload));
  markScopeDatasetSynced(payload);
  return payload;
}

export function removeScopeDataset(params) {
  const key = makeScopeDatasetKey(params || {});
  if (!key) return;

  removeKVValue(erfsKV, key);
  unmarkScopeDatasetSynced(params || {});
}

export function loadScopeIndex(params) {
  const key = makeScopeIndexKey(params || {});
  if (!key) return null;

  const raw = erfsKV.getString(key);
  return safeJsonParse(raw, null);
}


export function getScopeDatasetSyncMeta(params = {}) {
  const lmPcode = params?.lmPcode || null;
  const wardPcode = params?.wardPcode || null;
  const dataset = params?.dataset || LAST_ACTIVE_DATASET;

  if (!lmPcode || !wardPcode || !dataset) return null;

  const wardCacheKey =
    params?.wardCacheKey || `${lmPcode}__${wardPcode}`;
  const index = loadScopeIndex({ lmPcode });
  const wardMeta = index?.wards?.[wardCacheKey] || null;
  const datasetMeta = wardMeta?.datasets?.[dataset] || null;

  if (!datasetMeta) return null;

  return {
    lmPcode,
    wardPcode,
    wardCacheKey,
    dataset,
    key: datasetMeta?.key || null,
    status: datasetMeta?.status || "ready",
    size: Number(datasetMeta?.size || 0),
    persistedAt: datasetMeta?.persistedAt || wardMeta?.updatedAt || 0,
  };
}

export function getScopeDatasetSyncMetaByWard(params = {}) {
  const lmPcode = params?.lmPcode || null;
  const dataset = params?.dataset || LAST_ACTIVE_DATASET;
  const result = new Map();

  if (!lmPcode || !dataset) return result;

  const index = loadScopeIndex({ lmPcode });
  const wards = index?.wards || {};

  Object.values(wards).forEach((wardMeta) => {
    const wardPcode = wardMeta?.wardPcode || null;
    const wardCacheKey = wardMeta?.wardCacheKey || null;
    const datasetMeta = wardMeta?.datasets?.[dataset] || null;

    if (!wardPcode || !datasetMeta) return;

    result.set(wardPcode, {
      lmPcode,
      wardPcode,
      wardCacheKey,
      dataset,
      key: datasetMeta?.key || null,
      status: datasetMeta?.status || "ready",
      size: Number(datasetMeta?.size || 0),
      persistedAt: datasetMeta?.persistedAt || wardMeta?.updatedAt || 0,
    });
  });

  return result;
}

export function saveScopeIndex(params, index) {
  const key = makeScopeIndexKey(params || {});
  if (!key || !index) return null;

  const next = {
    version: VERSION,
    lmPcode: params.lmPcode,
    updatedAt: Date.now(),
    wards: index?.wards || {},
  };

  erfsKV.set(key, JSON.stringify(next));
  return next;
}

export function markScopeDatasetSynced(payload) {
  if (!payload?.lmPcode || !payload?.wardPcode) return null;

  const index = loadScopeIndex(payload) || {
    version: VERSION,
    lmPcode: payload.lmPcode,
    wards: {},
  };

  const wardCacheKey = payload.wardCacheKey || `${payload.lmPcode}__${payload.wardPcode}`;
  const existing = index.wards?.[wardCacheKey] || {};
  const existingDatasets = existing.datasets || {};

  const nextWard = {
    ...existing,
    lmPcode: payload.lmPcode,
    wardPcode: payload.wardPcode,
    wardCacheKey,
    updatedAt: Date.now(),
    datasets: {
      ...existingDatasets,
      [payload.dataset]: {
        key: payload.key,
        status: "ready",
        size: Number(payload?.data?.sync?.size || 0),
        persistedAt: payload.persistedAt,
      },
    },
  };

  return saveScopeIndex(payload, {
    ...index,
    wards: {
      ...(index.wards || {}),
      [wardCacheKey]: nextWard,
    },
  });
}

export function unmarkScopeDatasetSynced(params) {
  const index = loadScopeIndex(params || {});
  if (!index?.wards) return null;

  const wardCacheKey = params.wardCacheKey || `${params.lmPcode}__${params.wardPcode}`;
  const existing = index.wards[wardCacheKey];
  if (!existing) return index;

  const datasets = { ...(existing.datasets || {}) };
  delete datasets[params.dataset];

  const nextWards = { ...(index.wards || {}) };

  if (Object.keys(datasets).length === 0) {
    delete nextWards[wardCacheKey];
  } else {
    nextWards[wardCacheKey] = {
      ...existing,
      datasets,
      updatedAt: Date.now(),
    };
  }

  return saveScopeIndex(params, {
    ...index,
    wards: nextWards,
  });
}

export function saveLastActiveScope({
  uid,
  activeWorkbaseId,
  lmPcode,
  wardPcode,
  lm,
  ward,
}) {
  const key = makeLastActiveScopeKey();
  if (!key || !lmPcode || !wardPcode) return null;

  const payload = {
    version: VERSION,
    // These remain as audit/debug metadata only. Restore is device-level.
    uid: uid || null,
    activeWorkbaseId: activeWorkbaseId || null,
    lmPcode,
    wardPcode,
    wardCacheKey: `${lmPcode}__${wardPcode}`,
    lm: lm || { id: lmPcode, pcode: lmPcode },
    ward: ward || { id: wardPcode, pcode: wardPcode },
    savedAt: Date.now(),
  };

  geoKV.set(key, JSON.stringify(payload));
  return payload;
}

export function loadLastActiveScope() {
  const key = makeLastActiveScopeKey();
  if (!key) return null;

  return safeJsonParse(geoKV.getString(key), null);
}

export function clearLastActiveScope() {
  const key = makeLastActiveScopeKey();
  if (!key) return;

  removeKVValue(geoKV, key);
}

export function clearLastActiveScopeIfMatches({ lmPcode, wardPcode }) {
  const current = loadLastActiveScope();
  if (!current) return false;

  const sameLm = String(current?.lmPcode || "") === String(lmPcode || "");
  const sameWard = String(current?.wardPcode || "") === String(wardPcode || "");

  if (!sameLm || !sameWard) return false;

  clearLastActiveScope();
  return true;
}

export function getRestorableLastActiveScope({ lmPcode }) {
  const lastActive = loadLastActiveScope();
  if (!lastActive) return null;

  if (String(lastActive?.lmPcode || "") !== String(lmPcode || "")) return null;
  if (!lastActive?.wardPcode) return null;

  const savedPack = loadScopeDataset({
    lmPcode,
    wardPcode: lastActive.wardPcode,
    dataset: LAST_ACTIVE_DATASET,
  });

  const expectedPackKey = `${lmPcode}__${lastActive.wardPcode}`;
  const savedPackKey = savedPack?.data?.sync?.wardCacheKey || savedPack?.wardCacheKey || null;

  if (!savedPack?.data || savedPackKey !== expectedPackKey) return null;

  return lastActive;
}
