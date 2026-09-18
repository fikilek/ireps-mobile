# iREPS Mobile Release Notes

**Release:** My Work Orders search and map, faster returns, clearer sign in, meter-number rule
**Release Date:** 18 September 2026
**Release Stage:** Release Candidate
**Environment:** TEST and LIVE
**EAS Profiles:** `test` (channel `test`) and `live` (channel `production`)
**Artifact:** APK (internal distribution)
**Git ref:** `b1eedd7` on `main` (clean tree — both builds are the same commit)
**Runtime:** `exposdk:54.0.0`
**App Version:** 1.0.0
**Android Build (versionCode):** 13 (`live`) · 35 (`test`)
**LIVE EAS Build ID:** `513efa39-e2d8-4c5c-868c-596311fd5a76`
**Field Approved:** No
**General Release:** No

JavaScript only. No native module, patch or Expo SDK change, and no Functions or index deploy is needed: the phone works with the server as it stands on DEV, TEST and LIVE.

---

## 1. Search in a batch

**Rule:** TB-R051 (Targeted Batch rules 1.3.35).

In My Work Orders, an open batch now has a search box: **Search meter no., ERF or street**.

---

## 2. Batch map

**Rules:** TB-R051 1.3.35, map amendments 1.3.38 and 1.3.40.

A map button on the batch header opens the batch on a map.

- **Pins** sit at the best point iREPS has for each meter:
  - **S**: the Sales GPS point;
  - **G**: the geocoded address point, not observed in the field;
  - **E**: the ERF centre, when there is nothing better.
- Tapping a pin opens the same action tiles as the list.
- **Buttons with words:** ERFs (on at opening), Premises (off), Sales (off), Me (centres on the worker only when tapped) and Satellite (Normal at opening).
- **Other Sales meters** (CAT1–CAT8, by the local municipality's newest category month) show with status colours: ▲ blue, ★ orange, ■ green. Only those inside the batch area (the geofence plus 50 m) are drawn, at most 500 per query, with an honest note when the category month is missing or not everything loaded.
- **"Opening the batch map…"** shows until the map has zoomed to the batch geofence (else the pins), for 15 seconds at most.
- **ERF numbers** are drawn above the ERF's centre, inside the ERF, so a pin at the centre no longer hides the number. Sales icons sit exactly on their point, so zooming never moves one into a neighbouring ERF.
- The Operations area has one title bar, with a back arrow to Admin.

---

## 3. Completed meters are shown and locked

**Rule:** TB-R051. Owner's standard: a VISIBLE Sales meter IS completed.

A meter that is VISIBLE, or whose batch row is completed, shows as completed with its buttons locked. Open work is listed first.

---

## 4. The batch goes with the work

**Rule:** TB-R051.

Every way into a batch meter now checks, live, before the form opens:

- that the batch row still exists and is open;
- that the batch is the worker's own accepted batch;
- that the worker's role may do the work.

The worker sees **"Checking the batch meter…"** while it checks. This covers the tiles, the map sheet, Discover on the premise list, **+** and **ADD FIRST PREMISE**, the Maps tab, the ERF list and the premise card.

This closes two traps found on LIVE:

- **Discover on a premise card dropped the batch.** The capture then landed without batch context and the row stayed open. This was the main source of the 141 visible-but-open batch rows.
- **A phone kept an unallocated batch usable.** The server refused the submission, but the worker was never told.

The premise form keeps the batch it opened with, including when the app reuses an open form for a new meter.

### Smaller fixes

- A button that waits for more than 30 seconds stops and says why, instead of hanging.
- A meter in another Ward no longer gives a false "Premise Linkage Error".
- Android back goes up one level.
- Honest offline messages, for example "No connection — your work orders are not loaded".
- The rows screen closes when the batch leaves the worker's list.
- The Sales listener recovers after a dropped connection.
- The debug log that printed every batch row on each change is removed.

---

## 5. My Work Orders loads only the worker's own work

**Rule:** TB-R052 (Targeted Batch rules 1.3.39). Register item m02.

Before this release the screen downloaded everyone's data and sorted it on the phone. That included all batches, the newest 500 transactions project-wide (about 1.6 MB), all teams and service providers, and one Sales listener per row.

Now:

- Only the worker's own batches, BGO batches and teams are read.
- Office work orders are read by type and state. Finished ones are listed for 30 days, from office channels only.
- Sales records are read 30 at a time.
- Lists stay live for 24 hours after leaving the screen, and the last 3 batches are kept. Everything is released at sign-out or when a session ends.
- Accepting, rejecting or reloading never empties a list.
- **"Not up to date — reconnecting"** shows when a connection fails or only the phone's memory answers.
- The phone's form queue is confirmed from its own waiting forms.

It also fixes a defect: an office work order older than the newest 500 transactions dropped off the worker's list.

**Owner's DEV phone test (17 September):**

- Returning to the screen is instant.
- Accept works.
- The offline banner is right.
- **The first opening is not yet noticeably faster**, because the Ward's ERF pack (3,081 ERFs) downloads at the same moment.

---

## 6. Sign in says what went wrong

**Rule:** AU-R001 1.1.1, sign-in part only. Register item auth01.

Sign in used to say "Network error" for everything. Now each failure has its own window:

| Title | Message |
| --- | --- |
| No connection | Check your signal and try again. |
| Sign in failed | Email or password is not right. |
| Too many tries | Wait a few minutes and try again. |
| Account stopped | Speak to your manager. |

- Sign in waits at most 30 seconds for the person's record. What was typed stays in the form, and anyone left signed in with nowhere to go gets a **Sign out**.
- A token refresh is never reported as a failed sign in.

**Not in this release (Friday evening, after the Functions deploy):** the password-change gate, the sign-up service provider list, password reset and the invited-profile screens. "Lost access?" still goes nowhere.

---

## 7. Meter numbers: letters and digits only

**Rule:** MV-R001 1.1.0 section 8 (`ireps-rules/logic-rules/meter-visibility-rules.md`).

In Meter Discovery and Meter Installation, water and electricity:

- every space is removed (start, middle and end);
- a–z become capitals;
- any other character is **refused with a message**: *"Meter number may only contain letters and digits. Remove dashes, slashes, dots or other symbols."* Nothing is removed quietly;
- leading zeros are kept.

The Sales meter number prefilled from a Targeted Batch is cleaned with the same rule.

**Why:** two numbers are the same meter only when their cleaned numbers are equal. The same rule is being applied on the server and in the Sales pipeline (web stream), so a meter always carries one number.

---

## Backend changes that ship with this release

None. All the database indexes the new map and load-time queries use are present on DEV, TEST and LIVE (checked 18 September 2026).

---

## Known items not addressed in this release

- **The first opening of My Work Orders is still slow** while the Ward's ERF pack downloads.
- **Another Ward waits for a full ERF download:** tapping a meter in another Ward re-downloads that Ward's ERF list (1.8–6.9 MB), although the phone has it saved. Needs an owner decision.
- **The server does not refuse a meter that became VISIBLE while a form was open.** `premiseLink.js` `assertRowReady` refuses only a completed row. This needs a Functions change.
- **Offline queues re-submit batch work without a phone-side re-check.**
- **Offline wording is still false in some forms.** Meter Discovery (access), Meter Installation and TB No Access say "will sync automatically", which is not true. This belongs to the Offline First stream.
- **The rest of the sign-in work** waits for Friday evening (see section 6).
