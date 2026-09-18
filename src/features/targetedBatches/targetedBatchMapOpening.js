// TB-R051 (1.3.40): when the batch map has finished opening. Pure, so it is tested without a map.

// Whether the map has zoomed to the batch area:
// - the geofence, when the batch's geofence is on the phone;
// - nothing yet, while the batch's geofence is still coming;
// - else the batch's pins, when there are any;
// - nothing yet while the rows, or the Sales records that give the pins their positions, are still loading;
// - else there is nothing to zoom to, and the map's own message takes over.
export function isBatchMapOpeningZoomReached({
  mapReady = false,
  geofencePointCount = 0,
  waitsForGeofence = false,
  coordinateCount = 0,
  rowsState = "READY",
  waitsForPins = false,
  openingZoom = { points: false, geofence: false },
} = {}) {
  if (!mapReady) return false;
  if (geofencePointCount > 0) return openingZoom?.geofence === true;
  if (waitsForGeofence) return false;
  if (coordinateCount > 0) return openingZoom?.points === true;
  return rowsState !== "LOADING" && !waitsForPins;
}
