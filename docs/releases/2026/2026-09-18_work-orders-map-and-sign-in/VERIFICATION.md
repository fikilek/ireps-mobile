# Release Verification

**Release:** My Work Orders search and map, faster returns, clearer sign in, meter-number rule
**Release Date:** 18 September 2026
**Git ref:** `b1eedd7`
**Status:** IN PROGRESS — TEST build check outstanding

---

## Automated checks — passed

| Check | Result |
| --- | --- |
| Unit tests (`node --test "src/**/*.test.mjs" "app/**/*.test.mjs"`) on merged `main` | 369 / 369 passed |
| `expo-doctor` | 18 / 18 passed |
| `expo install --check` | Dependencies up to date |
| Android bundle, LIVE settings (`expo export --platform android`) | Builds (9.79 MB) |
| ESLint on the changed files | 0 errors |
| Native files (`package.json`, `patches/`, `app.config.js`, `eas.json`) | Unchanged since build 11 |
| Firestore indexes used by the new map (ERFs by Ward and box, premises by Ward and position, Sales by LM and ERF, batch rows by batch and row) | Present on DEV, TEST and LIVE |

The 5 remaining ESLint errors in the repository are pre-existing. They are broken imports in `src/test/` and `src/debugging/` files that the app never bundles (register item p13).

Independent reviews:

- Drop 1: four rounds.
- Map work: two rounds, plus one for each of 1.3.40 and the ERF label fix.
- Load time: two rounds.
- Sign in: one review.
- Meter numbers: one review.

---

## Owner's DEV phone checks — passed

Run from `C:\dev\ireps-mobile` against DEV on 17–18 September 2026.

| Check | Result |
| --- | --- |
| Returning to My Work Orders and reopening a batch | Instant |
| Accepting a batch | Works |
| Offline banner | Right |
| Batch map: zoom in and out with Sales on — icons stay in their ERFs, numbers above the centre | Passed |
| A real sign in goes straight through | Passed |
| First opening of My Work Orders | **Not noticeably faster** (Ward ERF pack downloading at the same time) — known |

---

## TEST build check — OUTSTANDING

To be done on a real handset with the `test` APK before the `live` link goes to the field.

| # | Check | Result |
| --- | --- | --- |
| 1 | The test APK installs **over** the old test app without uninstalling, and forms already waiting on the phone are still there | |
| 2 | Sign in with a wrong password shows **Sign in failed**; with the right one it goes straight through | |
| 3 | My Work Orders opens; note the seconds for the first opening | |
| 4 | Open a batch; search by meter number, ERF and street | |
| 5 | Map button: the spinner, then pins, ERF numbers and the Sales button | |
| 6 | Tap an open meter: "Checking the batch meter…", then the form opens with the batch | |
| 7 | A completed meter is locked | |
| 8 | Meter Discovery: type a meter number with a dash — it is refused with the message; with spaces and small letters it is cleaned | |

---

## Rollback position

This release is JavaScript only, so it can be fixed forward without a new APK round:

- **Over the air.** `eas update --channel production` reaches both build 11 and this build, because they share runtime `exposdk:54.0.0`. It applies on the second launch. No over-the-air update has been sent yet, so try the first one on the `test` channel.
- **Rebuild.** A live build from `2ddfa1a` returns to build 11's code. It installs only as a higher build number, never by downgrading, because an uninstall would delete waiting forms.
