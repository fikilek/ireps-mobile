export function canEditQueueItem(status) {
  return (
    status === "PENDING" ||
    status === "FAILED" ||
    status === "CONFLICT" ||
    status === "IN_PROGRESS"
  );
}

export function getQueueItemDisplayResult(item, formatRefusal) {
  if (item?.status === "PENDING") {
    return {
      code: "PENDING",
      message: "Draft saved locally",
    };
  }

  if (item?.status === "IN_PROGRESS") {
    return {
      code: item?.result?.code || "LOCAL_SAVE_ONLY",
      message:
        item?.result?.message ||
        "Saved locally only. Tap Edit to continue and submit.",
    };
  }

  if (item?.status === "SYNCING") {
    return {
      code: "SYNCING",
      message: "Submission is currently being synced",
    };
  }

  if (item?.status === "FAILED") {
    return {
      code: item?.result?.code || "FAILED",
      message: item?.result?.message || "Submission sync failed.",
    };
  }

  if (item?.status === "SUCCESS") {
    return {
      code: item?.result?.code || "SUCCESS",
      message: item?.result?.message || "TRN created successfully.",
    };
  }

  const refusalCode = item?.result?.code || "NAv";
  const words =
    typeof formatRefusal === "function"
      ? formatRefusal(refusalCode, item?.result?.message)
      : null;

  return {
    code: refusalCode,
    message: words?.title
      ? `${words.title}. ${words.body}`
      : item?.result?.message || "NAv",
  };
}

export function getQueueItemSyncLabel({ isOnline = true, status } = {}) {
  if (!isOnline) return "Offline";
  if (status === "SYNCING") return "Syncing...";
  if (status === "SUCCESS") return "Synced";
  if (status === "PENDING") return "Sync";
  if (status === "CONFLICT") return "Refused";
  if (status === "IN_PROGRESS") return "Draft Only";
  return "Pending Only";
}
