# iREPS Mobile — Updated Release Candidate Notes

**Date:** 27 August 2026  
**Release Stage:** Pilot / Release Candidate  
**Environment:** LIVE  
**EAS Profile:** `live`  
**Artifact:** APK  
**Updated LIVE EAS Build ID:** Pending  
**Field Approved:** No  
**General Release:** No  

## Pilot Status

The previous Release Candidate (26 August 2026) was issued to **one pilot field tester**.

Pilot testing is **not yet complete**.

In particular:

- Meter Disconnection has **not yet been fully pilot-tested**.
- Meter Reconnection has **not yet been fully pilot-tested**.
- The previous Release Candidate must therefore **not be treated as Field Approved**.
- The wider field team should remain on the previous known-good release until the updated Release Candidate completes pilot testing.

The next LIVE APK Release Candidate must include both:

1. the changes already contained in the 26 August 2026 pilot release; and
2. the latest Meter Discovery improvements completed on 27 August 2026.

---

## Changes Included in the Updated Release Candidate

### 1. Disconnection & Reconnection

Improved the Meter Disconnection and Meter Reconnection workflows and lifecycle handling.

This work remains part of the updated Release Candidate and still requires explicit pilot testing before wider field rollout.

Testing should include:

- launching Disconnection from the intended meter/asset workflow;
- completing and submitting a Disconnection;
- confirming the resulting transaction;
- launching Reconnection;
- completing and submitting a Reconnection;
- confirming that the expected meter lifecycle state is preserved.

### 2. No Access

No Access reasons have been standardised so that the same approved reasons are used consistently across the relevant field workflows.

### 3. Ward ERF Sync

Ward ERF Sync is available again from the Admin menu.

This allows field users to:

- open the Ward ERF Sync page directly;
- sync Ward ERF packs to the device;
- manage locally stored Ward ERF data;
- remove/drop locally stored Ward ERF packs when required.

### 4. Meter Discovery — Normalisation

The Meter Discovery Normalisation section has been cleaned up and simplified.

Redundant options were removed and the approved Normalisation values are now used consistently.

### 5. TRNS

Improved meter identification in the Mobile TRNS screen so that transactions belonging to the selected meter can be resolved correctly across different transaction types.

### 6. Meter Discovery — General Field Worker Comment

Meter Discovery now includes the shared **FWR General Comment** section.

The field worker can optionally capture:

- a written general comment;
- a photo;
- a voice clip;
- a video clip.

The General Comment is transaction-level evidence and remains on the Meter Discovery TRN.

General Comment evidence is not copied into the resulting AST.

### 7. General Comment Media Preview

The shared General Comment media experience has been improved.

- Photo preview continues to use the existing full-screen photo preview.
- Voice clips can now be opened in a dedicated full-screen audio preview.
- Video clips can now be opened in a dedicated full-screen video preview.
- Audio/video playback is stopped when the preview is closed or the user leaves the screen.

Because this is a shared General Comment component, the improved voice/video preview also applies to:

- Meter Disconnection;
- Meter Reconnection.

Their transaction payload contracts were not changed.

### 8. Meter Discovery — Prepaid Remaining Credit

Meter Discovery now captures **Remaining Credit** for prepaid meters.

This applies to:

- prepaid electricity meters;
- prepaid water meters.

It does not apply to conventional meters.

#### Remaining Credit captured

When the field worker can read the remaining credit:

- Remaining Credit is entered;
- a Remaining Credit photo is mandatory.

A value of `0` is treated as a valid captured balance and still requires a photo.

#### Remaining Credit not captured

When the remaining credit cannot be obtained, the field worker must select a reason.

Approved reasons are:

- Display blank / no reading
- Display damaged
- Display unreadable
- Unable to obtain balance
- Meter not responding
- Other

If **Other** is selected, the field worker must enter a short explanation.

The explanation is stored as part of the existing Remaining Credit comment value.

### 9. Remaining Credit Data Integrity

Additional safeguards were added so that stale Remaining Credit information does not survive incorrectly.

Examples include:

- clearing a captured Remaining Credit removes the associated Remaining Credit photo from the current form state;
- changing a meter from prepaid to conventional clears prepaid-only Remaining Credit state;
- switching back to prepaid does not resurrect stale Remaining Credit evidence.

### 10. Meter Discovery Media Handling

Meter Discovery media handling was improved so that non-photo General Comment evidence keeps the correct file type.

This protects:

- voice clips;
- video clips;
- photos;

during:

- immediate online submission;
- standard No Access durable storage;
- automatic queued retry;
- manual queued retry.

### 11. Backward Compatibility

The updated Meter Discovery payload uses a new Meter Discovery contract version for the new Remaining Credit rules.

The backend remains compatible with older/unversioned Meter Discovery submissions during the compatibility period.

This prevents older APKs or previously queued Meter Discovery submissions from being rejected solely because they pre-date the Remaining Credit feature.

---

# Pilot Test Requirements

The updated Release Candidate must be tested as a complete package before Field Approval.

## Priority Pilot Checks

### Disconnection

- launch from the intended meter/asset workflow;
- complete the form;
- test General Comment text/photo/voice/video where practical;
- submit successfully;
- confirm the transaction appears correctly.

### Reconnection

- launch from the intended meter/asset workflow;
- complete the form;
- test General Comment text/photo/voice/video where practical;
- submit successfully;
- confirm the transaction appears correctly.

### Meter Discovery — Conventional

Confirm:

- Remaining Credit does not appear;
- existing Meter Discovery behaviour remains unchanged;
- submission succeeds.

### Meter Discovery — Prepaid Electricity

Test both:

1. Remaining Credit captured + photo;
2. Remaining Credit unavailable + reason.

Also test:

- Remaining Credit = `0`;
- `Other` + mandatory explanation;
- General Comment text/photo/voice/video.

### Meter Discovery — Prepaid Water

Test both:

1. Remaining Credit captured + photo;
2. Remaining Credit unavailable + reason.

Also confirm Water Token Reading remains unchanged.

### Meter Discovery — No Access

Test standard Meter Discovery No Access with General Comment evidence.

### General Comment Media

Verify on Meter Discovery, Disconnection and Reconnection:

- photo preview;
- voice full-screen preview;
- video full-screen preview;
- deletion;
- playback stops after closing/leaving the form.

### General Field Checks

Report any:

- login problems;
- ERF or Ward syncing problems;
- Meter Discovery problems;
- TRN submission problems;
- photo/audio/video problems;
- GPS problems;
- Disconnection/Reconnection problems;
- crashes or freezing;
- slow performance;
- behaviour that differs unexpectedly from the previous known-good release.

---

# Field Release Notes / WhatsApp Message

*iREPS MOBILE — UPDATED PILOT RELEASE*  
*27 August 2026*

A new updated iREPS Mobile Release Candidate is being prepared for pilot testing.

This release includes all changes from the previous pilot release, together with the latest Meter Discovery improvements.

*WHAT'S NEW*

• *Disconnection & Reconnection*  
Improved the Meter Disconnection and Reconnection workflows and lifecycle handling. These still require explicit pilot testing before wider rollout.

• *No Access*  
No Access reasons have been standardised across the relevant field workflows.

• *Ward ERF Sync*  
Ward ERF Sync is available again from the Admin menu for syncing and managing locally stored Ward ERF data.

• *Meter Discovery — Normalisation*  
The Normalisation section has been simplified by removing redundant options and using the approved Normalisation values.

• *TRNS*  
Improved meter identification so transactions for the selected meter are resolved correctly across different transaction types.

• *Meter Discovery — General Comment*  
Field workers can now add an optional written comment, photo, voice clip and video clip to Meter Discovery.

• *General Comment Media Preview*  
Voice and video evidence can now be opened in dedicated full-screen previews. The same improved preview is available on Disconnection and Reconnection.

• *Prepaid Remaining Credit*  
Meter Discovery now captures Remaining Credit for prepaid electricity and water meters.

If the balance is visible, capture the value and a photo.

If the balance cannot be obtained, select a reason.

If *Other* is selected, an explanation is required.

A balance of `0` is a valid reading and still requires a photo.

*IMPORTANT — PILOT RELEASE*

This APK is not yet approved for general field rollout.

Only one pilot user received the previous Release Candidate, and Disconnection/Reconnection have not yet been fully pilot-tested.

Please use the updated application normally during field operations and report any problems.

Do not share the pilot APK with other field users until the release has completed pilot testing and has been formally approved.

*DOWNLOAD & INSTALL*

New LIVE APK link: **TO BE ADDED AFTER THE UPDATED EAS `live` BUILD COMPLETES**

---

# Release Approval Record

## Previous Release Candidate

**Date:** 26 August 2026  
**EAS Build ID:** `eaf37b20-f2c7-48e4-a5f1-7c5923f100f3`  
**Pilot distribution:** One field tester  
**Pilot status:** Incomplete  
**DCN tested:** No / not yet confirmed  
**RCN tested:** No / not yet confirmed  
**Field Approved:** No  

## Updated Release Candidate

**Date:** 27 August 2026  
**EAS Build ID:** Pending  
**APK link:** Pending  
**Pilot status:** Pending  
**Field Approved:** No  
**General Release:** No  

## Source Commits for Updated Release Candidate

Mobile:

`b1a04a0f25b761fbb0af1dd4a4e98c476dd806a1`

Web/backend:

`5d12480efdb972dd8646a151b925a0d92f5cba2e`

These commits contain the completed Meter Discovery Feature Improvements v1 work that must be included in the updated Release Candidate.
