import { collection, FieldPath, getDocsFromServer, limit, query, where } from "firebase/firestore";

import { db } from "../../firebase";
import { findLatestCategoryMonth, SALES_CATEGORY_LABELS } from "./salesCategory";

// Targeted Batch rules TB-R046 / TB-R051 (1.3.38): the LM's newest category month, found the same way as
// the server (one read of at most one meter per month, going back a year). Remembered for ten minutes, so
// opening several batch maps does not repeat it; the next month's categories take over within that time.
const REMEMBER_MS = 10 * 60 * 1000;
const remembered = new Map();

export async function loadLatestSalesCategoryMonth({ lmPcode, now = new Date() }) {
  if (!lmPcode) throw new Error("The municipality of this batch is unknown.");
  const known = remembered.get(lmPcode);
  if (known && Date.now() - known.at < REMEMBER_MS) return known.month;

  const month = await findLatestCategoryMonth({
    now,
    hasCategoryInMonth: async (candidate) => {
      const snapshot = await getDocsFromServer(query(
        collection(db, "sales-all-meters"),
        where("lmPcode", "==", lmPcode),
        where(new FieldPath("monthlyCategories", candidate, "leakageCategory"), "in", [...SALES_CATEGORY_LABELS]),
        limit(1),
      ));
      return !snapshot.empty;
    },
  });

  remembered.set(lmPcode, { month, at: Date.now() });
  return month;
}
