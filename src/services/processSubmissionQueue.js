import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { functions } from "../firebase";
import { getMediaExtension } from "../utils/getMediaExtension";
import { cleanupNoAccessMeterDiscoveryMedia } from "../utils/persistNoAccessMeterDiscoveryMedia";
import { thrownSubmissionRefusal } from "../utils/submissionRefusal";

import {
  getCallableNameForSubmissionQueueItem,
  getSubmissionQueue,
  markSubmissionQueueItemFailed,
  isThrownRefusal,
  markSubmissionQueueItemRefused,
  markSubmissionQueueItemSuccess,
  markSubmissionQueueItemSyncing,
  updateSubmissionQueueItem,
} from "../utils/submissionQueue";

let isQueueProcessing = false;

function isStandardMeterDiscoveryQueueItem(item = {}) {
  const formType = String(item?.formType || "")
    .trim()
    .toUpperCase();

  if (formType === "METER_DISCOVERY") return true;
  if (formType) return false;

  const trnType = String(
    item?.context?.trnType ||
      item?.payload?.accessData?.trnType ||
      item?.payload?.trnType ||
      "",
  )
    .trim()
    .toUpperCase();

  return trnType === "METER_DISCOVERY";
}

// x11 and m06 (TB-R059): when the server answers, it has decided, and sending the job again cannot
// change its mind. The job is kept as a refusal — never sent again — with the server's own sentence for
// the worker to read. Only these few codes mean "not yet, try later"; a job that never reached the
// server at all is a different thing and keeps waiting (the catch below).
//
// It is written this way round on purpose. It used to be a list of refusals the phone recognised, and
// anything not on it was put back to waiting and retried for ever while the card read "Draft saved
// locally" — so every code anybody added later fell into the same trap, silently. Now the trap cannot
// be re-made: an unknown refusal stops, like every other refusal.
const KEEP_WAITING_CODES = ["INVALID_PREMISE_ID", "PREMISE_NOT_FOUND", "UNAUTHENTICATED", "UNAVAILABLE", "DEADLINE_EXCEEDED", "INTERNAL"];

// A refusal that means "a transaction for this work already exists". Its photographs belong to that
// transaction, so they are never deleted — the office repairs the work from them (RG-R001 section 8).
const REFUSALS_WITH_A_SURVIVING_TRANSACTION = [
  "REGISTRATION_INCOMPLETE",
  "TRN_ALREADY_EXISTS",
];

/**
 * RG-R001 section 10: a refused submission takes its photographs with it.
 *
 * The evidence has to be uploaded before the server can decide, because the server refuses work whose
 * photographs are missing. When the work is then refused, nothing was saved and those files point at
 * a meter that does not exist. This is the one place in the app that uploads them, so it is the place
 * that clears them. It never throws: a file left behind must not turn a refusal into a crash - the
 * nightly sweep takes whatever this could not.
 *
 * Two things it will not do. It runs only AFTER the refusal is recorded, so a failure to record cannot
 * leave a retryable item pointing at deleted files. And it leaves the evidence alone when a
 * transaction for this work survives: the path is the same for every attempt on one meter, so deleting
 * here would strip the evidence off the very record the office is about to repair.
 */
async function deleteUploadedEvidence({
  uploadedStoragePaths = [],
  trnId,
  code = "",
}) {
  if (!uploadedStoragePaths.length) return;

  if (REFUSALS_WITH_A_SURVIVING_TRANSACTION.includes(String(code).toUpperCase())) {
    console.log(
      "processSubmissionQueue -- evidence kept: a transaction for this work exists",
      { trnId: trnId || "NAv", code },
    );
    return;
  }

  const storage = getStorage();

  for (const path of uploadedStoragePaths) {
    try {
      await deleteObject(ref(storage, path));
    } catch (error) {
      console.warn("processSubmissionQueue -- refused evidence left behind", {
        trnId: trnId || "NAv",
        path,
        message: error?.message || String(error),
      });
    }
  }
}


// A no access is a METER_DISCOVERY now (NA-R003), so it auto-sends with the rest.
const AUTO_SEND_FORM_TYPES = ["METER_DISCOVERY"];

/**
 * Is this queue item a No Access capture, of any kind of transaction?
 *
 * NA-R001: there is ONE No Access form, and every transaction type that can end in no access
 * opens it. So a no access is recognised by what it SAYS - the worker could not get in - and
 * never by which transaction it belongs to.
 *
 * The owner, 4 October 2026, testing a Meter Inspection no access with full signal: it was
 * saved on the phone and never sent, and the phone told him it would "be sent by itself as
 * soon as there is signal". There was signal. The sender had been asked for METER_DISCOVERY
 * no accesses only, so an Inspection capture was queued and then skipped - attempts 0 - and
 * the screen read "still waiting" as "waiting for signal".
 */
export function isNoAccessQueueItem(item = {}) {
  const hasAccess = String(item?.payload?.accessData?.access?.hasAccess || "")
    .trim()
    .toLowerCase();

  return hasAccess === "no";
}

function isAutoSendQueueItem(item = {}) {
  const formType = String(item?.formType || "")
    .trim()
    .toUpperCase();

  if (AUTO_SEND_FORM_TYPES.includes(formType)) return true;

  // EVERY no access, whatever transaction it belongs to. A form joins this list only once its
  // submit path saves before it sends and its callable accepts a repeat safely; the one No
  // Access form is the same path for all eight types - proved offline on the owner's phone on
  // 4 October - and onMeterLifecycleTrnCallable already treats a TRN id it has seen before as
  // a success rather than a duplicate.
  //
  // It is deliberately NOT every lifecycle capture: a found-meter inspection goes down its own
  // submit path, which has not been proved offline, and that is the bar for joining this list.
  if (isNoAccessQueueItem(item) && getCallableNameForSubmissionQueueItem(item)) {
    return true;
  }

  // Older captures were saved before formType was always written.
  return isStandardMeterDiscoveryQueueItem(item);
}

export const processSubmissionQueue = async ({
  agentUid = "SYSTEM",
  agentName = "SYSTEM",
  queueItemIds = null,
  filterMode = null,
  includeSyncing = false,
}) => {
  if (isQueueProcessing) {
    return {
      success: false,
      code: "QUEUE_BUSY",
      message: "Queue processing already in progress",
    };
  }

  isQueueProcessing = true;

  try {
    const netState = await NetInfo.fetch();

    // Unknown reachability counts as online. Coming out of airplane mode Android says "connected,
    // reachability unknown" for a few seconds, and demanding a definite yes made the sender answer
    // device offline and stop - with no second chance, because the signal does not change twice
    // (the owner's phone, 27 September: online for two minutes, nothing sent, zero attempts).
    //
    // Trying and failing costs one request. Refusing to try costs the day's work.
    const isOnline =
      Boolean(netState.isConnected) && netState.isInternetReachable !== false;

    if (!isOnline) {
      return {
        success: false,
        code: "DEVICE_OFFLINE",
        message: "Device offline",
      };
    }

    const queue = await getSubmissionQueue();
    const selectedQueueItemIds = Array.isArray(queueItemIds)
      ? new Set(queueItemIds.filter(Boolean))
      : null;

    const retryableStatuses = includeSyncing
      ? new Set(["PENDING", "FAILED", "SYNCING"])
      : new Set(["PENDING", "FAILED"]);

    const retryableItems = queue.filter((item) => {
      if (!retryableStatuses.has(item?.status)) return false;

      if (selectedQueueItemIds && !selectedQueueItemIds.has(item?.id)) {
        return false;
      }

      // OF-R001: the whole of Meter Discovery, whether the meter was there or not. The
      // no-access mode below is kept for the service that only ever wanted those.
      if (filterMode === "METER_DISCOVERY") {
        return isStandardMeterDiscoveryQueueItem(item);
      }

      // OF-R001/OF-R002: the forms whose whole submit path has been proved offline first, and may
      // therefore be sent by the background sender without a worker watching. A form joins this
      // list only once it saves before it sends and its callable accepts a repeat safely.
      //
      // Targeted Batch No Access joined on 27 September: its dialog had promised since the start
      // that the capture "will sync automatically", and nothing ever sent it.
      if (filterMode === "AUTO_SEND") {
        return isAutoSendQueueItem(item);
      }

      // NA-R001: one No Access form, every transaction type. This used to read
      // METER_DISCOVERY_NO_ACCESS and demand the transaction be a Meter Discovery, so the
      // form's own submit skipped an Inspection no access it had just queued.
      if (filterMode === "NO_ACCESS") {
        return isNoAccessQueueItem(item);
      }

      return true;
    });

    if (!retryableItems.length) {
      return {
        success: true,
        message: "No retryable queue items",
      };
    }

    const storage = getStorage();

    for (const item of retryableItems) {
      // RG-R001 section 10: what this attempt put into storage, so a refusal can take it away again.
      // It lives out here because the refusal can be thrown as well as answered.
      const uploadedStoragePaths = [];

      try {
        const syncingResult = await markSubmissionQueueItemSyncing(
          item.id,
          agentUid,
          agentName,
        );

        if (
          syncingResult?.queueItem?.status === "SUCCESS" &&
          syncingResult?.queueItem?.result?.success === true
        ) {
          continue;
        }

        const payload = item?.payload || {};
        const originalMedia = Array.isArray(payload?.media)
          ? payload.media
          : [];

        const syncedMedia = await Promise.all(
          originalMedia.map(async (mediaItem) => {
            if (mediaItem?.uri && !mediaItem?.url) {
              const folder =
                payload?.accessData?.access?.hasAccess === "yes"
                  ? `${payload?.meterType}_meters`
                  : "no_access";

              const stableId = payload?.trnId || payload?.id || item?.id;
              const extension = isStandardMeterDiscoveryQueueItem(item)
                ? getMediaExtension(mediaItem)
                : "jpg";
              const fileName = `${stableId}_${mediaItem?.tag}.${extension}`;

              const storagePath = `meters/${folder}/${fileName}`;
              const storageRef = ref(storage, storagePath);

              const response = await fetch(mediaItem.uri);
              const blob = await response.blob();

              const upload = uploadBytesResumable(storageRef, blob);
              const uploadTimer = setTimeout(() => upload.cancel(), 60000);
              try { await upload; } finally { clearTimeout(uploadTimer); }
              uploadedStoragePaths.push(storagePath);

              const downloadUrl = await getDownloadURL(storageRef);

              const cleanItem = { ...mediaItem };
              if (!isNoAccessQueueItem(item)) delete cleanItem.uri;

              return {
                ...cleanItem,
                url: downloadUrl,
              };
            }

            return mediaItem;
          }),
        );

        const finalPayload = {
          ...payload,
          media: syncedMedia,
        };

        if (JSON.stringify(syncedMedia) !== JSON.stringify(originalMedia)) {
          await updateSubmissionQueueItem(
            item.id,
            { payload: finalPayload },
            agentUid,
            agentName,
          );
        }

        const callableName = getCallableNameForSubmissionQueueItem(item);

        if (!callableName) {
          // m06: nothing about waiting will give this item a form type. It stops.
          await markSubmissionQueueItemRefused(
            item.id,
            {
              code: "UNKNOWN_QUEUE_FORM_TYPE",
              message:
                "This local queue item does not have a recognised form type and cannot be synced safely.",
              trnId: finalPayload?.id || "NAv",
            },
            agentUid,
            agentName,
          );

          // RG-R001 section 10: this refusal takes its photographs with it too, in the same order as
          // the others — recorded first, then cleared.
          await deleteUploadedEvidence({
            uploadedStoragePaths: isNoAccessQueueItem(item) ? [] : uploadedStoragePaths,
            trnId: finalPayload?.id,
            code: "UNKNOWN_QUEUE_FORM_TYPE",
          });

          continue;
        }

        const callable = httpsCallable(functions, callableName, { timeout: 60000 });

        const callableResponse = await callable(finalPayload);

        console.log("processSubmissionQueue -- callable routing", {
          queueItemId: item?.id,
          status: item?.status,
          formType: item?.formType,
          trnType:
            item?.context?.trnType ||
            item?.payload?.accessData?.trnType ||
            item?.payload?.trnType,
          callableName,
          erfNo: item?.context?.erfNo || item?.payload?.accessData?.erfNo,
          meterNo: item?.context?.meterNo || item?.payload?.ast?.astData?.astNo,
        });

        const result = callableResponse?.data || {};

        if (!result?.success) {
          const code = result?.code || "SYNC_FAILED";

          // Parent premise not ready yet -> keep retryable
          if (KEEP_WAITING_CODES.includes(code)) {
            await updateSubmissionQueueItem(
              item.id,
              {
                status: "PENDING",
                result: {
                  success: false,
                  code,
                  message:
                    result?.message ||
                    "Parent premise is not ready yet. This draft will retry later.",
                  trnId: "NAv",
                },
              },
              agentUid,
              agentName,
            );

            continue;
          }

          // The server answered and refused: it stops here. RG-R001 section 4 - the worker reads the
          // plain sentence, and the server's own wording is kept beside it for the office.
          await markSubmissionQueueItemRefused(
            item.id,
            {
              code,
              message:
                result?.plain || result?.message || "Submission requires review.",
              detail: result?.message || "NAv",
              trnId: result?.trnId || finalPayload?.trnId || "NAv",
            },
            agentUid,
            agentName,
          );

          // RG-R001 section 10: nothing was saved, so this attempt's photographs are orphans and go
          // with the refusal. AFTER the refusal is recorded, never before: if recording fails the item
          // becomes retryable again, and a retry sends addresses of files that no longer exist
          // (independent review, 2026-09-28).
          await deleteUploadedEvidence({
            uploadedStoragePaths: isNoAccessQueueItem(item) ? [] : uploadedStoragePaths,
            trnId: finalPayload?.id,
            code,
          });

          continue;
        }

        const successResult = await markSubmissionQueueItemSuccess(
          item.id,
          {
            code: result?.code || "SUCCESS",
            message: result?.message || "Synced successfully",
            trnId: result?.trnId || finalPayload?.id || "NAv",
          },
          agentUid,
          agentName,
        );

        if (
          successResult?.success === true &&
          successResult?.queueItem?.status === "SUCCESS" &&
          successResult?.queueItem?.result?.success === true &&
          (isNoAccessQueueItem(item) || isStandardMeterDiscoveryQueueItem(item))
        ) {
          try {
            // OF-R001: a found meter keeps its pictures in app storage too now, so the sweep
            // covers the whole form. Without this the phone fills up with sent evidence.
            await cleanupNoAccessMeterDiscoveryMedia({
              trnId: finalPayload?.id,
            });
          } catch (cleanupError) {
            console.warn(
              "processSubmissionQueue -- durable No Access media cleanup failed",
              {
                trnId: finalPayload?.id || "NAv",
                message: cleanupError?.message || String(cleanupError),
              },
            );
          }
        }
      } catch (error) {
        console.log("processSubmissionQueue -- item failed", item?.id, error);

        const message = error?.message || "";
        const code = error?.code || "";

        // m06: matched on the code alone. It used to match the word "premise" anywhere in the message,
        // so a refusal that merely mentioned a premise was forced back into waiting and retried for ever.
        if (KEEP_WAITING_CODES.includes(code)) {
          console.log("processSubmissionQueue -- catch → keeping PENDING");

          await updateSubmissionQueueItem(
            item.id,
            {
              status: "PENDING",
              result: {
                success: false,
                code: "PREMISE_NOT_READY",
                message:
                  "Parent premise is not ready yet. This draft will retry later.",
                trnId: "NAv",
              },
            },
            agentUid,
            agentName,
          );

          continue;
        }

        // The server threw because it refused. It stops here, in the server's own words.
        if (isThrownRefusal(code)) {
          await markSubmissionQueueItemRefused(
            item.id,
            thrownSubmissionRefusal(error, item?.payload?.id || "NAv"),
            agentUid,
            agentName,
          );

          // RG-R001 section 10, after the refusal is recorded — see the answered path above.
          await deleteUploadedEvidence({
            uploadedStoragePaths: isNoAccessQueueItem(item) ? [] : uploadedStoragePaths,
            trnId: item?.payload?.id,
            code,
          });

          continue;
        }

        // Never reached the server: it waits, and is sent again.
        await markSubmissionQueueItemFailed(
          item.id,
          {
            code: code || "SYNC_FAILED",
            message: message || "Sync failed",
            trnId: "NAv",
          },
          agentUid,
          agentName,
        );
      }
    }

    const remaining = (await getSubmissionQueue()).filter((entry) =>
      retryableItems.some((attempted) => attempted.id === entry.id) && ["PENDING", "FAILED", "SYNCING"].includes(entry.status));
    return { success: remaining.length === 0, code: remaining.length ? "QUEUE_PENDING" : "OK",
      message: remaining.length ? "Some visits are still waiting to send." : "Queue processed" };
  } catch (error) {
    console.log("processSubmissionQueue error:", error);

    return {
      success: false,
      message: error?.message || "Queue processing failed",
    };
  } finally {
    isQueueProcessing = false;
  }
};
