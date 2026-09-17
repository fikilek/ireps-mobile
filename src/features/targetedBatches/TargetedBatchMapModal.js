import { MaterialCommunityIcons } from "@expo/vector-icons";
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

import { useGetGeoFencesByLmPcodeWardPcodeQuery } from "../../redux/geofenceApi";
import {
  buildTargetedBatchMapPoints,
  TARGETED_BATCH_MAP_SOURCE_LABELS,
} from "./targetedBatchMapPoints";

// TB-R051: pins are coloured by the status the phone shows.
const STATUS_COLORS = Object.freeze({
  NOT_STARTED: "#2563eb",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#16a34a",
});

const STATUS_LEGEND = [
  { status: "NOT_STARTED", label: "Not started" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "COMPLETED", label: "Completed" },
];

const SOURCE_LEGEND = [
  { source: "GPS", label: "Sales GPS" },
  { source: "GEOCODED", label: "geocoded — not observed" },
  { source: "ERF", label: "ERF centre" },
];

const SOURCE_NOTES = Object.freeze({
  GPS: "Sales GPS",
  GEOCODED: "Position geocoded, not observed",
  ERF: "ERF centre",
});

// TB-R043: the batch geofence is purple.
const GEOFENCE_COLOR = "#7c3aed";
const GEOFENCE_FILL = "rgba(124,58,237,0.10)";

const FIT_EDGE_PADDING = { top: 60, right: 60, bottom: 60, left: 60 };
// TB-R051: lifts the Google logo above the "No position" button so it stays visible.
const MAP_PADDING = { top: 0, right: 0, bottom: 64, left: 0 };
// TB-R051: how long the batch geofence may take before the chip says it was not found.
const GEOFENCE_WAIT_MS = 10000;
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
const EMPTY_POINTS = Object.freeze({ groups: [], unplaced: [], coordinates: [] });
const EMPTY_LIST = [];

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
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);

    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [status, source, count, selected]);

  const coordinate = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude],
  );
  const handlePress = useCallback(() => onPress(groupKey), [onPress, groupKey]);
  const color = STATUS_COLORS[status] || STATUS_COLORS.NOT_STARTED;

  return (
    <Marker
      coordinate={coordinate}
      anchor={PIN_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      zIndex={selected ? 300 : 200}
    >
      <View style={styles.pinWrap}>
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

function GeofenceNameMarkerBase({ latitude, longitude, name }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);

    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [name]);

  const coordinate = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude],
  );

  return (
    <Marker
      coordinate={coordinate}
      anchor={LABEL_ANCHOR}
      tracksViewChanges={tracksViewChanges}
      zIndex={150}
    >
      <View style={styles.geofenceLabel}>
        <Text style={styles.geofenceLabelText} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </Marker>
  );
}

const GeofenceNameMarker = memo(GeofenceNameMarkerBase);
GeofenceNameMarker.displayName = "GeofenceNameMarker";

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
  const [mapReady, setMapReady] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [mapAreaHeight, setMapAreaHeight] = useState(0);
  const [geofenceWaitOver, setGeofenceWaitOver] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

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
  const geofenceScopeMissing = !lmPcode || !wardPcode;
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

  const initialRegion = useMemo(
    () => regionForCoordinates([...coordinates, ...geofencePolygon]),
    [coordinates, geofencePolygon],
  );

  useEffect(() => {
    if (!visible) setMapReady(false);
    setSheet(null);
    fitStateRef.current = { points: false, geofence: false };
  }, [visible, bucketId]);

  // Fit once to the meters and once more when the geofence arrives; later row updates never move the map.
  useEffect(() => {
    if (!visible || !mapReady) return undefined;

    const fitted = fitStateRef.current;
    const needPoints = coordinates.length > 0 && !fitted.points;
    const needGeofence = geofencePolygon.length > 0 && !fitted.geofence;
    if (!needPoints && !needGeofence) return undefined;

    const timer = setTimeout(() => {
      fitStateRef.current = {
        points: fitted.points || coordinates.length > 0,
        geofence: fitted.geofence || geofencePolygon.length > 0,
      };
      moveMapToCoordinates(mapRef.current, [...coordinates, ...geofencePolygon]);
    }, 250);

    return () => clearTimeout(timer);
  }, [visible, mapReady, coordinates, geofencePolygon]);

  const selectedGroup =
    sheet?.kind === "GROUP"
      ? groups.find((group) => group?.key === sheet.key) || null
      : null;

  useEffect(() => {
    if (sheet?.kind === "GROUP" && !selectedGroup) setSheet(null);
    if (sheet?.kind === "UNPLACED" && unplaced.length === 0) setSheet(null);
  }, [sheet, selectedGroup, unplaced.length]);

  const handleMapReady = useCallback(() => setMapReady(true), []);
  const handleGroupPress = useCallback(
    (key) => setSheet({ kind: "GROUP", key }),
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
    ? SOURCE_NOTES[sheetSource] || ""
    : "Not drawn on the map";
  const sheetStatusLine = describeStatusCounts(
    selectedGroup ? selectedGroup.statusCounts : countRowStatuses(sheetRows),
  );
  const sheetMaxHeight = Math.round(
    mapAreaHeight > 0
      ? Math.max(160, Math.min(windowHeight * 0.6, mapAreaHeight - 24))
      : windowHeight * 0.6,
  );

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
                    { backgroundColor: STATUS_COLORS[status] },
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
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            showsUserLocation
            toolbarEnabled={false}
            moveOnMarkerPress={false}
            mapPadding={MAP_PADDING}
            initialRegion={initialRegion}
            onMapReady={handleMapReady}
          >
            {geofencePolygon.length > 0 ? (
              <Polygon
                coordinates={geofencePolygon}
                strokeColor={GEOFENCE_COLOR}
                fillColor={GEOFENCE_FILL}
                strokeWidth={3}
                zIndex={10}
              />
            ) : null}

            {geofenceLabelPoint && geofenceName ? (
              <GeofenceNameMarker
                latitude={geofenceLabelPoint.latitude}
                longitude={geofenceLabelPoint.longitude}
                name={geofenceName}
              />
            ) : null}

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

          {groups.length === 0 ? (
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
                          STATUS_COLORS[selectedGroup.status] ||
                          STATUS_COLORS.NOT_STARTED,
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
  },

  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
