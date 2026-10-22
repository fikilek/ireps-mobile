// TB-R051, section 17 (1.3.74): the search box matches everything the work order card shows - the meter
// number (any part), the number found on site, the ERF number, the address line with the shop's name and
// unit number (TB-R067), the account number and the account holder's name. Thirteen shops at 26 Old Acre
// Street read the same address, and at the door the worker is given an account number and a name, so those
// are what they have to search on (owner, 2026-09-24). TB-R042 is untouched: it bars accounts from batching
// decisions, and finding a row on a list already in the worker's hand is not one.
const PLACEHOLDERS = new Set(["", "-", "nav", "n/a", "na", "null", "undefined"]);

const collapse = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const digitsOf = (value) => String(value ?? "").replace(/\D/g, "");
const meaningful = (value) => !PLACEHOLDERS.has(value);

function meterNumbers(row) {
  return [row.meterNo, row.raw?.meter?.numberRaw, row.raw?.meter?.numberNormalized, row.raw?.salesAllMeterId, row.foundMeterNo];
}

// The account number the worker is given at the door. Matched by its digits too, so it is found however it
// is typed or spaced.
function accountNumbers(row) {
  return [row.accountNumber, row.raw?.customer?.accountNumber];
}

// What the card reads under the account: the holder's name, and the address line with the shop and its unit
// number once the row has its premise (TB-R067).
function cardLines(row) {
  return [row.customerName, row.raw?.customer?.customerName, row.addressLine];
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
    if (accountNumbers(row).some((value) => digitsOf(value).includes(queryDigits))) return true;
  } else if (meterNumbers(row).some(contains)) {
    return true;
  }

  return (
    erfNumbers(row).some(contains) ||
    streetAddresses(row).some(contains) ||
    accountNumbers(row).some(contains) ||
    cardLines(row).some(contains)
  );
}

export function searchTargetedBatchRows(rows, query) {
  return (Array.isArray(rows) ? rows : []).filter((row) => targetedBatchRowMatchesSearch(row, query));
}

// TB-R051 (1.3.42, 1.3.92): the batch header's filters. Total shows every meter; a status shows only its meters.
export const TARGETED_BATCH_STATUS_FILTERS = Object.freeze({
  TOTAL: "TOTAL",
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  QA_PASS: "QA_PASS",
  QA_FAIL: "QA_FAIL",
});

function normalizeComponentQa(raw) {
  const clean = String(raw || "").trim().toUpperCase().replace(/_/g, " ");
  if (clean === "QA PASS" || clean === "PASS") return "QA PASS";
  if (clean === "QA FAIL" || clean === "FAIL") return "QA FAIL";
  if (clean === "QA PENDING" || clean === "PENDING") return "QA PENDING";
  return "QA NAv";
}

// TB-R051 / PR-R001: Canonical aggregate TB QA Final from Premise QA and Meter QA
export function calculateTbQaFinal(row) {
  // 1. Direct authoritative persisted TB QA status on the row
  const tbStatus = normalizeComponentQa(
    row?.qa?.tbStatus ||
      row?.raw?.qa?.tbStatus ||
      row?.qa?.finalStatus ||
      row?.raw?.qa?.finalStatus,
  );
  if (tbStatus === "QA FAIL") return "QA FAIL";
  if (tbStatus === "QA PASS") return "QA PASS";
  if (tbStatus === "QA PENDING") return "QA PENDING";

  const premiseQa = normalizeComponentQa(row?.qa?.premiseStatus || row?.raw?.qa?.premiseStatus);
  const meterQa = normalizeComponentQa(row?.qa?.meterStatus || row?.raw?.qa?.meterStatus);

  // 2. Component failure takes immediate precedence:
  // A failure in either Premise QA or Meter QA makes TB QA Final QA FAIL.
  if (premiseQa === "QA FAIL" || meterQa === "QA FAIL") {
    return "QA FAIL";
  }

  const salesState = String(row?.displayStatus || row?.executionStatus || "").trim().toUpperCase();
  if (salesState !== "COMPLETED") {
    return "QA NAv";
  }

  // 3. Both components must pass for TB QA Final to be QA PASS.
  if (premiseQa === "QA PASS" && meterQa === "QA PASS") {
    return "QA PASS";
  }

  // 4. In-flight review: Both pending or one pending and other passed
  if (
    (premiseQa === "QA PENDING" && meterQa === "QA PENDING") ||
    (premiseQa === "QA PASS" && meterQa === "QA PENDING") ||
    (premiseQa === "QA PENDING" && meterQa === "QA PASS")
  ) {
    return "QA PENDING";
  }

  // 5. QA NAv is not a pass: If either component is unavailable, the overall result remains unavailable.
  return "QA NAv";
}

// The status a row counts under, by the same test as the header counts:
// Total = Not Started + In Progress + Completed + QA PASS + QA FAIL
export function targetedBatchRowStatus(row) {
  const tbQa = calculateTbQaFinal(row);
  if (tbQa === "QA FAIL") return TARGETED_BATCH_STATUS_FILTERS.QA_FAIL;

  const status = String(row?.displayStatus || row?.executionStatus || "").trim().toUpperCase();
  if (status === "COMPLETED") {
    if (tbQa === "QA PASS") return TARGETED_BATCH_STATUS_FILTERS.QA_PASS;
    return TARGETED_BATCH_STATUS_FILTERS.COMPLETED;
  }
  if (status === "IN_PROGRESS") return TARGETED_BATCH_STATUS_FILTERS.IN_PROGRESS;
  return TARGETED_BATCH_STATUS_FILTERS.NOT_STARTED;
}

export function filterTargetedBatchRowsByStatus(rows, filter) {
  const list = Array.isArray(rows) ? rows : [];
  const wanted = String(filter || "").toUpperCase();
  if (
    wanted !== TARGETED_BATCH_STATUS_FILTERS.NOT_STARTED &&
    wanted !== TARGETED_BATCH_STATUS_FILTERS.IN_PROGRESS &&
    wanted !== TARGETED_BATCH_STATUS_FILTERS.COMPLETED &&
    wanted !== TARGETED_BATCH_STATUS_FILTERS.QA_PASS &&
    wanted !== TARGETED_BATCH_STATUS_FILTERS.QA_FAIL
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

// TB-R051 (1.3.68; replaces "open work is listed first" of 1.3.35): a batch lists the meter worked on
// most recently first, so a worker coming back to the list sees what they have just done at the top.
export const TARGETED_BATCH_ROW_ORDERS = Object.freeze({
  NEWEST_FIRST: "NEWEST_FIRST",
  OLDEST_FIRST: "OLDEST_FIRST",
});

// The order a batch opens on.
export const DEFAULT_TARGETED_BATCH_ROW_ORDER = TARGETED_BATCH_ROW_ORDERS.NEWEST_FIRST;

export function nextTargetedBatchRowOrder(current) {
  return String(current || "").toUpperCase() === TARGETED_BATCH_ROW_ORDERS.OLDEST_FIRST
    ? TARGETED_BATCH_ROW_ORDERS.NEWEST_FIRST
    : TARGETED_BATCH_ROW_ORDERS.OLDEST_FIRST;
}

// A meter nobody has worked on has no time of its own. Newest first, it follows the worked meters;
// oldest first, it leads them, because untouched work is the oldest work in the batch. Meters sharing
// a time, and all the untouched ones, keep the order the batch holds them in.
export function sortTargetedBatchRowsByLastWorked(rows, order = DEFAULT_TARGETED_BATCH_ROW_ORDER) {
  const list = Array.isArray(rows) ? rows : [];
  const oldestFirst =
    String(order || "").toUpperCase() === TARGETED_BATCH_ROW_ORDERS.OLDEST_FIRST;

  return list
    .map((row, index) => {
      const at = Number(row?.lastWorkedAt);
      return { row, index, at: Number.isFinite(at) && at > 0 ? at : 0 };
    })
    .sort((a, b) => {
      if (a.at !== b.at) {
        if (!a.at) return oldestFirst ? -1 : 1;
        if (!b.at) return oldestFirst ? 1 : -1;
        return oldestFirst ? a.at - b.at : b.at - a.at;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}
