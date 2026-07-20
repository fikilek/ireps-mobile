// src/services/fwr-monitoring/fwrLocationPayload.js

function nullableFiniteNumber(value, { minimum = null, maximum = null } = {}) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  if (minimum !== null && normalized < minimum) return null;
  if (maximum !== null && normalized > maximum) return null;

  return normalized;
}

export function buildFwrLocationPayload(locationResult) {
  const coords = locationResult?.coords || {};

  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("A valid GPS latitude is required.");
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("A valid GPS longitude is required.");
  }

  const timestamp = Number(locationResult?.timestamp);

  return {
    location: {
      latitude,
      longitude,
      accuracyM: nullableFiniteNumber(coords.accuracy, { minimum: 0 }),
      altitudeM: nullableFiniteNumber(coords.altitude),
      headingDegrees: nullableFiniteNumber(coords.heading, {
        minimum: 0,
        maximum: 359.999999,
      }),
      speedMps: nullableFiniteNumber(coords.speed, { minimum: 0 }),
    },
    capturedAtMs:
      Number.isFinite(timestamp) && timestamp > 0
        ? Math.trunc(timestamp)
        : Date.now(),
  };
}
