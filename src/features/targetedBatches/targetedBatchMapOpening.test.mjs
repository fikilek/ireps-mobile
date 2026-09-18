import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isBatchMapOpeningZoomReached } from "./targetedBatchMapOpening.js";

const modalSource = await readFile(new URL("./TargetedBatchMapModal.js", import.meta.url), "utf8");
const NOT_ZOOMED = { points: false, geofence: false };

test("TB-R051 1.3.40 opening: nothing is reached before the map is ready", () => {
  assert.equal(isBatchMapOpeningZoomReached({ mapReady: false, coordinateCount: 3, openingZoom: { points: true, geofence: true } }), false);
});

test("TB-R051 1.3.40 opening: a batch with its geofence waits for the zoom to the geofence, not only the pins", () => {
  const base = { mapReady: true, geofencePointCount: 12, coordinateCount: 3 };
  assert.equal(isBatchMapOpeningZoomReached({ ...base, openingZoom: NOT_ZOOMED }), false);
  assert.equal(isBatchMapOpeningZoomReached({ ...base, openingZoom: { points: true, geofence: false } }), false);
  assert.equal(isBatchMapOpeningZoomReached({ ...base, openingZoom: { points: true, geofence: true } }), true);
});

test("TB-R051 1.3.40 opening: while the geofence is still coming nothing is reached, even with pins zoomed", () => {
  assert.equal(
    isBatchMapOpeningZoomReached({ mapReady: true, waitsForGeofence: true, coordinateCount: 3, openingZoom: { points: true, geofence: false } }),
    false,
  );
});

test("TB-R051 1.3.40 opening: without a geofence (none, not found or offline) the zoom to the pins is enough", () => {
  const base = { mapReady: true, coordinateCount: 2 };
  assert.equal(isBatchMapOpeningZoomReached({ ...base, openingZoom: NOT_ZOOMED }), false);
  assert.equal(isBatchMapOpeningZoomReached({ ...base, openingZoom: { points: true, geofence: false } }), true);
});

test("TB-R051 1.3.40 opening: with nothing to zoom to, it waits only while the rows or the pins' Sales records load", () => {
  assert.equal(isBatchMapOpeningZoomReached({ mapReady: true, rowsState: "LOADING" }), false);
  for (const rowsState of ["READY", "OFFLINE", "ERROR"]) {
    assert.equal(isBatchMapOpeningZoomReached({ mapReady: true, rowsState }), true, rowsState);
  }
  // Review 1.3.40: rows on the phone, their Sales records (the pins' positions) still loading: not "no position" yet.
  assert.equal(isBatchMapOpeningZoomReached({ mapReady: true, rowsState: "READY", waitsForPins: true }), false);
  // Once a pin has arrived, the zoom to the pins decides.
  assert.equal(
    isBatchMapOpeningZoomReached({ mapReady: true, coordinateCount: 1, waitsForPins: true, openingZoom: { points: true, geofence: false } }),
    true,
  );
  assert.match(modalSource, /waitsForPins: !offline && salesStillLoading,/);
});

test("TB-R051 1.3.40 opening: every opening gets its own map, so it reports ready again", () => {
  assert.match(modalSource, /if \(visible !== wasVisible\) \{\s*setWasVisible\(visible\);\s*if \(visible\) setOpeningCount\(\(count\) => count \+ 1\);\s*\}/);
  assert.match(modalSource, /<MapView\s*key=\{`batch-map-\$\{openingCount\}`\}/);
});

test("TB-R051 1.3.40 opening: the map shows the spinner until the zoom is over, at most 15 seconds", () => {
  assert.match(modalSource, /const MAP_OPENING_MAX_MS = 15000;/);
  assert.match(modalSource, /const MAP_OPENING_MESSAGE = "Opening the batch map…";/);
  // Every opening starts again; the fit records what it zoomed to.
  assert.match(modalSource, /setOpeningZoom\(NO_OPENING_ZOOM\);\s*setOpeningSettled\(false\);/);
  assert.match(modalSource, /moveMapToCoordinates\(mapRef\.current, \[\.\.\.coordinates, \.\.\.geofencePolygon\]\);\s*setOpeningZoom\(next\);/);
  // Settled after the zoom animation, or at the limit.
  assert.match(modalSource, /if \(!visible \|\| openingSettled \|\| !openingZoomReached\) return undefined;\s*const timer = setTimeout\(\(\) => setOpeningSettled\(true\), MAP_ZOOM_SETTLE_MS\);/);
  assert.match(modalSource, /const timer = setTimeout\(\(\) => setOpeningSettled\(true\), MAP_OPENING_MAX_MS\);/);
  // The spinner covers the map (the buttons stay on top and usable); the empty message waits until it is over.
  assert.match(modalSource, /\{mapOpening \? \(\s*<View\s*style=\{styles\.openingOverlay\}\s*pointerEvents="none"/);
  assert.match(modalSource, /\{groups\.length === 0 && !mapOpening \? \(/);
  assert.ok(modalSource.indexOf("styles.openingOverlay") < modalSource.indexOf("styles.layerColumn}"), "the map buttons are drawn above the spinner");
});
