// TB-R051: positions for the batch map in My Work Orders. A position is for finding the meter only;
// it is never evidence and never used for the geofence check or an ERF decision (TB-R041).
export const TARGETED_BATCH_MAP_SOURCE_LABELS = Object.freeze({ GPS: "S", GEOCODED: "G", ERF: "E" });

const SOURCE_RANK = Object.freeze({ GPS: 3, GEOCODED: 2, ERF: 1 });
const STATUSES = Object.freeze(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// TB-R051 G: the saved ERF decision is read with the same checks as ireps-web sales-batch-policy.js.
const SALES_BATCH_ID = /^TGB_[0-9]{8}_[0-9]{6}_[A-Z0-9]{4}$/;
const ERF_RESOLUTION_KEYS = Object.freeze(["version", "revision", "method", "evidenceRefs", "geocode", "confirmedByUid", "confirmedByUser", "confirmedAt", "tbId"]);
const GEOCODE_KEYS = Object.freeze(["latitude", "longitude", "matchLevel", "geocodedAddress", "provider", "geocodedAt"]);

const nonblank = (value) => typeof value === "string" && value.trim().length > 0;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => hasOwn(value, key));
const validDocumentId = (value) =>
  nonblank(value) &&
  value === value.trim() &&
  !value.includes("/") &&
  [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) &&
  ![".", ".."].includes(value);

// Same reading as ireps-web sales-batch-policy.js timestampMillis: a Firestore Timestamp, or its seconds and nanoseconds.
function timestampMillis(value) {
  if (!isRecord(value)) return null;
  if (typeof value.toMillis === "function") {
    try {
      const millis = value.toMillis();
      return Number.isFinite(millis) ? millis : null;
    } catch {
      return null;
    }
  }
  const seconds = value.seconds ?? value._seconds;
  const nanos = value.nanoseconds ?? value._nanoseconds;
  return Number.isInteger(seconds) && Number.isInteger(nanos) && nanos >= 0 && nanos <= 999999999 ? seconds * 1000 + nanos / 1e6 : null;
}

const isTimestamp = (value) => timestampMillis(value) !== null;

// Same reading as ireps-web sales-batch-policy.js coordinateNumber.
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

// Port of ireps-web sales-batch-policy.js pipelineCandidates: a non-array candidate list means no GPS.
function pipelineCandidates(sales) {
  const arrays = [sales.erfCandidates, sales.ErfCandidates].filter((value) => value !== undefined);
  if (arrays.some((value) => !Array.isArray(value))) return null;
  return arrays.flat();
}

// TB-R051 S: exactly one pipeline candidate, with valid coordinates (singlePipelineErf).
function readGpsPoint(sales) {
  const candidates = pipelineCandidates(sales);
  if (candidates?.length !== 1) return null;
  const candidate = candidates[0];
  return readPoint(candidate?.Latitude ?? candidate?.latitude, candidate?.Longitude ?? candidate?.longitude);
}

// TB-R051 G: a valid saved GEOCODED ERF decision at an exact street number. Port of ireps-web
// sales-batch-policy.js inspectSavedErfDecision; a decision the web counts as invalid gives no G point.
function readGeocodedPoint(sales) {
  const erfId = sales.erfId;
  const resolution = sales.erfResolution;
  const geocode = resolution?.geocode;
  if (!validDocumentId(erfId)) return null;
  if (!exactKeys(resolution, ERF_RESOLUTION_KEYS)) return null;
  if (resolution.version !== 1 || !Number.isInteger(resolution.revision) || resolution.revision <= 0) return null;
  if (resolution.method !== "GEOCODED") return null;
  if (!Array.isArray(resolution.evidenceRefs) || resolution.evidenceRefs.length !== 1) return null;
  if (resolution.evidenceRefs[0] !== `ireps_erfs/${erfId}`) return null;
  if (!nonblank(resolution.confirmedByUid) || !nonblank(resolution.confirmedByUser) || !isTimestamp(resolution.confirmedAt)) return null;
  if (typeof resolution.tbId !== "string" || !SALES_BATCH_ID.test(resolution.tbId)) return null;
  if (!exactKeys(geocode, GEOCODE_KEYS) || geocode.matchLevel !== "EXACT_STREET_NUMBER") return null;
  if (!nonblank(geocode.geocodedAddress) || !nonblank(geocode.provider) || !isTimestamp(geocode.geocodedAt)) return null;
  if (typeof geocode.latitude !== "number" || typeof geocode.longitude !== "number") return null;
  return readPoint(geocode.latitude, geocode.longitude);
}

export function resolveTargetedBatchSalesPoint(sales) {
  if (!isRecord(sales)) return null;
  const gps = readGpsPoint(sales);
  if (gps) return { ...gps, source: "GPS" };
  const geocoded = readGeocodedPoint(sales);
  if (geocoded) return { ...geocoded, source: "GEOCODED" };
  return null;
}

// Accepts a geoLibrary entry ({ centroid }) or the centroid itself: { lat, lng }, { latitude, longitude } or [lat, lng].
export function readErfCentroid(entry) {
  if (entry === null || entry === undefined) return null;
  const raw = isRecord(entry) && entry.centroid !== undefined ? entry.centroid : entry;
  if (Array.isArray(raw)) return raw.length >= 2 ? readPoint(raw[0], raw[1]) : null;
  if (!isRecord(raw)) return null;
  return readPoint(raw.lat ?? raw.latitude, raw.lng ?? raw.longitude);
}

function readRowSalesPoint(row) {
  const point = row?.salesPoint;
  if (!isRecord(point) || (point.source !== "GPS" && point.source !== "GEOCODED")) return null;
  const position = readPoint(point.latitude, point.longitude);
  return position ? { ...position, source: point.source } : null;
}

function readRowPosition(row, erfCentroidById) {
  const salesPoint = readRowSalesPoint(row);
  if (salesPoint) return salesPoint;
  const erfId = String(row?.erfId || row?.refs?.erfId || "").trim();
  const centroid = erfId && isRecord(erfCentroidById) ? readErfCentroid(erfCentroidById[erfId]) : null;
  return centroid ? { ...centroid, source: "ERF" } : null;
}

function readRowStatus(row) {
  const status = String(row?.displayStatus || row?.executionStatus || "NOT_STARTED").trim().toUpperCase();
  return STATUSES.includes(status) ? status : "NOT_STARTED";
}

export function buildTargetedBatchMapPoints(rows, { erfCentroidById = {} } = {}) {
  const groupsByKey = new Map();
  const unplaced = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const position = readRowPosition(row, erfCentroidById);
    if (!position) {
      unplaced.push(row);
      continue;
    }

    const key = `${position.latitude.toFixed(6)},${position.longitude.toFixed(6)}`;
    let group = groupsByKey.get(key);
    if (!group) {
      group = {
        key,
        latitude: position.latitude,
        longitude: position.longitude,
        source: position.source,
        rows: [],
        statusCounts: { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0 },
        status: "COMPLETED",
      };
      groupsByKey.set(key, group);
    } else if (SOURCE_RANK[position.source] > SOURCE_RANK[group.source]) {
      group.latitude = position.latitude;
      group.longitude = position.longitude;
      group.source = position.source;
    }

    group.rows.push(row);
    group.statusCounts[readRowStatus(row)] += 1;
  }

  const groups = [...groupsByKey.values()].map((group) => ({
    ...group,
    // TB-R051: pins are coloured by the status the phone shows; any open meter keeps the pin open.
    status: group.statusCounts.NOT_STARTED > 0
      ? "NOT_STARTED"
      : group.statusCounts.IN_PROGRESS > 0
        ? "IN_PROGRESS"
        : "COMPLETED",
  }));

  return {
    groups,
    unplaced,
    coordinates: groups.map(({ latitude, longitude }) => ({ latitude, longitude })),
  };
}
