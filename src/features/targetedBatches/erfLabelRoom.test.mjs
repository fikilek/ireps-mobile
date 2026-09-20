// TB-R051 (1.3.70): the ERF number is drawn at the size that fits the room its own ERF gives it,
// so it never reaches the neighbour's ERF at any zoom.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ERF_LABEL_BASE_FONT_SIZE,
  erfLabelFontSize,
  erfLabelPoint,
  erfLabelRoomMetres,
} from "./erfLabelPoint.js";

const modalSource = await readFile(
  new URL("./TargetedBatchMapModal.js", import.meta.url),
  "utf8",
);

// A square ERF, 100 m a side at this latitude, with its centre at the middle.
const METRE_IN_DEGREES = 1 / 111320;
const side = 100 * METRE_IN_DEGREES;
const squareErf = (id = "ERF1") => ({
  id,
  erfNo: "3500",
  centroid: { latitude: 0, longitude: 0 },
  polygons: [
    [
      { latitude: -side / 2, longitude: -side / 2 },
      { latitude: -side / 2, longitude: side / 2 },
      { latitude: side / 2, longitude: side / 2 },
      { latitude: side / 2, longitude: -side / 2 },
    ],
  ],
});

test("the room is the distance from the label point to the nearest edge of its own ERF", () => {
  const erf = squareErf();
  // Measured at the centre, a 100 m square gives 50 m in every direction.
  const atCentre = erfLabelRoomMetres(erf, {
    point: { latitude: 0, longitude: 0 },
  });
  assert.ok(Math.abs(atCentre - 50) < 0.5, `expected about 50 m, got ${atCentre}`);

  // At its real label point the number sits 60% of the way up, so the top edge is the nearest one.
  const point = erfLabelPoint(erf);
  const room = erfLabelRoomMetres(erf, { point });
  assert.ok(room > 0 && room < atCentre, `expected less than 50 m, got ${room}`);
  assert.ok(Math.abs(room - 20) < 1, `expected about 20 m, got ${room}`);
});

test("an ERF lying inside another takes the outer ERF's room away", () => {
  const erf = squareErf();
  const point = { latitude: 0, longitude: 0 };
  const inner = 10 * METRE_IN_DEGREES;
  const hole = [
    { latitude: -inner, longitude: -inner },
    { latitude: -inner, longitude: inner },
    { latitude: inner, longitude: inner },
    { latitude: inner, longitude: -inner },
  ];
  const room = erfLabelRoomMetres(erf, { holes: [hole], point });
  assert.ok(Math.abs(room - 10) < 0.5, `expected about 10 m, got ${room}`);
});

test("an ERF with nothing to measure has no room, and never a wrong number", () => {
  assert.equal(erfLabelRoomMetres(null), 0);
  assert.equal(erfLabelRoomMetres({}), 0);
  assert.equal(erfLabelRoomMetres({ centroid: { latitude: 0, longitude: 0 } }), 0);
  assert.equal(
    erfLabelRoomMetres(squareErf(), { point: { latitude: "x", longitude: 0 } }) > 0,
    true,
    "a broken point falls back to the ERF's own label point",
  );
});

// The box the number is drawn in, at a given font size, exactly as erfLabelPoint.js measures it.
const halfDiagonal = (characters, fontSize) => {
  const width = characters * 0.68 * fontSize + 8;
  const height = 1.25 * fontSize + 8;
  return Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
};

test("the number never grows past the size it is meant to be", () => {
  assert.equal(erfLabelFontSize(4, 10_000), ERF_LABEL_BASE_FONT_SIZE);
  assert.equal(erfLabelFontSize(4, 40), ERF_LABEL_BASE_FONT_SIZE);
});

test("the number shrinks with the room, and the box always fits inside it", () => {
  let last = ERF_LABEL_BASE_FONT_SIZE + 1;
  for (const room of [40, 30, 22, 18, 15, 13, 11, 10, 9]) {
    const fontSize = erfLabelFontSize(4, room);
    assert.ok(fontSize <= last, `${fontSize} at ${room}px is not smaller than ${last}`);
    last = fontSize;
    if (!fontSize) continue;
    assert.ok(
      halfDiagonal(4, fontSize) <= room + 0.5,
      `a ${fontSize}px number does not fit in ${room}px of room`,
    );
  }
});

test("a longer number needs more room than a shorter one", () => {
  assert.ok(erfLabelFontSize(8, 20) < erfLabelFontSize(2, 20));
});

test("an ERF with no room left is given no number at all", () => {
  for (const room of [0, -5, 2, Number.NaN, null, undefined]) {
    assert.equal(erfLabelFontSize(4, room), 0);
  }
});

test("the map sizes each number from the zoom it has settled on", () => {
  // The map keeps the region it settles on, and only then.
  assert.match(modalSource, /onRegionChangeComplete=\{handleRegionSettled\}/);
  assert.match(modalSource, /const \[region, setRegion\] = useState\(null\);/);
  // Metres per pixel come from the settled region's height over the map area's height.
  assert.match(modalSource, /return \(delta \* 111320\) \/ mapAreaHeight;/);
  // Each ERF's room is worked out once, with its label point, not on every zoom.
  assert.match(modalSource, /roomMetres: erfLabelRoomMetres\(erf, \{ holes: holes\[index\], point \}\)/);
  // A number with no room is left out; the rest carry their size.
  assert.match(modalSource, /if \(!fontSize\) return null;/);
  assert.match(modalSource, /fontSize=\{fontSize\}/);
  // The ERF label still sits centred on its own point (1.3.40).
  const erfLabel = modalSource.slice(
    modalSource.indexOf("function ErfLabelMarkerBase("),
    modalSource.indexOf("const ErfLabelMarker = memo("),
  );
  assert.match(erfLabel, /anchor=\{CENTRE_ANCHOR\}/);
  // A new size means a new picture of the marker, or the map would keep the old one.
  assert.match(erfLabel, /useSettledTracksViewChanges\(\s*`\$\{erfNo\}:\$\{fontSize\}`,?\s*\)/);
});
