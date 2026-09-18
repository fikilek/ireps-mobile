import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore";

import { db } from "../../firebase";

// TB-R051 (1.3.38): the ERFs and Premises layers read only the batch area, once, from the server. A Ward the phone
// is not already working in is never downloaded or kept whole for this map, and nothing is taken from the phone's
// cache: offline, or when a read fails, the promise rejects so the map can say the layer could not be loaded,
// never that there is nothing there. Same queries as the web allocation map (sales-batch-nearby.js nearbyQuerySpec).
const DEFAULT_AREA_LIMIT = 600;

const cleanValue = (value) =>
  typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";

function readBbox(bbox) {
  if (bbox === null || typeof bbox !== "object" || Array.isArray(bbox)) return null;
  const { minLat, maxLat, minLng, maxLng } = bbox;
  if (![minLat, maxLat, minLng, maxLng].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  return minLat <= maxLat && minLng <= maxLng ? { minLat, maxLat, minLng, maxLng } : null;
}

const readLimit = (value) => (Number.isInteger(value) && value > 0 ? value : DEFAULT_AREA_LIMIT);

function readScope(layer, { wardPcode, bbox }) {
  const ward = cleanValue(wardPcode);
  if (!ward) throw new Error(`${layer} in the batch area need the batch Ward`);
  const bounds = readBbox(bbox);
  if (!bounds) throw new Error(`${layer} in the batch area need the batch area`);
  return { ward, bounds };
}

// The document ID wins over a stored id field, as the Ward premises stream and the web read them.
const docsOf = (snapshot) => (snapshot?.docs || []).map((docSnap) => ({ ...(docSnap.data() || {}), id: docSnap.id }));

// ERFs whose stored bbox overlaps the batch area's rectangle (the map then keeps those in the batch area).
export async function loadBatchAreaErfs({ wardPcode, bbox, limit: maxDocs = DEFAULT_AREA_LIMIT } = {}) {
  const { ward, bounds } = readScope("ERFs", { wardPcode, bbox });
  const snapshot = await getDocsFromServer(
    query(
      collection(db, "ireps_erfs"),
      where("admin.ward.pcode", "==", ward),
      where("bbox.maxLat", ">=", bounds.minLat),
      where("bbox.maxLng", ">=", bounds.minLng),
      where("bbox.minLat", "<=", bounds.maxLat),
      where("bbox.minLng", "<=", bounds.maxLng),
      limit(readLimit(maxDocs)),
    ),
  );
  return docsOf(snapshot);
}

// Premises whose position (geometry.centroid) is in the batch area's rectangle (the map then keeps those in the batch area).
export async function loadBatchAreaPremises({ wardPcode, bbox, limit: maxDocs = DEFAULT_AREA_LIMIT } = {}) {
  const { ward, bounds } = readScope("Premises", { wardPcode, bbox });
  const snapshot = await getDocsFromServer(
    query(
      collection(db, "premises"),
      where("parents.wardPcode", "==", ward),
      where("geometry.centroid.lat", ">=", bounds.minLat),
      where("geometry.centroid.lat", "<=", bounds.maxLat),
      where("geometry.centroid.lng", ">=", bounds.minLng),
      where("geometry.centroid.lng", "<=", bounds.maxLng),
      limit(readLimit(maxDocs)),
    ),
  );
  return docsOf(snapshot);
}
