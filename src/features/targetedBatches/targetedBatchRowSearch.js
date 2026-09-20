// TB-R051: search a batch's rows by meter number (any part), ERF number or street address.
// Customer name and account number are never searched (TB-R042).
const PLACEHOLDERS = new Set(["", "-", "nav", "n/a", "na", "null", "undefined"]);

const collapse = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const digitsOf = (value) => String(value ?? "").replace(/\D/g, "");
const meaningful = (value) => !PLACEHOLDERS.has(value);

function meterNumbers(row) {
  return [row.meterNo, row.raw?.meter?.numberRaw, row.raw?.meter?.numberNormalized, row.raw?.salesAllMeterId];
}

function erfNumbers(row) {
  return [row.erfNo, row.raw?.property?.erfNo, row.raw?.location?.erfNo];
}

function streetAddresses(row) {
  const lines = [row.addressLine1, row.raw?.location?.addressLine1];
  if (lines.some((value) => meaningful(collapse(value)))) return lines;
  // row.address falls back to the town when the row has no street line; a town is not a street address.
  return row.raw?.location ? [] : [row.address];
}

const isCompleted = (row) => String(row?.displayStatus || row?.executionStatus || "").trim().toUpperCase() === "COMPLETED";

// TB-R051: only a query made of digits, spaces and hyphens is read as a meter number, so "0425 123"
// finds meter 04251234567 while the house number in "5 Church" never matches meter numbers holding a 5.
const looksLikeMeterNumber = (text) => /^[\d\s-]+$/.test(text) && /\d/.test(text);

export function targetedBatchRowMatchesSearch(row, query) {
  const text = collapse(query);
  if (!text) return true;
  if (!row || typeof row !== "object") return false;

  const contains = (value) => {
    const clean = collapse(value);
    return meaningful(clean) && clean.includes(text);
  };

  if (looksLikeMeterNumber(text)) {
    const queryDigits = digitsOf(text);
    if (meterNumbers(row).some((value) => digitsOf(value).includes(queryDigits))) return true;
  } else if (meterNumbers(row).some(contains)) {
    return true;
  }

  return erfNumbers(row).some(contains) || streetAddresses(row).some(contains);
}

export function searchTargetedBatchRows(rows, query) {
  return (Array.isArray(rows) ? rows : []).filter((row) => targetedBatchRowMatchesSearch(row, query));
}

// TB-R051 (1.3.42): the batch header's filters. Total shows every meter; a status shows only its meters.
export const TARGETED_BATCH_STATUS_FILTERS = Object.freeze({
  TOTAL: "TOTAL",
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
});

// The status a row counts under, by the same test as the header counts: Completed, In Progress, else Not Started.
export function targetedBatchRowStatus(row) {
  const status = String(row?.displayStatus || row?.executionStatus || "").trim().toUpperCase();
  if (status === "COMPLETED") return TARGETED_BATCH_STATUS_FILTERS.COMPLETED;
  if (status === "IN_PROGRESS") return TARGETED_BATCH_STATUS_FILTERS.IN_PROGRESS;
  return TARGETED_BATCH_STATUS_FILTERS.NOT_STARTED;
}

export function filterTargetedBatchRowsByStatus(rows, filter) {
  const list = Array.isArray(rows) ? rows : [];
  const wanted = String(filter || "").toUpperCase();
  if (
    wanted !== TARGETED_BATCH_STATUS_FILTERS.NOT_STARTED &&
    wanted !== TARGETED_BATCH_STATUS_FILTERS.IN_PROGRESS &&
    wanted !== TARGETED_BATCH_STATUS_FILTERS.COMPLETED
  ) {
    return list;
  }
  return list.filter((row) => targetedBatchRowStatus(row) === wanted);
}

// Tapping the selected status again, or Total, goes back to every meter.
export function nextTargetedBatchStatusFilter(current, tapped) {
  const next = String(tapped || "").toUpperCase();
  if (!Object.values(TARGETED_BATCH_STATUS_FILTERS).includes(next)) return TARGETED_BATCH_STATUS_FILTERS.TOTAL;
  return next === current ? TARGETED_BATCH_STATUS_FILTERS.TOTAL : next;
}

// TB-R051: open work is listed first; the order is otherwise kept.
export function sortTargetedBatchRowsOpenFirst(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return [...list.filter((row) => !isCompleted(row)), ...list.filter(isCompleted)];
}
