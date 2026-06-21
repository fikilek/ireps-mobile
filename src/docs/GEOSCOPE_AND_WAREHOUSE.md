# iREPS Mobile — GEOSCOPE_AND_WAREHOUSE.md

## 1. GeoContext: The Scope Manager

GeoContext (\src/context/GeoContext.js\) is the core scope management system. It manages the user's current geographic selection through 5 cascade levels.

### 1.1 Selection State

| Level | Field | Description |
|-------|-------|-------------|
| 5 - LM | selectedLm | Local Municipality (from user's active workbase) |
| 4 - Ward | selectedWard | Administrative ward (restored from MMKV or user-selected) |
| 3 - Erf | selectedErf | Cadastral parcel (user-selected via ERF screen or map) |
| 2 - Premise | selectedPremise | Physical property (user-selected via premise list or map) |
| 1 - Meter | selectedMeter | Meter/asset (user-selected via meter list) |

### 1.2 Cascade Clear Rules

When a higher-level selection changes, all lower levels are automatically cleared:

- \selectedLm\ changes -> clears ward, erf, premise, meter
- \selectedWard\ changes -> clears erf, premise, meter
- \selectedErf\ changes -> clears premise, meter
- \selectedPremise\ changes -> clears meter

### 1.3 Hydration Stages

**Stage 0: No LM, No Ward**
- All selections are null
- WarehouseContext remains closed (no data fetched)
- App shows empty scope state on dashboard screens

**Stage 1: LM known, Ward unknown**
- selectedLm is set from the user's active workbase in their profile
- MMKV is queried via \getRestorableLastActiveScope()\ for a restorable last-active ward
- If a valid ward is found, transitions to Stage 2 automatically

**Stage 2: LM + Ward known (ScopeReady)**
- Both \lmPcode\ and \wardPcode\ exist
- WarehouseContext opens and fetches all operational data via RTK Query
- MMKV saves the current scope via \saveLastActiveScope()\ for next session restore

### 1.4 MMKV Persistence

Last active ward scope is saved to MMKV:
- Key format: \{uid}__{workbaseId}__{lmPcode}\
- Value: \{ wardPcode, ward }\
- Restored via \getRestorableLastActiveScope()\ on app start/login

### 1.5 Flight Signal

GeoContext includes a \lightSignal\ counter. This counter increments on every state change. It is used as a dependency in \useEffect\ hooks to trigger downstream reactions without stale closures. This prevents race conditions where multiple state changes try to trigger the same side effect.

## 2. WarehouseContext: The Data Hub

WarehouseContext (\src/context/WarehouseContext.js\) is the central data aggregator. Once GeoContext signals \scopeReady\ (both lmPcode and wardPcode are truthy), WarehouseContext subscribes to RTK Query endpoints and aggregates the results into a single unified interface.

### 2.1 Data Access Levels

| Property | Content | Reactivity |
|----------|---------|------------|
| \vailable\ | Wards list (filtered to current LM) | Changes on LM change |
| \ll\ | Full dataset: wards, erfs, prems, meters, trns, geoLibrary | Changes on scope change (LM or Ward) |
| \iltered\ | Data filtered by leaf selection (erf, premise, meter) | Reacts to every selection change |
| \sync\ | Sync status for each domain (scope, wards, erfs, meters, trns) | Independent of selection |
| \loading\ | Composite loading flag | True while any domain is loading |

### 2.2 Data Sources

| Domain | RTK Query Endpoint |
|--------|-------------------|
| Wards | \useGetWardsByLocalMunicipalityQuery(lmPcode)\ |
| ERFs | \useGetErfsByLmPcodeWardPcodeQuery({ lmPcode, wardPcode })\ |
| Premises | \useGetPremisesByLmPcodeWardPcodeQuery({ lmPcode, wardPcode })\ |
| Meters (ASTs) | \useGetAstsByLmPcodeWardPcodeQuery({ lmPcode, wardPcode })\ |
| Transactions | \useGetTrnsByLmPcodeWardPcodeQuery({ lmPcode, wardPcode })\ |

### 2.3 GeoLibrary

The \geoLibrary\ is built from ERF geo entries (centroids, bboxes, geometry polygons) combined with ward polygon data. This powers the map screen and spatial queries. Built via \uildGeoLibrary()\ in \warehouseSelectors.js\.

### 2.4 Pack Key Validation

WarehouseContext validates that the ERF pack's \wardCacheKey\ matches the expected \lmPcode__wardPcode\ key before using cached data. This prevents stale data from a previous ward from being displayed during scope transitions.

## 3. Used By

- All screen components that display ward-scoped data (ERF list, premise list, etc.)
- Dashboard and analytics screens (WMS Dashboard, revenue dashboards)
- Map layer rendering (PremiseLayer.js, map markers)
- Filter modals (ward selectors, scope-based filtering)

---

> See related diagrams in ./diagrams/03_geoscope_state_machine.md, 04_geoscope_cascade_clear.md, 05_warehouse_data_flow.md
