import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { findLatestCategoryMonth, isCatSalesMeter, monthOf, previousMonth, SALES_CATEGORY_LABELS, salesCategoryKind } from "./salesCategory.js";

// Targeted Batch rules TB-R046 / TB-R051 (1.3.38): other Sales meters on the batch map are CAT meters only.
const meter = (month, label) => ({ monthlyCategories: { [month]: { leakageCategory: label } } });

test("CAT1–CAT8 in the category month are CAT; Normal and missing are not", () => {
  assert.equal(salesCategoryKind(meter("2026-08", "CAT4 - Long Gap (4+ months)"), "2026-08").kind, "CAT");
  assert.equal(salesCategoryKind(meter("2026-08", "Normal - No Leakage Flag"), "2026-08").kind, "NORMAL");
  assert.equal(salesCategoryKind(meter("2026-07", "CAT1 - Zero Purchaser"), "2026-08").kind, "NONE", "an older month's category does not count");
  assert.equal(salesCategoryKind({}, "2026-08").kind, "NONE");
  assert.equal(salesCategoryKind(meter("2026-08", "CAT2 - Ghost Purchaser (1-3 mo)"), null).kind, "NONE", "no category month, no CAT");
  assert.equal(isCatSalesMeter(meter("2026-08", "CAT8 - Energy Without Purchase"), "2026-08"), true);
  assert.equal(isCatSalesMeter(meter("2026-08", "Normal - No Leakage Flag"), "2026-08"), false);
});

test("the labels match the server's list exactly", async () => {
  const policy = await readFile(new URL("../../../../ireps-web/functions/salesAllMeters/sales-batch-policy.js", import.meta.url), "utf8").catch(() => null);
  if (!policy) return; // the web repo is not next to this one
  const serverLabels = [...policy.slice(policy.indexOf("SALES_CATEGORY_LABELS")).matchAll(/"((?:CAT\d|Normal)[^"]*)"/g)].slice(0, SALES_CATEGORY_LABELS.length).map(match => match[1]);
  assert.deepEqual(serverLabels, [...SALES_CATEGORY_LABELS]);
});

test("months step back across the year and use South African time", () => {
  assert.equal(previousMonth("2026-01"), "2025-12");
  assert.equal(previousMonth("2026-09"), "2026-08");
  assert.equal(monthOf(new Date("2026-08-31T22:30:00Z")), "2026-09", "00:30 SAST on 1 September is September");
  assert.equal(monthOf(new Date("2026-08-31T21:59:59Z")), "2026-08", "23:59 SAST on 31 August is still August");
  assert.equal(monthOf(new Date("2026-12-31T22:00:00Z")), "2027-01", "midnight SAST starts the new year");
});

test("the newest category month is the first month back from now with any category", async () => {
  const asked = [];
  const month = await findLatestCategoryMonth({ now: new Date("2026-09-17T10:00:00Z"), hasCategoryInMonth: async candidate => { asked.push(candidate); return candidate === "2026-08"; } });
  assert.equal(month, "2026-08");
  assert.deepEqual(asked, ["2026-09", "2026-08"]);
  const none = await findLatestCategoryMonth({ now: new Date("2026-09-17T10:00:00Z"), hasCategoryInMonth: async () => false });
  assert.equal(none, null, "no categories in the last year: no month, so no CAT meters are shown");
});
