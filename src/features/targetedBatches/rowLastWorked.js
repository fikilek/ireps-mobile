// TB-R051 (1.3.68): when a batch's meter was last worked on, so the meter a worker has just finished
// is the first one they see when they come back to the list.
//
// No single field carries it. The back end moves `fieldWork.updatedAt` on the batch's reference in the
// Sales record on every submit (a premise, a meter, a No Access), writes the row's completion when the
// row closes, and records a different meter found at the ERF (TB-R063) on the Sales record itself. The
// newest of them is the time; a meter with none of them has never been worked on.

// Timestamps reach the phone as a Firestore Timestamp, a plain {seconds}, or a string.
export function toWorkedMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// A No Access visit is kept as the day and time it was recorded, not as a timestamp.
export function noAccessVisitMillis(visit = {}) {
  const date = String(visit?.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;

  const time = String(visit?.time ?? "").trim();
  const clock = /^\d{2}:\d{2}(:\d{2})?$/.test(time) ? time : "00:00:00";
  const parsed = Date.parse(`${date}T${clock.length === 5 ? `${clock}:00` : clock}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

// The newest field-work time on this row, or 0 when nobody has worked on it.
// `fieldWork` is the batch's own reference in the Sales record; `sales` the Sales record.
export function readRowLastWorkedMillis(row = {}, { fieldWork = null, sales = null } = {}) {
  const visits = Array.isArray(fieldWork?.noAccess) ? fieldWork.noAccess : [];

  return Math.max(
    0,
    toWorkedMillis(fieldWork?.updatedAt),
    toWorkedMillis(fieldWork?.submittedAt),
    toWorkedMillis(row?.execution?.completedAt),
    toWorkedMillis(row?.execution?.startedAt),
    toWorkedMillis(row?.metadata?.updatedAt),
    toWorkedMillis(sales?.differentMeterFound?.foundAt),
    ...visits.map(noAccessVisitMillis),
  );
}
