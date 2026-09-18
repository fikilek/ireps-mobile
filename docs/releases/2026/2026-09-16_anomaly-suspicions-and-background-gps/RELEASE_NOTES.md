# iREPS Mobile Release Notes

**Release:** Meter Ok suspicions, background GPS repair, over-the-air updates
**Release Date:** 16 September 2026
**Release Stage:** Release Candidate
**Environment:** TEST and LIVE
**EAS Profiles:** `test` (channel `test`) and `live` (channel `production`)
**Artifact:** APK (internal distribution)
**Git ref:** `0c083b1` (clean tree — both builds are the same commit)
**Runtime:** `exposdk:54.0.0`
**App Version:** 1.0.0
**Android Build (versionCode):** 11 (`live`) · 34 (`test`, build `5f5341df-25bb-4e3c-8074-c596b290541e`)
**LIVE EAS Build ID:** `fdd0d2e6-3a32-4daf-b121-aa25c3ea0101`
**Field Approved:** No
**General Release:** No

---

## 1. Meter Ok now carries bridge and bypass suspicions

Requested by the field. A meter can be working perfectly and still look interfered with, and until now there was nowhere to say so.

**Meter Ok** now offers three details instead of one:

| Detail | Photo required |
| --- | --- |
| Operationally Ok | No |
| Bridge Suspicion | **Yes** |
| Bypass Suspicion | **Yes** |

The other three anomalies — Meter Faulty, Meter Damaged, Illegally Connected — are unchanged.

### The anomaly photo now follows the detail

Before this release the rule was *"any anomaly except Meter Ok needs a photo"*. That rule would have let a bridge or bypass suspicion be filed with no picture at all, which is worth very little when it is disputed.

The rule is now decided by the **detail**: everything except Operationally Ok needs its anomaly photo. It is enforced on the phone **and** on the server, so the two cannot drift apart.

A submission carrying no detail keeps the old rule, so anything queued offline on a phone before this release is never refused for want of a photo.

### A suspicion is not a healthy meter

A Meter Ok carrying a suspicion now reads **amber** — not the green tick — in the asset list and in both the electricity and water transaction reports. Only Operationally Ok stays green.

### What had to be fixed to make this work

Both anomaly pickers assumed Meter Ok had exactly one detail. `AnomalySelect` filled it in automatically and `AnomalyDetailSelect` **disabled the dropdown**. Adding the options alone would have shipped a locked picker: the field would have seen three details and been unable to choose either suspicion. Both now fill the detail in only where there is a single option and nothing to choose.

**Rules:** `MA-R001 1.0.0` (`ireps-rules/logic-rules/meter-anomaly-rules.md`).

---

## 2. Background GPS no longer crashes the app

On 14 September the DEV app died with an `OutOfMemoryError` on an SM-A065F while the FWR background location task was running. The cause was three Android bugs in `expo-task-manager@14.0.9`, none of which had been backported to SDK 54.

The worst of them: **every new GPS fix cancelled the pending job and rescheduled it with all previous fixes merged in**, so the job data grew without bound — 385 cancellations against 5 completions in 43 minutes, with the final job reaching 146 KB. The heap climbed from 42 MB to 256 MB in half an hour.

This release carries a `patch-package` backport:

| Fix | What it does |
| --- | --- |
| [expo#41688](https://github.com/expo/expo/pull/41688) | Each batch of fixes gets its own job. Data is merged only as the Android job limit approaches |
| [expo#47844](https://github.com/expo/expo/pull/47844) | The task callback is released after use. Previously every executed task leaked its `JobService` and `JobParameters` |
| [expo#47958](https://github.com/expo/expo/pull/47958) | The headless task manager is cleared when the context is destroyed, so events still reach JS when the process was started headless by a GPS broadcast and the app is then opened |
| — | `JSONObject.NULL` is converted to a real null |

**One part of the upstream fix was deliberately not taken.** The merged version of #41688 also rewrites `createJobInfo` to use `setPersisted(true)` with `setImportantWhileForeground(true)`, which builds a job with no constraint and crashes on every task delivery on Android 9–11 — a live bug, [expo#47571](https://github.com/expo/expo/issues/47571). The job constraints were never the cause of the memory problem, so they are left exactly as they ship today.

**Note for the field:** on the affected phone, LIVE also showed no JavaScript acknowledgements while in the background, so background FWR GPS may not have been reaching the server at all. This release is expected to correct that, and it is the single most important thing to verify on a real handset.

---

## 3. Over-the-air updates are now possible

`app.config.js` has carried an update URL and a runtime version for some time, but `expo-updates` was never installed — so none of it did anything, and every fix of any size needed a new APK on every phone.

`expo-updates@~29.0.20` is now installed. From this build onwards a JavaScript-only fix can be delivered with `eas update --channel production` instead of a distribution round.

This is visible on the EAS build page: these builds show a **Channel** (`test` / `production`), where every previous build shows `None`.

**This release itself cannot be delivered over the air.** It contains native changes, and the phones in the field do not yet have `expo-updates`. Everyone must install the APK. The benefit begins with the release after this one.

---

## Backend changes that ship with this release

Deployed to DEV, TEST and LIVE on 16 September 2026:

- `onMeterDiscoveryCallable`
- `onMeterDiscoveryCreated`
- `onMeterInstallationCallable`

They carry the matching anomaly photo rule. The server was deployed before the APK on purpose: a phone running the old app cannot produce a suspicion, so the stricter rule has nothing to reject.

---

## Known items not addressed in this release

- **Forensic photo GPS is not checked against the meter.** A photo can be taken any distance from the meter it documents and will be accepted. Observed during testing of this release: photos recorded at Butterworth against a meter in Dundee, roughly 600 km apart.
- **The MREAD proximity rule is bypassed on LIVE.** `functions/meterLifecycle/helpers.js` hard-codes `distanceMeters = 4` with the comment `TEMP REMOTE TEST CHEAT`, so the "you must be next to the meter" rule passes from anywhere, and every LIVE meter reading stores 4 m as its distance.

Both are carried into the iREPS Mobile work that follows this release.
