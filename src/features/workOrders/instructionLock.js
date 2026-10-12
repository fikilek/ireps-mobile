// A form opened from an office instruction is locked to it. `DR-R001` 3.4.
//
// ONE WELL for four forms. Disconnection, Reconnection, Removal and Meter
// Reading each carried its own copy of this function with its own copy of the
// state list, all four identical and all four naming the words that stopped
// being states on 11 October. Four copies of one fact is how they come to
// disagree, and these are the forms a worker is standing at a meter with.
//
// A job in the bin or waiting in the pool locks the form too. Before this
// they were held only by the accidental `Boolean(action?.trnId)` clause
// below: the worker could open the form for a job that was no longer his,
// locked, with nothing saying why.

const upper = (value) => String(value ?? "").trim().toUpperCase();

/**
 * Every state in which the work belongs to an office instruction rather than
 * to the worker's own hand. An old word is placed on one of the five first.
 */
const PLACED = {
  ISSUED: "ISSUED",
  REASSIGNED: "ISSUED",
  ACCEPTED: "ACCEPTED",
  IN_PROGRESS: "ACCEPTED",
  REJECTED: "CREATED",
  CANCELLED: "CREATED",
  CREATED: "CREATED",
  DELETED: "DELETED",
  COMPLETED: "COMPLETED",
};

export function instructionState(action = {}) {
  const raw = upper(
    action?.workflowState ||
      action?.workflow?.state ||
      action?.trnActiveLifecycle?.workflowState,
  );

  return PLACED[raw] || "";
}

/**
 * Is this form standing on an office instruction?
 *
 * Every placed state counts, including `CREATED` and `DELETED`: a job the
 * office is holding or has binned is still the office's, and the form must
 * not let the worker capture against it as though it were his own find.
 */
export function isLifecycleInstructionLocked(action = {}) {
  return (
    action?.source === "WMS" ||
    Boolean(action?.instructionTrnId) ||
    Boolean(action?.trnId) ||
    Boolean(action?.id) ||
    Boolean(instructionState(action))
  );
}
