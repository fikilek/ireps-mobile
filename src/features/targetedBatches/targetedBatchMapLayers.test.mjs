import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  batchAreaShape,
  batchMapArea,
  classifyOtherSalesMeter,
  erfEntriesFromDocs,
  erfNumberChunks,
  erfsInArea,
  MAP_PIN_LABELS,
  MAP_STATUS_COLORS,
  nearestItems,
  orderedUnique,
  pointInArea,
  pointInBatchArea,
  premisesInArea,
  SALES_STATUS_ICONS,
} from "./targetedBatchMapLayers.js";

const layersSource = await readFile(new URL("./targetedBatchMapLayers.js", import.meta.url), "utf8");
const loaderSource = await readFile(new URL("./loadOtherSalesMeters.js", import.meta.url), "utf8");
const areaLoaderSource = await readFile(new URL("./loadBatchAreaLayers.js", import.meta.url), "utf8");
const modalSource = await readFile(new URL("./TargetedBatchMapModal.js", import.meta.url), "utf8");
const erfsApiSource = await readFile(new URL("../../redux/erfsApi.js", import.meta.url), "utf8");

const METERS_PER_DEGREE_LATITUDE = 111320;
const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

// Haversine distance in metres, to check the margin independently of the conversion used.
function metresBetween(first, second) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(second.latitude - first.latitude);
  const dLng = radians(second.longitude - first.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------------------------------------
// The real ward ERF pack: erfsApi.js initialises Firebase on import, so its pure pack builder is evaluated
// from its source text and fed an ireps_erfs snapshot shaped as collection-shape-rules/ireps_erfs.md.
// ---------------------------------------------------------------------------------------------------------
function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `${start} not found`);
  assert.notEqual(to, -1, `${end} not found`);
  return source.slice(from, to);
}

const buildWardErfPackFromSnapshot = new Function(
  `${sliceBetween(erfsApiSource, "const workoutSovereignErf", "const makeWardPackKey")}
${sliceBetween(erfsApiSource, "function parseErfGeometry(", "export const erfsApi")}
return buildWardErfPackFromSnapshot;`,
)();

// Lesedi, Ward 13 (the ireps_erfs.md example ERF 2315 and its neighbours).
const LM = "ZA7423";
const WARD = "ZA7423013";
const square = (lat, lng, half) => [
  [lng - half, lat - half],
  [lng + half, lat - half],
  [lng + half, lat + half],
  [lng - half, lat + half],
  [lng - half, lat - half],
];
const ireps_erf = ({ erfId, parcelNo, portion = 0, lat, lng, half = 0.0001, geometry, bbox, centroid, updatedAt = "2026-06-12T00:00:00.000Z" }) => ({
  erfId,
  admin: { localMunicipality: { name: "Lesedi", pcode: LM }, ward: { name: "Ward 13", pcode: WARD } },
  bbox: bbox === undefined ? { minLat: lat - half, minLng: lng - half, maxLat: lat + half, maxLng: lng + half } : bbox,
  centroid: centroid === undefined ? { lat, lng } : centroid,
  erf: { area: 233.764418, source: "SG", status: "R", type: "FORMAL" },
  sg: { parcelNo, portion, erfNo: portion ? `${parcelNo}/${portion}` : String(parcelNo), prclKey: erfId, prclType: "E" },
  // Stored as stringified GeoJSON (ireps_erfs.md 4); the pack parses it.
  geometry: geometry === undefined ? JSON.stringify({ type: "MultiPolygon", coordinates: [[square(lat, lng, half)]] }) : geometry,
  premises: [],
  geofenceRefs: [],
  metadata: { updatedAt },
});
const snapshotOf = (erfs) => ({ size: erfs.length, docs: erfs.map((erf) => ({ id: erf.erfId, data: () => erf })) });
const packOf = (erfs) =>
  buildWardErfPackFromSnapshot(snapshotOf(erfs), { lmPcode: LM, wardPcode: WARD, wardCacheKey: `${LM}__${WARD}`, firstSnapshotAt: 1 });

const MIDDLE = { latitude: -26.3484086987837, longitude: 28.761325581674797 };
const AREA = batchMapArea({ pinCoordinates: [MIDDLE], marginMeters: 50 });

test("the module stays pure: its only import is the pure map points module", () => {
  const imports = layersSource.match(/^import .*$/gm) || [];
  assert.deepEqual(imports, ['import { readErfCentroid, resolveTargetedBatchSalesPoint } from "./targetedBatchMapPoints.js";']);
  assert.doesNotMatch(layersSource, /from "react|from "firebase|from "expo/);
});

test("pin wording, map status colours and status shapes are the 1.3.38 contract, frozen", () => {
  assert.deepEqual(MAP_PIN_LABELS, { GPS: "GPS Sales", GEOCODED: "Non-GPS Sales", ERF: "ERF" });
  assert.deepEqual(MAP_STATUS_COLORS, { NOT_STARTED: "#2563eb", IN_PROGRESS: "#f59e0b", COMPLETED: "#16a34a" });
  assert.deepEqual(SALES_STATUS_ICONS, {
    NOT_STARTED: { symbol: "▲", color: "#2563eb", label: "Not started" },
    IN_PROGRESS: { symbol: "★", color: "#f59e0b", label: "In progress" },
    COMPLETED: { symbol: "■", color: "#16a34a", label: "Completed" },
  });
  for (const status of Object.keys(MAP_STATUS_COLORS)) {
    assert.equal(SALES_STATUS_ICONS[status].color, MAP_STATUS_COLORS[status]);
  }
  assert.deepEqual(Object.keys(SALES_STATUS_ICONS), Object.keys(MAP_STATUS_COLORS));
  assert.equal(Object.isFrozen(MAP_PIN_LABELS), true);
  assert.equal(Object.isFrozen(MAP_STATUS_COLORS), true);
  assert.equal(Object.isFrozen(SALES_STATUS_ICONS), true);
  assert.equal(Object.isFrozen(SALES_STATUS_ICONS.IN_PROGRESS), true);
  assert.doesNotMatch(JSON.stringify(MAP_PIN_LABELS), /not observed/i);
  // Each colour is set once, in MAP_STATUS_COLORS.
  assert.equal(layersSource.match(/#2563eb|#f59e0b|#16a34a/gi).length, 3);
});

test("the batch pins use the same status colours: the map takes MAP_STATUS_COLORS, or holds the same values", () => {
  const own = modalSource.match(
    /const STATUS_COLORS = Object\.freeze\(\{\s*NOT_STARTED:\s*"(#[0-9a-f]{6})",\s*IN_PROGRESS:\s*"(#[0-9a-f]{6})",\s*COMPLETED:\s*"(#[0-9a-f]{6})"/i,
  );
  if (own) {
    assert.deepEqual(own.slice(1, 4), [MAP_STATUS_COLORS.NOT_STARTED, MAP_STATUS_COLORS.IN_PROGRESS, MAP_STATUS_COLORS.COMPLETED]);
  } else {
    assert.match(modalSource, /MAP_STATUS_COLORS/);
  }
});

// ---------------------------------------------------------------------------------------------------------
// batchMapArea / pointInArea
// ---------------------------------------------------------------------------------------------------------
test("batch area: the geofence decides when it has three points; the pins are then ignored", () => {
  const geofencePoints = [
    { latitude: -26.35, longitude: 28.76 },
    { latitude: -26.34, longitude: 28.77 },
    { latitude: -26.345, longitude: 28.75 },
  ];
  const pinCoordinates = [{ latitude: -26.5, longitude: 28.9 }];
  const area = batchMapArea({ geofencePoints, pinCoordinates, marginMeters: 0 });
  assert.deepEqual(area, { minLat: -26.35, maxLat: -26.34, minLng: 28.75, maxLng: 28.77 });
  assert.equal(pointInArea(area, pinCoordinates[0]), false);
});

test("batch area: the pins decide where there is no geofence, or the geofence has fewer than three valid points", () => {
  const pinCoordinates = [
    { latitude: -26.349, longitude: 28.762 },
    { latitude: -26.347, longitude: 28.76 },
  ];
  const expected = { minLat: -26.349, maxLat: -26.347, minLng: 28.76, maxLng: 28.762 };
  assert.deepEqual(batchMapArea({ pinCoordinates, marginMeters: 0 }), expected);
  assert.deepEqual(batchMapArea({ geofencePoints: [], pinCoordinates, marginMeters: 0 }), expected);
  assert.deepEqual(
    batchMapArea({
      geofencePoints: [{ latitude: -20, longitude: 20 }, { latitude: -21, longitude: 21 }, { latitude: null, longitude: 22 }],
      pinCoordinates,
      marginMeters: 0,
    }),
    expected,
  );
});

test("batch area: invalid points are skipped; { lat, lng } is read; nothing valid gives null", () => {
  assert.deepEqual(
    batchMapArea({
      pinCoordinates: [null, { latitude: Number.NaN, longitude: 28 }, { latitude: 95, longitude: 28 }, { lat: -26.3, lng: 28.7 }, "x"],
      marginMeters: 0,
    }),
    { minLat: -26.3, maxLat: -26.3, minLng: 28.7, maxLng: 28.7 },
  );
  assert.equal(batchMapArea({}), null);
  assert.equal(batchMapArea(), null);
  assert.equal(batchMapArea({ geofencePoints: "bad", pinCoordinates: [{ latitude: null, longitude: null }] }), null);
});

test("batch area: a 50 m margin is 50 m on every side at that latitude (the default)", () => {
  const area = batchMapArea({ pinCoordinates: [MIDDLE] });
  assert.deepEqual(area, batchMapArea({ pinCoordinates: [MIDDLE], marginMeters: 50 }));

  near(area.maxLat - MIDDLE.latitude, 50 / METERS_PER_DEGREE_LATITUDE);
  near(MIDDLE.latitude - area.minLat, 50 / METERS_PER_DEGREE_LATITUDE);
  near(area.maxLng - MIDDLE.longitude, 50 / METERS_PER_DEGREE_LATITUDE / Math.cos((MIDDLE.latitude * Math.PI) / 180));
  // At -26° a degree of longitude is shorter, so the longitude margin is wider in degrees.
  assert.ok(area.maxLng - MIDDLE.longitude > area.maxLat - MIDDLE.latitude);

  for (const edge of [
    { latitude: area.maxLat, longitude: MIDDLE.longitude },
    { latitude: area.minLat, longitude: MIDDLE.longitude },
    { latitude: MIDDLE.latitude, longitude: area.maxLng },
    { latitude: MIDDLE.latitude, longitude: area.minLng },
  ]) {
    near(metresBetween(MIDDLE, edge), 50, 0.5);
  }
});

test("batch area: margin 0, negative or not a number adds nothing; the area stays on the globe", () => {
  const pin = [{ latitude: -26.3, longitude: 28.7 }];
  const bare = { minLat: -26.3, maxLat: -26.3, minLng: 28.7, maxLng: 28.7 };
  assert.deepEqual(batchMapArea({ pinCoordinates: pin, marginMeters: 0 }), bare);
  assert.deepEqual(batchMapArea({ pinCoordinates: pin, marginMeters: -5 }), bare);
  assert.deepEqual(batchMapArea({ pinCoordinates: pin, marginMeters: Number.NaN }), bare);
  assert.deepEqual(batchMapArea({ pinCoordinates: pin, marginMeters: "50" }), bare);

  const edge = batchMapArea({ pinCoordinates: [{ latitude: 90, longitude: 180 }], marginMeters: 500 });
  assert.equal(edge.maxLat, 90);
  assert.equal(edge.maxLng, 180);
  assert.ok(edge.minLat < 90 && edge.minLng < 180);
});

test("point in area: edges count; outside, invalid areas and invalid points do not", () => {
  const area = { minLat: -26.35, maxLat: -26.34, minLng: 28.75, maxLng: 28.77 };
  assert.equal(pointInArea(area, { latitude: -26.345, longitude: 28.76 }), true);
  assert.equal(pointInArea(area, { latitude: -26.35, longitude: 28.77 }), true);
  assert.equal(pointInArea(area, { latitude: -26.34, longitude: 28.75 }), true);
  assert.equal(pointInArea(area, { latitude: -26.3399, longitude: 28.76 }), false);
  assert.equal(pointInArea(area, { latitude: -26.345, longitude: 28.7701 }), false);
  assert.equal(pointInArea(area, { latitude: "-26.345", longitude: 28.76 }), false);
  assert.equal(pointInArea(area, { latitude: -26.345 }), false);
  assert.equal(pointInArea(area, null), false);
  assert.equal(pointInArea(null, { latitude: -26.345, longitude: 28.76 }), false);
  assert.equal(pointInArea({ ...area, minLat: -26.3, maxLat: -26.4 }, { latitude: -26.345, longitude: 28.76 }), false);
  assert.equal(pointInArea({ ...area, maxLng: Number.NaN }, { latitude: -26.345, longitude: 28.76 }), false);
});

// ---------------------------------------------------------------------------------------------------------
// batchAreaShape / pointInBatchArea: the geofence's own outline with a 50 m margin
// ---------------------------------------------------------------------------------------------------------
const LNG_DEGREE_METERS = METERS_PER_DEGREE_LATITUDE * Math.cos((MIDDLE.latitude * Math.PI) / 180);
// A point x metres east and y metres north of MIDDLE.
const local = (x, y) => ({
  latitude: MIDDLE.latitude + y / METERS_PER_DEGREE_LATITUDE,
  longitude: MIDDLE.longitude + x / LNG_DEGREE_METERS,
});

// A 100 m square geofence around MIDDLE.
const SQUARE = [local(-50, -50), local(50, -50), local(50, 50), local(-50, 50)];

// A diagonal strip geofence along a road: from MIDDLE 800 m east and 800 m north (about 1.13 km), 30 m wide.
const STRIP_WIDTH_HALF = 15;
const STRIP_LENGTH = 800 * Math.SQRT2;
// `along` metres along the strip's middle line from its start, `across` metres to its north-west side.
const onStrip = (along, across = 0) => local((along - across) / Math.SQRT2, (along + across) / Math.SQRT2);
const STRIP = [
  onStrip(0, STRIP_WIDTH_HALF),
  onStrip(STRIP_LENGTH, STRIP_WIDTH_HALF),
  onStrip(STRIP_LENGTH, -STRIP_WIDTH_HALF),
  onStrip(0, -STRIP_WIDTH_HALF),
];
const STRIP_SHAPE = batchAreaShape({ geofencePoints: STRIP, marginMeters: 50 });

test("area shape: a geofence of three or more points is the outline; bbox is its rectangle plus the margin", () => {
  const shape = batchAreaShape({ geofencePoints: SQUARE, pinCoordinates: [{ latitude: -26.5, longitude: 28.9 }], marginMeters: 50 });
  assert.deepEqual(Object.keys(shape).sort(), ["bbox", "center", "marginMeters", "polygon"]);
  assert.deepEqual(shape.polygon, SQUARE);
  assert.equal(shape.marginMeters, 50);
  assert.deepEqual(shape.bbox, batchMapArea({ geofencePoints: SQUARE, marginMeters: 50 }));
  near(shape.center.latitude, MIDDLE.latitude);
  near(shape.center.longitude, MIDDLE.longitude);
  near(metresBetween(local(0, 50), { latitude: shape.bbox.maxLat, longitude: MIDDLE.longitude }), 50, 0.5);

  // A closed ring (first point repeated) is the same outline; { lat, lng } is read.
  const closed = batchAreaShape({ geofencePoints: [...SQUARE.map(({ latitude, longitude }) => ({ lat: latitude, lng: longitude })), { ...SQUARE[0] }] });
  assert.deepEqual(closed.polygon, SQUARE);
  // The default margin is 50 m.
  assert.equal(closed.marginMeters, 50);
});

test("area shape: without a geofence outline the pins make a rectangle area; nothing valid gives null", () => {
  const pins = [local(-20, 0), local(20, 10)];
  const shape = batchAreaShape({ geofencePoints: [SQUARE[0], SQUARE[1], { ...SQUARE[0] }], pinCoordinates: pins, marginMeters: 50 });
  assert.equal(shape.polygon, null);
  assert.deepEqual(shape.bbox, batchMapArea({ pinCoordinates: pins, marginMeters: 50 }));
  near(shape.center.latitude, local(0, 5).latitude);
  near(shape.center.longitude, MIDDLE.longitude);

  assert.equal(batchAreaShape({ pinCoordinates: pins, marginMeters: "50" }).marginMeters, 0);
  assert.equal(batchAreaShape({ pinCoordinates: pins, marginMeters: -1 }).marginMeters, 0);
  assert.equal(batchAreaShape({}), null);
  assert.equal(batchAreaShape(), null);
  assert.equal(batchAreaShape({ geofencePoints: [SQUARE[0], SQUARE[1]], pinCoordinates: "bad" }), null);
});

test("in the batch area: inside the outline, or within 50 m of its edges; corners are rounded, not square", () => {
  const shape = batchAreaShape({ geofencePoints: SQUARE, marginMeters: 50 });
  assert.equal(pointInBatchArea(shape, MIDDLE), true);
  assert.equal(pointInBatchArea(shape, local(49, 49)), true);
  // 49 m and 51 m beyond the east edge, and beyond the south edge.
  assert.equal(pointInBatchArea(shape, local(99, 0)), true);
  assert.equal(pointInBatchArea(shape, local(101, 0)), false);
  assert.equal(pointInBatchArea(shape, local(0, -99)), true);
  assert.equal(pointInBatchArea(shape, local(0, -101)), false);
  // Beyond the north-east corner: 42 m away is in, 57 m away is out although it is inside the rectangle.
  assert.equal(pointInBatchArea(shape, local(80, 80)), true);
  assert.equal(pointInBatchArea(shape, local(90, 90)), false);
  assert.equal(pointInArea(shape.bbox, local(90, 90)), true);
  // A shape read back from JSON (the map keeps it as a key) gives the same answers.
  const copy = JSON.parse(JSON.stringify(shape));
  assert.equal(pointInBatchArea(copy, local(80, 80)), true);
  assert.equal(pointInBatchArea(copy, local(90, 90)), false);
  // pointInArea reads a shape the same way.
  assert.equal(pointInArea(shape, local(90, 90)), false);
});

test("in the batch area: margin 0 keeps the outline itself, edges and corners count; a notch is outside", () => {
  // A U-shaped geofence: 300 m wide, 300 m tall, with a 100 m wide notch 200 m deep from the north.
  const u = [local(-150, -150), local(150, -150), local(150, 150), local(50, 150), local(50, -50), local(-50, -50), local(-50, 150), local(-150, 150)];
  const bare = batchAreaShape({ geofencePoints: u, marginMeters: 0 });
  assert.equal(pointInBatchArea(bare, local(-100, 0)), true);
  assert.equal(pointInBatchArea(bare, u[0]), true);
  assert.equal(pointInBatchArea(bare, { latitude: u[0].latitude, longitude: (u[0].longitude + u[1].longitude) / 2 }), true);
  assert.equal(pointInBatchArea(bare, local(0, 100)), false);
  assert.equal(pointInBatchArea(bare, local(0, -49)), false);

  // The margin reaches into the notch from its walls and its bottom.
  const shape = batchAreaShape({ geofencePoints: u, marginMeters: 50 });
  assert.equal(pointInBatchArea(shape, local(10, 100)), true);
  assert.equal(pointInBatchArea(shape, local(0, -10)), true);
  const narrow = batchAreaShape({ geofencePoints: u, marginMeters: 30 });
  assert.equal(pointInBatchArea(narrow, local(0, 100)), false);
  assert.equal(pointInBatchArea(narrow, local(25, 100)), true);
  assert.equal(pointInBatchArea(narrow, local(0, -10)), false);
});

test("in the batch area: a diagonal strip geofence; its rectangle's far corner is not in the area", () => {
  const farCorner = local(0, 800);
  assert.equal(pointInArea(STRIP_SHAPE.bbox, farCorner), true);
  assert.equal(pointInBatchArea(STRIP_SHAPE, farCorner), false);
  assert.equal(pointInBatchArea(STRIP_SHAPE, local(800, 0)), false);

  const middle = STRIP_LENGTH / 2;
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(middle)), true);
  // Edge of the strip at 15 m; the margin reaches 65 m from the middle line on both sides.
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(middle, 64)), true);
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(middle, 66)), false);
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(middle, -64)), true);
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(middle, -66)), false);
  // Beyond both ends.
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(-49)), true);
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(-51)), false);
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(STRIP_LENGTH + 49)), true);
  assert.equal(pointInBatchArea(STRIP_SHAPE, onStrip(STRIP_LENGTH + 51)), false);
  assert.equal(pointInArea(STRIP_SHAPE.bbox, onStrip(STRIP_LENGTH + 51)), true);
});

test("in the batch area: without an outline the rectangle decides; bad shapes and points are not in it", () => {
  const pins = batchAreaShape({ pinCoordinates: [MIDDLE], marginMeters: 50 });
  assert.equal(pointInBatchArea(pins, local(0, 49)), true);
  assert.equal(pointInBatchArea(pins, local(0, 51)), false);
  // Rectangle corners are in.
  assert.equal(pointInBatchArea(pins, local(45, 45)), true);
  // A plain rectangle reads as before.
  assert.equal(pointInBatchArea(AREA, local(45, 45)), true);
  // An outline with fewer than three valid points is no outline.
  assert.equal(pointInBatchArea({ ...STRIP_SHAPE, polygon: STRIP.slice(0, 2) }, local(0, 800)), true);

  assert.equal(pointInBatchArea(STRIP_SHAPE, { latitude: String(MIDDLE.latitude), longitude: MIDDLE.longitude }), false);
  assert.equal(pointInBatchArea(STRIP_SHAPE, { latitude: Number.NaN, longitude: MIDDLE.longitude }), false);
  assert.equal(pointInBatchArea(STRIP_SHAPE, null), false);
  assert.equal(pointInBatchArea(null, MIDDLE), false);
  assert.equal(pointInBatchArea({ ...STRIP_SHAPE, bbox: { ...STRIP_SHAPE.bbox, minLat: 0 } }, MIDDLE), false);
  assert.equal(pointInBatchArea({ polygon: STRIP, marginMeters: 50 }, MIDDLE), false);
  assert.equal(pointInBatchArea("bad", MIDDLE), false);
});

// ---------------------------------------------------------------------------------------------------------
// erfsInArea, against the real ward ERF pack
// ---------------------------------------------------------------------------------------------------------
test("ERF pack shape: meta { id, erfNo }, geo { bbox, centroid { lat, lng }, geometry parsed GeoJSON }", () => {
  const pack = packOf([ireps_erf({ erfId: "G423T0IR077100002315000000", parcelNo: 2315, lat: MIDDLE.latitude, lng: MIDDLE.longitude })]);
  const [meta] = pack.metaEntries;
  const geo = pack.geoEntries[meta.id];
  assert.equal(meta.id, "G423T0IR077100002315000000");
  assert.equal(meta.erfNo, "2315");
  assert.deepEqual(Object.keys(geo).sort(), ["bbox", "centroid", "geometry"]);
  assert.deepEqual(Object.keys(geo.bbox).sort(), ["maxLat", "maxLng", "minLat", "minLng"]);
  assert.deepEqual(geo.centroid, { lat: MIDDLE.latitude, lng: MIDDLE.longitude });
  assert.equal(typeof geo.geometry, "object");
  assert.equal(geo.geometry.type, "MultiPolygon");
});

test("ERFs: a MultiPolygon gives every part's outer ring as { latitude, longitude }; holes are left out", () => {
  const outer = square(MIDDLE.latitude, MIDDLE.longitude, 0.0002);
  const hole = square(MIDDLE.latitude, MIDDLE.longitude, 0.00005);
  const second = square(MIDDLE.latitude + 0.0003, MIDDLE.longitude, 0.00005);
  const pack = packOf([
    ireps_erf({
      erfId: "G423T0IR077100002316000000",
      parcelNo: 2316,
      lat: MIDDLE.latitude,
      lng: MIDDLE.longitude,
      half: 0.0003,
      geometry: JSON.stringify({ type: "MultiPolygon", coordinates: [[outer, hole], [second]] }),
    }),
  ]);
  const { erfs, capped } = erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries });
  assert.equal(capped, false);
  assert.equal(erfs.length, 1);
  assert.deepEqual(Object.keys(erfs[0]).sort(), ["centroid", "erfNo", "id", "polygons"]);
  assert.equal(erfs[0].id, "G423T0IR077100002316000000");
  assert.equal(erfs[0].erfNo, "2316");
  assert.deepEqual(erfs[0].centroid, MIDDLE);
  assert.deepEqual(erfs[0].polygons, [
    outer.map(([longitude, latitude]) => ({ latitude, longitude })),
    second.map(([longitude, latitude]) => ({ latitude, longitude })),
  ]);
});

test("ERFs: a Polygon gives its outer ring; a portion reads parcel/portion", () => {
  const outer = square(MIDDLE.latitude, MIDDLE.longitude, 0.0001);
  const hole = square(MIDDLE.latitude, MIDDLE.longitude, 0.00002);
  const pack = packOf([
    ireps_erf({
      erfId: "G423T0IR077100002317000003",
      parcelNo: 2317,
      portion: 3,
      lat: MIDDLE.latitude,
      lng: MIDDLE.longitude,
      geometry: JSON.stringify({ type: "Polygon", coordinates: [outer, hole] }),
    }),
  ]);
  const { erfs } = erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries });
  assert.equal(erfs[0].erfNo, "2317/3");
  assert.deepEqual(erfs[0].polygons, [outer.map(([longitude, latitude]) => ({ latitude, longitude }))]);
});

test("ERFs: a stored string (an older cache), a Feature and untyped nesting are read; bad geometry gives no boundary", () => {
  const ring = square(MIDDLE.latitude, MIDDLE.longitude, 0.0001);
  const expected = [ring.map(([longitude, latitude]) => ({ latitude, longitude }))];
  const geo = (geometry) => ({ bbox: null, centroid: { lat: MIDDLE.latitude, lng: MIDDLE.longitude }, geometry });
  const read = (geometry) =>
    erfsInArea({ area: AREA, metaEntries: [{ id: "E1", erfNo: "1" }], geoEntries: { E1: geo(geometry) } }).erfs[0].polygons;

  assert.deepEqual(read(JSON.stringify({ type: "MultiPolygon", coordinates: [[ring]] })), expected);
  assert.deepEqual(read({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } }), expected);
  assert.deepEqual(read({ coordinates: [ring] }), expected);
  assert.deepEqual(read({ coordinates: [[ring]] }), expected);
  assert.deepEqual(read({ type: "Point", coordinates: [28.76, -26.34] }), []);
  assert.deepEqual(read("{not json"), []);
  assert.deepEqual(read(null), []);
  // Fewer than three valid positions is not a boundary; invalid positions are dropped.
  assert.deepEqual(read({ type: "Polygon", coordinates: [[[28.76, -26.34], [28.761, -26.34], [null, -26.35], [28.76, 95]]] }), []);
  assert.deepEqual(read({ type: "Polygon", coordinates: [[...ring.slice(0, 2), ["x", "y"], ...ring.slice(2)]] }), expected);
});

test("ERFs: in the area when the bbox overlaps, even with the centre outside; not when both are outside", () => {
  // A long ERF whose bbox reaches into the area while its centre is 300 m north.
  const northLat = MIDDLE.latitude + 300 / METERS_PER_DEGREE_LATITUDE;
  const reaching = ireps_erf({
    erfId: "REACHING",
    parcelNo: 1,
    lat: northLat,
    lng: MIDDLE.longitude,
    bbox: { minLat: MIDDLE.latitude, minLng: MIDDLE.longitude - 0.0001, maxLat: northLat + 0.0001, maxLng: MIDDLE.longitude + 0.0001 },
  });
  const away = ireps_erf({ erfId: "AWAY", parcelNo: 2, lat: northLat, lng: MIDDLE.longitude });
  const pack = packOf([reaching, away]);
  const { erfs } = erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries });
  assert.deepEqual(erfs.map((erf) => erf.id), ["REACHING"]);
  assert.equal(pointInArea(AREA, erfs[0].centroid), false);
});

test("ERFs: without a bbox the centre decides; without both the boundary's own bounds decide", () => {
  const inside = { latitude: MIDDLE.latitude + 0.0001, longitude: MIDDLE.longitude };
  const outside = { latitude: MIDDLE.latitude + 0.01, longitude: MIDDLE.longitude };
  const ringAt = ({ latitude, longitude }) => ({ type: "Polygon", coordinates: [square(latitude, longitude, 0.00005)] });
  const geoEntries = {
    CENTRE_IN: { bbox: null, centroid: { lat: inside.latitude, lng: inside.longitude }, geometry: null },
    CENTRE_OUT: { bbox: null, centroid: { lat: outside.latitude, lng: outside.longitude }, geometry: ringAt(inside) },
    ARRAY_CENTRE: { bbox: { minLat: "bad" }, centroid: [inside.latitude, inside.longitude], geometry: null },
    SHAPE_IN: { bbox: null, centroid: null, geometry: JSON.stringify(ringAt(inside)) },
    SHAPE_OUT: { bbox: null, centroid: null, geometry: ringAt(outside) },
    NOTHING: { bbox: null, centroid: null, geometry: null },
  };
  const metaEntries = Object.keys(geoEntries).map((id) => ({ id, erfNo: id }));
  const { erfs } = erfsInArea({ area: AREA, metaEntries, geoEntries });
  assert.deepEqual(erfs.map((erf) => erf.id).sort(), ["ARRAY_CENTRE", "CENTRE_IN", "SHAPE_IN"]);
  const byId = Object.fromEntries(erfs.map((erf) => [erf.id, erf]));
  assert.deepEqual(byId.ARRAY_CENTRE.centroid, inside);
  assert.equal(byId.SHAPE_IN.centroid, null);
  assert.equal(byId.SHAPE_IN.polygons.length, 1);
  assert.deepEqual(byId.CENTRE_IN.polygons, []);
});

test("ERFs: ERFs without a geo entry, without an ID or listed twice are skipped; bad input gives nothing", () => {
  const geoEntries = { E1: { bbox: null, centroid: { lat: MIDDLE.latitude, lng: MIDDLE.longitude }, geometry: null } };
  const { erfs } = erfsInArea({
    area: AREA,
    metaEntries: [{ id: "E1", erfNo: " 826 " }, { id: "E1", erfNo: "again" }, { id: "E2", erfNo: "2" }, { erfNo: "3" }, null],
    geoEntries,
  });
  assert.deepEqual(erfs, [{ id: "E1", erfNo: "826", centroid: MIDDLE, polygons: [] }]);

  assert.deepEqual(erfsInArea({ area: null, metaEntries: [{ id: "E1" }], geoEntries }), { erfs: [], capped: false });
  assert.deepEqual(erfsInArea({ area: AREA, metaEntries: "bad", geoEntries: "bad" }), { erfs: [], capped: false });
  assert.deepEqual(erfsInArea(), { erfs: [], capped: false });
});

test("ERFs: the cap keeps the ERFs nearest the middle of the area and says it was capped", () => {
  const step = 10 / METERS_PER_DEGREE_LATITUDE;
  const erfList = [3, 0, 2, 1].map((index) =>
    ireps_erf({ erfId: `E${index}`, parcelNo: 100 + index, lat: MIDDLE.latitude + index * step, lng: MIDDLE.longitude, half: 0.00002 }),
  );
  const pack = packOf(erfList);
  const all = erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries });
  assert.equal(all.capped, false);
  assert.deepEqual(all.erfs.map((erf) => erf.id), ["E0", "E1", "E2", "E3"]);

  const two = erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries, limit: 2 });
  assert.equal(two.capped, true);
  assert.deepEqual(two.erfs.map((erf) => erf.id), ["E0", "E1"]);

  assert.equal(erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries, limit: 4 }).capped, false);
  assert.deepEqual(erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries, limit: 0 }), { erfs: [], capped: true });

  // The default cap is 400.
  const many = Array.from({ length: 401 }, (_, index) => ({ id: `M${String(index).padStart(3, "0")}`, erfNo: String(index) }));
  const manyGeo = Object.fromEntries(many.map(({ id }) => [id, { bbox: null, centroid: { lat: MIDDLE.latitude, lng: MIDDLE.longitude }, geometry: null }]));
  const capped = erfsInArea({ area: AREA, metaEntries: many, geoEntries: manyGeo });
  assert.equal(capped.erfs.length, 400);
  assert.equal(capped.capped, true);
  // Equal distances fall back to the ERF ID, so the kept ERFs do not change between renders.
  assert.equal(capped.erfs[0].id, "M000");
  assert.equal(capped.erfs[399].id, "M399");
});

// An ireps_erfs document as the area read returns it ({ ...data, id }), with a rectangle boundary in metres
// around MIDDLE (x east, y north).
const rectangleDoc = ({ erfId, parcelNo, west, east, south, north, centre }) => {
  const sw = local(west, south);
  const ne = local(east, north);
  const ring = [local(west, south), local(east, south), local(east, north), local(west, north), local(west, south)];
  const middle = centre ?? local((west + east) / 2, (south + north) / 2);
  return {
    ...ireps_erf({
      erfId,
      parcelNo,
      lat: middle.latitude,
      lng: middle.longitude,
      bbox: { minLat: sw.latitude, minLng: sw.longitude, maxLat: ne.latitude, maxLng: ne.longitude },
      geometry: JSON.stringify({ type: "Polygon", coordinates: [ring.map(({ latitude, longitude }) => [longitude, latitude])] }),
    }),
    id: erfId,
  };
};
const squareDoc = (erfId, parcelNo, { latitude, longitude }, halfMeters) => {
  const x = (longitude - MIDDLE.longitude) * LNG_DEGREE_METERS;
  const y = (latitude - MIDDLE.latitude) * METERS_PER_DEGREE_LATITUDE;
  return rectangleDoc({ erfId, parcelNo, west: x - halfMeters, east: x + halfMeters, south: y - halfMeters, north: y + halfMeters });
};

// Around the diagonal strip (its middle is 400 m east and 400 m north of MIDDLE).
const STRIP_ERF_DOCS = [
  // In the far corner of the strip's rectangle, 565 m from the strip.
  squareDoc("FAR_CORNER", 1, local(0, 800), 5),
  // On the strip.
  squareDoc("ON_STRIP", 2, onStrip(STRIP_LENGTH / 2), 5),
  // Centre 45 m from the strip's edge.
  squareDoc("CENTRE_NEAR", 3, onStrip(300, 60), 3),
  // Centre 85 m from the edge, its nearest corner 43 m.
  squareDoc("CORNER_NEAR", 4, onStrip(700, 100), 30),
  // Centre 100 m from the edge, its nearest corner 58 m.
  squareDoc("CORNER_AWAY", 5, onStrip(900, 115), 30),
  // A long narrow ERF the strip crosses: its centre and every corner are more than 50 m from the strip's edge.
  rectangleDoc({ erfId: "CROSSED", parcelNo: 6, west: 395, east: 405, south: 300, north: 700 }),
  // A large ERF holding the whole strip: its centre and corners are far away.
  rectangleDoc({ erfId: "HOLDS_STRIP", parcelNo: 7, west: -900, east: 1100, south: -300, north: 1700 }),
];

test("ERFs with a geofence outline: centre in the batch area, or boundary touching it; the rectangle's far corner is out", () => {
  const { metaEntries, geoEntries } = erfEntriesFromDocs(STRIP_ERF_DOCS);
  const { erfs, capped } = erfsInArea({ shape: STRIP_SHAPE, metaEntries, geoEntries });
  assert.equal(capped, false);
  // Nearest the middle of the area first (centres 0, 100, 168, 272 and 424 m away).
  assert.deepEqual(erfs.map((erf) => erf.id), ["ON_STRIP", "CROSSED", "CORNER_NEAR", "CENTRE_NEAR", "HOLDS_STRIP"]);
  assert.equal(pointInBatchArea(STRIP_SHAPE, erfs.find((erf) => erf.id === "CROSSED").centroid), false);
  assert.equal(pointInBatchArea(STRIP_SHAPE, erfs.find((erf) => erf.id === "CORNER_NEAR").centroid), false);
  assert.equal(erfs.find((erf) => erf.id === "CROSSED").polygons[0].length, 5);

  // The shape given as area, the same result; the cap keeps the nearest.
  assert.deepEqual(erfsInArea({ area: STRIP_SHAPE, metaEntries, geoEntries }), { erfs, capped });
  const two = erfsInArea({ shape: STRIP_SHAPE, metaEntries, geoEntries, limit: 2 });
  assert.deepEqual(two.erfs.map((erf) => erf.id), ["ON_STRIP", "CROSSED"]);
  assert.equal(two.capped, true);

  // The rectangle alone (as before 1.3.38 outlines) includes the far corner.
  const rectangle = erfsInArea({ area: STRIP_SHAPE.bbox, metaEntries, geoEntries });
  assert.deepEqual(rectangle.erfs.map((erf) => erf.id).sort(), STRIP_ERF_DOCS.map((doc) => doc.id).sort());
});

test("ERFs with a geofence outline: a stored bbox alone is used as the boundary; a centre alone must be in the area", () => {
  const geo = (id) => {
    const doc = STRIP_ERF_DOCS.find((item) => item.id === id);
    return { bbox: doc.bbox, centroid: doc.centroid, geometry: null };
  };
  const geoEntries = {
    NEAR_BBOX_ONLY: { ...geo("CORNER_NEAR"), centroid: null },
    AWAY_BBOX_ONLY: { ...geo("CORNER_AWAY"), centroid: null },
    FAR_CENTRE_ONLY: { ...geo("FAR_CORNER"), bbox: null },
    NEAR_CENTRE_ONLY: { ...geo("CENTRE_NEAR"), bbox: null },
    FAR_BAD_GEOMETRY: { ...geo("FAR_CORNER"), geometry: "{bad" },
  };
  const metaEntries = Object.keys(geoEntries).map((id) => ({ id, erfNo: id }));
  const { erfs } = erfsInArea({ shape: STRIP_SHAPE, metaEntries, geoEntries });
  assert.deepEqual(erfs.map((erf) => erf.id).sort(), ["NEAR_BBOX_ONLY", "NEAR_CENTRE_ONLY"]);
});

test("ERFs: a shape without an outline (pins) gives the same ERFs as its rectangle", () => {
  const { metaEntries, geoEntries } = erfEntriesFromDocs(STRIP_ERF_DOCS);
  const pins = batchAreaShape({ pinCoordinates: [onStrip(0), onStrip(STRIP_LENGTH)], marginMeters: 50 });
  assert.equal(pins.polygon, null);
  const fromShape = erfsInArea({ shape: pins, metaEntries, geoEntries });
  assert.deepEqual(fromShape, erfsInArea({ area: pins.bbox, metaEntries, geoEntries }));
  assert.equal(fromShape.erfs.length, STRIP_ERF_DOCS.length);
});

// ---------------------------------------------------------------------------------------------------------
// premisesInArea
// ---------------------------------------------------------------------------------------------------------
// A premises document as the Ward stream returns it ({ ...data, id }), shaped as formPremise.js writes it.
const premise = ({ id, lat, lng, address, erfNo = "2315" }) => ({
  id,
  erfId: "G423T0IR077100002315000000",
  erfNo,
  parents: { lmPcode: LM, wardPcode: WARD },
  address: address === undefined ? { suburbName: "Impumelelo", strNo: "12", strName: "Main", strType: "Street" } : address,
  propertyType: { type: "Residential", name: "", unitNo: "" },
  occupancy: { status: "OCCUPIED" },
  geometry: { centroid: { lat, lng } },
  metadata: { updatedAt: "2026-09-10T08:00:00.000Z" },
});

test("premises: those whose geometry.centroid is in the area, nearest the middle first", () => {
  const found = premisesInArea({
    area: AREA,
    premises: [
      premise({ id: "FAR", lat: MIDDLE.latitude + 0.0003, lng: MIDDLE.longitude }),
      premise({ id: "OUT", lat: MIDDLE.latitude + 0.01, lng: MIDDLE.longitude }),
      premise({ id: "NEAR", lat: MIDDLE.latitude, lng: MIDDLE.longitude + 0.00001 }),
    ],
  });
  assert.deepEqual(found, [
    { id: "NEAR", latitude: MIDDLE.latitude, longitude: MIDDLE.longitude + 0.00001, label: "12 Main Street" },
    { id: "FAR", latitude: MIDDLE.latitude + 0.0003, longitude: MIDDLE.longitude, label: "12 Main Street" },
  ]);
});

test("premises: no position, no ID, a repeated ID or a bad area are not drawn", () => {
  const inside = { lat: MIDDLE.latitude, lng: MIDDLE.longitude };
  const found = premisesInArea({
    area: AREA,
    premises: [
      { ...premise({ id: "NO_GEOMETRY", ...inside }), geometry: undefined },
      premise({ id: "NULL_CENTRE", lat: null, lng: null }),
      premise({ id: "", ...inside }),
      premise({ id: "TWICE", ...inside }),
      premise({ id: "TWICE", lat: MIDDLE.latitude + 0.0001, lng: MIDDLE.longitude }),
      null,
    ],
  });
  assert.deepEqual(found.map((item) => item.id), ["TWICE"]);
  assert.equal(found[0].latitude, MIDDLE.latitude);
  assert.deepEqual(premisesInArea({ area: null, premises: [premise({ id: "P", ...inside })] }), []);
  assert.deepEqual(premisesInArea({ area: AREA, premises: "bad" }), []);
  assert.deepEqual(premisesInArea(), []);
});

test("premises: the label is the street address, without unchosen values; else the ERF; else No address", () => {
  const at = { lat: MIDDLE.latitude, lng: MIDDLE.longitude };
  const labelOf = (overrides) => premisesInArea({ area: AREA, premises: [{ ...premise({ id: "P", ...at }), ...overrides }] })[0].label;
  assert.equal(labelOf({}), "12 Main Street");
  assert.equal(labelOf({ address: { strNo: "", strName: "Main", strType: "Select..." } }), "Main");
  assert.equal(labelOf({ address: { strNo: " ", strName: "", strType: "Select..." } }), "Erf 2315");
  assert.equal(labelOf({ address: null, erfNo: "" }), "No address");
  // A position given as numeric text is still placed.
  assert.equal(premisesInArea({ area: AREA, premises: [premise({ id: "TEXT", lat: String(at.lat), lng: String(at.lng) })] }).length, 1);
});

test("premises with a geofence outline: in the outline or its 50 m margin; the rectangle's far corner is out", () => {
  const place = (id, { latitude, longitude }) => premise({ id, lat: latitude, lng: longitude });
  const premises = [
    place("FAR_CORNER", local(0, 800)),
    place("NEAR_EDGE", onStrip(200, 60)),
    place("PAST_MARGIN", onStrip(200, -70)),
    place("ON_STRIP", onStrip(STRIP_LENGTH / 2 + 10)),
  ];
  assert.deepEqual(premisesInArea({ shape: STRIP_SHAPE, premises }).map((item) => item.id), ["ON_STRIP", "NEAR_EDGE"]);
  assert.deepEqual(premisesInArea({ area: STRIP_SHAPE, premises }).map((item) => item.id), ["ON_STRIP", "NEAR_EDGE"]);
  assert.deepEqual(
    premisesInArea({ area: STRIP_SHAPE.bbox, premises }).map((item) => item.id).sort(),
    ["FAR_CORNER", "NEAR_EDGE", "ON_STRIP", "PAST_MARGIN"],
  );
});

// ---------------------------------------------------------------------------------------------------------
// erfEntriesFromDocs: the same entries as the Ward ERF pack for the same documents
// ---------------------------------------------------------------------------------------------------------
test("ERF entries from documents are exactly the Ward ERF pack's entries for the same documents", () => {
  const timestamp = { toMillis: () => Date.parse("2026-09-01T00:00:00.000Z") };
  const documents = [
    { id: "G423T0IR077100002315000000", data: ireps_erf({ erfId: "G423T0IR077100002315000000", parcelNo: 2315, lat: MIDDLE.latitude, lng: MIDDLE.longitude }) },
    {
      id: "G423T0IR077100002317000003",
      data: {
        ...ireps_erf({ erfId: "G423T0IR077100002317000003", parcelNo: 2317, portion: 3, lat: MIDDLE.latitude, lng: MIDDLE.longitude + 0.0002 }),
        geometry: { type: "Polygon", coordinates: [square(MIDDLE.latitude, MIDDLE.longitude + 0.0002, 0.0001)] },
        metadata: { updatedAt: { seconds: 1789200000, nanoseconds: 500 } },
      },
    },
    // No SG parcel: the ERF number is worked out from the ERF ID.
    { id: "G423T0IR077100002318000004", data: { ...ireps_erf({ erfId: "G423T0IR077100002318000004", parcelNo: null, lat: MIDDLE.latitude, lng: MIDDLE.longitude }), sg: {}, metadata: { updatedAt: timestamp } } },
    // Older nested shape, without a root erfId, bbox, centroid or geometry.
    {
      id: "NESTED_DOC",
      data: {
        admin: { ward: { pcode: WARD } },
        erf: { erfId: "G423T0IR077100002319000000", bbox: { minLat: -26.35, minLng: 28.76, maxLat: -26.34, maxLng: 28.77 }, centroid: { lat: -26.345, lng: 28.765 }, geometry: JSON.stringify({ type: "Point", coordinates: [28.765, -26.345] }) },
        sg: { parcelNo: " 2319 ", portion: "0" },
        premises: "bad",
        metadata: { updatedAt: new Date("2026-09-02T00:00:00.000Z") },
      },
    },
    // No erfId at all: the document ID; unreadable geometry is null; no metadata.
    { id: "NO_ERF_ID", data: { sg: { parcelNo: 5 }, geometry: "{bad", premises: [{ id: "P1" }] } },
    // Same update time as the first: the order is kept.
    { id: "G423T0IR077100002320000000", data: ireps_erf({ erfId: "G423T0IR077100002320000000", parcelNo: 2320, lat: MIDDLE.latitude, lng: MIDDLE.longitude }) },
  ];

  const pack = buildWardErfPackFromSnapshot(
    { size: documents.length, docs: documents.map(({ id, data }) => ({ id, data: () => data })) },
    { lmPcode: LM, wardPcode: WARD, wardCacheKey: `${LM}__${WARD}`, firstSnapshotAt: 1 },
  );
  const expected = { metaEntries: pack.metaEntries, geoEntries: pack.geoEntries };

  // As the area read returns them ({ ...data, id }) and as Firestore document snapshots.
  assert.deepEqual(erfEntriesFromDocs(documents.map(({ id, data }) => ({ ...data, id }))), expected);
  assert.deepEqual(erfEntriesFromDocs(documents.map(({ id, data }) => ({ id, data: () => data }))), expected);

  // What the pack holds for these documents.
  assert.deepEqual(
    expected.metaEntries.map((meta) => [meta.id, meta.erfNo]),
    [
      ["G423T0IR077100002317000003", "2317/3"],
      ["G423T0IR077100002319000000", "2319"],
      ["G423T0IR077100002318000004", "2318/4"],
      ["G423T0IR077100002315000000", "2315"],
      ["G423T0IR077100002320000000", "2320"],
      ["NO_ERF_ID", "5"],
    ],
  );
  assert.equal(expected.geoEntries.NO_ERF_ID.geometry, null);
  assert.deepEqual(expected.geoEntries.G423T0IR077100002319000000.centroid, { lat: -26.345, lng: 28.765 });
});

test("ERF entries from documents: nothing readable gives empty entries", () => {
  const empty = { metaEntries: [], geoEntries: {} };
  assert.deepEqual(erfEntriesFromDocs([]), empty);
  assert.deepEqual(erfEntriesFromDocs("bad"), empty);
  assert.deepEqual(erfEntriesFromDocs(), empty);
  assert.deepEqual(erfEntriesFromDocs([null, 5, "x", [], { sg: { parcelNo: 1 } }]), empty);
});

// ---------------------------------------------------------------------------------------------------------
// orderedUnique, erfNumberChunks, nearestItems
// ---------------------------------------------------------------------------------------------------------
test("ordered unique: the first values in the given order, never sorted as text; blanks and placeholders left out", () => {
  const values = ["826", " 10 ", "9", "826", "100", "N/A", "", "  ", null, undefined, {}, 5, "Unavailable", "NAv", "2"];
  assert.deepEqual(orderedUnique(values), ["826", "10", "9", "100", "5", "2"]);
  assert.deepEqual(orderedUnique(values, 3), ["826", "10", "9"]);
  assert.deepEqual(orderedUnique(values, 0), []);
  assert.deepEqual(orderedUnique(values, 2.7), ["826", "10"]);
  assert.deepEqual(orderedUnique(values, -1), orderedUnique(values));
  assert.deepEqual(orderedUnique("bad", 3), []);
  assert.deepEqual(orderedUnique(), []);
});

test("ERF numbers: 30 to a chunk in the given order, unique, blanks and placeholders left out", () => {
  const numbers = Array.from({ length: 65 }, (_, index) => String(65 - index));
  const chunks = erfNumberChunks([...numbers, " 65 ", "", "  ", "N/A", "Unavailable", "NAv", null]);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [30, 30, 5]);
  assert.deepEqual(chunks.flat(), numbers);

  assert.deepEqual(erfNumberChunks(["826", "3/826", "1200", "826"]), [["826", "3/826", "1200"]]);
  assert.deepEqual(erfNumberChunks(["B", "A", "C"], 2), [["B", "A"], ["C"]]);
  // ERFs from erfsInArea are read by their ERF number.
  assert.deepEqual(erfNumberChunks([{ erfNo: "9" }, { erfNo: "10" }, {}, null]), [["9", "10"]]);
  // Never more than Firestore's 30 values; a bad size uses 30.
  assert.deepEqual(erfNumberChunks(numbers, 50).map((chunk) => chunk.length), [30, 30, 5]);
  assert.deepEqual(erfNumberChunks(numbers, 0).map((chunk) => chunk.length), [30, 30, 5]);
  assert.deepEqual(erfNumberChunks([]), []);
  assert.deepEqual(erfNumberChunks("bad"), []);
});

test("ERF numbers: with 400 ERFs, ten chunks keep the 300 nearest the middle, not the first 300 as text", () => {
  // ERF 1 is nearest the middle, ERF 400 furthest.
  const nearestFirst = Array.from({ length: 400 }, (_, index) => String(index + 1));
  const kept = erfNumberChunks(orderedUnique(nearestFirst, 300));
  assert.equal(kept.length, 10);
  assert.deepEqual(kept.flat(), nearestFirst.slice(0, 300));
  for (const erfNo of ["4", "5", "6", "7", "8", "9", "37", "42"]) assert.ok(kept.flat().includes(erfNo), erfNo);

  // Without the cap the order is the same; the first ten chunks are still the 300 nearest.
  const all = erfNumberChunks(nearestFirst);
  assert.equal(all.length, 14);
  assert.deepEqual(all.slice(0, 10).flat(), nearestFirst.slice(0, 300));
});

test("ERF numbers: erfsInArea's nearest-first order carries into the chunks", () => {
  const step = 5 / METERS_PER_DEGREE_LATITUDE;
  const pack = packOf(
    ["100", "2", "10", "9"].map((parcelNo, index) =>
      ireps_erf({ erfId: `E${parcelNo}`, parcelNo, lat: MIDDLE.latitude + (3 - index) * step, lng: MIDDLE.longitude, half: 0.00001 }),
    ),
  );
  const { erfs } = erfsInArea({ area: AREA, metaEntries: pack.metaEntries, geoEntries: pack.geoEntries });
  assert.deepEqual(erfs.map((erf) => erf.erfNo), ["9", "10", "2", "100"]);
  assert.deepEqual(erfNumberChunks(orderedUnique(erfs.map((erf) => erf.erfNo), 3), 2), [["9", "10"], ["2"]]);
  assert.deepEqual(erfNumberChunks(orderedUnique(erfs.map((erf) => erf.id)), 30), [["E9", "E10", "E2", "E100"]]);
});

test("nearest items: nearest the centre first, the same distance keeps the given order, no position is left out", () => {
  const items = [
    { id: "far", point: local(0, 100) },
    { id: "none" },
    { id: "near", point: local(1, 0) },
    { id: "tie1", point: local(0, 50) },
    { id: "mid", point: local(-30, 0) },
    { id: "tie2", point: local(0, 50) },
    null,
  ];
  const ids = (list) => list.map((item) => item.id);
  assert.deepEqual(ids(nearestItems(items, MIDDLE, undefined, 3)), ["near", "mid", "tie1"]);
  assert.deepEqual(ids(nearestItems(items, MIDDLE, undefined, 4)), ["near", "mid", "tie1", "tie2"]);
  assert.deepEqual(ids(nearestItems(items, MIDDLE)), ["near", "mid", "tie1", "tie2", "far"]);
  assert.deepEqual(nearestItems(items, MIDDLE, undefined, 0), []);
  // The centre as { lat, lng }; longitude distance counts in metres at that latitude (55 m east beats 60 m north,
  // although 55 m east is more degrees than 60 m north).
  const centre = { lat: MIDDLE.latitude, lng: MIDDLE.longitude };
  assert.ok(local(55, 0).longitude - MIDDLE.longitude > local(0, 60).latitude - MIDDLE.latitude);
  assert.deepEqual(ids(nearestItems([{ id: "north", point: local(0, 60) }, { id: "east", point: local(55, 0) }], centre)), ["east", "north"]);
  // A position read by the caller; items without one are left out.
  const premises = [{ id: "P1", at: local(20, 0) }, { id: "P2", at: local(5, 0) }, { id: "P3" }];
  assert.deepEqual(ids(nearestItems(premises, MIDDLE, (item) => item.at, 5)), ["P2", "P1"]);
  // Items that are positions themselves.
  assert.deepEqual(nearestItems([local(9, 0), local(3, 0)], MIDDLE), [local(3, 0), local(9, 0)]);
  // Without a valid centre the given order is kept.
  assert.deepEqual(ids(nearestItems(items, null, undefined, 2)), ["far", "near"]);
  assert.deepEqual(nearestItems("bad", MIDDLE, undefined, 2), []);
});

// ---------------------------------------------------------------------------------------------------------
// classifyOtherSalesMeter
// ---------------------------------------------------------------------------------------------------------
const TB_ID = "TGB_20260912_100000_ABCD";
const gpsSales = (overrides = {}) => ({
  meterNo: "04123456789",
  lmPcode: LM,
  erfNumbers: ["2315"],
  erfCandidates: [{ ErfId: "G423T0IR077100002315000000", Latitude: -26.3484, Longitude: 28.7613 }],
  master: { id: "04123456789", visibility: "INVISIBLE" },
  ...overrides,
});
const ERF_ID = "G423T0IR077100002316000000";
// A saved ERF decision shaped as ireps-web inspectSavedErfDecision accepts it.
const geocodedSales = (overrides = {}) => ({
  meterNo: "07000000001",
  lmPcode: LM,
  erfNumbers: ["2316"],
  erfCandidates: [],
  erfId: ERF_ID,
  erfResolution: {
    version: 1,
    revision: 1,
    method: "GEOCODED",
    evidenceRefs: [`ireps_erfs/${ERF_ID}`],
    geocode: {
      latitude: -26.3486,
      longitude: 28.7615,
      matchLevel: "EXACT_STREET_NUMBER",
      geocodedAddress: "14 Main Street, Impumelelo, 1515, South Africa",
      provider: "Google Geocoding API",
      geocodedAt: { seconds: 1789200000, nanoseconds: 0 },
    },
    confirmedByUid: "UID_OFFICE_1",
    confirmedByUser: "Office User",
    confirmedAt: { seconds: 1789200060, nanoseconds: 500 },
    tbId: TB_ID,
  },
  ...overrides,
});
const fieldWorkRef = (status) => ({
  id: TB_ID,
  date: { seconds: 1789200000, nanoseconds: 0 },
  rowId: "ROW_1",
  fieldWork: { status, updatedAt: { seconds: 1789200100, nanoseconds: 0 } },
});

test("other Sales: a GPS Sales meter sits at its S point and reads GPS Sales", () => {
  assert.deepEqual(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales() }), {
    id: "04123456789",
    meterNo: "04123456789",
    status: "NOT_STARTED",
    point: { latitude: -26.3484, longitude: 28.7613, source: "GPS" },
    kindLabel: "GPS Sales",
  });
});

test("other Sales: a Non-GPS Sales meter with a saved ERF decision sits at its G point", () => {
  assert.deepEqual(classifyOtherSalesMeter({ id: "07000000001", sales: geocodedSales() }), {
    id: "07000000001",
    meterNo: "07000000001",
    status: "NOT_STARTED",
    point: { latitude: -26.3486, longitude: 28.7615, source: "GEOCODED" },
    kindLabel: "Non-GPS Sales",
  });
});

test("other Sales: a meter of this batch is never an other Sales meter", () => {
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales(), batchSalesIds: ["X", "04123456789"] }), null);
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales(), batchSalesIds: [" 04123456789 "] }), null);
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales(), batchSalesIds: new Set(["04123456789"]) }), null);
  assert.notEqual(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales(), batchSalesIds: ["04123456780"] }), null);
  assert.notEqual(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales(), batchSalesIds: "bad" }), null);
});

test("other Sales: a meter with neither an S nor a G position is not drawn", () => {
  const noPosition = gpsSales({ erfCandidates: [] });
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: noPosition }), null);
  // Two pipeline candidates is no GPS point.
  const twoCandidates = gpsSales({ erfCandidates: [{ Latitude: -26.3, Longitude: 28.7 }, { Latitude: -26.4, Longitude: 28.8 }] });
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: twoCandidates }), null);
  // A saved decision the web counts as invalid gives no G point.
  const invalidDecision = geocodedSales();
  invalidDecision.erfResolution = { ...invalidDecision.erfResolution, method: "MANUAL" };
  assert.equal(classifyOtherSalesMeter({ id: "07000000001", sales: invalidDecision }), null);
  // The ERF centre (E) is never used for other Sales meters.
  assert.equal(classifyOtherSalesMeter({ id: "X", sales: { erfId: ERF_ID, centroid: { lat: -26.34, lng: 28.76 } } }), null);
});

test("other Sales: VISIBLE is Completed, whatever the field work says", () => {
  for (const tbRefs of [undefined, [], [fieldWorkRef("IN_PROGRESS")], [fieldWorkRef("COMPLETED")]]) {
    const sales = gpsSales({ master: { visibility: "VISIBLE" }, ...(tbRefs ? { tbRefs } : {}) });
    assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales }).status, "COMPLETED");
  }
  assert.equal(classifyOtherSalesMeter({ id: "07000000001", sales: geocodedSales({ master: { visibility: "VISIBLE" } }) }).status, "COMPLETED");
});

test("other Sales: field work In progress on any batch entry is In progress", () => {
  const status = (sales) => classifyOtherSalesMeter({ id: "04123456789", sales }).status;
  assert.equal(status(gpsSales({ tbRefs: [fieldWorkRef("IN_PROGRESS")] })), "IN_PROGRESS");
  assert.equal(status(gpsSales({ tbRefs: [{ id: "TGB_20260901_100000_OLD1", date: { seconds: 1, nanoseconds: 0 } }, fieldWorkRef("IN_PROGRESS")] })), "IN_PROGRESS");
  assert.equal(status(gpsSales({ master: undefined, tbRefs: [fieldWorkRef("IN_PROGRESS")] })), "IN_PROGRESS");
});

test("other Sales: otherwise Not started (no refs, refs before field work, completed field work without VISIBLE, bad refs)", () => {
  const status = (sales) => classifyOtherSalesMeter({ id: "04123456789", sales }).status;
  assert.equal(status(gpsSales()), "NOT_STARTED");
  assert.equal(status(gpsSales({ tbRefs: [{ id: TB_ID, date: { seconds: 1789200000, nanoseconds: 0 } }] })), "NOT_STARTED");
  assert.equal(status(gpsSales({ tbRefs: [fieldWorkRef("COMPLETED")] })), "NOT_STARTED");
  assert.equal(status(gpsSales({ tbRefs: [null, "x", { fieldWork: "IN_PROGRESS" }, { status: "IN_PROGRESS" }] })), "NOT_STARTED");
  assert.equal(status(gpsSales({ tbRefs: { 0: fieldWorkRef("IN_PROGRESS") } })), "NOT_STARTED");
  assert.equal(status(gpsSales({ master: { visibility: "visible" } })), "NOT_STARTED");
  assert.equal(status(gpsSales({ master: "VISIBLE" })), "NOT_STARTED");
});

test("other Sales: the meter number comes from the Sales record, else its ID; no ID or no record is nothing", () => {
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales({ meterNo: " 0412 3456 789 " }) }).meterNo, "0412 3456 789");
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: gpsSales({ meterNo: "" }) }).meterNo, "04123456789");
  assert.equal(classifyOtherSalesMeter({ id: " 04123456789 ", sales: gpsSales({ meterNo: undefined }) }).id, "04123456789");
  assert.equal(classifyOtherSalesMeter({ id: "", sales: gpsSales() }), null);
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: null }), null);
  assert.equal(classifyOtherSalesMeter({ id: "04123456789", sales: [gpsSales()] }), null);
  assert.equal(classifyOtherSalesMeter(), null);
});

// ---------------------------------------------------------------------------------------------------------
// Loaders: they import Firebase, so they are evaluated from their source text with fake Firestore calls.
// ---------------------------------------------------------------------------------------------------------
function evaluateLoaderSource(source, names, fakes) {
  const body = source.replace(/^import .*$/gm, "").replace(/^export async function/gm, "async function");
  return new Function(...Object.keys(fakes), `${body}\nreturn { ${names.join(", ")} };`)(...Object.values(fakes));
}

// Only server reads exist; a cache read or a stream would fail the test.
const refuse = (name) => () => {
  throw new Error(`${name} must not be used`);
};
const firestoreFakes = (getDocsFromServer) => ({
  collection: (database, name) => ({ database, name }),
  where: (field, operator, value) => ({ field, operator, value }),
  limit: (count) => ({ limit: count }),
  query: (from, ...constraints) => ({ from, constraints }),
  getDocsFromServer,
  getDocs: refuse("getDocs"),
  getDocsFromCache: refuse("getDocsFromCache"),
  onSnapshot: refuse("onSnapshot"),
  db: { name: "fake-db" },
});
const describeQuery = ({ from, constraints }) => ({
  collection: from.name,
  database: from.database.name,
  constraints: constraints.map((item) => ("limit" in item ? ["limit", item.limit] : [item.field, item.operator, item.value])),
});
const docOf = (id, data) => ({ id, data: () => data });
const offlineError = () => Object.assign(new Error("Failed to get documents from server. (However, these documents may exist in the local cache.)"), { code: "unavailable" });

const loaderWith = (getDocsFromServer) =>
  evaluateLoaderSource(loaderSource, ["loadOtherSalesMeters"], firestoreFakes(getDocsFromServer)).loadOtherSalesMeters;

test("Other Sales loader: server reads only, with db imported as the Targeted Batch API does", () => {
  const imports = loaderSource.match(/^import .*$/gm) || [];
  assert.deepEqual(imports, [
    'import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore";',
    'import { db } from "../../firebase";',
  ]);
  assert.doesNotMatch(loaderSource, /onSnapshot|getDocsFromCache|getDocs\(/);
});

test("Other Sales loader: GPS Sales by LM and ERF numbers, Non-GPS Sales by ERF ID, one query per chunk", async () => {
  const queries = [];
  const load = loaderWith(async (request) => {
    queries.push(describeQuery(request));
    return { docs: [] };
  });

  assert.deepEqual(
    await load({ lmPcode: ` ${LM} `, erfNumberChunks: [["2315", " 2316 "], ["2317/3"]], erfIdChunks: [[ERF_ID, " G423T0IR077100002315000000 "]] }),
    [],
  );
  assert.deepEqual(queries, [
    { collection: "sales-all-meters", database: "fake-db", constraints: [["lmPcode", "==", LM], ["erfNumbers", "array-contains-any", ["2315", "2316"]], ["limit", 500]] },
    { collection: "sales-all-meters", database: "fake-db", constraints: [["lmPcode", "==", LM], ["erfNumbers", "array-contains-any", ["2317/3"]], ["limit", 500]] },
    { collection: "sales-all-meters", database: "fake-db", constraints: [["erfId", "in", [ERF_ID, "G423T0IR077100002315000000"]], ["limit", 500]] },
  ]);

  // ERF IDs alone.
  queries.length = 0;
  await load({ lmPcode: LM, erfIdChunks: [[ERF_ID]] });
  assert.deepEqual(queries, [{ collection: "sales-all-meters", database: "fake-db", constraints: [["erfId", "in", [ERF_ID]], ["limit", 500]] }]);
});

test("Other Sales loader: a query that reaches its limit marks the answer as cut, so the map can say so", async () => {
  const full = loaderWith(async ({ constraints }) =>
    constraints[0].field === "lmPcode"
      ? { docs: Array.from({ length: 500 }, (_, index) => docOf(`M${index}`, { meterNo: `M${index}`, lmPcode: LM })) }
      : { docs: [] });
  const cut = await full({ lmPcode: LM, erfNumberChunks: [["2315"]], erfIdChunks: [[ERF_ID]] });
  assert.equal(cut.length, 500);
  assert.equal(cut.truncated, true);
  assert.equal(Object.keys(cut).includes("truncated"), false, "the marker is not an item of the list");

  const small = loaderWith(async () => ({ docs: [docOf("A", { meterNo: "A", lmPcode: LM })] }));
  assert.equal((await small({ lmPcode: LM, erfNumberChunks: [["2315"]] })).truncated, false);
});

test("Other Sales loader: merged by ID, each meter once; an ERF ID result of another LM is left out", async () => {
  const load = loaderWith(async ({ constraints }) => {
    const [first] = constraints;
    if (first.field === "lmPcode" && first.value === LM && constraints[1].value[0] === "2315") {
      return { docs: [docOf("A", { meterNo: "A", lmPcode: LM }), docOf("B", { meterNo: "B", lmPcode: LM })] };
    }
    if (first.field === "lmPcode") {
      return { docs: [docOf("B", { meterNo: "B again", lmPcode: LM }), docOf("C", null)] };
    }
    return {
      docs: [
        docOf("A", { meterNo: "A by ERF", lmPcode: LM }),
        docOf("D", geocodedSales({ meterNo: "D" })),
        docOf("E", geocodedSales({ meterNo: "E", lmPcode: "ZA7422" })),
        docOf("F", geocodedSales({ meterNo: "F", lmPcode: undefined })),
      ],
    };
  });

  const result = await load({ lmPcode: LM, erfNumberChunks: [["2315"], ["2316"]], erfIdChunks: [[ERF_ID]] });
  assert.deepEqual(
    result.map(({ id, sales }) => [id, sales.meterNo]),
    [["A", "A"], ["B", "B"], ["C", undefined], ["D", "D"]],
  );
  assert.deepEqual(result[2], { id: "C", sales: {} });
  // A Non-GPS Sales meter found by its saved ERF sits at its G point.
  assert.equal(classifyOtherSalesMeter({ id: result[3].id, sales: result[3].sales }).point.source, "GEOCODED");
});

test("Other Sales loader: at most 10 queries of each kind; the dropped chunks are logged per kind", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const queries = [];
  const load = loaderWith(async (request) => {
    queries.push(describeQuery(request));
    return { docs: [] };
  });
  const numberChunks = Array.from({ length: 12 }, (_, index) => [`N${index}`]);
  const idChunks = Array.from({ length: 13 }, (_, index) => [`I${index}`]);

  assert.deepEqual(await load({ lmPcode: LM, erfNumberChunks: numberChunks, erfIdChunks: idChunks }), []);
  assert.equal(queries.length, 20);
  // The first chunks are kept, in the given order.
  assert.deepEqual(
    queries.slice(0, 10).map((item) => item.constraints[1][2][0]),
    numberChunks.slice(0, 10).map(([value]) => value),
  );
  assert.deepEqual(
    queries.slice(10).map((item) => item.constraints[0][2][0]),
    idChunks.slice(0, 10).map(([value]) => value),
  );
  assert.equal(warn.mock.callCount(), 2);
  assert.deepEqual(
    warn.mock.calls.map((call) => [call.arguments[1].kind, call.arguments[1].dropped]),
    [["ERF numbers", 2], ["ERF IDs", 3]],
  );

  queries.length = 0;
  await load({ lmPcode: LM, erfNumberChunks: numberChunks.slice(0, 10), erfIdChunks: idChunks.slice(0, 10) });
  assert.equal(queries.length, 20);
  assert.equal(warn.mock.callCount(), 2);
});

test("Other Sales loader: a chunk longer than 30 is split in its order; repeated and blank values are left out", async () => {
  const queries = [];
  const load = loaderWith(async (request) => {
    queries.push(describeQuery(request));
    return { docs: [] };
  });
  const values = Array.from({ length: 65 }, (_, index) => `E${65 - index}`);
  await load({ lmPcode: LM, erfIdChunks: [[...values, "E65", " ", ""]] });
  assert.deepEqual(queries.map((item) => item.constraints[0][2].length), [30, 30, 5]);
  assert.deepEqual(queries.flatMap((item) => item.constraints[0][2]), values);
});

test("Other Sales loader: blank chunks are skipped; no ERF numbers or IDs asks nothing", async () => {
  let calls = 0;
  const load = loaderWith(async () => {
    calls += 1;
    return { docs: [] };
  });
  assert.deepEqual(await load({ lmPcode: LM, erfNumberChunks: [], erfIdChunks: [] }), []);
  assert.deepEqual(await load({ lmPcode: LM, erfNumberChunks: [[], ["", "  "], "bad", null], erfIdChunks: "bad" }), []);
  assert.deepEqual(await load({ lmPcode: LM }), []);
  assert.equal(calls, 0);
});

test("Other Sales loader: offline, a failed query or a missing LM rejects; never an empty answer", async () => {
  const offline = loaderWith(async () => {
    throw offlineError();
  });
  await assert.rejects(offline({ lmPcode: LM, erfNumberChunks: [["2315"]] }), { code: "unavailable" });
  await assert.rejects(offline({ lmPcode: LM, erfIdChunks: [[ERF_ID]] }), { code: "unavailable" });

  // One failed query of several fails the load.
  const oneFails = loaderWith(async ({ constraints }) => {
    if (constraints[0].field === "erfId") throw new Error("permission-denied");
    return { docs: [docOf("A", { lmPcode: LM })] };
  });
  await assert.rejects(oneFails({ lmPcode: LM, erfNumberChunks: [["2315"]], erfIdChunks: [[ERF_ID]] }), /permission-denied/);

  const load = loaderWith(async () => ({ docs: [] }));
  await assert.rejects(load({ lmPcode: " ", erfNumberChunks: [["2315"]] }), /Local Municipality/);
  await assert.rejects(load({ erfIdChunks: [[ERF_ID]] }), /Local Municipality/);
  await assert.rejects(load(), /Local Municipality/);
});

// ---------------------------------------------------------------------------------------------------------
// loadBatchAreaErfs / loadBatchAreaPremises
// ---------------------------------------------------------------------------------------------------------
const areaLoadersWith = (getDocsFromServer) =>
  evaluateLoaderSource(areaLoaderSource, ["loadBatchAreaErfs", "loadBatchAreaPremises"], firestoreFakes(getDocsFromServer));
const BOUNDS = { minLat: -26.36, maxLat: -26.34, minLng: 28.75, maxLng: 28.77 };

test("area loader: server reads only, with db imported as the Targeted Batch API does", () => {
  const imports = areaLoaderSource.match(/^import .*$/gm) || [];
  assert.deepEqual(imports, [
    'import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore";',
    'import { db } from "../../firebase";',
  ]);
  assert.doesNotMatch(areaLoaderSource, /onSnapshot|getDocsFromCache|getDocs\(/);
});

test("area loader: ERFs of the batch Ward whose bbox overlaps the area (the web's nearbyQuerySpec), at most 600", async () => {
  const queries = [];
  const { loadBatchAreaErfs } = areaLoadersWith(async (request) => {
    queries.push(describeQuery(request));
    return { docs: [docOf("G423T0IR077100002315000000", { erfId: "G423T0IR077100002315000000", id: "stored", sg: { parcelNo: 2315 } }), docOf("NO_DATA", null)] };
  });

  const docs = await loadBatchAreaErfs({ wardPcode: ` ${WARD} `, bbox: BOUNDS });
  assert.deepEqual(queries, [
    {
      collection: "ireps_erfs",
      database: "fake-db",
      constraints: [
        ["admin.ward.pcode", "==", WARD],
        ["bbox.maxLat", ">=", BOUNDS.minLat],
        ["bbox.maxLng", ">=", BOUNDS.minLng],
        ["bbox.minLat", "<=", BOUNDS.maxLat],
        ["bbox.minLng", "<=", BOUNDS.maxLng],
        ["limit", 600],
      ],
    },
  ]);
  // The document ID wins over a stored id field.
  assert.deepEqual(docs, [
    { erfId: "G423T0IR077100002315000000", id: "G423T0IR077100002315000000", sg: { parcelNo: 2315 } },
    { id: "NO_DATA" },
  ]);
});

test("area loader: premises of the batch Ward whose position is in the area (the web's nearbyQuerySpec), at most 600", async () => {
  const queries = [];
  const { loadBatchAreaPremises } = areaLoadersWith(async (request) => {
    queries.push(describeQuery(request));
    return { docs: [docOf("PREMISE_1", premise({ id: "stored", lat: -26.35, lng: 28.76 }))] };
  });

  const docs = await loadBatchAreaPremises({ wardPcode: WARD, bbox: BOUNDS });
  assert.deepEqual(queries, [
    {
      collection: "premises",
      database: "fake-db",
      constraints: [
        ["parents.wardPcode", "==", WARD],
        ["geometry.centroid.lat", ">=", BOUNDS.minLat],
        ["geometry.centroid.lat", "<=", BOUNDS.maxLat],
        ["geometry.centroid.lng", ">=", BOUNDS.minLng],
        ["geometry.centroid.lng", "<=", BOUNDS.maxLng],
        ["limit", 600],
      ],
    },
  ]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].id, "PREMISE_1");
  assert.deepEqual(docs[0].geometry, { centroid: { lat: -26.35, lng: 28.76 } });
});

test("area loader: a given limit is used; a bad limit is 600", async () => {
  const limits = [];
  const loaders = areaLoadersWith(async ({ constraints }) => {
    limits.push(constraints.at(-1).limit);
    return { docs: [] };
  });
  for (const load of [loaders.loadBatchAreaErfs, loaders.loadBatchAreaPremises]) {
    limits.length = 0;
    for (const limit of [250, 0, -1, 2.5, "600", null]) {
      assert.deepEqual(await load({ wardPcode: WARD, bbox: BOUNDS, limit }), []);
    }
    assert.deepEqual(limits, [250, 600, 600, 600, 600, 600]);
  }
});

test("area loader: offline or a failed read rejects; no Ward or no valid area rejects without reading", async () => {
  const offline = areaLoadersWith(async () => {
    throw offlineError();
  });
  await assert.rejects(offline.loadBatchAreaErfs({ wardPcode: WARD, bbox: BOUNDS }), { code: "unavailable" });
  await assert.rejects(offline.loadBatchAreaPremises({ wardPcode: WARD, bbox: BOUNDS }), { code: "unavailable" });

  let calls = 0;
  const loaders = areaLoadersWith(async () => {
    calls += 1;
    return { docs: [] };
  });
  for (const [name, load] of [["ERFs", loaders.loadBatchAreaErfs], ["Premises", loaders.loadBatchAreaPremises]]) {
    await assert.rejects(load({ wardPcode: " ", bbox: BOUNDS }), new RegExp(`${name} in the batch area need the batch Ward`));
    await assert.rejects(load({ bbox: BOUNDS }), /batch Ward/);
    await assert.rejects(load({ wardPcode: WARD }), /need the batch area/);
    await assert.rejects(load({ wardPcode: WARD, bbox: { ...BOUNDS, minLat: -26.3 } }), /need the batch area/);
    await assert.rejects(load({ wardPcode: WARD, bbox: { ...BOUNDS, maxLng: "28.77" } }), /need the batch area/);
    await assert.rejects(load(), /batch Ward/);
  }
  assert.equal(calls, 0);
});

test("area loader to map: ERF documents read for a strip geofence give only the ERFs in the batch area", async () => {
  const queries = [];
  const { loadBatchAreaErfs } = areaLoadersWith(async (request) => {
    queries.push(describeQuery(request));
    return { docs: STRIP_ERF_DOCS.map(({ id, ...data }) => docOf(id, data)) };
  });
  const docs = await loadBatchAreaErfs({ wardPcode: WARD, bbox: STRIP_SHAPE.bbox });
  assert.deepEqual(queries[0].constraints[1], ["bbox.maxLat", ">=", STRIP_SHAPE.bbox.minLat]);
  const { metaEntries, geoEntries } = erfEntriesFromDocs(docs);
  const { erfs } = erfsInArea({ shape: STRIP_SHAPE, metaEntries, geoEntries });
  assert.deepEqual(erfs.map((erf) => erf.id), ["ON_STRIP", "CROSSED", "CORNER_NEAR", "CENTRE_NEAR", "HOLDS_STRIP"]);
  assert.deepEqual(erfs.map((erf) => erf.erfNo), ["2", "6", "4", "3", "7"]);
});
