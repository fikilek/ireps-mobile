export const REMAINING_CREDIT_PHOTO_TAG = "remainingCreditPhoto";
export const REMAINING_CREDIT_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
export const REMAINING_CREDIT_OTHER_PREFIX = "Other:";

export function toRemainingCreditString(value) {
  return String(value ?? "");
}

export function hasRemainingCredit(value) {
  return toRemainingCreditString(value).trim() !== "";
}

export function getUsableMediaUri(item = {}) {
  return String(item?.uri || item?.url || "").trim();
}

export function hasUsableRemainingCreditPhoto(media = []) {
  return (
    Array.isArray(media) &&
    media.some(
      (item) =>
        item?.tag === REMAINING_CREDIT_PHOTO_TAG &&
        getUsableMediaUri(item) !== "",
    )
  );
}

export function removeRemainingCreditPhoto(media = []) {
  return Array.isArray(media)
    ? media.filter((item) => item?.tag !== REMAINING_CREDIT_PHOTO_TAG)
    : [];
}

export function hydrateRemainingCreditMeter(meter = {}) {
  const storedComment = toRemainingCreditString(
    meter?.remainingCreditComment,
  ).trim();
  const isCanonicalOther = storedComment.startsWith(
    `${REMAINING_CREDIT_OTHER_PREFIX} `,
  );

  const hydratedMeter = {
    ...(meter || {}),
    remainingCredit: toRemainingCreditString(meter?.remainingCredit),
    remainingCreditComment: isCanonicalOther ? "Other" : storedComment,
    remainingCreditCommentOther: isCanonicalOther
      ? storedComment.slice(REMAINING_CREDIT_OTHER_PREFIX.length).trim()
      : "",
  };

  if (hydratedMeter?.type === "conventional") {
    hydratedMeter.remainingCredit = "";
    hydratedMeter.remainingCreditComment = "";
    hydratedMeter.remainingCreditCommentOther = "";
  }

  return hydratedMeter;
}

export function canonicalizeRemainingCredit({
  meter = {},
  media = [],
  isDiscovery = true,
} = {}) {
  const canonicalMeter = { ...(meter || {}) };
  let canonicalMedia = Array.isArray(media) ? [...media] : [];
  const isPrepaidDiscovery =
    isDiscovery === true && canonicalMeter?.type === "prepaid";

  if (!isPrepaidDiscovery) {
    delete canonicalMeter.remainingCredit;
    delete canonicalMeter.remainingCreditComment;
    delete canonicalMeter.remainingCreditCommentOther;
    canonicalMedia = removeRemainingCreditPhoto(canonicalMedia);

    return {
      meter: canonicalMeter,
      media: canonicalMedia,
    };
  }

  const remainingCredit = toRemainingCreditString(
    canonicalMeter?.remainingCredit,
  ).trim();

  if (remainingCredit !== "") {
    canonicalMeter.remainingCredit = remainingCredit;
    canonicalMeter.remainingCreditComment = "";
    delete canonicalMeter.remainingCreditCommentOther;
  } else {
    canonicalMeter.remainingCredit = "";
    const selectedReason = toRemainingCreditString(
      canonicalMeter?.remainingCreditComment,
    ).trim();
    const otherReason = toRemainingCreditString(
      canonicalMeter?.remainingCreditCommentOther,
    ).trim();

    canonicalMeter.remainingCreditComment =
      selectedReason === "Other" && otherReason
        ? `${REMAINING_CREDIT_OTHER_PREFIX} ${otherReason}`
        : selectedReason;
    delete canonicalMeter.remainingCreditCommentOther;
    canonicalMedia = removeRemainingCreditPhoto(canonicalMedia);
  }

  return {
    meter: canonicalMeter,
    media: canonicalMedia,
  };
}

export function getRemainingCreditValidationError({
  isDiscovery = true,
  meter = {},
  media = [],
  approvedReasons = [],
} = {}) {
  if (isDiscovery !== true || meter?.type !== "prepaid") {
    return null;
  }

  const remainingCredit = toRemainingCreditString(
    meter?.remainingCredit,
  ).trim();
  const remainingCreditComment = toRemainingCreditString(
    meter?.remainingCreditComment,
  ).trim();
  const remainingCreditCommentOther = toRemainingCreditString(
    meter?.remainingCreditCommentOther,
  ).trim();
  const hasCredit = remainingCredit !== "";

  if (hasCredit) {
    if (!REMAINING_CREDIT_PATTERN.test(remainingCredit)) {
      return {
        path: "ast.astData.meter.remainingCredit",
        message: "Enter a valid Remaining Credit value",
      };
    }

    if (remainingCreditComment !== "") {
      return {
        path: "ast.astData.meter.remainingCreditComment",
        message: "Remaining Credit reason is not allowed when a value is captured",
      };
    }

    if (!hasUsableRemainingCreditPhoto(media)) {
      return {
        path: "media",
        message: "Remaining Credit photo required",
      };
    }

    return null;
  }

  if (!remainingCreditComment) {
    return {
      path: "ast.astData.meter.remainingCreditComment",
      message: "Remaining Credit reason is required",
    };
  }

  if (!approvedReasons.includes(remainingCreditComment)) {
    return {
      path: "ast.astData.meter.remainingCreditComment",
      message: "Select a valid Remaining Credit reason",
    };
  }

  if (remainingCreditComment === "Other" && !remainingCreditCommentOther) {
    return {
      path: "ast.astData.meter.remainingCreditCommentOther",
      message: "Specify the other Remaining Credit reason",
    };
  }

  return null;
}
