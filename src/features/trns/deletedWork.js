// A deleted job is not on the worker's phone. `DR-R001` 5.5.
//
// The owner, 11 October 2026: **"DELETED must not show in FWRs devices. It
// will confuse them."**
//
// ONE WELL, AND IT IS THE WHOLE MECHANISM. There is no second line of defence:
// `firestore.rules` is nine lines allowing any signed-in client to read
// everything, so a deleted transaction really does arrive on the device over
// the wire. What keeps it off his screen is this code and nothing else.
//
// It is excluded at the WAREHOUSE, where the ward's transactions land, because
// one unconstrained query feeds the TRNs tab, the premise and asset lists, the
// TRN filter and stats, and all five admin dashboards. Filtering in each of
// them would be nine chances to forget one - and the dashboards are exactly
// where forgetting shows as a total that no box adds up to, which is the fault
// the owner found on his own phone on 11 October.
//
// `CREATED` is deliberately NOT excluded here. A job waiting in the pool is
// nobody's work, and `myWorkItems.js` keeps it off his cards for that reason -
// but it is a real transaction on that meter, and the TRNs tab is a record of
// what has happened to a meter rather than a list of his jobs.

const upper = (value) => String(value ?? "").trim().toUpperCase();

/** Is this transaction in the bin? */
export function isDeletedWork(trn) {
  // The transaction's own state is the truth (`DR-R001` 5.3). The meter's
  // marker is read as well, because a cached record may carry one and not the
  // other, and either saying DELETED is enough to keep it off his screen.
  return (
    upper(trn?.workflow?.state) === "DELETED" ||
    upper(trn?.workflowState) === "DELETED" ||
    upper(trn?.trnActiveLifecycle?.workflowState) === "DELETED"
  );
}

/** The same list, without what the office has put in the bin. */
export function withoutDeletedWork(trns) {
  const list = Array.isArray(trns) ? trns : [];

  return list.filter((trn) => !isDeletedWork(trn));
}
