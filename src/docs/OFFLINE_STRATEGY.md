# iREPS Mobile — OFFLINE_STRATEGY.md

## 1. Overview

The app is designed as offline-first. Forms can be filled and submitted without network connectivity. When connectivity is restored, a background sync service processes the queue automatically.

## 2. Network Detection

Using \@react-native-community/netinfo\ for network state detection. Two detection points:

1. **Form submission**: \NetInfo.fetch()\ checks connectivity before deciding to submit or queue
2. **Background sync**: \NetInfo.addEventListener\ for real-time connectivity changes that trigger the sync service

## 3. Submission Queues

Three MMKV-backed queues store pending submissions:

| Queue | Storage File | Retries FAILED? |
|-------|-------------|-----------------|
| Premise Queue | premiseSubmissionQueue.js | No (only PENDING) |
| General Queue | submissionQueue.js | Yes (PENDING + FAILED) |
| Account Data Queue | accountDataSubmissionQueue.js | Yes (PENDING + FAILED) |

### Queue Item Structure

`
{
  id: string,           // Unique queue item ID
  status: "PENDING" | "SYNCING" | "SUCCESS" | "FAILED",
  payload: object,       // The form data to submit
  formType: string,      // Determines which Cloud Function to call
  context: object,       // Metadata about the form (erfNo, meterNo, etc.)
  result: {
    success: boolean,
    code: string,
    message: string,
    itemId: string       // The Firestore document ID
  },
  metadata: {
    createdAt: string (ISO),
    updatedAt: string (ISO),
    createdByUid: string,
    createdByUser: string,
    version: "v2"
  }
}
`

## 4. Form Submission Flow

1. User fills form and taps Submit
2. \NetInfo.fetch()\ checks connectivity
3. **If OFFLINE**:
   - Save to queue with status \PENDING\
   - Show success toast + redirect to offline storage screen
4. **If ONLINE**:
   - Upload all local media URIs to Firebase Storage (with individual timeouts)
   - Call Cloud Function with complete payload (15s timeout)
   - On timeout: save to queue as fallback
   - On success: remove from queue if previously existed

## 5. Background Sync Service

\src/services/startSubmissionQueueSyncService.js\ listens to NetInfo connectivity changes.

### Sync Flow

1. Lock acquired (\isQueueProcessing / isPremiseQueueProcessing\ flags prevent parallel runs)
2. Read queue - filter retryable items
3. For each item:
   a. Mark as \SYNCING\
   b. Upload any local media URIs (\mediaItem.uri && !mediaItem.url\) to Firebase Storage
   c. Determine Cloud Function name from \ormType\ \$(getCallableNameForSubmissionQueueItem)\
   d. Call Cloud Function with complete payload (including download URLs)
   e. On success -> mark \SUCCESS\ (removed from queue on next cycle)
   f. On \INVALID_PREMISE_ID / PREMISE_NOT_FOUND\ -> keep \PENDING\ (retry later)
   g. On other failures -> mark \FAILED\
4. Release lock

## 6. Retry Logic

- \FAILED\ items in the general queue are retried on the next sync cycle
- \PREMISE_NOT_READY\ errors are kept as \PENDING\ for automatic retry
- A processing lock (boolean flag) prevents parallel sync runs
- The sync service runs automatically when NetInfo detects connectivity restoration

## 7. Important Distinctions

- The **Premise Queue** only retries \PENDING\ items (not \FAILED\)
- The **General Queue** retries both \PENDING\ and \FAILED\ items
- Premise parent dependency: if a premise is not yet synced, the general queue keeps dependent items as \PENDING\
- All queue operations are synchronous MMKV reads/writes to prevent race conditions

---

> See related diagrams in ./diagrams/07_offline_form_submission.md, 14_sync_service_retry_logic.md
