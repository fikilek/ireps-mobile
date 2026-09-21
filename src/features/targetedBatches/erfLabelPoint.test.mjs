import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ERF_LABEL_DROP, erfLabelPoint, holesByErf, ringContainsPoint, ringsContainPoint } from "./erfLabelPoint.js";

const modalSource = await readFile(new URL("./TargetedBatchMapModal.js", import.meta.url), "utf8");

// A rectangle ERF: latitudes -28.0010 (bottom) to -28.0000 (top), longitudes 30.0000 to 30.0010.
const rectangle = [
  { latitude: -28.001, longitude: 30.0 },
  { latitude: -28.001, longitude: 30.001 },
  { latitude: -28.0, longitude: 30.001 },
  { latitude: -28.0, longitude: 30.0 },
];
const centre = { latitude: -28.0005, longitude: 30.0005 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test("TB-R051 1.3.70 an ERF number sits just below the centre, beside the pin, 30% of the way to the boundary", () => {
  // Not up against the edge (60% of the way up, 1.3.40), where it had the least room and crossed first.
  assert.equal(ERF_LABEL_DROP, 0.3);
  const point = erfLabelPoint({ centroid: centre, polygons: [rectangle] });
  close(point.latitude, -28.0005 - 0.0005 * 0.3);
  assert.ok(point.latitude < centre.latitude, "below the centre, the side a pin does not cover");
  close(point.longitude, 30.0005);
  assert.equal(ringContainsPoint(rectangle, point), true, "inside its own ERF");
});

test("TB-R051 1.3.40 the ERF number is a fixed point on the ground: the same whatever the zoom", () => {
  // The point depends only on the ERF's shape; nothing about the map view goes in.
  assert.equal(erfLabelPoint.length, 1, "only the ERF (and the optional drop) decide the point");
  assert.deepEqual(erfLabelPoint({ centroid: centre, polygons: [rectangle] }), erfLabelPoint({ centroid: centre, polygons: [rectangle] }));
});

test("TB-R051 1.3.40 a closed ring (first point repeated) and a slanted ERF also give a point inside", () => {
  const closed = [...rectangle, rectangle[0]];
  const point = erfLabelPoint({ centroid: centre, polygons: [closed] });
  close(point.latitude, -28.0005 - 0.0005 * 0.3);

  // A parallelogram whose bottom edge slopes: the boundary straight below the centre is used.
  const slanted = [
    { latitude: -28.0014, longitude: 30.0 },
    { latitude: -28.0006, longitude: 30.001 },
    { latitude: -28.0, longitude: 30.001 },
    { latitude: -28.0, longitude: 30.0 },
  ];
  const slantCentre = { latitude: -28.0005, longitude: 30.0005 };
  const slantPoint = erfLabelPoint({ centroid: slantCentre, polygons: [slanted] });
  const bottomAtCentre = -28.001; // the bottom edge at longitude 30.0005 is halfway between -28.0014 and -28.0006
  close(slantPoint.latitude, -28.0005 - (-28.0005 - bottomAtCentre) * 0.3);
  assert.equal(ringContainsPoint(slanted, slantPoint), true);
});

test("TB-R051 1.3.40 where the centre is not inside the ERF, the number starts from the widest stretch inside it", () => {
  // An L-shaped ERF whose centre falls in the missing corner. On the centre's east-west line only the thin upright
  // arm (30.0000–30.0002) is inside, so the number starts from that arm's middle.
  const lShape = [
    { latitude: -28.001, longitude: 30.0 },
    { latitude: -28.001, longitude: 30.001 },
    { latitude: -28.0008, longitude: 30.001 },
    { latitude: -28.0008, longitude: 30.0002 },
    { latitude: -28.0, longitude: 30.0002 },
    { latitude: -28.0, longitude: 30.0 },
  ];
  assert.equal(ringContainsPoint(lShape, centre), false);
  const point = erfLabelPoint({ centroid: centre, polygons: [lShape] });
  assert.equal(ringContainsPoint(lShape, point), true, "inside its own ERF, never the neighbour in the missing corner");
  close(point.longitude, 30.0001);
  close(point.latitude, -28.0005 - 0.0005 * 0.3);

  // A U-shaped ERF whose centre falls in the gap between the arms: the widest stretch on that line is used.
  const uShape = [
    { latitude: -28.001, longitude: 30.0 },
    { latitude: -28.001, longitude: 30.001 },
    { latitude: -28.0, longitude: 30.001 },
    { latitude: -28.0, longitude: 30.0007 },
    { latitude: -28.0008, longitude: 30.0007 },
    { latitude: -28.0008, longitude: 30.0003 },
    { latitude: -28.0, longitude: 30.0003 },
    { latitude: -28.0, longitude: 30.0 },
  ];
  const uCentre = { latitude: -28.0006, longitude: 30.0005 };
  assert.equal(ringContainsPoint(uShape, uCentre), false);
  const uPoint = erfLabelPoint({ centroid: uCentre, polygons: [uShape] });
  assert.equal(ringContainsPoint(uShape, uPoint), true);
});

test("TB-R051 1.3.40 an ERF lying inside another is a hole: the outer number never lands on the inner ERF", () => {
  const outer = {
    id: "OUTER",
    centroid: { latitude: -28.0005, longitude: 30.0005 },
    polygons: [rectangle],
  };
  const innerRing = [
    { latitude: -28.0008, longitude: 30.0002 },
    { latitude: -28.0008, longitude: 30.0008 },
    { latitude: -28.0001, longitude: 30.0008 },
    { latitude: -28.0001, longitude: 30.0002 },
  ];
  const inner = { id: "INNER", centroid: { latitude: -28.00045, longitude: 30.0005 }, polygons: [innerRing] };
  const holes = holesByErf([outer, inner]);
  assert.deepEqual(holes[0], [innerRing], "the inner ERF is a hole in the outer one");
  assert.deepEqual(holes[1], [], "the outer ERF is not a hole in the inner one");

  const outerPoint = erfLabelPoint(outer, { holes: holes[0] });
  assert.equal(ringsContainPoint([rectangle, innerRing], outerPoint), true, "inside the outer ERF, outside the hole");
  assert.equal(ringContainsPoint(innerRing, outerPoint), false);
  const innerPoint = erfLabelPoint(inner, { holes: holes[1] });
  assert.equal(ringContainsPoint(innerRing, innerPoint), true);

  // Neighbours side by side are never holes.
  const neighbour = { id: "N", centroid: { latitude: -28.0005, longitude: 30.0015 }, polygons: [rectangle.map((p) => ({ ...p, longitude: p.longitude + 0.001 }))] };
  assert.deepEqual(holesByErf([outer, neighbour]), [[], []]);
});

test("TB-R051 1.3.70 a north-south boundary exactly on the line below the base point is found", () => {
  // A notched ERF: the notch's east side runs north-south on the centre's longitude, below the centre.
  const notched = [
    { latitude: -28.0, longitude: 30.0 },
    { latitude: -28.0, longitude: 30.001 },
    { latitude: -28.001, longitude: 30.001 },
    { latitude: -28.001, longitude: 30.0005 },
    { latitude: -28.0006, longitude: 30.0005 },
    { latitude: -28.0006, longitude: 30.0 },
  ];
  const base = { latitude: -28.0003, longitude: 30.0005 };
  const point = erfLabelPoint({ centroid: base, polygons: [notched] });
  // The boundary straight below is the top of the notch at -28.0006.
  close(point.latitude, -28.0003 - 0.0003 * 0.3);
  assert.equal(ringContainsPoint(notched, point), true);
});

test("TB-R051 1.3.40 broken or missing outlines fall back to the centre", () => {
  // No outline, or a broken one: the centre.
  assert.equal(erfLabelPoint({ centroid: centre, polygons: [] }), centre);
  assert.equal(erfLabelPoint({ centroid: centre }), centre);
  assert.equal(erfLabelPoint({ centroid: centre, polygons: [[{ latitude: 1, longitude: 2 }]] }), centre);
  // No centre: no label.
  assert.equal(erfLabelPoint({ polygons: [rectangle] }), null);
  assert.equal(erfLabelPoint(null), null);
});

test("TB-R051 1.3.40 an ERF drawn as several outlines uses the one holding its centre", () => {
  const far = rectangle.map((point) => ({ latitude: point.latitude + 0.01, longitude: point.longitude }));
  const point = erfLabelPoint({ centroid: centre, polygons: [far, rectangle] });
  close(point.latitude, -28.0005 - 0.0005 * 0.3);
});

test("TB-R051 1.3.40 on the map: icons centred exactly on their position, ERF numbers at their label point", () => {
  const marker = modalSource.slice(modalSource.indexOf("function OtherSalesMarkerBase("), modalSource.indexOf("const OtherSalesMarker = memo("));
  assert.match(marker, /anchor=\{CENTRE_ANCHOR\}/);
  assert.doesNotMatch(modalSource, /OTHER_SALES_ANCHOR|otherSalesPinWrap|OTHER_SALES_MARKER_HEIGHT/);
  assert.match(modalSource, /const holes = holesByErf\(drawnErfs\);/);
  assert.match(modalSource, /const point = erfNo \? erfLabelPoint\(erf, \{ holes: holes\[index\] \}\) : null;/);
  // (1.3.69) each number is drawn at its own point, at the size its ERF has room for.
  assert.match(modalSource, /\{erfLabels\.map\(\(label\) => \{[\s\S]*?<ErfLabelMarker\s*key=\{`erf-label-\$\{label\.id\}`\}\s*latitude=\{label\.point\.latitude\}\s*longitude=\{label\.point\.longitude\}/);
  // The ERF label itself stays centred on its point.
  const erfLabel = modalSource.slice(modalSource.indexOf("function ErfLabelMarkerBase("), modalSource.indexOf("const ErfLabelMarker = memo("));
  assert.match(erfLabel, /anchor=\{CENTRE_ANCHOR\}/);
});
