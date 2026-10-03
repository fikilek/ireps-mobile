// No Access rules NA-R003 (1.3.0) — the gate.
//
// Before a worker reaches ANY transaction form they answer one question: did you reach the
// meter? Yes opens the form. No opens the No Access screen, and they never see the form at
// all - there is nothing in it for them, because the form exists to record a meter and there
// is no meter.
//
// The words live here so the question reads the same wherever it is asked. Meter Discovery
// and Meter Installation already had a gate of their own (water, electricity, no access);
// this is the two-answer version for work issued against a meter that already exists.

import { formatStreetAddress } from "../premises/streetAddress.js";

// NA-R030: the record stores the address and the property type as WORDS, not as the objects a
// premise holds them in. A premise address is { strNo, strName, strType, suburbName } and a
// property type is { type, name, unitNo }; handing either to a screen crashes it with
// "Objects are not valid as a React child". formatStreetAddress is the app's own formatter,
// so the words read the same here as everywhere else.
export function premiseAddressWords(premise = {}) {
  return formatStreetAddress(premise?.address || {}) || "";
}

export function premisePropertyTypeWords(premise = {}) {
  const t = premise?.propertyType || {};
  return [t?.type, t?.name, t?.unitNo].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
}

export const ACCESS_GATE = Object.freeze({
  title: "Did you reach the meter?",
  // NA-R001 section 1: the test is the hand, not the eye. A meter seen through a gate or
  // photographed over a wall was not reached.
  message: "Answer YES only if you could touch the meter with your hand.",
  yes: "YES, I REACHED IT",
  no: "NO ACCESS",
});

export const NO_ACCESS_ROUTE = "/(tabs)/admin/operations/no-access";

/**
 * NA-R044 (1.3.0): a no access is to a PREMISE. Work issued against a meter always has one,
 * because a meter cannot exist without a premise - ERF, then premise, then meter. So this
 * never has to invent one, and if it is ever missing the server refuses rather than recording
 * something nobody can act on.
 */
export function buildAssetNoAccessContext(asset = {}, { returnTo, trnType } = {}) {
  const accessData = asset?.accessData || {};

  return {
    // NA-R003: a no access on a disconnection is a disconnection that could not be done.
    trnType: trnType || "METER_DISCOVERY",
    erfId: accessData?.erfId || "",
    erfNo: accessData?.erfNo || "NAv",
    premiseId: accessData?.premise?.id || null,
    premiseAddress: premiseAddressWords(accessData?.premise),
    premisePropertyType: premisePropertyTypeWords(accessData?.premise),
    wardPcode: accessData?.parents?.wardPcode || "",
    lmPcode: accessData?.parents?.lmPcode || "",
    meterNo: asset?.ast?.astData?.astNo || asset?.astNo || "",
    astId: asset?.id || "",
    returnTo: returnTo || "/(tabs)/asts",
  };
}

/** True when the work can be recorded at all — the premise the no access would name. */
export function assetCanRecordNoAccess(asset = {}) {
  return Boolean(asset?.accessData?.premise?.id && asset?.accessData?.erfId);
}
