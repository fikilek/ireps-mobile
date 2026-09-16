# Release Verification

**Release:** Meter Ok suspicions, background GPS repair, over-the-air updates
**Release Date:** 16 September 2026
**Git ref:** `0c083b1`
**Status:** IN PROGRESS — device verification outstanding

---

## Automated checks — passed

| Check | Result |
| --- | --- |
| Functions test suite (`ireps-web/functions`) | 589 / 589 passed |
| Meter discovery validation suite | 58 / 58 passed, including the new suspicion tests |
| Anomaly logic checks against the shipped `formOptions.js` | 4 / 4 passed |
| `expo-doctor` | 18 / 18 passed |
| ESLint on every changed file | 0 errors |
| `expo-task-manager` patch re-applies after a clean `npm install` | Confirmed — this is what EAS does on every build |

The 5 remaining ESLint errors in the repository are pre-existing: broken imports in `src/test/` and `src/debugging/` files that Metro never bundles, because nothing in the app entry graph imports them.

---

## DEV verification — passed

Meter discovery submitted from the DEV app against `ireps2` on 16 September 2026 at 02:56:38Z.

**Transaction:** `TRN_MDIS_1789527276694_ELC_ZA5241006_1695`
**Premise:** 1695 Tom Worthington Street, Ward ZA5241006
**Captured by:** Lefu Motlou

Evidence in the stored record:

- `ast.anomalies.anomaly` = `"Meter Ok"`
- `ast.anomalies.anomalyDetail` = `"Bridge Suspicion"` — proves the detail picker is no longer locked to the first option
- `media` contains an entry tagged `anomalyPhoto` — proves the new photo rule fired and was satisfied
- The record reached `asts` and `trns`, so the redeployed DEV validator accepted it — front and back agree

---

## Device verification — OUTSTANDING

To be completed on a real handset with the `test` APK before the `live` APK is distributed.

| # | Check | Result |
| --- | --- | --- |
| 1 | Meter Ok selected — the ANOMALY DETAIL dropdown is open and empty, not greyed out and pre-filled | |
| 2 | Operationally Ok selected — submits as before, no anomaly photo requested | |
| 3 | Bypass Suspicion selected with no photo — submission is **refused** | |
| 4 | Bypass Suspicion with a photo — submits and the record lands in `ireps-test` | |
| 5 | The transaction report shows the suspicion in **amber**, not the green tick | |
| 6 | An existing plain Meter Ok asset still reads green (regression check) | |
| 7 | **Phone locked 20–30 minutes with FWR running — background locations still arrive server-side** | |
| 8 | No `OutOfMemoryError` and no crash after a sustained background session | |

Checks 7 and 8 are the ones that cannot be proven by reading code or inspecting a record. They are the reason for the test build.

---

## Rollback position

If checks 7 or 8 fail, the `expo-task-manager` patch is the suspect. The anomaly work is independent of it and sits in its own commit:

- `a176e76` — anomaly change only (JavaScript)
- `0c083b1` — `expo-task-manager` patch and `expo-updates` (native)

A live build from `a176e76` alone delivers the field request without the native change.
