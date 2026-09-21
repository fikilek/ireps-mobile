import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWarehouse } from "../../context/WarehouseContext";
import { useGetGeoFencesByLmPcodeWardPcodeQuery } from "../../redux/geofenceApi";
import {
  loadBatchAreaErfs,
  loadBatchAreaPremises,
} from "./loadBatchAreaLayers";
import { loadLatestSalesCategoryMonth } from "./loadLatestSalesCategoryMonth";
import { loadOtherSalesMeters } from "./loadOtherSalesMeters";
import {
  ERF_LABEL_BASE_FONT_SIZE,
  erfLabelFontSize,
  erfLabelPoint,
  erfLabelRoomMetres,
  holesByErf,
} from "./erfLabelPoint";
import { isBatchMapOpeningZoomReached } from "./targetedBatchMapOpening";
import { isCatSalesMeter } from "./salesCategory";
import {
  batchAreaShape,
  classifyOtherSalesMeter,
  erfEntriesFromDocs,
  erfNumberChunks,
  erfsInArea,
  MAP_PIN_LABELS,
  MAP_STATUS_COLORS,
  nearestItems,
  orderedUnique,
  pointInBatchArea,
  premisesInArea,
  SALES_STATUS_ICONS,
} from "./targetedBatchMapLayers";
import {
  buildTargetedBatchMapPoints,
  TARGETED_BATCH_MAP_SOURCE_LABELS,
} from "./targetedBatchMapPoints";

// TB-R051 (1.3.38): the batch pins, the legend and the other Sales meter shapes all use the map's status colours.
const STATUS_LEGEND = [
  { status: "NOT_STARTED", label: "Not started" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "COMPLETED", label: "Completed" },
];

// TB-R051 (1.3.38): S, G and E read in plain words in the legend and the meter window.
const SOURCE_LEGEND = [
  { source: "GPS", label: MAP_PIN_LABELS.GPS },
  { source: "GEOCODED", label: MAP_PIN_LABELS.GEOCODED },
  { source: "ERF", label: MAP_PIN_LABELS.ERF },
];

// TB-R051 (1.3.70): the geofence name is measured rather than left to the map. A marker drawn once into a
// picture came out cut off ("Gf W6 Cr" for "Gf W6 Craigside1"), so the label is given the width its name
// needs. A heavy character at this size is about this wide, plus the padding and border on each side.
const GEOFENCE_LABEL_CHARACTER_WIDTH = 7;
const GEOFENCE_LABEL_EDGES = 16;
const GEOFENCE_LABEL_MAX_WIDTH = 220;

// TB-R043: the batch geofence is purple.
const GEOFENCE_COLOR = "#7c3aed";
const GEOFENCE_FILL = "rgba(124,58,237,0.10)";

// TB-R051 (1.3.38): map layers and buttons.
const BATCH_AREA_MARGIN_METERS = 50;
const ERF_LAYER_LIMIT = 400;
const PREMISE_LAYER_LIMIT = 400;
const OTHER_SALES_LAYER_LIMIT = 400;
// The most documents one batch area read returns (ERFs or premises); a read that reaches it may have left some out.
const AREA_READ_LIMIT = 600;
// The loader asks for at most 10 queries of 30 values each, for ERF numbers and for ERF IDs.
const OTHER_SALES_MAX_ERFS = 300;
const ERF_STROKE_COLOR = "#475569";
const ERF_FILL_COLOR = "rgba(71,85,105,0.04)";
const PREMISE_COLOR = "#0e7490";
const LAYER_ON_COLOR = "#1d4ed8";
// Wide enough for the longest button word ("Satellite") under a 44 px button.
const LAYER_COLUMN_WIDTH = 64;
const LOCATE_TIMEOUT_MS = 15000;
const MAP_MESSAGE_MS = 4000;
const ERFS_LOADING_MESSAGE = "Loading ERFs…";
const ERFS_ERROR_MESSAGE = "Could not load the ERFs. Check your connection.";
const ERFS_OFFLINE_MESSAGE = "No connection — ERFs cannot be loaded";
const PREMISES_LOADING_MESSAGE = "Loading premises…";
const PREMISES_ERROR_MESSAGE =
  "Could not load premises. Check your connection.";
const PREMISES_OFFLINE_MESSAGE = "No connection — premises cannot be loaded";
const OTHER_SALES_LOADING_MESSAGE = "Loading other Sales meters…";
const OTHER_SALES_ERROR_MESSAGE =
  "Could not load other Sales meters. Check your connection.";
const OTHER_SALES_OFFLINE_MESSAGE =
  "No connection — other Sales meters are not loaded";
const OTHER_SALES_ERFS_LEFT_OUT_MESSAGE =
  "Some other CAT Sales meters of the batch area were not loaded";
const LOCATE_PERMISSION_MESSAGE =
  "Location permission was not granted, so the map cannot centre on you.";
const LOCATE_FAILED_MESSAGE = "Could not find your location. Try again.";

const FIT_EDGE_PADDING = { top: 60, right: 60, bottom: 60, left: 60 };
// TB-R051: lifts the Google logo above the "No position" button so it stays visible.
const MAP_PADDING = { top: 0, right: 0, bottom: 64, left: 0 };
// TB-R051: how long the batch geofence may take before the chip says it was not found.
const GEOFENCE_WAIT_MS = 10000;
// TB-R051 (1.3.40): a spinner shows while the map opens and zooms to the batch area, never longer than this.
const MAP_OPENING_MAX_MS = 15000;
// TB-R051 (1.3.40): the zoom animation is over this long after the map is told to zoom.
const MAP_ZOOM_SETTLE_MS = 600;
const MAP_OPENING_MESSAGE = "Opening the batch map…";
const NO_OPENING_ZOOM = Object.freeze({ points: false, geofence: false });
// TB-R051: same wording as My Work Orders when the phone has no connection.
const WMS_OFFLINE_MESSAGE = "No connection — your work orders are not loaded";
const ROWS_LOADING_MESSAGE = "Loading the batch meters…";
const ROWS_ERROR_MESSAGE = "Could not load the Targeted Batch rows.";
const NO_POSITION_MESSAGE = "No meters of this batch have a position";
const SHEET_INITIAL_RENDER = 6;
const SHEET_WINDOW_SIZE = 5;
const SINGLE_POINT_DELTA = 0.004;
const PIN_ANCHOR = { x: 12 / 34, y: 22 / 34 };
const LABEL_ANCHOR = { x: 0.5, y: 1 };
const CENTRE_ANCHOR = { x: 0.5, y: 0.5 };
const EMPTY_POINTS = Object.freeze({ groups: [], unplaced: [], coordinates: [] });
const EMPTY_LIST = [];
const EMPTY_ERF_LAYER = Object.freeze({ erfs: EMPTY_LIST, capped: false });
const EMPTY_OTHER_SALES_LAYER = Object.freeze({
  meters: EMPTY_LIST,
  capped: false,
});
const IDLE_LAYER_LOAD = Object.freeze({
  key: "",
  status: "IDLE",
  data: EMPTY_LIST,
});
const NO_MAP_MESSAGE = Object.freeze({ text: "", id: 0 });

function readFirstString(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }

  return "";
}

// Same scope fallbacks as getTargetedBatchWardScope in My Work Orders.
function getBatchWardScope(bucket = {}, rows = []) {
  const batchScope = bucket?.scope || bucket?.raw?.scope || {};
  const firstRow = rows.find(Boolean) || {};
  const rowScope = firstRow?.scope || firstRow?.raw?.scope || {};

  return {
    lmPcode: readFirstString(
      batchScope?.lmPcode,
      batchScope?.lmId,
      rowScope?.lmPcode,
      rowScope?.lmId,
    ),
    wardPcode: readFirstString(
      batchScope?.wardPcode,
      batchScope?.wardId,
      batchScope?.ward?.pcode,
      batchScope?.ward?.id,
      rowScope?.wardPcode,
      rowScope?.wardId,
      rowScope?.ward?.pcode,
      rowScope?.ward?.id,
    ),
  };
}

// Same geometry reading as the selected geofence on the Maps tab.
function readGeofencePolygon(geofence) {
  const points = geofence?.geometry?.points;
  if (!Array.isArray(points) || points.length < 3) return EMPTY_LIST;

  const coords = [...points]
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .map((pt) => ({
      latitude: pt?.latitude,
      longitude: pt?.longitude,
    }))
    .filter(
      (pt) => Number.isFinite(pt.latitude) && Number.isFinite(pt.longitude),
    );

  return coords.length >= 3 ? coords : EMPTY_LIST;
}

function getTopCoordinate(coords = []) {
  return coords.reduce(
    (top, point) => (!top || point.latitude > top.latitude ? point : top),
    null,
  );
}

function regionForCoordinates(coords = []) {
  if (coords.length === 0) return undefined;

  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;

  for (const point of coords) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, SINGLE_POINT_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, SINGLE_POINT_DELTA),
  };
}

function moveMapToCoordinates(map, coords = []) {
  if (!map || coords.length === 0) return;

  const first = coords[0];
  const samePoint = coords.every(
    (point) =>
      point.latitude.toFixed(6) === first.latitude.toFixed(6) &&
      point.longitude.toFixed(6) === first.longitude.toFixed(6),
  );

  // A zero-size bounds would zoom the map in to its limit.
  if (samePoint) {
    map.animateToRegion(
      {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: SINGLE_POINT_DELTA,
        longitudeDelta: SINGLE_POINT_DELTA,
      },
      400,
    );
    return;
  }

  map.fitToCoordinates(coords, {
    edgePadding: FIT_EDGE_PADDING,
    animated: true,
  });
}

function countRowStatuses(rows = []) {
  return rows.reduce(
    (acc, row) => {
      const status = String(
        row?.displayStatus || row?.executionStatus || "NOT_STARTED",
      ).toUpperCase();
      if (status === "COMPLETED") acc.COMPLETED += 1;
      else if (status === "IN_PROGRESS") acc.IN_PROGRESS += 1;
      else acc.NOT_STARTED += 1;
      return acc;
    },
    { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0 },
  );
}

function describeStatusCounts(statusCounts = {}) {
  return STATUS_LEGEND.map(({ status, label }) => {
    const count = Number(statusCounts?.[status] || 0);
    return count > 0 ? `${count} ${label.toLowerCase()}` : null;
  })
    .filter(Boolean)
    .join(" · ");
}

function sheetRowKey(row, index) {
  return readFirstString(row?.id) || `row-${index}`;
}

// TB-R051 (1.3.38): the area key only changes when the area itself moves (its outline, rectangle, margin or middle),
// not on every row update.
function readAreaKey(shape) {
  const bbox = shape?.bbox;
  if (!bbox) return "";
  const values = [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng];
  if (!values.every((value) => Number.isFinite(value))) return "";

  return JSON.stringify({
    bbox: {
      minLat: bbox.minLat,
      maxLat: bbox.maxLat,
      minLng: bbox.minLng,
      maxLng: bbox.maxLng,
    },
    polygon: Array.isArray(shape.polygon)
      ? shape.polygon.map(({ latitude, longitude }) => ({ latitude, longitude }))
      : null,
    marginMeters: shape.marginMeters,
    center: shape.center
      ? {
          latitude: shape.center.latitude,
          longitude: shape.center.longitude,
        }
      : null,
  });
}

// TB-R051 (1.3.38): a layer read once for each request key while the map is open. A result is kept for this opening:
// switching the button off and on, or losing and regaining the connection, does not read it again. A failed read is
// tried again the next time the layer is wanted. Closing the map drops the result. `load` returns a promise and is
// only called when the request key changes to one without a result.
function useLayerLoad({ open, wanted, requestKey, load, label }) {
  const [state, setState] = useState(IDLE_LAYER_LOAD);
  const stateRef = useRef(IDLE_LAYER_LOAD);
  const openingRef = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (open) return undefined;
    // A read still under way when the map closes is ignored when it ends.
    openingRef.current += 1;
    stateRef.current = IDLE_LAYER_LOAD;
    setState(IDLE_LAYER_LOAD);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || !wanted || !requestKey) return;

    const current = stateRef.current;
    if (
      current.key === requestKey &&
      (current.status === "LOADING" || current.status === "READY")
    ) {
      return;
    }

    const opening = openingRef.current;
    const settle = (next) => {
      if (
        opening !== openingRef.current ||
        stateRef.current.key !== requestKey
      ) {
        return;
      }
      stateRef.current = next;
      setState(next);
    };

    const started = { key: requestKey, status: "LOADING", data: EMPTY_LIST };
    stateRef.current = started;
    setState(started);

    Promise.resolve()
      .then(() => loadRef.current())
      .then((data) =>
        settle({
          key: requestKey,
          status: "READY",
          data: Array.isArray(data) ? data : EMPTY_LIST,
        }),
      )
      .catch((loadError) => {
        console.log(`TargetedBatchMapModal --${label} --error`, loadError);
        settle({ key: requestKey, status: "ERROR", data: EMPTY_LIST });
      });
  }, [open, wanted, requestKey, label]);

  return requestKey && state.key === requestKey ? state : IDLE_LAYER_LOAD;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("The location took too long.")),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// TB-R051 (1.3.70): a custom marker view is drawn once into a picture and then stops tracking, so a long
// layer does not redraw on every frame. The picture must be taken AFTER the view has laid out: taken on a
// timer alone it caught a long geofence name still being measured, and the map drew "Gf W6 Cr" where the
// name reads "Gf W6 Craigside1". Tracking therefore stops a moment after the view reports its layout, and
// on a plain timer only for a view that never reports one.
// (1.3.70) Never longer than the 0.3 s every marker had before: each tick of tracking draws a new picture,
// and on a field phone with a 256 MB limit a longer budget ran the app out of memory (21 Sep, SM-A065F:
// OutOfMemoryError in MapMarker.updateCustomForTracking).
const MARKER_SETTLE_MS = 150;
const MARKER_SETTLE_WITHOUT_LAYOUT_MS = 300;

function useSettledTracksViewChanges(signature) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const timerRef = useRef(null);

  const stopTrackingIn = useCallback((wait) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTracksViewChanges(false), wait);
  }, []);

  useEffect(() => {
    setTracksViewChanges(true);
    stopTrackingIn(MARKER_SETTLE_WITHOUT_LAYOUT_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [signature, stopTrackingIn]);

  // The view has been measured, so the picture taken now holds the whole label.
  const onLayout = useCallback(
    () => stopTrackingIn(MARKER_SETTLE_MS),
    [stopTrackingIn],
  );

  return { tracksViewChanges, onLayout };
}

function BatchGroupMarkerBase({
  groupKey,
  latitude,
  longitude,
  status,
  source,
  count,
  selected,
  onPress,
}) {
  const { tracksViewChanges, onLayout } = useSettledTracksViewChanges(
    `${status}|${source}|${count}|${selected ? "1" : "0"}`,
  );

  const coordinate = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude],
  );
  const handlePress = useCallback(() => onPress(groupKey), [onPress, groupKey]);
  const color = MAP_STATUS_COLORS[status] || MAP_STATUS_COLORS.NOT_STARTED;

  return (
    <Marker
      coordinate={coordinate}
      anchor={PIN_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      zIndex={selected ? 300 : 200}
    >
      <View style={styles.pinWrap} onLayout={onLayout}>
        <View
          style={[
            styles.pin,
            { backgroundColor: color },
            selected && styles.pinSelected,
          ]}
        >
          <Text style={styles.pinText}>
            {TARGETED_BATCH_MAP_SOURCE_LABELS[source] || "?"}
          </Text>
        </View>

        {count > 1 ? (
          <View style={styles.pinBadge}>
            <Text style={styles.pinBadgeText}>
              {count > 99 ? "99+" : count}
            </Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

const BatchGroupMarker = memo(BatchGroupMarkerBase);
BatchGroupMarker.displayName = "BatchGroupMarker";

// TB-R051 (1.3.70): the batch's geofence name, drawn whole. It was coming out cut off, so it is given the
// width its name needs instead of leaving the map to measure it, and a new name makes a new marker. It is
// drawn into a picture like every other marker: keeping it redrawing for good ran a field phone out of
// memory.
function GeofenceNameMarkerBase({ latitude, longitude, name }) {
  const { tracksViewChanges, onLayout } = useSettledTracksViewChanges(name);

  const coordinate = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude],
  );

  const width = useMemo(
    () =>
      Math.min(
        GEOFENCE_LABEL_MAX_WIDTH,
        Math.ceil(String(name ?? "").length * GEOFENCE_LABEL_CHARACTER_WIDTH) +
          GEOFENCE_LABEL_EDGES,
      ),
    [name],
  );

  return (
    <Marker
      coordinate={coordinate}
      anchor={LABEL_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      zIndex={150}
    >
      <View style={[styles.geofenceLabel, { width }]} onLayout={onLayout}>
        <Text style={styles.geofenceLabelText} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </Marker>
  );
}

const GeofenceNameMarker = memo(GeofenceNameMarkerBase);
GeofenceNameMarker.displayName = "GeofenceNameMarker";

// TB-R051 (1.3.38, 1.3.40): the ERF number, centred on its label point inside the ERF (erfLabelPoint.js).
// (1.3.70) It is drawn at the size that fits the room its own ERF gives it at this zoom, so it never reaches
// the neighbour's ERF. The size is part of the signature: a new size means a new picture of the marker.
function ErfLabelMarkerBase({
  latitude,
  longitude,
  erfNo,
  fontSize = ERF_LABEL_BASE_FONT_SIZE,
}) {
  const { tracksViewChanges, onLayout } = useSettledTracksViewChanges(
    `${erfNo}:${fontSize}`,
  );
  const coordinate = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude],
  );

  return (
    <Marker
      coordinate={coordinate}
      anchor={CENTRE_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      zIndex={100}
    >
      <View
        style={[styles.erfLabel, { borderRadius: Math.max(2, fontSize / 2) }]}
        onLayout={onLayout}
      >
        <Text
          style={[styles.erfLabelText, { fontSize, lineHeight: fontSize * 1.25 }]}
          numberOfLines={1}
        >
          {erfNo}
        </Text>
      </View>
    </Marker>
  );
}

const ErfLabelMarker = memo(ErfLabelMarkerBase);
ErfLabelMarker.displayName = "ErfLabelMarker";

// TB-R051 (1.3.38): a premise in the batch area; tapping shows its label.
function PremiseMarkerBase({ premiseId, latitude, longitude, selected, onPress }) {
  const { tracksViewChanges, onLayout } =
    useSettledTracksViewChanges(Boolean(selected));
  const coordinate = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude],
  );
  const handlePress = useCallback(
    () => onPress(premiseId),
    [onPress, premiseId],
  );

  return (
    <Marker
      coordinate={coordinate}
      anchor={CENTRE_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      zIndex={selected ? 190 : 120}
    >
      <View
        style={[styles.premisePin, selected && styles.layerPinSelected]}
        onLayout={onLayout}
      >
        <MaterialCommunityIcons name="home" size={12} color="#ffffff" />
      </View>
    </Marker>
  );
}

const PremiseMarker = memo(PremiseMarkerBase);
PremiseMarker.displayName = "PremiseMarker";

// TB-R051 (1.3.38): a Sales meter not in this batch, for looking only.
function OtherSalesMarkerBase({
  meterId,
  latitude,
  longitude,
  status,
  selected,
  onPress,
}) {
  const icon = SALES_STATUS_ICONS[status] || SALES_STATUS_ICONS.NOT_STARTED;
  const color = MAP_STATUS_COLORS[status] || MAP_STATUS_COLORS.NOT_STARTED;
  const { tracksViewChanges, onLayout } = useSettledTracksViewChanges(
    `${status}:${Boolean(selected)}`,
  );
  const coordinate = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude],
  );
  const handlePress = useCallback(() => onPress(meterId), [onPress, meterId]);

  return (
    <Marker
      coordinate={coordinate}
      // TB-R051 (1.3.40): centred exactly on its position at every zoom.
      anchor={CENTRE_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      zIndex={selected ? 195 : 180}
    >
      <View
        style={[
          styles.otherSalesPin,
          { borderColor: color },
          selected && styles.layerPinSelected,
        ]}
        onLayout={onLayout}
      >
        <Text style={[styles.otherSalesPinText, { color }]}>
          {icon.symbol}
        </Text>
      </View>
    </Marker>
  );
}

const OtherSalesMarker = memo(OtherSalesMarkerBase);
OtherSalesMarker.displayName = "OtherSalesMarker";

// TB-R051 (1.3.38): a round map button that shows whether it is on, with a short word under it.
function MapLayerButton({
  icon,
  word,
  label,
  on = false,
  busy = false,
  disabled = false,
  toggle = true,
  onPress,
}) {
  const active = on && !disabled;
  const iconColor = disabled ? "#94a3b8" : on ? "#ffffff" : "#334155";

  return (
    <Pressable
      style={styles.layerItem}
      onPress={onPress}
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityLabel={label || word}
      accessibilityState={
        toggle ? { checked: on, disabled, busy } : { disabled, busy }
      }
      hitSlop={4}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.layerButton,
              active && styles.layerButtonOn,
              disabled && styles.layerButtonDisabled,
              pressed && styles.layerButtonPressed,
            ]}
          >
            <MaterialCommunityIcons name={icon} size={22} color={iconColor} />

            {busy ? (
              <View style={styles.layerButtonBusy} pointerEvents="none">
                <ActivityIndicator
                  size="large"
                  color={active ? "#ffffff" : LAYER_ON_COLOR}
                />
              </View>
            ) : null}

            {disabled ? (
              <View style={styles.layerButtonBadge} pointerEvents="none">
                <MaterialCommunityIcons
                  name="wifi-off"
                  size={10}
                  color="#ffffff"
                />
              </View>
            ) : null}
          </View>

          <View
            style={[
              styles.layerWord,
              active && styles.layerWordOn,
              disabled && styles.layerWordDisabled,
            ]}
          >
            <Text
              style={[
                styles.layerWordText,
                active && styles.layerWordTextOn,
                disabled && styles.layerWordTextDisabled,
              ]}
              numberOfLines={1}
            >
              {word}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

export default function TargetedBatchMapModal({
  visible,
  bucket,
  rows,
  erfCentroidById,
  offline,
  loading,
  error,
  onClose,
  renderRowCard,
}) {
  // Own map ref; never the shared MapContext ref.
  const mapRef = useRef(null);
  const fitStateRef = useRef({ points: false, geofence: false });
  const locateRequestRef = useRef(0);
  const locatingRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  // TB-R051 (1.3.40): what the opening zoom has reached, and whether the opening spinner is over.
  const [openingZoom, setOpeningZoom] = useState(NO_OPENING_ZOOM);
  const [openingSettled, setOpeningSettled] = useState(false);
  // TB-R051 (1.3.40): every opening gets its own map, so a map kept on screen while the modal closes (iOS) reports
  // ready again when it is opened again.
  const [openingCount, setOpeningCount] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpeningCount((count) => count + 1);
  }
  const [sheet, setSheet] = useState(null);
  const [mapAreaHeight, setMapAreaHeight] = useState(0);
  // TB-R051 (1.3.70): the ERF numbers are sized from the zoom, so the map keeps the region it settles on.
  const [region, setRegion] = useState(null);
  const [geofenceWaitOver, setGeofenceWaitOver] = useState(false);
  const [salesWaitDoneKey, setSalesWaitDoneKey] = useState("");
  // TB-R051 (1.3.38): ERFs on, Premises and Other Sales meters off, Normal map when the map opens.
  const [erfsOn, setErfsOn] = useState(true);
  const [premisesOn, setPremisesOn] = useState(false);
  const [otherSalesOn, setOtherSalesOn] = useState(false);
  const [mapType, setMapType] = useState("standard");
  const [locating, setLocating] = useState(false);
  const [mapMessage, setMapMessage] = useState(NO_MAP_MESSAGE);
  const { height: windowHeight } = useWindowDimensions();
  // TB-R051 (1.3.38): the Ward the phone is already working in; its ERFs and premises are used as they are.
  const { all: warehouseAll, sync: warehouseSync } = useWarehouse();

  const safeRows = Array.isArray(rows) ? rows : EMPTY_LIST;
  const bucketId = readFirstString(bucket?.id);
  const geofenceId = readFirstString(bucket?.geofenceId);

  // TB-R051 online only: with no rows on the phone, say why instead of "no position" or "0 no position".
  const rowsState =
    safeRows.length > 0
      ? "READY"
      : offline
        ? "OFFLINE"
        : loading
          ? "LOADING"
          : error
            ? "ERROR"
            : "READY";

  // TB-R051: a position only helps find the meter; it is never evidence (TB-R041).
  const mapPoints = useMemo(
    () =>
      visible
        ? buildTargetedBatchMapPoints(safeRows, {
            erfCentroidById: erfCentroidById || {},
          })
        : EMPTY_POINTS,
    [visible, safeRows, erfCentroidById],
  );
  const groups = mapPoints?.groups || EMPTY_LIST;
  const unplaced = mapPoints?.unplaced || EMPTY_LIST;
  const coordinates = mapPoints?.coordinates || EMPTY_LIST;

  const placedCount = useMemo(
    () => groups.reduce((sum, group) => sum + (group?.rows?.length || 0), 0),
    [groups],
  );

  // TB-R043: the batch geofence, read from the batch's Ward.
  const { lmPcode, wardPcode } = getBatchWardScope(bucket, safeRows);
  const wardScopeMissing = !lmPcode || !wardPcode;
  const geofenceScopeMissing = wardScopeMissing;
  // currentData: never the previous Ward's geofences while this Ward loads.
  const { currentData: wardGeofences } = useGetGeoFencesByLmPcodeWardPcodeQuery(
    { lmPcode, wardPcode },
    { skip: !visible || !geofenceId || geofenceScopeMissing },
  );
  // TB-R051: the query starts as [] before the first snapshot, so only a non-empty list proves the Ward's geofences arrived.
  const wardGeofencesLoaded =
    Array.isArray(wardGeofences) && wardGeofences.length > 0;

  const geofence = useMemo(() => {
    if (!geofenceId || !Array.isArray(wardGeofences)) return null;
    return (
      wardGeofences.find((fence) => readFirstString(fence?.id) === geofenceId) ||
      null
    );
  }, [wardGeofences, geofenceId]);
  const geofencePolygon = useMemo(() => readGeofencePolygon(geofence), [geofence]);
  const geofenceLabelPoint = useMemo(
    () => getTopCoordinate(geofencePolygon),
    [geofencePolygon],
  );
  const geofenceName = readFirstString(geofence?.name, geofenceId);

  // TB-R051: no silent waits; a geofence that never arrives is reported, not "loading" forever.
  // No LM/Ward scope means the query cannot run, so it is not found at once (once the rows, which can
  // carry the scope, are on the phone). Offline it is only not loaded yet: cached geofences may be incomplete.
  const geofenceNotFound =
    Boolean(geofenceId) &&
    !geofence &&
    (geofenceScopeMissing
      ? rowsState === "READY"
      : !offline && (wardGeofencesLoaded || geofenceWaitOver));

  // The wait restarts when the map opens, the batch or its Ward changes, or the connection returns.
  useEffect(() => {
    setGeofenceWaitOver(false);
    if (!visible || !geofenceId || !lmPcode || !wardPcode || offline) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setGeofenceWaitOver(true);
    }, GEOFENCE_WAIT_MS);

    return () => clearTimeout(timer);
  }, [visible, bucketId, geofenceId, lmPcode, wardPcode, offline]);

  // TB-R051 (1.3.38): the batch area follows the geofence's own outline with a 50 m margin; where there is no
  // geofence it is the batch's pins with the margin. A batch with a geofence waits for it (online) instead of
  // starting from the pins.
  const areaWaitsForGeofence =
    Boolean(geofenceId) && !geofence && !geofenceNotFound && !offline;
  // Without a geofence the pins make the area, and a pin needs its Sales record: wait for those records (up to the
  // same limit as the geofence) instead of building a small area and re-reading it as each record arrives.
  // The wait happens once per opening: after the area is drawn, a reconnect that marks records loading again does not
  // take the area away.
  const salesStillLoading = safeRows.some((row) => row?.salesLoadState === "LOADING");
  const salesWaitKey = visible && !geofenceId ? bucketId || "batch" : "";
  const salesWaitOver = Boolean(salesWaitKey) && salesWaitDoneKey === salesWaitKey;
  if (!salesWaitKey && salesWaitDoneKey) setSalesWaitDoneKey("");
  useEffect(() => {
    if (!salesWaitKey || offline || !salesStillLoading || salesWaitOver) return undefined;
    const timer = setTimeout(() => setSalesWaitDoneKey(salesWaitKey), GEOFENCE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [salesWaitKey, offline, salesStillLoading, salesWaitOver]);
  const areaWaitsForSales =
    Boolean(salesWaitKey) && !offline && rowsState === "READY" && salesStillLoading && !salesWaitOver;
  const rawBatchShape = useMemo(
    () =>
      visible && !areaWaitsForGeofence && !areaWaitsForSales
        ? batchAreaShape({
            geofencePoints: geofencePolygon,
            pinCoordinates: coordinates,
            marginMeters: BATCH_AREA_MARGIN_METERS,
          })
        : null,
    [visible, areaWaitsForGeofence, areaWaitsForSales, geofencePolygon, coordinates],
  );
  if (salesWaitKey && !salesWaitOver && rawBatchShape) setSalesWaitDoneKey(salesWaitKey);
  const areaKey = readAreaKey(rawBatchShape);
  const batchShape = useMemo(
    () => (areaKey ? JSON.parse(areaKey) : null),
    [areaKey],
  );
  const areaBboxKey = batchShape ? JSON.stringify(batchShape.bbox) : "";
  // Still coming: the geofence, or the rows whose pins make the area.
  const areaPending =
    !batchShape && (areaWaitsForGeofence || areaWaitsForSales || rowsState === "LOADING");
  const areaUnavailable = Boolean(visible) && !batchShape && !areaPending;
  // Only said once the rows are on the phone; without rows the empty card already says why.
  const areaMissing = areaUnavailable && rowsState === "READY";
  // The layers need the batch Ward; once the rows are on the phone a missing Ward is reported.
  const layerScopeError = wardScopeMissing && rowsState === "READY";

  // TB-R051 (1.3.38): a Ward the phone is already working in (the warehouse's active Ward) uses the warehouse's own
  // ERFs and premises, with no new listener. Any other Ward is never downloaded or kept whole for this map: only the
  // batch area is read, once, and dropped when the map closes.
  const warehouseScope = warehouseSync?.scope;
  const batchWardIsActive =
    !wardScopeMissing &&
    warehouseScope?.status === "ready" &&
    readFirstString(warehouseScope?.lmPcode) === lmPcode &&
    readFirstString(warehouseScope?.wardPcode) === wardPcode;
  const warehouseErfsReady =
    batchWardIsActive &&
    warehouseSync?.erfs?.status === "ready" &&
    Array.isArray(warehouseAll?.erfs);
  const warehouseErfEntries = warehouseErfsReady ? warehouseAll.erfs : null;
  // The warehouse rebuilds geoLibrary whenever its meters, premises or transactions change, but the ERF entries in
  // it only change with the ERF pack (all.erfs). The layer follows all.erfs, so 400 ERF boundaries are not redrawn
  // on every meter update.
  const warehouseGeoRef = useRef(null);
  warehouseGeoRef.current = warehouseAll?.geoLibrary || null;
  const warehousePremises =
    batchWardIsActive &&
    Array.isArray(warehouseAll?.prems) &&
    warehouseAll.prems.length > 0
      ? warehouseAll.prems
      : null;

  // TB-R051 (1.3.38): ERFs of the batch area, read once when the map is open and online; other Sales meters need them too.
  const erfAreaLoad = useLayerLoad({
    open: Boolean(visible),
    wanted:
      (erfsOn || otherSalesOn) &&
      !offline &&
      !layerScopeError &&
      !warehouseErfsReady,
    requestKey:
      !warehouseErfsReady && wardPcode && areaBboxKey
        ? `${wardPcode}|${areaBboxKey}`
        : "",
    load: () =>
      loadBatchAreaErfs({
        wardPcode,
        bbox: batchShape?.bbox,
        limit: AREA_READ_LIMIT,
      }),
    label: "loadBatchAreaErfs",
  });
  const areaErfDocs = erfAreaLoad.status === "READY" ? erfAreaLoad.data : null;
  const areaErfEntries = useMemo(
    () => (areaErfDocs ? erfEntriesFromDocs(areaErfDocs) : null),
    [areaErfDocs],
  );
  const erfsReady = warehouseErfsReady || Boolean(areaErfEntries);
  const erfsLoadFailed = !erfsReady && erfAreaLoad.status === "ERROR";
  // A read that reached its limit may have left ERFs out, and not the furthest ones.
  const erfsReadLimited =
    !warehouseErfsReady &&
    Array.isArray(areaErfDocs) &&
    areaErfDocs.length >= AREA_READ_LIMIT;

  const erfLayer = useMemo(() => {
    if (!batchShape) return EMPTY_ERF_LAYER;
    const entries = warehouseErfEntries
      ? {
          metaEntries: warehouseErfEntries,
          geoEntries: warehouseGeoRef.current || {},
        }
      : areaErfEntries;
    if (!entries) return EMPTY_ERF_LAYER;

    return (
      erfsInArea({
        shape: batchShape,
        metaEntries: entries.metaEntries || EMPTY_LIST,
        geoEntries: entries.geoEntries || {},
        limit: ERF_LAYER_LIMIT,
      }) || EMPTY_ERF_LAYER
    );
  }, [batchShape, warehouseErfEntries, areaErfEntries]);
  const layerErfs = Array.isArray(erfLayer?.erfs) ? erfLayer.erfs : EMPTY_LIST;
  const drawnErfs = erfsOn && !layerScopeError ? layerErfs : EMPTY_LIST;
  const erfPolygons = useMemo(
    () =>
      drawnErfs.flatMap((erf) =>
        (Array.isArray(erf?.polygons) ? erf.polygons : [])
          .filter((ring) => Array.isArray(ring) && ring.length >= 3)
          .map((ring, ringIndex) => ({
            key: `erf-${erf.id}-${ringIndex}`,
            ring,
          })),
      ),
    [drawnErfs],
  );
  // TB-R051 (1.3.40): each ERF number on a fixed point inside its ERF, above the centre, so it never moves with the
  // zoom and a pin or icon at the centre does not hide it.
  const erfLabels = useMemo(() => {
    // An ERF lying inside another is a hole in the outer one, so the outer number never lands on the inner ERF.
    const holes = holesByErf(drawnErfs);
    return drawnErfs
      .map((erf, index) => {
        const erfNo = readFirstString(erf?.erfNo);
        const point = erfNo ? erfLabelPoint(erf, { holes: holes[index] }) : null;
        return point
          ? {
              id: erf.id,
              erfNo,
              point,
              // TB-R051 (1.3.70): how much room this ERF gives its own number, in metres.
              roomMetres: erfLabelRoomMetres(erf, { holes: holes[index], point }),
            }
          : null;
      })
      .filter(Boolean);
  }, [drawnErfs]);

  // TB-R051 (1.3.38): premises of the batch area, read once when the Premises button is first switched on. An empty
  // warehouse list cannot tell "not arrived" from "none", so it is read from the batch area instead.
  const premisesAreaLoad = useLayerLoad({
    open: Boolean(visible),
    wanted: premisesOn && !offline && !layerScopeError && !warehousePremises,
    requestKey:
      !warehousePremises && wardPcode && areaBboxKey
        ? `${wardPcode}|${areaBboxKey}`
        : "",
    load: () =>
      loadBatchAreaPremises({
        wardPcode,
        bbox: batchShape?.bbox,
        limit: AREA_READ_LIMIT,
      }),
    label: "loadBatchAreaPremises",
  });
  const areaPremiseDocs =
    premisesAreaLoad.status === "READY" ? premisesAreaLoad.data : null;
  const premisesSource = warehousePremises || areaPremiseDocs;
  const premisesReady = Boolean(premisesSource);
  const premisesLoadFailed =
    !premisesReady && premisesAreaLoad.status === "ERROR";
  const premisesReadLimited =
    !warehousePremises &&
    Array.isArray(areaPremiseDocs) &&
    areaPremiseDocs.length >= AREA_READ_LIMIT;

  const premisesInBatchArea = useMemo(() => {
    if (!visible || !premisesOn || !batchShape || !premisesSource) {
      return EMPTY_LIST;
    }
    const found = premisesInArea({ shape: batchShape, premises: premisesSource });
    return Array.isArray(found) ? found : EMPTY_LIST;
  }, [visible, premisesOn, batchShape, premisesSource]);
  const drawnPremises = useMemo(
    () =>
      premisesOn && !layerScopeError
        ? premisesInBatchArea.slice(0, PREMISE_LAYER_LIMIT)
        : EMPTY_LIST,
    [premisesOn, layerScopeError, premisesInBatchArea],
  );
  const premisesBusy =
    premisesOn &&
    !layerScopeError &&
    !premisesLoadFailed &&
    (areaPending || (!premisesReady && !offline && !areaUnavailable));

  // TB-R051 (1.3.38): other Sales meters on the ERFs of the batch area. They wait for the batch rows, so this batch's
  // own meters are never drawn as other Sales meters. GPS Sales are asked for by ERF number and Non-GPS Sales by ERF
  // ID, each for the 300 ERFs nearest the middle of the batch area (at most 10 queries of 30).
  const otherSalesRequest = useMemo(() => {
    if (!visible || rowsState !== "READY" || !lmPcode || !batchShape) {
      return null;
    }
    if (!erfsReady) return null;

    const numbersInOrder = layerErfs.map((erf) => erf?.erfNo);
    const idsInOrder = layerErfs.map((erf) => erf?.id);
    const erfNumbers = orderedUnique(numbersInOrder, OTHER_SALES_MAX_ERFS);
    const erfIds = orderedUnique(idsInOrder, OTHER_SALES_MAX_ERFS);
    const request = {
      lmPcode,
      erfNumberChunks: erfNumberChunks(erfNumbers),
      // The same ordered chunks of 30, of ERF IDs.
      erfIdChunks: erfNumberChunks(erfIds),
    };

    return {
      key: JSON.stringify(request),
      request,
      erfsLeftOut:
        Boolean(erfLayer?.capped) ||
        erfsReadLimited ||
        orderedUnique(numbersInOrder).length > erfNumbers.length ||
        orderedUnique(idsInOrder).length > erfIds.length,
    };
  }, [
    visible,
    rowsState,
    lmPcode,
    batchShape,
    erfsReady,
    layerErfs,
    erfLayer?.capped,
    erfsReadLimited,
  ]);

  const otherSalesLoad = useLayerLoad({
    open: Boolean(visible),
    wanted: otherSalesOn && !offline && !layerScopeError,
    requestKey: otherSalesRequest?.key || "",
    // TB-R051 (1.3.38) and TB-R046: only CAT1–CAT8 meters of the LM's newest category month. Normal and uncategorised
    // meters are dropped before they are kept, so the map never holds them.
    load: async () => {
      const request = otherSalesRequest?.request;
      const categoryMonth = await loadLatestSalesCategoryMonth({ lmPcode: request?.lmPcode });
      const found = categoryMonth ? await loadOtherSalesMeters(request) : [];
      const catMeters = found.filter((item) => isCatSalesMeter(item?.sales, categoryMonth));
      return Object.defineProperties(catMeters, {
        categoryMonth: { value: categoryMonth },
        truncated: { value: Boolean(found.truncated) },
      });
    },
    label: "loadOtherSalesMeters",
  });

  const otherSalesStatus = !otherSalesOn
    ? "OFF"
    : offline
      ? "OFFLINE"
      : layerScopeError
        ? "NO_SCOPE"
        : rowsState === "ERROR" || erfsLoadFailed
          ? "ERROR"
          : areaUnavailable
            ? "NO_AREA"
            : otherSalesLoad.status === "READY" ||
                otherSalesLoad.status === "ERROR"
              ? otherSalesLoad.status
              : "LOADING";
  const otherSalesErfsLeftOut =
    otherSalesStatus === "READY" &&
    (Boolean(otherSalesRequest?.erfsLeftOut) || Boolean(otherSalesLoad.data?.truncated));

  // This batch's own meters are never drawn as other Sales meters.
  const batchSalesIdsKey = useMemo(
    () =>
      JSON.stringify(
        [
          ...new Set(
            safeRows
              .flatMap((row) => [
                row?.salesAllMeterId,
                row?.salesDocId,
                row?.raw?.salesAllMeterId,
                row?.raw?.salesDocId,
              ])
              .map((value) => readFirstString(value))
              .filter(Boolean),
          ),
        ].sort(),
      ),
    [safeRows],
  );

  // TB-R051 (1.3.38): only meters whose position lies in the batch area are drawn (ERF numbers repeat across towns),
  // at most 400, nearest the middle first.
  const otherSalesLayer = useMemo(() => {
    if (otherSalesStatus !== "READY" || !batchShape) {
      return EMPTY_OTHER_SALES_LAYER;
    }

    const batchSalesIds = JSON.parse(batchSalesIdsKey);
    const seen = new Set();
    const inArea = [];

    for (const item of otherSalesLoad.data) {
      const id = readFirstString(item?.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const meter = classifyOtherSalesMeter({
        id,
        sales: item?.sales,
        batchSalesIds,
      });
      if (meter?.point && pointInBatchArea(batchShape, meter.point)) {
        inArea.push(meter);
      }
    }

    const meters = nearestItems(
      inArea,
      batchShape.center,
      (meter) => meter.point,
      OTHER_SALES_LAYER_LIMIT,
    );
    return { meters, capped: inArea.length > meters.length };
  }, [otherSalesStatus, batchShape, otherSalesLoad.data, batchSalesIdsKey]);
  const otherSalesMeters = otherSalesLayer.meters;

  const erfsBusy =
    erfsOn &&
    !layerScopeError &&
    !erfsLoadFailed &&
    (areaPending || (!erfsReady && !offline && !areaUnavailable));

  const initialRegion = useMemo(
    () => regionForCoordinates([...coordinates, ...geofencePolygon]),
    [coordinates, geofencePolygon],
  );

  useEffect(() => {
    if (!visible) setMapReady(false);
    setSheet(null);
    fitStateRef.current = { points: false, geofence: false };
    // TB-R051 (1.3.40): every opening shows the spinner until the map has zoomed to the batch area.
    setOpeningZoom(NO_OPENING_ZOOM);
    setOpeningSettled(false);
    // TB-R051 (1.3.38): every opening starts with ERFs on, Premises and Other Sales meters off and the Normal map.
    setErfsOn(true);
    setPremisesOn(false);
    setOtherSalesOn(false);
    setMapType("standard");
    setMapMessage(NO_MAP_MESSAGE);
    locateRequestRef.current += 1;
    locatingRef.current = false;
    setLocating(false);
  }, [visible, bucketId]);

  // TB-R051 (1.3.70): how many metres one pixel covers at the zoom the map is at. The region's latitude
  // delta spans the height of the map area, measured in the same pixels the label is drawn in. Until the
  // map has settled on a region of its own, the one it opened at is used, so the numbers are sized from
  // the first frame rather than missing until the first pan.
  const metresPerPixel = useMemo(() => {
    const delta = Number(region?.latitudeDelta ?? initialRegion?.latitudeDelta);
    if (!Number.isFinite(delta) || delta <= 0 || mapAreaHeight <= 0) return 0;
    return (delta * 111320) / mapAreaHeight;
  }, [region?.latitudeDelta, initialRegion?.latitudeDelta, mapAreaHeight]);

  // The size each number is drawn at. 0 leaves it out: its ERF has no room for it at this zoom.
  const erfLabelSizes = useMemo(() => {
    if (!metresPerPixel) return {};
    const sizes = {};
    for (const label of erfLabels) {
      sizes[label.id] = erfLabelFontSize(
        String(label.erfNo).length,
        label.roomMetres / metresPerPixel,
      );
    }
    return sizes;
  }, [erfLabels, metresPerPixel]);

  // Fit once to the meters and once more when the geofence arrives; later row updates never move the map.
  useEffect(() => {
    if (!visible || !mapReady) return undefined;

    const fitted = fitStateRef.current;
    const needPoints = coordinates.length > 0 && !fitted.points;
    const needGeofence = geofencePolygon.length > 0 && !fitted.geofence;
    if (!needPoints && !needGeofence) return undefined;

    const timer = setTimeout(() => {
      const next = {
        points: fitted.points || coordinates.length > 0,
        geofence: fitted.geofence || geofencePolygon.length > 0,
      };
      fitStateRef.current = next;
      moveMapToCoordinates(mapRef.current, [...coordinates, ...geofencePolygon]);
      setOpeningZoom(next);
    }, 250);

    return () => clearTimeout(timer);
  }, [visible, mapReady, coordinates, geofencePolygon]);

  // TB-R051 (1.3.40): whether the map has zoomed to the batch area (the geofence, else the pins).
  const openingZoomReached = isBatchMapOpeningZoomReached({
    mapReady,
    geofencePointCount: geofencePolygon.length,
    waitsForGeofence: areaWaitsForGeofence,
    coordinateCount: coordinates.length,
    rowsState,
    // Online, a pin may still come from a Sales record that has not loaded.
    waitsForPins: !offline && salesStillLoading,
    openingZoom,
  });

  // TB-R051 (1.3.40): the spinner ends when the zoom animation is over, and never shows longer than the limit.
  useEffect(() => {
    if (!visible || openingSettled || !openingZoomReached) return undefined;
    const timer = setTimeout(() => setOpeningSettled(true), MAP_ZOOM_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [visible, openingSettled, openingZoomReached]);

  useEffect(() => {
    if (!visible || openingSettled) return undefined;
    const timer = setTimeout(() => setOpeningSettled(true), MAP_OPENING_MAX_MS);
    return () => clearTimeout(timer);
  }, [visible, bucketId, openingSettled]);

  const mapOpening = visible && !openingSettled;

  useEffect(() => {
    if (!mapMessage.text) return undefined;

    const timer = setTimeout(() => {
      setMapMessage(NO_MAP_MESSAGE);
    }, MAP_MESSAGE_MS);

    return () => clearTimeout(timer);
  }, [mapMessage]);

  const selectedGroup =
    sheet?.kind === "GROUP"
      ? groups.find((group) => group?.key === sheet.key) || null
      : null;
  const selectedOtherSales =
    sheet?.kind === "OTHER_SALES"
      ? otherSalesMeters.find((meter) => meter?.id === sheet.id) || null
      : null;
  const selectedPremise =
    sheet?.kind === "PREMISE"
      ? drawnPremises.find((premise) => premise?.id === sheet.id) || null
      : null;

  useEffect(() => {
    if (sheet?.kind === "GROUP" && !selectedGroup) setSheet(null);
    if (sheet?.kind === "UNPLACED" && unplaced.length === 0) setSheet(null);
    if (sheet?.kind === "OTHER_SALES" && !selectedOtherSales) setSheet(null);
    if (sheet?.kind === "PREMISE" && !selectedPremise) setSheet(null);
  }, [sheet, selectedGroup, unplaced.length, selectedOtherSales, selectedPremise]);

  const showMapMessage = useCallback(
    (text) => setMapMessage({ text, id: Date.now() }),
    [],
  );
  const handleMapReady = useCallback(() => setMapReady(true), []);
  const handleGroupPress = useCallback(
    (key) => setSheet({ kind: "GROUP", key }),
    [],
  );
  const handleOtherSalesPress = useCallback(
    (id) => setSheet({ kind: "OTHER_SALES", id }),
    [],
  );
  const handlePremisePress = useCallback(
    (id) => setSheet({ kind: "PREMISE", id }),
    [],
  );
  const openUnplaced = useCallback(() => setSheet({ kind: "UNPLACED" }), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  // TB-R051: back goes up one level; with the meter list open it closes only the list.
  const handleRequestClose = useCallback(
    () => (sheet ? setSheet(null) : onClose?.()),
    [sheet, onClose],
  );
  const renderSheetItem = useCallback(
    ({ item }) =>
      typeof renderRowCard === "function" ? renderRowCard(item) : null,
    [renderRowCard],
  );
  const handleMapAreaLayout = useCallback((event) => {
    setMapAreaHeight(Math.round(event?.nativeEvent?.layout?.height || 0));
  }, []);

  // Only when the pan or zoom has settled, so nothing is recomputed on every frame of a gesture.
  const handleRegionSettled = useCallback((next) => {
    const delta = Number(next?.latitudeDelta);
    if (!Number.isFinite(delta) || delta <= 0) return;

    setRegion((current) => {
      // A pan does not change the zoom, and a hair of drift is no new size for any number. Holding the
      // same region keeps a pan from redrawing every ERF number on the map.
      const held = Number(current?.latitudeDelta);
      if (Number.isFinite(held) && Math.abs(delta - held) <= held * 0.01) {
        return current;
      }
      return { latitudeDelta: delta };
    });
  }, []);

  const toggleErfs = useCallback(() => setErfsOn((on) => !on), []);
  const togglePremises = useCallback(() => setPremisesOn((on) => !on), []);
  // TB-R051 (1.3.38): with no connection the button stays off and says why; one already on can still be turned off.
  const toggleOtherSales = useCallback(() => {
    if (offline && !otherSalesOn) {
      showMapMessage(OTHER_SALES_OFFLINE_MESSAGE);
      return;
    }
    setOtherSalesOn((on) => !on);
  }, [offline, otherSalesOn, showMapMessage]);
  const toggleMapType = useCallback(
    () =>
      setMapType((current) =>
        current === "standard" ? "satellite" : "standard",
      ),
    [],
  );

  // TB-R051 (1.3.38): the map moves to the worker only when this button is tapped; it never follows the worker.
  const handleCentreOnMe = useCallback(async () => {
    if (locatingRef.current) return;

    const requestId = locateRequestRef.current + 1;
    locateRequestRef.current = requestId;
    locatingRef.current = true;
    setLocating(true);

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission?.status !== Location.PermissionStatus.GRANTED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (requestId !== locateRequestRef.current) return;

      if (permission?.status !== Location.PermissionStatus.GRANTED) {
        showMapMessage(LOCATE_PERMISSION_MESSAGE);
        return;
      }

      const position = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        LOCATE_TIMEOUT_MS,
      );
      if (requestId !== locateRequestRef.current) return;

      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !mapRef.current
      ) {
        showMapMessage(LOCATE_FAILED_MESSAGE);
        return;
      }

      mapRef.current.animateCamera(
        { center: { latitude, longitude } },
        { duration: 400 },
      );
    } catch (locateError) {
      if (requestId !== locateRequestRef.current) return;
      console.log("TargetedBatchMapModal --centreOnMe --error", locateError);
      showMapMessage(LOCATE_FAILED_MESSAGE);
    } finally {
      if (requestId === locateRequestRef.current) {
        locatingRef.current = false;
        setLocating(false);
      }
    }
  }, [showMapMessage]);

  const sheetRows = selectedGroup
    ? selectedGroup.rows || EMPTY_LIST
    : sheet?.kind === "UNPLACED"
      ? unplaced
      : EMPTY_LIST;
  const sheetOpen = Boolean(sheet) && sheetRows.length > 0;
  const sheetSource = selectedGroup?.source || null;
  const sheetTitle = !selectedGroup
    ? `No position (${unplaced.length})`
    : sheetRows.length === 1
      ? `Meter ${sheetRows[0]?.meterNo || "NAv"}`
      : `${sheetRows.length} meters here`;
  const sheetNote = selectedGroup
    ? MAP_PIN_LABELS[sheetSource] || ""
    : "Not drawn on the map";
  const sheetStatusLine = describeStatusCounts(
    selectedGroup ? selectedGroup.statusCounts : countRowStatuses(sheetRows),
  );
  const sheetMaxHeight = Math.round(
    mapAreaHeight > 0
      ? Math.max(160, Math.min(windowHeight * 0.6, mapAreaHeight - 24))
      : windowHeight * 0.6,
  );

  const selectedOtherSalesIcon = selectedOtherSales
    ? SALES_STATUS_ICONS[selectedOtherSales.status] ||
      SALES_STATUS_ICONS.NOT_STARTED
    : null;
  const selectedOtherSalesColor = selectedOtherSales
    ? MAP_STATUS_COLORS[selectedOtherSales.status] ||
      MAP_STATUS_COLORS.NOT_STARTED
    : null;

  // TB-R051 (1.3.38): short notes on the map; never a silent empty layer.
  const layerNotes = [];
  const anyAreaLayerOn = erfsOn || premisesOn || otherSalesOn;
  if (mapMessage.text) {
    layerNotes.push({ key: "message", text: mapMessage.text, tone: "warn" });
  }
  if (anyAreaLayerOn && layerScopeError) {
    layerNotes.push({
      key: "scope",
      text: "The batch Ward is not known, so ERFs, premises and other Sales meters cannot load.",
      tone: "error",
    });
  } else if (anyAreaLayerOn && areaMissing) {
    layerNotes.push({
      key: "area",
      text: "No batch area: this batch has no geofence and no meter positions.",
      tone: "info",
    });
  }
  // TB-R051 (1.3.38): a layer that cannot load says so; "none" is only said when the read really completed with none.
  if (erfsOn && !layerScopeError && !areaUnavailable) {
    if (erfsLoadFailed) {
      layerNotes.push({ key: "erfs", text: ERFS_ERROR_MESSAGE, tone: "error" });
    } else if (!erfsReady && offline) {
      layerNotes.push({ key: "erfs", text: ERFS_OFFLINE_MESSAGE, tone: "warn" });
    } else if (!erfsReady || !batchShape) {
      layerNotes.push({ key: "erfs", text: ERFS_LOADING_MESSAGE, tone: "info" });
    } else if (erfsReadLimited) {
      layerNotes.push({
        key: "erfs",
        text: "Some ERFs of a large batch area were not loaded",
        tone: "info",
      });
    } else if (erfLayer?.capped) {
      layerNotes.push({
        key: "erfs",
        text: `Only the ${ERF_LAYER_LIMIT} ERFs nearest the middle of the batch area are drawn`,
        tone: "info",
      });
    } else if (layerErfs.length === 0) {
      layerNotes.push({
        key: "erfs",
        text: "No ERFs in the batch area",
        tone: "info",
      });
    }
  }
  if (premisesOn && !layerScopeError && !areaUnavailable) {
    if (premisesLoadFailed) {
      layerNotes.push({
        key: "premises",
        text: PREMISES_ERROR_MESSAGE,
        tone: "error",
      });
    } else if (!premisesReady && offline) {
      layerNotes.push({
        key: "premises",
        text: PREMISES_OFFLINE_MESSAGE,
        tone: "warn",
      });
    } else if (!premisesReady || !batchShape) {
      layerNotes.push({
        key: "premises",
        text: PREMISES_LOADING_MESSAGE,
        tone: "info",
      });
    } else if (premisesReadLimited) {
      layerNotes.push({
        key: "premises",
        text: "Some premises of a large batch area were not loaded",
        tone: "info",
      });
    } else if (premisesInBatchArea.length === 0) {
      layerNotes.push({
        key: "premises",
        text: "No premises in the batch area",
        tone: "info",
      });
    } else if (premisesInBatchArea.length > PREMISE_LAYER_LIMIT) {
      layerNotes.push({
        key: "premises",
        text: `Only the ${PREMISE_LAYER_LIMIT} premises nearest the middle of the batch area are drawn`,
        tone: "info",
      });
    }
  }
  if (otherSalesStatus === "OFFLINE") {
    layerNotes.push({
      key: "other-sales",
      text: OTHER_SALES_OFFLINE_MESSAGE,
      tone: "warn",
    });
  } else if (otherSalesStatus === "ERROR") {
    layerNotes.push({
      key: "other-sales",
      text: OTHER_SALES_ERROR_MESSAGE,
      tone: "error",
    });
  } else if (otherSalesStatus === "LOADING") {
    layerNotes.push({
      key: "other-sales",
      text: OTHER_SALES_LOADING_MESSAGE,
      tone: "info",
    });
  } else if (otherSalesStatus === "READY") {
    // As for ERFs: "none" only after a complete read, and a missing category month is said as such.
    if (!otherSalesLoad.data?.categoryMonth) {
      layerNotes.push({
        key: "other-sales",
        text: "No category month for this municipality, so no other CAT Sales meters are shown",
        tone: "info",
      });
    } else if (otherSalesErfsLeftOut) {
      layerNotes.push({
        key: "other-sales-left-out",
        text: OTHER_SALES_ERFS_LEFT_OUT_MESSAGE,
        tone: "info",
      });
    } else if (otherSalesMeters.length === 0) {
      layerNotes.push({
        key: "other-sales",
        text: "No other CAT Sales meters with a position in the batch area",
        tone: "info",
      });
    } else if (otherSalesLayer.capped) {
      layerNotes.push({
        key: "other-sales",
        text: `Only the ${OTHER_SALES_LAYER_LIMIT} other CAT Sales meters nearest the middle of the batch area are drawn`,
        tone: "info",
      });
    }
  }

  const headerCounts =
    rowsState === "OFFLINE"
      ? "Meters not loaded — no connection"
      : rowsState === "LOADING"
        ? "Loading meters…"
        : rowsState === "ERROR"
          ? "Meters not loaded"
          : `${placedCount} on map · ${unplaced.length} no position`;
  const emptyMessage =
    rowsState === "OFFLINE"
      ? WMS_OFFLINE_MESSAGE
      : rowsState === "LOADING"
        ? ROWS_LOADING_MESSAGE
        : rowsState === "ERROR"
          ? readFirstString(error?.message, ROWS_ERROR_MESSAGE)
          : NO_POSITION_MESSAGE;
  const emptyIcon =
    rowsState === "OFFLINE"
      ? "wifi-off"
      : rowsState === "ERROR"
        ? "alert-circle-outline"
        : "map-marker-off-outline";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleRequestClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close batch map"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
            </Pressable>

            <View style={styles.headerMain}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {bucketId || "Targeted Batch"}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {headerCounts}
              </Text>
            </View>

            {/* TB-R043: a batch without a geofence shows No geofence. */}
            {!geofenceId ? (
              <View style={[styles.geofenceChip, styles.geofenceChipMissing]}>
                <MaterialCommunityIcons
                  name="vector-polygon"
                  size={13}
                  color="#64748b"
                />
                <Text style={styles.geofenceChipMissingText}>No geofence</Text>
              </View>
            ) : geofence ? (
              <View style={styles.geofenceChip}>
                <MaterialCommunityIcons
                  name="vector-polygon"
                  size={13}
                  color={GEOFENCE_COLOR}
                />
                <Text style={styles.geofenceChipText} numberOfLines={1}>
                  {geofenceName}
                </Text>
              </View>
            ) : (
              <View style={[styles.geofenceChip, styles.geofenceChipMissing]}>
                <MaterialCommunityIcons
                  name="vector-polygon"
                  size={13}
                  color="#64748b"
                />
                <Text style={styles.geofenceChipMissingText} numberOfLines={1}>
                  {geofenceNotFound
                    ? "Geofence not found"
                    : "Geofence not loaded yet"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.legendRow}>
            {STATUS_LEGEND.map(({ status, label }) => (
              <View key={status} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: MAP_STATUS_COLORS[status] },
                  ]}
                />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.legendRow}>
            {SOURCE_LEGEND.map(({ source, label }) => (
              <View key={source} style={styles.legendItem}>
                <View style={styles.legendLetter}>
                  <Text style={styles.legendLetterText}>
                    {TARGETED_BATCH_MAP_SOURCE_LABELS[source]}
                  </Text>
                </View>
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {offline ? (
          <View style={styles.offlineBanner}>
            <MaterialCommunityIcons name="wifi-off" size={15} color="#92400e" />
            <Text style={styles.offlineText}>
              No connection — the map background may not load
            </Text>
          </View>
        ) : null}

        <View style={styles.mapArea} onLayout={handleMapAreaLayout}>
          <MapView
            key={`batch-map-${openingCount}`}
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            mapType={mapType}
            showsUserLocation
            showsMyLocationButton={false}
            toolbarEnabled={false}
            moveOnMarkerPress={false}
            mapPadding={MAP_PADDING}
            initialRegion={initialRegion}
            onMapReady={handleMapReady}
            onRegionChangeComplete={handleRegionSettled}
          >
            {erfPolygons.map(({ key, ring }) => (
              <Polygon
                key={key}
                coordinates={ring}
                strokeColor={ERF_STROKE_COLOR}
                fillColor={ERF_FILL_COLOR}
                strokeWidth={1}
                zIndex={5}
              />
            ))}

            {geofencePolygon.length > 0 ? (
              <Polygon
                coordinates={geofencePolygon}
                strokeColor={GEOFENCE_COLOR}
                fillColor={GEOFENCE_FILL}
                strokeWidth={3}
                zIndex={10}
              />
            ) : null}

            {erfLabels.map((label) => {
              const fontSize = erfLabelSizes[label.id] || 0;
              if (!fontSize) return null;

              return (
                <ErfLabelMarker
                  key={`erf-label-${label.id}`}
                  latitude={label.point.latitude}
                  longitude={label.point.longitude}
                  erfNo={label.erfNo}
                  fontSize={fontSize}
                />
              );
            })}

            {geofenceLabelPoint && geofenceName ? (
              <GeofenceNameMarker
                // A new name gets a new marker: the map kept the size the marker was made with, which is
                // one of the ways the name came out cut off.
                key={`geofence-name-${geofenceName}`}
                latitude={geofenceLabelPoint.latitude}
                longitude={geofenceLabelPoint.longitude}
                name={geofenceName}
              />
            ) : null}

            {drawnPremises.map((premise) => (
              <PremiseMarker
                key={`premise-${premise.id}`}
                premiseId={premise.id}
                latitude={premise.latitude}
                longitude={premise.longitude}
                selected={selectedPremise?.id === premise.id}
                onPress={handlePremisePress}
              />
            ))}

            {otherSalesMeters.map((meter) => (
              <OtherSalesMarker
                key={`other-sales-${meter.id}`}
                meterId={meter.id}
                latitude={meter.point.latitude}
                longitude={meter.point.longitude}
                status={meter.status}
                selected={selectedOtherSales?.id === meter.id}
                onPress={handleOtherSalesPress}
              />
            ))}

            {groups.map((group) => (
              <BatchGroupMarker
                key={group.key}
                groupKey={group.key}
                latitude={group.latitude}
                longitude={group.longitude}
                status={group.status}
                source={group.source}
                count={group.rows?.length || 0}
                selected={selectedGroup?.key === group.key}
                onPress={handleGroupPress}
              />
            ))}
          </MapView>

          {/* TB-R051 (1.3.40): a spinner from opening until the map has zoomed to the batch area. */}
          {mapOpening ? (
            <View
              style={styles.openingOverlay}
              pointerEvents="none"
              accessibilityRole="progressbar"
              accessibilityLabel={MAP_OPENING_MESSAGE}
            >
              <View style={styles.emptyCard}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.emptyTitle}>{MAP_OPENING_MESSAGE}</Text>
              </View>
            </View>
          ) : null}

          {groups.length === 0 && !mapOpening ? (
            <View style={styles.emptyOverlay} pointerEvents="none">
              <View style={styles.emptyCard}>
                {rowsState === "LOADING" ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <MaterialCommunityIcons
                    name={emptyIcon}
                    size={30}
                    color="#94a3b8"
                  />
                )}
                <Text style={styles.emptyTitle}>{emptyMessage}</Text>
              </View>
            </View>
          ) : null}

          {layerNotes.length > 0 ? (
            <View style={styles.layerNotes} pointerEvents="none">
              {layerNotes.map((note) => (
                <View
                  key={note.key}
                  style={[
                    styles.layerNote,
                    note.tone === "warn" && styles.layerNoteWarn,
                    note.tone === "error" && styles.layerNoteError,
                  ]}
                >
                  <Text
                    style={[
                      styles.layerNoteText,
                      note.tone === "warn" && styles.layerNoteTextWarn,
                      note.tone === "error" && styles.layerNoteTextError,
                    ]}
                  >
                    {note.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* TB-R051 (1.3.38): map buttons on the right, top to bottom. */}
          <View style={styles.layerColumn}>
            <MapLayerButton
              icon="vector-square"
              word="ERFs"
              label="ERFs"
              on={erfsOn}
              busy={erfsBusy}
              onPress={toggleErfs}
            />
            <MapLayerButton
              icon="home-outline"
              word="Premises"
              label="Premises"
              on={premisesOn}
              busy={premisesBusy}
              onPress={togglePremises}
            />
            <MapLayerButton
              icon="gauge"
              word="Sales"
              label={
                offline
                  ? "Other CAT Sales meters, needs a connection"
                  : "Other CAT Sales meters"
              }
              on={otherSalesOn}
              busy={otherSalesStatus === "LOADING"}
              disabled={Boolean(offline)}
              onPress={toggleOtherSales}
            />
            {/* TB-R051 (1.3.38): the only centre button; the map's own top-right button stays hidden. */}
            <MapLayerButton
              icon="crosshairs-gps"
              word="Me"
              label="Centre on me"
              toggle={false}
              busy={locating}
              onPress={handleCentreOnMe}
            />
            <MapLayerButton
              icon="satellite-variant"
              word="Satellite"
              label="Satellite map"
              on={mapType === "satellite"}
              onPress={toggleMapType}
            />
          </View>

          {unplaced.length > 0 ? (
            <Pressable
              style={({ pressed }) => [
                styles.noPositionButton,
                pressed && styles.noPositionButtonPressed,
              ]}
              onPress={openUnplaced}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name="map-marker-question-outline"
                size={16}
                color="#ffffff"
              />
              <Text style={styles.noPositionButtonText}>
                {`No position (${unplaced.length})`}
              </Text>
            </Pressable>
          ) : null}

          {/* TB-R051 (1.3.38): other Sales meters and premises are for looking only; never the work buttons. */}
          {selectedOtherSales ? (
            <View style={styles.infoCard}>
              <View
                style={[
                  styles.infoIcon,
                  { borderColor: selectedOtherSalesColor },
                ]}
              >
                <Text
                  style={[
                    styles.otherSalesPinText,
                    { color: selectedOtherSalesColor },
                  ]}
                >
                  {selectedOtherSalesIcon.symbol}
                </Text>
              </View>

              <View style={styles.infoMain}>
                <Text style={styles.infoTitle} numberOfLines={1}>
                  {`Meter ${readFirstString(selectedOtherSales.meterNo, selectedOtherSales.id)}`}
                </Text>
                <Text
                  style={[
                    styles.infoLine,
                    { color: selectedOtherSalesColor },
                  ]}
                  numberOfLines={1}
                >
                  {`${selectedOtherSalesIcon.symbol} ${selectedOtherSalesIcon.label}`}
                </Text>
                <Text style={styles.infoLine} numberOfLines={1}>
                  {selectedOtherSales.kindLabel}
                </Text>
                <Text style={styles.infoMuted} numberOfLines={1}>
                  Not in this batch · view only
                </Text>
              </View>

              <Pressable
                style={styles.sheetClose}
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Close meter window"
                hitSlop={8}
              >
                <MaterialCommunityIcons name="close" size={20} color="#0f172a" />
              </Pressable>
            </View>
          ) : selectedPremise ? (
            <View style={styles.infoCard}>
              <View style={[styles.infoIcon, styles.infoIconPremise]}>
                <MaterialCommunityIcons name="home" size={18} color="#ffffff" />
              </View>

              <View style={styles.infoMain}>
                <Text style={styles.infoTitle} numberOfLines={1}>
                  Premise
                </Text>
                <Text style={styles.infoLine} numberOfLines={2}>
                  {readFirstString(selectedPremise.label, "No label")}
                </Text>
              </View>

              <Pressable
                style={styles.sheetClose}
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Close premise window"
                hitSlop={8}
              >
                <MaterialCommunityIcons name="close" size={20} color="#0f172a" />
              </Pressable>
            </View>
          ) : null}

          {sheetOpen ? (
            <>
              <Pressable
                style={styles.sheetBackdrop}
                onPress={closeSheet}
                accessibilityLabel="Close meter list"
              />

              <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
                <View style={styles.sheetHandle} />

                <View style={styles.sheetHeader}>
                  <View
                    style={[
                      styles.sheetIcon,
                      selectedGroup && {
                        backgroundColor:
                          MAP_STATUS_COLORS[selectedGroup.status] ||
                          MAP_STATUS_COLORS.NOT_STARTED,
                      },
                    ]}
                  >
                    {selectedGroup ? (
                      <Text style={styles.pinText}>
                        {TARGETED_BATCH_MAP_SOURCE_LABELS[sheetSource] || "?"}
                      </Text>
                    ) : (
                      <MaterialCommunityIcons
                        name="map-marker-question-outline"
                        size={18}
                        color="#475569"
                      />
                    )}
                  </View>

                  <View style={styles.sheetHeaderMain}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                      {sheetTitle}
                    </Text>
                    {sheetNote ? (
                      <Text
                        style={[
                          styles.sheetNote,
                          sheetSource === "GEOCODED" && styles.sheetNoteGeocoded,
                        ]}
                        numberOfLines={1}
                      >
                        {sheetNote}
                      </Text>
                    ) : null}
                    {sheetStatusLine ? (
                      <Text style={styles.sheetSub} numberOfLines={1}>
                        {sheetStatusLine}
                      </Text>
                    ) : null}
                  </View>

                  <Pressable
                    style={styles.sheetClose}
                    onPress={closeSheet}
                    accessibilityRole="button"
                    accessibilityLabel="Close meter list"
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={20}
                      color="#0f172a"
                    />
                  </Pressable>
                </View>

                {/* TB-R051: virtualised, so a long "No position" list does not mount every card at once. */}
                <FlatList
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetScrollContent}
                  data={sheetRows}
                  keyExtractor={sheetRowKey}
                  renderItem={renderSheetItem}
                  initialNumToRender={SHEET_INITIAL_RENDER}
                  windowSize={SHEET_WINDOW_SIZE}
                  keyboardShouldPersistTaps="handled"
                />
              </View>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  header: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMain: {
    flex: 1,
  },
  headerTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  headerSub: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  geofenceChip: {
    maxWidth: "42%",
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    backgroundColor: "#f5f3ff",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  geofenceChipText: {
    flexShrink: 1,
    color: GEOFENCE_COLOR,
    fontSize: 10,
    fontWeight: "900",
  },
  geofenceChipMissing: {
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  geofenceChipMissingText: {
    flexShrink: 1,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
  },

  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLetter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  legendLetterText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  legendText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
  },

  offlineBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offlineText: {
    flex: 1,
    color: "#92400e",
    fontSize: 11,
    fontWeight: "800",
  },

  mapArea: {
    flex: 1,
    overflow: "hidden",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  pinWrap: {
    width: 34,
    height: 34,
  },
  pin: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinSelected: {
    borderColor: "#0f172a",
  },
  pinText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  pinBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: "#ffffff",
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  pinBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },

  geofenceLabel: {
    maxWidth: 220,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GEOFENCE_COLOR,
    backgroundColor: "#ffffff",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  geofenceLabelText: {
    color: GEOFENCE_COLOR,
    fontSize: 11,
    fontWeight: "900",
    // The label is given its width, so the name sits in the middle of it.
    textAlign: "center",
  },

  erfLabel: {
    maxWidth: 120,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  erfLabelText: {
    color: "#1e293b",
    // TB-R051 (1.3.70): the size the number is drawn at when its ERF has room for it; the marker sets a
    // smaller one when it has not, so this and the geometry must stay the same number.
    fontSize: ERF_LABEL_BASE_FONT_SIZE,
    fontWeight: "800",
  },
  premisePin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: PREMISE_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  otherSalesPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  otherSalesPinText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  layerPinSelected: {
    borderColor: "#0f172a",
    borderWidth: 3,
  },

  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  openingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(248,250,252,0.72)",
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 7,
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  layerNotes: {
    position: "absolute",
    top: 12,
    left: 12,
    right: LAYER_COLUMN_WIDTH + 16,
    alignItems: "flex-start",
    gap: 6,
  },
  layerNote: {
    maxWidth: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  layerNoteWarn: {
    borderColor: "#fde68a",
    backgroundColor: "#fef3c7",
  },
  layerNoteError: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  layerNoteText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "800",
  },
  layerNoteTextWarn: {
    color: "#92400e",
  },
  layerNoteTextError: {
    color: "#b91c1c",
  },

  // TB-R051 (1.3.38): top right, clear of the Google logo and the "No position" button at the bottom left.
  layerColumn: {
    position: "absolute",
    top: 10,
    right: 8,
    width: LAYER_COLUMN_WIDTH,
    alignItems: "center",
    gap: 6,
  },
  layerItem: {
    width: LAYER_COLUMN_WIDTH,
    alignItems: "center",
    gap: 2,
  },
  layerWord: {
    maxWidth: LAYER_COLUMN_WIDTH,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  layerWordOn: {
    backgroundColor: LAYER_ON_COLOR,
  },
  layerWordDisabled: {
    backgroundColor: "rgba(241,245,249,0.92)",
  },
  layerWordText: {
    color: "#0f172a",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
  },
  layerWordTextOn: {
    color: "#ffffff",
  },
  layerWordTextDisabled: {
    color: "#64748b",
  },
  layerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#0f172a",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  layerButtonOn: {
    borderColor: LAYER_ON_COLOR,
    backgroundColor: LAYER_ON_COLOR,
  },
  layerButtonDisabled: {
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
  },
  layerButtonPressed: {
    opacity: 0.75,
  },
  layerButtonBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  layerButtonBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#92400e",
    alignItems: "center",
    justifyContent: "center",
  },

  noPositionButton: {
    position: "absolute",
    left: 12,
    bottom: 16,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 13,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noPositionButtonPressed: {
    backgroundColor: "#334155",
  },
  noPositionButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  infoCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    elevation: 6,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconPremise: {
    borderColor: PREMISE_COLOR,
    backgroundColor: PREMISE_COLOR,
  },
  infoMain: {
    flex: 1,
  },
  infoTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  infoLine: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  infoMuted: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.18)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#f8fafc",
    paddingTop: 6,
    paddingHorizontal: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  sheetIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHeaderMain: {
    flex: 1,
  },
  sheetTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },
  sheetNote: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  sheetNoteGeocoded: {
    color: "#b45309",
  },
  sheetSub: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    paddingBottom: 12,
  },
});
