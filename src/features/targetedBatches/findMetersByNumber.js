// TB-R051 (1.3.42): the meter record of a meter found outside this batch, read from the server (online only,
// TB-R051). Always from the server: the phone's memory could answer "none" for a meter that exists, so with no
// connection the read fails and the phone says so.
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  query,
  where,
} from "firebase/firestore";

import { db } from "../../firebase";
import { cleanMeterNumberInput } from "../meters/meterNumberRule";
import { describeFoundMeter } from "./foundMeter";

// A few are enough to tell "one", "several" and "none"; the same number should never be on more than one.
const FOUND_METER_READ_LIMIT = 5;

export async function findMetersByNumber(meterNumber) {
  const meterNo = cleanMeterNumberInput(meterNumber);
  if (!meterNo) return [];

  // First the link that made the meter VISIBLE (MV-R001): meter_master/{number}.refs.asts.id. It finds the exact
  // record, also one whose own number was saved with spaces before the phone cleaned meter numbers.
  const master = await getDocFromServer(doc(db, "meter_master", meterNo));
  const linkedId = String((master.exists() && master.data()?.refs?.asts?.id) || "").trim();
  if (linkedId && !linkedId.includes("/")) {
    const linked = await getDocFromServer(doc(db, "asts", linkedId));
    if (linked.exists()) return [describeFoundMeter(linked.id, linked.data())];
  }

  // Without that link: the meter records carrying this number.
  const snapshot = await getDocsFromServer(
    query(
      collection(db, "asts"),
      where("ast.astData.astNo", "==", meterNo),
      limit(FOUND_METER_READ_LIMIT),
    ),
  );

  return snapshot.docs.map((docSnap) => describeFoundMeter(docSnap.id, docSnap.data()));
}
