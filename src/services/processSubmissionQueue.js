import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { functions } from "../firebase";
import { cleanupNoAccessMeterDiscoveryMedia } from "../utils/persistNoAccessMeterDiscoveryMedia";

import {
  getCallableNameForSubmissionQueueItem,
  getSubmissionQueue,
  markSubmissionQueueItemFailed,
  markSubmissionQueueItemSuccess,
  markSubmissionQueueItemSyncing,
  updateSubmissionQueueItem,
} from "../utils/submissionQueue";

let isQueueProcessing = false;

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

    const isOnline = netState.isConnected && netState.isInternetReachable;

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

      if (filterMode === "METER_DISCOVERY_NO_ACCESS") {
        const formType = String(item?.formType || "")
          .trim()
          .toUpperCase();
        const trnType = String(
          item?.context?.trnType ||
            item?.payload?.accessData?.trnType ||
            item?.payload?.trnType ||
            "",
        )
          .trim()
          .toUpperCase();
        const hasAccess = String(
          item?.payload?.accessData?.access?.hasAccess || "",
        )
          .trim()
          .toLowerCase();

        return (
          (formType === "METER_DISCOVERY" || trnType === "METER_DISCOVERY") &&
          hasAccess === "no"
        );
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
              const fileName = `${stableId}_${mediaItem?.tag}.jpg`;

              const storageRef = ref(storage, `meters/${folder}/${fileName}`);

              const response = await fetch(mediaItem.uri);
              const blob = await response.blob();

              await uploadBytes(storageRef, blob);

              const downloadUrl = await getDownloadURL(storageRef);

              const { uri, ...cleanItem } = mediaItem;

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
          await markSubmissionQueueItemFailed(
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

          continue;
        }

        const callable = httpsCallable(functions, callableName);

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

          if ([
            "TARGETED_BATCH_METER_ALREADY_LINKED", "TARGETED_BATCH_ROW_NOT_EXECUTABLE",
            "TARGETED_BATCH_ROW_EXECUTION_STATE_INVALID", "TARGETED_BATCH_ROW_CORRELATION_MISMATCH",
            "TARGETED_BATCH_SALES_LINK_MISMATCH", "TARGETED_BATCH_ERF_LINK_MISMATCH",
            "TARGETED_BATCH_PREMISE_LINK_MISMATCH", "SALES_DOCUMENT_NOT_FOUND",
            "SALES_TB_REF_NOT_FOUND", "SALES_TB_REF_DUPLICATE", "IDEMPOTENCY_CONFLICT",
            "TARGETED_BATCH_ACCESS_DENIED", "TARGETED_BATCH_NOT_ASSIGNED_TO_ACTOR",
          ].includes(code)) {
            await updateSubmissionQueueItem(item.id, {
              status: "CONFLICT",
              result: { success: false, code, message: result?.message || "Submission requires review.", trnId: finalPayload?.trnId || "NAv" },
            }, agentUid, agentName);
            continue;
          }

          // Parent premise not ready yet -> keep retryable
          if (code === "INVALID_PREMISE_ID" || code === "PREMISE_NOT_FOUND") {
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

          await markSubmissionQueueItemFailed(
            item.id,
            {
              code,
              message: result?.message || "Submission sync failed",
              trnId: result?.trnId || "NAv",
            },
            agentUid,
            agentName,
          );

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
          String(finalPayload?.accessData?.trnType || "")
            .trim()
            .toUpperCase() === "METER_DISCOVERY" &&
          String(finalPayload?.accessData?.access?.hasAccess || "")
            .trim()
            .toLowerCase() === "no"
        ) {
          try {
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

        const isPremiseError =
          message.includes("PREMISE") ||
          message.includes("premise") ||
          code === "INVALID_PREMISE_ID" ||
          code === "PREMISE_NOT_FOUND";

        if (isPremiseError) {
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

        await markSubmissionQueueItemFailed(
          item.id,
          {
            code: "SYNC_FAILED",
            message: message || "Sync failed",
            trnId: "NAv",
          },
          agentUid,
          agentName,
        );
      }
    }

    return {
      success: true,
      message: "Queue processed",
    };
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
