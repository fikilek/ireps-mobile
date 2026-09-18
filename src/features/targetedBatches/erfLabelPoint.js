// TB-R051 (1.3.40): where an ERF number is drawn on the batch map. Pure, so it is tested without a map.
//
// A map label keeps its size on screen at every zoom, so a label moved by screen pixels lands in another ERF when
// the map is zoomed out. The ERF number is therefore placed on a fixed point on the ground inside its own ERF:
// straight above a base point, part of the way to the ERF's boundary, so a pin or icon at the centre does not hide
// it. The base point is the ERF centre when it is inside the ERF, else the middle of the widest stretch of the ERF
// on a line across it. An ERF lying inside another counts as a hole in the outer one.

// How far from the base point towards the boundary above it the ERF number sits.
export const ERF_LABEL_RISE = 0.6;

function isPoint(point) {
  return (
    Boolean(point) &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

function usableRings(rings) {
  return (Array.isArray(rings) ? rings : []).filter(
    (ring) => Array.isArray(ring) && ring.length >= 3,
  );
}

// The edges of the given rings, skipping any edge with a broken point.
function edgesOf(rings) {
  const edges = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (isPoint(a) && isPoint(b)) edges.push([a, b]);
    }
  }
  return edges;
}

// Even-odd test on latitude and longitude as a plane (an ERF is small). Several rings together: a point inside an
// outline and inside a hole is outside.
export function ringsContainPoint(rings, point) {
  if (!isPoint(point)) return false;

  let inside = false;
  for (const [a, b] of edgesOf(usableRings(rings))) {
    if (a.latitude > point.latitude === b.latitude > point.latitude) continue;
    const crossLongitude =
      a.longitude +
      ((point.latitude - a.latitude) * (b.longitude - a.longitude)) /
        (b.latitude - a.latitude);
    if (point.longitude < crossLongitude) inside = !inside;
  }
  return inside;
}

export function ringContainsPoint(ring, point) {
  return ringsContainPoint([ring], point);
}

// The latitude where the boundary first meets the line straight above the point, or null.
function boundaryAbove(rings, point) {
  let top = Infinity;
  for (const [a, b] of edgesOf(rings)) {
    let latitude = null;
    if (a.longitude === point.longitude && b.longitude === point.longitude) {
      // A north-south edge on the line itself: the boundary starts at its lower end.
      latitude = Math.min(a.latitude, b.latitude);
    } else {
      const crosses =
        (a.longitude <= point.longitude && point.longitude < b.longitude) ||
        (b.longitude <= point.longitude && point.longitude < a.longitude);
      if (!crosses) continue;
      latitude =
        a.latitude +
        ((point.longitude - a.longitude) * (b.latitude - a.latitude)) /
          (b.longitude - a.longitude);
    }
    if (latitude > point.latitude && latitude < top) top = latitude;
  }
  return Number.isFinite(top) ? top : null;
}

// The middle of the widest stretch inside the rings on the east-west line at this latitude, or null.
function widestStretchMiddle(rings, latitude) {
  const crossings = [];
  for (const [a, b] of edgesOf(rings)) {
    if (a.latitude > latitude === b.latitude > latitude) continue;
    crossings.push(
      a.longitude +
        ((latitude - a.latitude) * (b.longitude - a.longitude)) /
          (b.latitude - a.latitude),
    );
  }
  crossings.sort((left, right) => left - right);

  let best = null;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const width = crossings[i + 1] - crossings[i];
    if (width > 0 && (!best || width > best.width)) {
      best = { width, longitude: (crossings[i] + crossings[i + 1]) / 2 };
    }
  }
  return best ? { latitude, longitude: best.longitude } : null;
}

// A point inside the rings to start from: the centre when it is inside, else the middle of the widest inside
// stretch on the centre's east-west line, else on the line halfway up the outline.
function basePoint(rings, centroid) {
  if (ringsContainPoint(rings, centroid)) return centroid;

  const onCentreLine = widestStretchMiddle(rings, centroid.latitude);
  if (onCentreLine && ringsContainPoint(rings, onCentreLine)) return onCentreLine;

  const latitudes = edgesOf(rings).map(([a]) => a.latitude);
  if (!latitudes.length) return null;
  const middle = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const onMiddleLine = widestStretchMiddle(rings, middle);
  return onMiddleLine && ringsContainPoint(rings, onMiddleLine) ? onMiddleLine : null;
}

// erf: { centroid: { latitude, longitude }, polygons: [[{ latitude, longitude }, ...], ...] }.
// holes: outlines of other ERFs that lie inside this one.
// Returns the point to draw the ERF number at, or null when the ERF has no centre.
export function erfLabelPoint(erf, { holes = [], rise = ERF_LABEL_RISE } = {}) {
  const centroid = erf?.centroid;
  if (!isPoint(centroid)) return null;

  const outlines = usableRings(erf?.polygons);
  if (!outlines.length) return centroid;
  const rings = [...outlines, ...usableRings(holes)];

  const base = basePoint(rings, centroid);
  if (!base) return centroid;

  const top = boundaryAbove(rings, base);
  if (top === null) return base;

  // Every point between the base point and the first boundary above it is inside the ERF.
  return {
    latitude: base.latitude + (top - base.latitude) * rise,
    longitude: base.longitude,
  };
}

// The latitude and longitude bounds of an ERF's outlines, or null.
export function erfBounds(erf) {
  const points = usableRings(erf?.polygons).flat().filter(isPoint);
  if (!points.length) return null;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes),
  };
}

// For each ERF, the outlines of the other ERFs lying inside it (their bounds inside its bounds and their first
// point inside its outline): the holes for erfLabelPoint.
export function holesByErf(erfs = []) {
  const list = Array.isArray(erfs) ? erfs : [];
  const bounds = list.map(erfBounds);
  return list.map((erf, index) => {
    const outer = bounds[index];
    if (!outer) return [];
    const holes = [];
    list.forEach((other, otherIndex) => {
      const inner = bounds[otherIndex];
      if (otherIndex === index || !inner) return;
      if (
        inner.minLat < outer.minLat ||
        inner.maxLat > outer.maxLat ||
        inner.minLng < outer.minLng ||
        inner.maxLng > outer.maxLng
      ) {
        return;
      }
      const otherRings = usableRings(other?.polygons);
      const firstPoint = otherRings[0]?.find(isPoint);
      if (firstPoint && ringsContainPoint(erf.polygons, firstPoint)) holes.push(...otherRings);
    });
    return holes;
  });
}
