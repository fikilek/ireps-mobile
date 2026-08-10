# iREPS Ward Memory Patch 1C — Stabilise after Patch 1B

## Purpose
Patch 1B introduced scoped RTK Query cache keys and sign-out cache resets. Testing showed instability after dropping a ward: previously synced ward rows disappeared and new sync did not start reliably.

Patch 1C is a stabilisation rollback to the last architecture that tested successfully for Zamo:

- UI still reads WarehouseContext only.
- WarehouseContext still reads RTK Query only.
- RTK Query still hydrates ERF packs from MMKV.
- RTK Query still persists fresh ERF snapshots back to MMKV.
- GeoContext still saves/restores last active scope from MMKV.

## Files included
- `src/storage/wardScopeStorage.js`
- `src/redux/erfsApi.js`
- `src/context/GeoContext.js`
- `src/context/WarehouseContext.js`
- `src/redux/authApi.js`
- `app/(tabs)/admin/storage/ward-erfs-sync.js`

## What changed from Patch 1B
- Removed the scoped RTK Query cache key change.
- Removed WarehouseContext passing `uid` / `activeWorkbaseId` into the ERF query.
- Removed sign-out API cache reset from `authApi.js`.
- Restored the simpler Ward ERF Control flow from Patch 1.

## Expected behaviour after Patch 1C
Same-user behaviour should return to the known working Patch 1 result:

1. Zamo signs in.
2. Synced ward ERF packs hydrate from MMKV.
3. Last active ward restores.
4. Dropping one ward removes only that ward's ERF pack and clears last-active only if that ward was active.
5. Sync button should work again.

Known remaining design issue:
- Cross-user clean slate is not solved in Patch 1C. We will handle that with a smaller, safer Patch 1D after Patch 1C is stable again.
