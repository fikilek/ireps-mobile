import { isSameTabRoute, returnAfterLifecycleWork } from "./lifecycleReturn.js";

export const PREMISE_TAB = "/(tabs)/premises";
export const PREMISE_WORKORDERS = "/(tabs)/admin/operations/my-workorders";
export const PREMISE_QUEUE = "/(tabs)/admin/storage/premise-offline-storage";
const ORIGINS = new Set([PREMISE_TAB, PREMISE_WORKORDERS, PREMISE_QUEUE, "/(tabs)/maps"]);

export function premiseFormReturnRoute(value, { fromWorkorder = false, fromQueue = false } = {}) {
  const origin = String((Array.isArray(value) ? value[0] : value) || "").trim();
  // Entry-point origin wins over batch context carried through the Premises tab.
  if (ORIGINS.has(origin)) return origin;
  if (fromQueue) return PREMISE_QUEUE;
  return fromWorkorder ? PREMISE_WORKORDERS : PREMISE_TAB;
}

export function returnAfterPremiseForm(router, href) {
  if (isSameTabRoute(href, PREMISE_TAB) && typeof router?.dismissTo === "function") {
    // Reuse the source screen and its filters, rather than replacing it.
    router.dismissTo(href);
    return "dismissTo";
  }
  return returnAfterLifecycleWork(router, href, PREMISE_TAB);
}
