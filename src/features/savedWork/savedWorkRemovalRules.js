// OF-R002 (1.0.0) section 7: work leaves the phone in one of two ways only — the office accepted
// it, or a supervisor removed it on purpose, with a reason, and that removal is recorded.
//
// Before this, Clear sat next to Sync and threw away every item after one tap, unsent work
// included. The owner lost two queued disconnections to it on 27 September.

export const SUPERVISOR_ROLES = ["SPV", "MNG", "ADM", "SPU"];

const clean = (value) => String(value || "").trim();

/**
 * Work the office has confirmed it has. Only this may be cleared without asking anyone.
 * Every queue on the phone marks a confirmed send the same way.
 */
export function isSentToOffice(item = {}) {
  return item?.status === "SUCCESS" && item?.result?.success === true;
}

/** Work still to go: nothing here may be deleted except by a supervisor, with a reason. */
export function isUnsentWork(item = {}) {
  return !isSentToOffice(item);
}

export function canRemoveUnsentWork(role) {
  return SUPERVISOR_ROLES.includes(clean(role).toUpperCase());
}

// The owner, 27 September: "why do we need such a long sentence". A supervisor tidying a phone
// should tap, not type. These are the reasons work is actually removed in the field; any one of
// them explains the removal on its own.
export const REMOVAL_REASONS = [
  "Captured twice by mistake",
  "Wrong meter or wrong place",
  "Test capture, not real work",
  "The office already has this work",
  "The worker asked for it to be removed",
];

/**
 * Any reason at all, picked or typed. What matters is that somebody chose one and it is kept with
 * their name — not how long it is.
 */
export function validateRemovalReason(reason) {
  const text = clean(reason);

  if (!text) {
    return { valid: false, message: "Pick a reason." };
  }

  return { valid: true, reason: text };
}

/**
 * The whole decision in one call, so every queue screen answers it the same way.
 * `sent` work needs a plain confirmation; unsent work needs a supervisor and a reason.
 */
export function assessRemoval({ item = {}, role, reason } = {}) {
  if (isSentToOffice(item)) {
    return { allowed: true, needsReason: false, code: "ALREADY_SENT" };
  }

  if (!canRemoveUnsentWork(role)) {
    return {
      allowed: false,
      needsReason: true,
      code: "NOT_A_SUPERVISOR",
      message:
        "This work has not reached the office yet. Only a supervisor can remove it.",
    };
  }

  const check = validateRemovalReason(reason);

  if (!check.valid) {
    return {
      allowed: false,
      needsReason: true,
      code: "REASON_REQUIRED",
      message: check.message,
    };
  }

  return { allowed: true, needsReason: true, code: "SUPERVISOR_REMOVAL", reason: check.reason };
}

/** What is kept about a removal, so work never disappears without a trace. */
export function buildRemovalRecord({
  item = {},
  store = "NAv",
  reason = "NAv",
  removedByUid = "NAv",
  removedByUser = "NAv",
  removedByRole = "NAv",
  removedAt = new Date().toISOString(),
} = {}) {
  return {
    id: clean(item?.id) || "NAv",
    store: clean(store) || "NAv",
    formType: clean(item?.formType || item?.context?.trnType) || "NAv",
    status: clean(item?.status) || "NAv",
    wasSent: isSentToOffice(item),
    meterNo: clean(item?.context?.meterNo) || "NAv",
    erfNo: clean(item?.context?.erfNo) || "NAv",
    premiseId: clean(item?.context?.premiseId) || "NAv",
    capturedAt: clean(item?.metadata?.createdAt) || "NAv",
    capturedByUid: clean(item?.metadata?.createdByUid) || "NAv",
    capturedByUser: clean(item?.metadata?.createdByUser) || "NAv",
    reason: clean(reason) || "NAv",
    removedByUid: clean(removedByUid) || "NAv",
    removedByUser: clean(removedByUser) || "NAv",
    removedByRole: clean(removedByRole) || "NAv",
    removedAt,
  };
}
