// Targeted Batch rules TB-R046 (1.3.28) and TB-R051 (1.3.38): the batch map shows other Sales meters only
// when they are CAT1–CAT8 in the LM's newest category month — the same test batching uses. Mirrors
// ireps-web functions/salesAllMeters/sales-batch-policy.js (salesCategoryKind) and
// sales-category-month.js (latestSalesCategoryMonth). iREPS never calculates a category; Mpilo supplies it.

export const SALES_CATEGORY_LABELS = Object.freeze([
  "CAT1 - Zero Purchaser",
  "CAT2 - Ghost Purchaser (1-3 mo)",
  "CAT3 - Micro Purchaser (<R400)",
  "CAT4 - Long Gap (4+ months)",
  "CAT5 - Stopped Purchasing",
  "CAT6 - Low kWh per Rand",
  "CAT8 - Energy Without Purchase",
  "Normal - No Leakage Flag",
]);

export const CATEGORY_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const CATEGORY_MONTHS_BACK = 12;

// The category of one meter in one month: CAT, NORMAL or NONE (no category that month).
export function salesCategoryKind(sales = {}, month = null) {
  const label = CATEGORY_MONTH.test(month || "")
    ? String(sales?.monthlyCategories?.[month]?.leakageCategory ?? "").trim()
    : "";
  return {
    kind: /^CAT[1-8]\b/i.test(label) ? "CAT" : /^normal\b/i.test(label) ? "NORMAL" : "NONE",
    label: label || null,
    month: CATEGORY_MONTH.test(month || "") ? month : null,
  };
}

export const isCatSalesMeter = (sales, month) => salesCategoryKind(sales, month).kind === "CAT";

// The calendar month in South Africa (UTC+2, no daylight saving), as the server works it out. Plain arithmetic, so
// it never depends on how a phone formats dates.
const SOUTH_AFRICA_OFFSET_MS = 2 * 60 * 60 * 1000;
export function monthOf(date) {
  return new Date(new Date(date).getTime() + SOUTH_AFRICA_OFFSET_MS).toISOString().slice(0, 7);
}

export function previousMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}

// From this month back a year, the first month in which any of the LM's meters has a known category.
// hasCategoryInMonth(month) answers that question for one month (one tiny server read).
export async function findLatestCategoryMonth({ now = new Date(), hasCategoryInMonth }) {
  let month = monthOf(now);
  for (let step = 0; step <= CATEGORY_MONTHS_BACK; step += 1, month = previousMonth(month)) {
    if (await hasCategoryInMonth(month)) return month;
  }
  return null;
}
