# Deployment Record

**Release:** Meter Ok suspicions, background GPS repair, over-the-air updates
**Release Date:** 16 September 2026
**Status:** Backend complete. APK distribution pending device verification.

---

## Source

| Repository | Commit | What it carries |
| --- | --- | --- |
| `ireps-mobile` | `a176e76` | Meter Ok carries bridge and bypass suspicions (MA-R001 1.0.0) |
| `ireps-mobile` | `0c083b1` | `expo-task-manager` patch; `expo-updates` installed |
| `ireps-web` | `624a91a` | Anomaly photo decided by the detail, not the anomaly |
| `ireps-rules` | `239925b` | Meter anomaly rules MA-R001 1.0.0 |

Both APKs were built from `0c083b1` with a clean working tree.

---

## Backend deployment — complete

Functions deployed: `onMeterDiscoveryCallable`, `onMeterDiscoveryCreated`, `onMeterInstallationCallable`

| Environment | Project | Status |
| --- | --- | --- |
| DEV | `ireps2` | Deployed 16 September 2026 |
| TEST | `ireps-test` | Deployed 16 September 2026 |
| LIVE | `ireps-5c3e9` | Deployed 16 September 2026 |

The server went out ahead of the APK deliberately. A phone running the old app cannot select a suspicion, so the stricter photo rule has nothing to reject and old phones are unaffected.

---

## Builds

| Profile | Channel | Git ref | Runtime | Outcome |
| --- | --- | --- | --- | --- |
| `test` | `test` | `0c083b1` | `exposdk:54.0.0` | Finished, 24m 41s. versionCode 34, build `5f5341df-25bb-4e3c-8074-c596b290541e` |
| `live` | `production` | `0c083b1` | `exposdk:54.0.0` | Finished. versionCode 11, build `fdd0d2e6-3a32-4daf-b121-aa25c3ea0101` |

App version 1.0.0. Android credentials: remote (Expo server), keystore `Build Credentials N8kBeiIyAG` (default).

LIVE install link (internal distribution):
https://expo.dev/accounts/ireps/projects/maps1/builds/fdd0d2e6-3a32-4daf-b121-aa25c3ea0101

Both builds show a **Channel** for the first time. Every earlier build shows `None`, because `expo-updates` was not installed until this release.

---

## Distribution

**Not yet distributed.**

The `live` APK must not reach any phone until the device verification in `VERIFICATION.md` passes, in particular the background GPS checks.

Every field phone must install this APK. It cannot be delivered over the air: it contains native changes, and the phones currently in the field do not have `expo-updates`. Anyone who does not install it keeps seeing a single detail under Meter Ok and keeps the old background-location behaviour.

---

## Notes for the next release

From the release after this one, a JavaScript-only fix can be delivered with:

```
eas update --channel production
```

Native changes — anything touching a native module, a patch under `patches/`, or the Expo SDK — still require a build and a distribution round.
