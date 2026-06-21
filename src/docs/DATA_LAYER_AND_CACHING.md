# iREPS Mobile — DATA_LAYER_AND_CACHING.md

## 1. RTK Query Architecture

All server data flows through RTK Query API slices. Each domain has its own slice following a consistent pattern:

1. \queryFn\: Initial hydration - checks MMKV cache for instant data
2. \onCacheEntryAdded\: Real-time Firestore \onSnapshot\ listener for live updates
3. \serializeQueryArgs\: Stable cache key generation to prevent duplicate subscriptions

## 2. ERF Ward Pack Architecture

ERFs use a unique ward pack pattern optimized for performance. Each ward pack contains:

| Field | Type | Description |
|-------|------|-------------|
| \metaEntries\ | Array | ERF metadata (id, erfNo, premises[], admin, metadata.updatedAt) |
| \geoEntries\ | Object | ERF geometry keyed by ERF ID (centroid, bbox, geometry polygon) |
| \sync\ | Object | Sync state: status, lmPcode, wardPcode, wardCacheKey, timestamps |

### 2.1 Pack Key \\\

Each ward pack is identified by \wardCacheKey = {lmPcode}__{wardPcode}\.
This key is used for:
- RTK Query cache serialization (via \serializeQueryArgs\) - ensures stable cache identity
- MMKV storage key - allows quick lookups without parsing
- Validation in WarehouseContext - prevents stale ward data display

### 2.2 Cache Hydration Flow

1. \queryFn\ runs first - checks MMKV via \loadScopeDataset()\
   - Cache hit: returns \{ metaEntries, geoEntries, sync: { source: "mmkv" } }\
   - Cache miss: returns \emptyWardPack()\ with empty arrays
2. \onCacheEntryAdded\ starts Firestore \onSnapshot\ listener
3. First snapshot: full authoritative rebuild -> saves to MMKV via \saveScopeDataset()\
4. Subsequent snapshots: surgical patching via \docChanges()\ -> updates MMKV
5. Listener errors: falls back to MMKV data if available, marks sync status as error

## 3. MMKV Persistence

### 3.1 ERF Pack Cache (wardScopeStorage.js)

\loadScopeDataset(args)\ and \saveScopeDataset(args)\ manage the ward-scoped ERF cache.
Keyed by \{uid, activeWorkbaseId, lmPcode, wardPcode, dataset: \"erfs\"}\.

### 3.2 Submission Queues

Three separate MMKV-backed queues for offline form submissions:

| Queue | Storage File | Form Types |
|-------|-------------|------------|
| Premise Queue | premiseSubmissionQueue.js | Premise creation, updates |
| General Queue | submissionQueue.js | Meter discovery, installation, account data |
| Account Data Queue | accountDataSubmissionQueue.js | Account number lookup forms |

## 4. Redux Persist Configuration

\src/redux/store.js\ configures redux-persist with MMKV storage adapter:

- \whitelist: [\"offline\"]\ - Only offline queue state is persisted via Redux
- \lacklist\: All API slices (authApi, erfsApi, etc.) and temporary state

This keeps persisted state minimal and avoids conflicts between persisted snapshots and live API data. API caches are rehydrated from MMKV or Firestore on each app session.

## 5. Optimistic Updates

\premisesApi\ uses optimistic updates via \onQueryStarted\:

1. When adding/updating a premise, the cache is optimistically updated
2. The ERF pack's \metaEntries\ is also updated (premises array + metadata.updatedAt)
3. If the mutation fails, \patchResult.undo()\ reverts both caches

## 6. Cache Invalidation

- RTK Query \	agTypes\ provide automatic invalidation
- Auth mutations \invalidatesTags: [\"User\"]\ trigger user list refetch
- Firestore \onSnapshot\ listeners provide real-time updates without manual invalidation
- Ward scope changes implicitly invalidate all ward-scoped caches (new cache keys)

---

> See related diagrams in ./diagrams/06_erf_ward_pack_caching.md
