import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore";

import { db } from "../../firebase";

// TB-R051 (1.3.38): Other Sales meters are read once from the server, never streamed and never taken from the
// phone's cache (offline the read rejects, so the map says it could not load them, never that there are none),
// and only for the ERFs of the batch area. Same plan as the web allocation map (sales-batch-nearby.js): GPS Sales
// by their ERF numbers (nearbySalesQueryPlan), Non-GPS Sales with a saved ERF decision by that ERF's ID
// (nearbyErfLinkedPlan). At most 30 values a query and at most 10 queries of each kind.
const MAX_QUERIES_PER_KIND = 10;
const MAX_VALUES_PER_QUERY = 30;
// A guard on download size: ERF numbers repeat across towns, so one query can match many meters far away.
const MAX_DOCS_PER_QUERY = 500;

const cleanValue = (value) =>
  typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";

// Blank values are left out; a chunk longer than Firestore allows is split, in its order.
function readChunks(chunks) {
  const result = [];
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    if (!Array.isArray(chunk)) continue;
    const values = [...new Set(chunk.map(cleanValue).filter(Boolean))];
    for (let index = 0; index < values.length; index += MAX_VALUES_PER_QUERY) {
      result.push(values.slice(index, index + MAX_VALUES_PER_QUERY));
    }
  }
  return result;
}

function keepQueries(kind, chunks, lmPcode) {
  if (chunks.length > MAX_QUERIES_PER_KIND) {
    console.warn("loadOtherSalesMeters --chunks dropped", {
      lmPcode,
      kind,
      chunks: chunks.length,
      dropped: chunks.length - MAX_QUERIES_PER_KIND,
    });
  }
  return chunks.slice(0, MAX_QUERIES_PER_KIND);
}

// Sales carry no Ward or searchable position; GPS Sales list their pipeline ERF numbers in `erfNumbers`, and a
// Non-GPS Sales meter's saved ERF decision is its `erfId`. Throws when a query fails or the phone is offline.
export async function loadOtherSalesMeters({ lmPcode, erfNumberChunks = [], erfIdChunks = [] } = {}) {
  const lm = cleanValue(lmPcode);
  if (!lm) {
    throw new Error("Other Sales meters need the batch's Local Municipality");
  }

  const numberChunks = keepQueries("ERF numbers", readChunks(erfNumberChunks), lm);
  const idChunks = keepQueries("ERF IDs", readChunks(erfIdChunks), lm);
  const salesMeters = collection(db, "sales-all-meters");

  const [numberSnapshots, idSnapshots] = await Promise.all([
    Promise.all(
      numberChunks.map((chunk) =>
        getDocsFromServer(
          query(salesMeters, where("lmPcode", "==", lm), where("erfNumbers", "array-contains-any", chunk), limit(MAX_DOCS_PER_QUERY)),
        ),
      ),
    ),
    Promise.all(idChunks.map((chunk) => getDocsFromServer(query(salesMeters, where("erfId", "in", chunk), limit(MAX_DOCS_PER_QUERY))))),
  ]);

  // One Sales meter can be found by two queries; it is returned once.
  const byId = new Map();
  const keep = (docSnap, fromErfId) => {
    if (!docSnap?.id || byId.has(docSnap.id)) return;
    const sales = docSnap.data() || {};
    // The ERF ID query is not limited to the LM (an ERF ID is unique); a record of another LM is left out, as the
    // web's nearbyLayerRecords does.
    if (fromErfId && cleanValue(sales.lmPcode) !== lm) return;
    byId.set(docSnap.id, { id: docSnap.id, sales });
  };

  for (const snapshot of numberSnapshots) {
    for (const docSnap of snapshot?.docs || []) keep(docSnap, false);
  }
  for (const snapshot of idSnapshots) {
    for (const docSnap of snapshot?.docs || []) keep(docSnap, true);
  }

  // `truncated` (not enumerable) says a query reached its limit, so some meters of the area may be missing.
  const truncated = [...numberSnapshots, ...idSnapshots].some((snapshot) => (snapshot?.docs?.length || 0) >= MAX_DOCS_PER_QUERY);
  return Object.defineProperty([...byId.values()], "truncated", { value: truncated });
}
