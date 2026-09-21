// TB-R051 (1.3.40): where an ERF number is drawn on the batch map. Pure, so it is tested without a map.
//
// A map label keeps its size on screen at every zoom, so a label moved by screen pixels lands in another ERF when
// the map is zoomed out. The ERF number is therefore placed on a fixed point on the ground inside its own ERF:
// just below a base point (1.3.70), a little of the way to the ERF's boundary, beside the pin rather than under
// it. The base point is the ERF centre when it is inside the ERF, else the middle of the widest stretch of the ERF
// on a line across it. An ERF lying inside another counts as a hole in the outer one.

// TB-R051 (1.3.70; replaces "60% of the way up" of 1.3.40): the ERF number sits just below the ERF's centre,
// beside the pin, and never up against the ERF's edge. Up at 60% it had the least room in the ERF, so it was
// the first thing to cross into the neighbour's ERF as the map zoomed out (owner, 2026-09-21: "make it closer
// to S, and the S is at the center"). It goes below the centre because a pin grows upward from its point, so
// that is the side the pin does not cover. This is how far towards the boundary below it the number sits.
export const ERF_LABEL_DROP = 0.3;

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

// The latitude where the boundary first meets the line straight below the point, or null.
function boundaryBelow(rings, point) {
  let bottom = -Infinity;
  for (const [a, b] of edgesOf(rings)) {
    let latitude = null;
    if (a.longitude === point.longitude && b.longitude === point.longitude) {
      // A north-south edge on the line itself: the boundary starts at its upper end.
      latitude = Math.max(a.latitude, b.latitude);
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
    if (latitude < point.latitude && latitude > bottom) bottom = latitude;
  }
  return Number.isFinite(bottom) ? bottom : null;
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
export function erfLabelPoint(erf, { holes = [], drop = ERF_LABEL_DROP } = {}) {
  const centroid = erf?.centroid;
  if (!isPoint(centroid)) return null;

  const outlines = usableRings(erf?.polygons);
  if (!outlines.length) return centroid;
  const rings = [...outlines, ...usableRings(holes)];

  const base = basePoint(rings, centroid);
  if (!base) return centroid;

  const bottom = boundaryBelow(rings, base);
  if (bottom === null) return base;

  // Every point between the base point and the first boundary below it is inside the ERF.
  return {
    latitude: base.latitude - (base.latitude - bottom) * drop,
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

// TB-R051 (1.3.70): the ERF number keeps itself inside its own ERF at every zoom.
//
// A map label is a picture pinned to a point and keeps its size on screen, while the ERF shrinks as the map
// zooms out, so a label of a fixed size ends up over the neighbour's ERF. The number is therefore drawn at the
// largest size that still fits in the room its own ERF gives it: the circle around the label point that
// touches the nearest edge of the ERF (its outline, or an ERF lying inside it). A circle is used rather than
// the ERF's width, because it is right whichever way the ERF runs.

const METRES_PER_DEGREE_LATITUDE = 111320;

// The ERF number's own measurements, in pixels at font size 1.
export const ERF_LABEL_BASE_FONT_SIZE = 9;
const ERF_LABEL_WIDTH_PER_CHARACTER = 0.68; // of the font size, for the heavy digits a number is made of
const ERF_LABEL_LINE_HEIGHT = 1.25;
// Padding and border on each side of the box. The label's horizontal edge; its vertical edge is smaller,
// so measuring the height with this one makes the fit cautious rather than tight.
const ERF_LABEL_EDGE = 4;
// Below this the label has no readable pixels left, so nothing is drawn rather than a smudge.
const ERF_LABEL_SMALLEST_FONT_SIZE = 3;

// The distance in metres from an ERF's label point to the nearest edge of that ERF.
export function erfLabelRoomMetres(erf, { holes = [], point = null } = {}) {
  const at = isPoint(point) ? point : erfLabelPoint(erf, { holes });
  if (!isPoint(at)) return 0;

  const edges = edgesOf([...usableRings(erf?.polygons), ...usableRings(holes)]);
  if (!edges.length) return 0;

  // A degree of longitude is shorter away from the equator, by the cosine of the latitude.
  const longitudeScale = Math.cos((at.latitude * Math.PI) / 180);
  const metres = (point_, from) => ({
    x:
      (point_.longitude - from.longitude) *
      METRES_PER_DEGREE_LATITUDE *
      longitudeScale,
    y: (point_.latitude - from.latitude) * METRES_PER_DEGREE_LATITUDE,
  });

  let nearest = Infinity;
  for (const [a, b] of edges) {
    const toPoint = metres(at, a);
    const edge = metres(b, a);
    const edgeLengthSquared = edge.x * edge.x + edge.y * edge.y;
    // How far along the edge the nearest point lies, kept between its two ends.
    const along =
      edgeLengthSquared > 0
        ? Math.max(
            0,
            Math.min(
              1,
              (toPoint.x * edge.x + toPoint.y * edge.y) / edgeLengthSquared,
            ),
          )
        : 0;
    const x = toPoint.x - edge.x * along;
    const y = toPoint.y - edge.y * along;
    const distance = Math.sqrt(x * x + y * y);
    if (distance < nearest) nearest = distance;
  }

  return Number.isFinite(nearest) ? nearest : 0;
}

// The largest font size, never above the base, whose label box fits inside a circle of `roomPixels`.
// 0 means the ERF has no room left for a number worth drawing.
export function erfLabelFontSize(
  characters,
  roomPixels,
  base = ERF_LABEL_BASE_FONT_SIZE,
) {
  const count = Math.max(1, Math.trunc(Number(characters) || 0));
  const room = Number(roomPixels);
  if (!Number.isFinite(room) || room <= 0) return 0;

  // The box at font size f is (count * w * f + 2e) wide and (h * f + 2e) high; it fits when half its
  // diagonal is within the room. Solving that for f is the quadratic below.
  const width = count * ERF_LABEL_WIDTH_PER_CHARACTER;
  const height = ERF_LABEL_LINE_HEIGHT;
  const a = width * width + height * height;
  const b = 4 * ERF_LABEL_EDGE * (width + height);
  const c = 8 * ERF_LABEL_EDGE * ERF_LABEL_EDGE - 4 * room * room;

  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return 0;

  const fitted = (-b + Math.sqrt(discriminant)) / (2 * a);
  if (!Number.isFinite(fitted) || fitted < ERF_LABEL_SMALLEST_FONT_SIZE) return 0;

  // Whole pixels, so a small pan or zoom does not redraw every number on the map.
  return Math.min(Math.round(fitted), base);
}
