// TB-R051 (1.3.38): the layers behind the batch map buttons (ERFs, Premises, Other Sales meters) and the
// plain pin wording. Pure helpers: no React or Firebase. A position here is for finding a meter only; it is
// never evidence and never used for the geofence check or an ERF decision (TB-R041).
import { readErfCentroid, resolveTargetedBatchSalesPoint } from "./targetedBatchMapPoints.js";

// TB-R051 (1.3.38): S, G and E in plain words, in the legend and in the meter window.
export const MAP_PIN_LABELS = Object.freeze({
  GPS: "GPS Sales",
  GEOCODED: "Non-GPS Sales",
  ERF: "ERF",
});

// TB-R051 (1.3.38): the map's status colours. The batch pins and the other Sales meter shapes use these same
// values, so on this map a colour always means the same status.
export const MAP_STATUS_COLORS = Object.freeze({
  NOT_STARTED: "#2563eb",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#16a34a",
});

// TB-R051 (1.3.38): other Sales meters show a status shape in the map's status colours; VISIBLE is Completed.
export const SALES_STATUS_ICONS = Object.freeze({
  NOT_STARTED: Object.freeze({ symbol: "▲", color: MAP_STATUS_COLORS.NOT_STARTED, label: "Not started" }),
  IN_PROGRESS: Object.freeze({ symbol: "★", color: MAP_STATUS_COLORS.IN_PROGRESS, label: "In progress" }),
  COMPLETED: Object.freeze({ symbol: "■", color: MAP_STATUS_COLORS.COMPLETED, label: "Completed" }),
});

// Same conversion as the web allocation map (locatedMeterBounds): 111 320 m per degree of latitude.
const METERS_PER_DEGREE_LATITUDE = 111320;
// Firestore allows at most 30 values in one array-contains-any or in.
const MAX_QUERY_CHUNK = 30;
// Values the phone and the web show when the SG number is unknown; never asked for.
const PLACEHOLDER_VALUES = Object.freeze(["N/A", "NAv", "Unavailable"]);
// Address values a new premise form leaves when nothing was chosen.
const PLACEHOLDER_ADDRESS_VALUES = Object.freeze(["Select..."]);
// Rounding room when a distance is compared with the margin (one micrometre).
const DISTANCE_TOLERANCE_METERS = 1e-6;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const cleanString = (value) =>
  typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";

// Same reading as targetedBatchMapPoints.js coordinateNumber: a number or a numeric string within range.
function coordinateNumber(value, limit) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function readPoint(latitudeValue, longitudeValue) {
  const latitude = coordinateNumber(latitudeValue, 90);
  const longitude = coordinateNumber(longitudeValue, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

// Map coordinates as the batch map holds them ({ latitude, longitude }); { lat, lng } is read too.
function readMapPoint(value) {
  if (!isRecord(value)) return null;
  return readPoint(value.latitude ?? value.lat, value.longitude ?? value.lng);
}

function readMapPoints(values) {
  return (Array.isArray(values) ? values : []).map(readMapPoint).filter(Boolean);
}

// A point to test against an area: numbers only, as the map holds its positions.
function readExactPoint(point) {
  if (!isRecord(point)) return null;
  const { latitude, longitude } = point;
  return typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

// A ring that repeats its first point at the end has no extra edge there.
function openRing(points) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first.latitude === last.latitude && first.longitude === last.longitude ? points.slice(0, -1) : points;
}

function boundsOfPoints(points) {
  if (!points.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const { latitude, longitude } of points) {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLng = Math.min(minLng, longitude);
    maxLng = Math.max(maxLng, longitude);
  }
  return { minLat, maxLat, minLng, maxLng };
}

function readArea(area) {
  if (!isRecord(area)) return null;
  const { minLat, maxLat, minLng, maxLng } = area;
  if (![minLat, maxLat, minLng, maxLng].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  return minLat <= maxLat && minLng <= maxLng ? { minLat, maxLat, minLng, maxLng } : null;
}

const readMargin = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
const lngScaleAt = (latitude) => Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
const middleOf = (bounds) => ({
  latitude: (bounds.minLat + bounds.maxLat) / 2,
  longitude: (bounds.minLng + bounds.maxLng) / 2,
});

function expandBounds(bounds, marginMeters) {
  const latMargin = marginMeters / METERS_PER_DEGREE_LATITUDE;
  const lngMargin = latMargin / lngScaleAt((bounds.minLat + bounds.maxLat) / 2);
  return {
    minLat: Math.max(-90, bounds.minLat - latMargin),
    maxLat: Math.min(90, bounds.maxLat + latMargin),
    minLng: Math.max(-180, bounds.minLng - lngMargin),
    maxLng: Math.min(180, bounds.maxLng + lngMargin),
  };
}

// TB-R051 (1.3.38): the batch area follows the geofence's own outline with a 50 m margin, not a rectangle
// around it; where there is no geofence it is the batch's pins with the margin. A geofence needs three
// points to be an outline; with fewer the pins are used. bbox is the outline's (or the pins') rectangle
// plus the margin: a quick first filter and the bounds of the area reads. center is the middle of that
// rectangle, from which a capped layer keeps the nearest items.
export function batchAreaShape({ geofencePoints = [], pinCoordinates = [], marginMeters = 50 } = {}) {
  const fence = openRing(readMapPoints(geofencePoints));
  const polygon = fence.length >= 3 ? fence : null;
  const bounds = boundsOfPoints(polygon || readMapPoints(pinCoordinates));
  if (!bounds) return null;

  const margin = readMargin(marginMeters);
  return {
    bbox: expandBounds(bounds, margin),
    polygon,
    marginMeters: margin,
    center: middleOf(bounds),
  };
}

// The rectangle of the batch area (batchAreaShape bbox), as before the outline was followed.
export function batchMapArea(options = {}) {
  return batchAreaShape(options)?.bbox ?? null;
}

// A batch area shape, or a plain { minLat, maxLat, minLng, maxLng } rectangle (read as a shape without an outline).
function readShape(value) {
  if (!isRecord(value)) return null;
  if (!isRecord(value.bbox)) {
    const bbox = readArea(value);
    return bbox ? { bbox, polygon: null, marginMeters: 0, center: middleOf(bbox) } : null;
  }

  const bbox = readArea(value.bbox);
  if (!bbox) return null;
  const fence = openRing(readMapPoints(value.polygon));
  return {
    bbox,
    polygon: fence.length >= 3 ? fence : null,
    marginMeters: readMargin(value.marginMeters),
    center: readMapPoint(value.center) || middleOf(bbox),
  };
}

// The outline in equirectangular metres at the latitude of the area, so the margin is metres on every side.
function prepareArea(value) {
  const shape = readShape(value);
  if (!shape) return null;

  const origin = middleOf(shape.bbox);
  const lngScale = lngScaleAt(origin.latitude);
  const project = ({ latitude, longitude }) => ({
    x: (longitude - origin.longitude) * lngScale * METERS_PER_DEGREE_LATITUDE,
    y: (latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
  });

  return {
    ...shape,
    project,
    ring: shape.polygon ? shape.polygon.map(project) : null,
    reach: shape.marginMeters + DISTANCE_TOLERANCE_METERS,
  };
}

// Edges count as inside.
function insideBounds(bounds, { latitude, longitude }) {
  return latitude >= bounds.minLat && latitude <= bounds.maxLat && longitude >= bounds.minLng && longitude <= bounds.maxLng;
}

function boundsOverlap(first, second) {
  return first.maxLat >= second.minLat && first.minLat <= second.maxLat && first.maxLng >= second.minLng && first.minLng <= second.maxLng;
}

// Ray casting on projected points.
function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function orientation(a, b, c) {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function onSegment(a, b, point) {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}

function segmentsTouch(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b))
  );
}

function segmentDistance(a, b, c, d) {
  if (segmentsTouch(a, b, c, d)) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

function forEachEdge(ring, visit) {
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    if (visit(ring[previous], ring[index])) return true;
  }
  return false;
}

// A valid point in the area: inside the outline or within the margin of its edges; without an outline, inside the rectangle.
function containsPoint(prepared, point) {
  if (!insideBounds(prepared.bbox, point)) return false;
  if (!prepared.ring) return true;
  const projected = prepared.project(point);
  if (pointInRing(projected, prepared.ring)) return true;
  return forEachEdge(prepared.ring, (a, b) => distanceToSegment(projected, a, b) <= prepared.reach);
}

// An ERF boundary ring touches the area when a corner is inside the outline, the outline lies inside the ERF, or
// an ERF edge comes within the margin of an outline edge (which includes edges that cross it).
function ringTouchesArea(prepared, ring) {
  const bounds = boundsOfPoints(ring);
  if (!bounds || !boundsOverlap(bounds, prepared.bbox)) return false;
  if (!prepared.ring) return true;

  const points = ring.map(prepared.project);
  const outline = prepared.ring;
  if (points.some((point) => pointInRing(point, outline))) return true;
  if (points.length >= 3 && pointInRing(outline[0], points)) return true;
  return forEachEdge(points, (a, b) => forEachEdge(outline, (c, d) => segmentDistance(a, b, c, d) <= prepared.reach));
}

// TB-R051 (1.3.38): is a point in the batch area? Inside the geofence outline or within the margin (metres) of its
// edges; without an outline, inside the rectangle. A plain rectangle is read as before.
export function pointInBatchArea(shape, point) {
  const prepared = prepareArea(shape);
  const position = readExactPoint(point);
  return Boolean(prepared && position && containsPoint(prepared, position));
}

// Kept for the rectangle callers; a batch area shape is read the same way as pointInBatchArea.
export function pointInArea(area, point) {
  return pointInBatchArea(area, point);
}

// Nearest to the middle of the area first, so a capped layer keeps the middle of the batch.
function distanceFrom(center) {
  const lngScale = lngScaleAt(center.latitude);
  return ({ latitude, longitude }) => (latitude - center.latitude) ** 2 + ((longitude - center.longitude) * lngScale) ** 2;
}

function byDistanceThenId(first, second) {
  return first.distance - second.distance || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0);
}

const readLimit = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : Infinity);

// TB-R051 (1.3.38): the nearest `limit` items to the centre, nearest first; items at the same distance keep their
// order, and items without a position are left out. Without a valid centre the given order is kept.
export function nearestItems(items, center, pointOf, limit) {
  const readItemPoint =
    typeof pointOf === "function" ? pointOf : (item) => (isRecord(item) && isRecord(item.point) ? item.point : item);
  const origin = readMapPoint(center);
  const distance = origin ? distanceFrom(origin) : () => 0;

  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index, point: readMapPoint(readItemPoint(item)) }))
    .filter((entry) => entry.point)
    .map((entry) => ({ ...entry, distance: distance(entry.point) }))
    .sort((first, second) => first.distance - second.distance || first.index - second.index)
    .slice(0, readLimit(limit))
    .map((entry) => entry.item);
}

// The ERF pack bbox as ireps_erfs stores it: { minLat, minLng, maxLat, maxLng }.
function readErfBbox(bbox) {
  if (!isRecord(bbox)) return null;
  const minLat = coordinateNumber(bbox.minLat, 90);
  const maxLat = coordinateNumber(bbox.maxLat, 90);
  const minLng = coordinateNumber(bbox.minLng, 180);
  const maxLng = coordinateNumber(bbox.maxLng, 180);
  if ([minLat, maxLat, minLng, maxLng].some((value) => value === null)) return null;
  return minLat <= maxLat && minLng <= maxLng ? { minLat, maxLat, minLng, maxLng } : null;
}

const ringOfBounds = ({ minLat, maxLat, minLng, maxLng }) => [
  { latitude: minLat, longitude: minLng },
  { latitude: minLat, longitude: maxLng },
  { latitude: maxLat, longitude: maxLng },
  { latitude: maxLat, longitude: minLng },
];

// The ERF pack holds parsed GeoJSON (erfsApi parseErfGeometry); a cache written before that may still hold
// the stored string. Polygon: [outer ring, holes...]; MultiPolygon: [[outer ring, holes...], ...]; each
// position is [longitude, latitude].
function readGeometry(value) {
  let geometry = value;
  if (typeof geometry === "string") {
    try {
      geometry = JSON.parse(geometry);
    } catch {
      return null;
    }
  }
  if (isRecord(geometry) && geometry.type === "Feature") geometry = geometry.geometry;
  return isRecord(geometry) && Array.isArray(geometry.coordinates) ? geometry : null;
}

function polygonListOf(geometry) {
  const { type, coordinates } = geometry;
  if (type === "Polygon") return [coordinates];
  if (type === "MultiPolygon") return coordinates;
  if (type !== undefined && type !== null) return [];
  // No type: read by nesting, as the Maps tab getSafeCoords does.
  if (typeof coordinates?.[0]?.[0]?.[0] === "number") return [coordinates];
  if (typeof coordinates?.[0]?.[0]?.[0]?.[0] === "number") return coordinates;
  return [];
}

// TB-R051 (1.3.38): the ERF boundary is each polygon's outer ring, as on the Maps tab. Holes are left out:
// a hole is another ERF, which draws its own boundary.
function readErfPolygons(value) {
  const geometry = readGeometry(value);
  if (!geometry) return [];
  return polygonListOf(geometry)
    .map((polygon) => (Array.isArray(polygon) && Array.isArray(polygon[0]) ? polygon[0] : []))
    .map((ring) => ring.map((position) => (Array.isArray(position) ? readPoint(position[1], position[0]) : null)).filter(Boolean))
    .filter((ring) => ring.length >= 3);
}

// TB-R051 (1.3.38): the ERFs of the batch area, nearest the middle first, at most `limit`. The rectangles are a
// quick first filter (the ERF bbox overlaps the area's, or its centre is in it). With a geofence outline an ERF
// then counts when its centre is in the batch area or its boundary touches it; a plain rectangle area (or a shape
// without an outline) keeps the rectangle result. Without a stored bbox or centre the boundary's own bounds are used.
export function erfsInArea({ area, shape, metaEntries = [], geoEntries = {}, limit = 400 } = {}) {
  const prepared = prepareArea(shape ?? area);
  if (!prepared) return { erfs: [], capped: false };

  const geoById = isRecord(geoEntries) ? geoEntries : {};
  const distance = distanceFrom(prepared.center);
  const seen = new Set();
  const found = [];

  for (const meta of Array.isArray(metaEntries) ? metaEntries : []) {
    const id = cleanString(meta?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const geo = isRecord(geoById[id]) ? geoById[id] : null;
    if (!geo) continue;

    const centroid = readErfCentroid(geo.centroid ?? null);
    let bbox = readErfBbox(geo.bbox);
    let polygons = null;
    if (!bbox && !centroid) {
      polygons = readErfPolygons(geo.geometry);
      bbox = boundsOfPoints(polygons.flat());
    }

    const nearArea = (bbox && boundsOverlap(bbox, prepared.bbox)) || (centroid && insideBounds(prepared.bbox, centroid));
    if (!nearArea) continue;

    if (prepared.ring && !(centroid && containsPoint(prepared, centroid))) {
      polygons = polygons ?? readErfPolygons(geo.geometry);
      const rings = polygons.length ? polygons : bbox ? [ringOfBounds(bbox)] : [];
      if (!rings.some((ring) => ringTouchesArea(prepared, ring))) continue;
    }

    const middle = centroid || middleOf(bbox);
    found.push({ id, meta, geo, centroid, polygons, distance: distance(middle) });
  }

  const cap = typeof limit === "number" && limit >= 0 ? Math.floor(limit) : 400;
  found.sort(byDistanceThenId);

  return {
    erfs: found.slice(0, cap).map(({ id, meta, geo, centroid, polygons }) => ({
      id,
      erfNo: cleanString(meta?.erfNo),
      centroid,
      polygons: polygons ?? readErfPolygons(geo.geometry),
    })),
    capped: found.length > cap,
  };
}

function premiseLabel(premise) {
  const address = isRecord(premise?.address) ? premise.address : {};
  const text = [address.strNo, address.strName, address.strType]
    .map(cleanString)
    .filter((part) => part && !PLACEHOLDER_ADDRESS_VALUES.includes(part))
    .join(" ");
  if (text) return text;
  const erfNo = cleanString(premise?.erfNo);
  return erfNo ? `Erf ${erfNo}` : "No address";
}

// TB-R051 (1.3.38): the premises of the batch area (inside the outline or its margin; without one, the rectangle),
// at the position the Maps tab draws them (geometry.centroid { lat, lng }), nearest the middle first.
export function premisesInArea({ area, shape, premises = [] } = {}) {
  const prepared = prepareArea(shape ?? area);
  if (!prepared) return [];

  const distance = distanceFrom(prepared.center);
  const seen = new Set();
  const found = [];

  for (const premise of Array.isArray(premises) ? premises : []) {
    const id = cleanString(premise?.id);
    if (!id || seen.has(id)) continue;

    const centroid = premise?.geometry?.centroid;
    const point = isRecord(centroid) ? readPoint(centroid.lat ?? centroid.latitude, centroid.lng ?? centroid.longitude) : null;
    if (!point || !containsPoint(prepared, point)) continue;

    seen.add(id);
    found.push({ id, ...point, label: premiseLabel(premise), distance: distance(point) });
  }

  return found.sort(byDistanceThenId).map(({ id, latitude, longitude, label }) => ({ id, latitude, longitude, label }));
}

// TB-R051 (1.3.38): the first `max` unique non-blank values in the given order (for ERFs from erfsInArea: nearest
// the middle first). Placeholders (N/A, NAv, Unavailable) are never asked for.
export function orderedUnique(values, max) {
  const cap = readLimit(max);
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (result.length >= cap) break;
    const text = cleanString(value);
    if (!text || PLACEHOLDER_VALUES.includes(text) || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

// TB-R051 (1.3.38): the values other Sales meters are asked for, at most 30 to a query, in the given order (never
// re-sorted, so a query limit leaves out the last values, not those last in text order). ERF objects from
// erfsInArea are read by their ERF number.
export function erfNumberChunks(numbers, size = 30) {
  const chunkSize = Number.isInteger(size) && size > 0 ? Math.min(size, MAX_QUERY_CHUNK) : MAX_QUERY_CHUNK;
  const values = orderedUnique((Array.isArray(numbers) ? numbers : []).map((value) => (isRecord(value) ? value.erfNo : value)));

  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

// ---------------------------------------------------------------------------------------------------------
// TB-R051 (1.3.38): ERFs read for the batch area, in the ERF pack shape. Copied from src/redux/erfsApi.js
// (buildWardErfPackFromSnapshot and its helpers), which initialises Firebase on import and so cannot be used by
// this pure module; the tests prove the same output for the same documents. Change both together.
// ---------------------------------------------------------------------------------------------------------
function workoutSovereignErfNo(id) {
  if (!id) return "N/A";
  const text = String(id);
  const erfBlock = text.substring(13, 20).replace(/^0+/, "");
  const portionBlock = text.substring(21, 26).replace(/^0+/, "");
  return Number(portionBlock) === 0 ? `${erfBlock}` : `${erfBlock}/${portionBlock}`;
}

function buildErfNo(id, erf = {}) {
  const parcelNo = erf?.sg?.parcelNo;
  const portion = Number(erf?.sg?.portion ?? 0);

  if (parcelNo != null && String(parcelNo).trim() !== "") {
    return portion > 0 ? `${String(parcelNo).trim()}/${portion}` : String(parcelNo).trim();
  }

  return workoutSovereignErfNo(id) || "N/A";
}

function toTimestampMs(value) {
  if (value == null || value === "") return 0;

  if (typeof value?.toMillis === "function") {
    const milliseconds = value.toMillis();
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  }

  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  }

  const seconds = Number(value?.seconds ?? value?._seconds);
  const nanoseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0);

  if (Number.isFinite(seconds)) {
    return seconds * 1000 + (Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : 0);
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue;

  const parsedValue = Date.parse(String(value));
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

const sortMetaByUpdatedAtDesc = (a, b) => toTimestampMs(b?.metadata?.updatedAt) - toTimestampMs(a?.metadata?.updatedAt);

function parseErfGeometry(erf) {
  const rawGeometry = erf?.geometry ?? erf?.erf?.geometry ?? null;

  if (typeof rawGeometry === "string") {
    try {
      return JSON.parse(rawGeometry);
    } catch {
      return null;
    }
  }

  return rawGeometry || null;
}

// Documents as the area read returns them ({ ...data, id }); Firestore document snapshots are read too.
export function erfEntriesFromDocs(docs) {
  const metaEntries = [];
  const geoEntries = {};

  for (const docSnap of Array.isArray(docs) ? docs : []) {
    if (!isRecord(docSnap)) continue;
    const erf = typeof docSnap.data === "function" ? docSnap.data() || {} : docSnap;
    const id = erf?.erfId || erf?.erf?.erfId || docSnap.id;
    if (!id) continue;

    metaEntries.push({
      id,
      admin: erf?.admin,
      erfNo: buildErfNo(id, erf),
      premises: Array.isArray(erf?.premises) ? erf.premises : [],
      metadata: erf?.metadata || {},
    });

    geoEntries[id] = {
      bbox: erf?.bbox ?? erf?.erf?.bbox ?? null,
      centroid: erf?.centroid ?? erf?.erf?.centroid ?? null,
      geometry: parseErfGeometry(erf),
    };
  }

  metaEntries.sort(sortMetaByUpdatedAtDesc);
  return { metaEntries, geoEntries };
}

function readIdSet(ids) {
  const values = ids instanceof Set ? [...ids] : Array.isArray(ids) ? ids : [];
  return new Set(values.map(cleanString).filter(Boolean));
}

// TB-R051 (1.3.38): same derivation as TB Draft (Sales schema TB5): VISIBLE is Completed; otherwise
// field work in progress on any batch entry is In progress; otherwise Not started.
function readOtherSalesStatus(sales) {
  if (isRecord(sales.master) && sales.master.visibility === "VISIBLE") return "COMPLETED";
  const refs = Array.isArray(sales.tbRefs) ? sales.tbRefs : [];
  return refs.some((ref) => isRecord(ref) && isRecord(ref.fieldWork) && ref.fieldWork.status === "IN_PROGRESS")
    ? "IN_PROGRESS"
    : "NOT_STARTED";
}

// TB-R051 (1.3.38): a Sales meter that is not in this batch, for looking only. It sits at its position under
// the same S/G rule as the batch pins; a meter with neither is not drawn (null).
export function classifyOtherSalesMeter({ id, sales, batchSalesIds = [] } = {}) {
  const salesId = cleanString(id);
  if (!salesId || !isRecord(sales)) return null;
  if (readIdSet(batchSalesIds).has(salesId)) return null;

  const point = resolveTargetedBatchSalesPoint(sales);
  if (!point || (point.source !== "GPS" && point.source !== "GEOCODED")) return null;

  return {
    id: salesId,
    meterNo: cleanString(sales.meterNo) || salesId,
    status: readOtherSalesStatus(sales),
    point: { latitude: point.latitude, longitude: point.longitude, source: point.source },
    kindLabel: MAP_PIN_LABELS[point.source],
  };
}
