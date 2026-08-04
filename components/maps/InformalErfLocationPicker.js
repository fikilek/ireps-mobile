import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getIn, useFormikContext } from "formik";
import { Fragment, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal as NativeModal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Marker,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import Svg, {
  Line as SvgLine,
  Polygon as SvgPolygon,
  Rect as SvgRect,
} from "react-native-svg";
import {
  Button,
  IconButton,
  Modal,
  Portal,
  Surface,
} from "react-native-paper";
import { FormSection } from "../forms/FormSection";

const FALLBACK_COORDS = {
  latitude: -33.9249,
  longitude: 18.4241,
};

const COORDINATE_EPSILON = 1e-9;

const toMapPoint = (value) => {
  if (Array.isArray(value) && value.length === 2) {
    const latitude = Number(value[0]);
    const longitude = Number(value[1]);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

const pointsAreEqual = (pointA, pointB) => {
  if (!pointA || !pointB) return false;

  return (
    Math.abs(pointA.latitude - pointB.latitude) <= COORDINATE_EPSILON &&
    Math.abs(pointA.longitude - pointB.longitude) <= COORDINATE_EPSILON
  );
};

const stripClosingPoint = (points = []) => {
  if (points.length < 2) return points;

  if (pointsAreEqual(points[0], points[points.length - 1])) {
    return points.slice(0, -1);
  }

  return points;
};

const normalizeBoundaryPoints = (value) => {
  if (!Array.isArray(value)) return [];

  const points = value.map(toMapPoint).filter(Boolean);
  return stripClosingPoint(points);
};

const getPreferredCenter = ({ boundary, rawValue, initialGps, erfCentroid }) => {
  if (boundary.length > 0) {
    const totals = boundary.reduce(
      (acc, point) => ({
        latitude: acc.latitude + point.latitude,
        longitude: acc.longitude + point.longitude,
      }),
      { latitude: 0, longitude: 0 },
    );

    return {
      latitude: totals.latitude / boundary.length,
      longitude: totals.longitude / boundary.length,
    };
  }

  return (
    toMapPoint(rawValue) ||
    toMapPoint(initialGps) ||
    toMapPoint(erfCentroid) ||
    FALLBACK_COORDS
  );
};

const buildRegion = (points = [], fallbackCenter = FALLBACK_COORDS) => {
  if (points.length === 0) {
    return {
      ...fallbackCenter,
      latitudeDelta: 0.0008,
      longitudeDelta: 0.0008,
    };
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.6, 0.0008),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.6, 0.0008),
  };
};

const pointIsOnSegment = (point, segmentStart, segmentEnd) => {
  const crossProduct =
    (point.longitude - segmentStart.longitude) *
      (segmentEnd.latitude - segmentStart.latitude) -
    (point.latitude - segmentStart.latitude) *
      (segmentEnd.longitude - segmentStart.longitude);

  if (Math.abs(crossProduct) > COORDINATE_EPSILON) return false;

  const minLongitude = Math.min(
    segmentStart.longitude,
    segmentEnd.longitude,
  );
  const maxLongitude = Math.max(
    segmentStart.longitude,
    segmentEnd.longitude,
  );
  const minLatitude = Math.min(segmentStart.latitude, segmentEnd.latitude);
  const maxLatitude = Math.max(segmentStart.latitude, segmentEnd.latitude);

  return (
    point.longitude >= minLongitude - COORDINATE_EPSILON &&
    point.longitude <= maxLongitude + COORDINATE_EPSILON &&
    point.latitude >= minLatitude - COORDINATE_EPSILON &&
    point.latitude <= maxLatitude + COORDINATE_EPSILON
  );
};

const pointIsInsidePolygon = (point, polygon = []) => {
  if (!point || polygon.length < 3) return false;

  for (let index = 0; index < polygon.length; index += 1) {
    const nextIndex = (index + 1) % polygon.length;

    if (pointIsOnSegment(point, polygon[index], polygon[nextIndex])) {
      return true;
    }
  }

  let inside = false;

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    const intersects =
      current.latitude > point.latitude !== previous.latitude > point.latitude &&
      point.longitude <
        ((previous.longitude - current.longitude) *
          (point.latitude - current.latitude)) /
          (previous.latitude - current.latitude) +
          current.longitude;

    if (intersects) inside = !inside;
  }

  return inside;
};

const getOrientation = (pointA, pointB, pointC) => {
  const value =
    (pointB.latitude - pointA.latitude) *
      (pointC.longitude - pointB.longitude) -
    (pointB.longitude - pointA.longitude) *
      (pointC.latitude - pointB.latitude);

  if (Math.abs(value) <= COORDINATE_EPSILON) return 0;
  return value > 0 ? 1 : 2;
};

const segmentsIntersect = (pointA, pointB, pointC, pointD) => {
  const orientation1 = getOrientation(pointA, pointB, pointC);
  const orientation2 = getOrientation(pointA, pointB, pointD);
  const orientation3 = getOrientation(pointC, pointD, pointA);
  const orientation4 = getOrientation(pointC, pointD, pointB);

  if (
    orientation1 !== orientation2 &&
    orientation3 !== orientation4
  ) {
    return true;
  }

  if (orientation1 === 0 && pointIsOnSegment(pointC, pointA, pointB)) {
    return true;
  }

  if (orientation2 === 0 && pointIsOnSegment(pointD, pointA, pointB)) {
    return true;
  }

  if (orientation3 === 0 && pointIsOnSegment(pointA, pointC, pointD)) {
    return true;
  }

  if (orientation4 === 0 && pointIsOnSegment(pointB, pointC, pointD)) {
    return true;
  }

  return false;
};

const polygonHasSelfIntersection = (points = []) => {
  if (points.length < 4) return false;

  for (let firstEdge = 0; firstEdge < points.length; firstEdge += 1) {
    const firstNext = (firstEdge + 1) % points.length;

    for (
      let secondEdge = firstEdge + 1;
      secondEdge < points.length;
      secondEdge += 1
    ) {
      const secondNext = (secondEdge + 1) % points.length;

      const edgesAreAdjacent =
        firstEdge === secondEdge ||
        firstNext === secondEdge ||
        secondNext === firstEdge;

      if (edgesAreAdjacent) continue;

      if (
        segmentsIntersect(
          points[firstEdge],
          points[firstNext],
          points[secondEdge],
          points[secondNext],
        )
      ) {
        return true;
      }
    }
  }

  return false;
};

const getUniquePointCount = (points = []) => {
  const uniquePoints = new Set(
    points.map(
      (point) =>
        `${point.latitude.toFixed(7)}:${point.longitude.toFixed(7)}`,
    ),
  );

  return uniquePoints.size;
};

const validateBoundaryDraft = (points = [], wardBoundary = []) => {
  if (points.length < 3) {
    return {
      isValid: false,
      insideWard: null,
      message: `Add ${3 - points.length} more point${points.length === 2 ? "" : "s"}.`,
    };
  }

  if (getUniquePointCount(points) !== points.length) {
    return {
      isValid: false,
      insideWard: null,
      message: "Boundary points must be unique.",
    };
  }

  if (polygonHasSelfIntersection(points)) {
    return {
      isValid: false,
      insideWard: null,
      message: "Boundary lines must not cross.",
    };
  }

  const insideWard =
    wardBoundary.length >= 3
      ? points.every((point) => pointIsInsidePolygon(point, wardBoundary))
      : null;

  if (insideWard === false) {
    return {
      isValid: false,
      insideWard,
      message: "Move every point inside the selected ward.",
    };
  }

  return {
    isValid: true,
    insideWard,
    message: "Ready to confirm.",
  };
};

const InformalErfLocationPicker = ({
  label = "INFORMAL ERF BOUNDARY",
  name,
  initialGps = null,
  icon = "vector-polygon",
  referenceBoundary = [],
  erfNo = "N/A",
  erfCentroid = null,
  disabled = false,
  nearbyErfs = [],
  nearbyPremises = [],
  nearbyMeters = [],
}) => {
  const { values, setFieldValue, errors, touched, submitCount } =
    useFormikContext();

  const mapRef = useRef(null);
  const mapTypeButtonRef = useRef(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [mapType, setMapType] = useState("standard");
  const [mapTypeMenuVisible, setMapTypeMenuVisible] = useState(false);
  const [mapTypeMenuPosition, setMapTypeMenuPosition] = useState({
    top: 0,
    left: 8,
    width: 150,
  });
  const [showNeighbourhoods, setShowNeighbourhoods] = useState(true);
  const [tempPoints, setTempPoints] = useState([]);
  const [mapSession, setMapSession] = useState(0);

  const rawValue = getIn(values, name);
  const error = getIn(errors, name);
  const isTouched = getIn(touched, name);
  const hasError = !!error && (isTouched || submitCount > 0);

  const currentBoundary = useMemo(
    () => normalizeBoundaryPoints(rawValue),
    [rawValue],
  );

  const wardBoundary = useMemo(
    () => normalizeBoundaryPoints(referenceBoundary),
    [referenceBoundary],
  );

  const initialCenter = useMemo(
    () =>
      getPreferredCenter({
        boundary: currentBoundary,
        rawValue,
        initialGps,
        erfCentroid,
      }),
    [currentBoundary, rawValue, initialGps, erfCentroid],
  );

  const previewPolygonPoints = useMemo(() => {
    if (currentBoundary.length < 3) return "";

    const latitudes = currentBoundary.map((point) => point.latitude);
    const longitudes = currentBoundary.map((point) => point.longitude);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const latitudeRange = Math.max(maxLatitude - minLatitude, 1e-9);
    const longitudeRange = Math.max(maxLongitude - minLongitude, 1e-9);
    const padding = 12;
    const drawableSize = 100 - padding * 2;

    return currentBoundary
      .map((point) => {
        const x =
          padding +
          ((point.longitude - minLongitude) / longitudeRange) * drawableSize;
        const y =
          padding +
          ((maxLatitude - point.latitude) / latitudeRange) * drawableSize;

        return `${x},${y}`;
      })
      .join(" ");
  }, [currentBoundary]);

  const draftValidation = useMemo(
    () => validateBoundaryDraft(tempPoints, wardBoundary),
    [tempPoints, wardBoundary],
  );

  const handleOpenModal = () => {
    setTempPoints(currentBoundary);
    setMapType("standard");
    setMapTypeMenuVisible(false);
    setMapSession((previous) => previous + 1);
    setModalVisible(true);
  };

  const getMapTypeLabel = (type) => {
    if (type === "satellite") return "SATELLITE";
    if (type === "hybrid") return "HYBRID";
    return "NORMAL";
  };

  const getMapTypeIcon = (type) => {
    if (type === "satellite") return "satellite-variant";
    if (type === "hybrid") return "layers";
    return "map-outline";
  };

  const handleToggleMapTypeMenu = () => {
    if (mapTypeMenuVisible) {
      setMapTypeMenuVisible(false);
      return;
    }

    requestAnimationFrame(() => {
      mapTypeButtonRef.current?.measureInWindow((x, y, width, height) => {
        const screenWidth = Dimensions.get("window").width;
        const menuWidth = Math.max(width, 150);
        const clampedLeft = Math.min(
          Math.max(8, x),
          Math.max(8, screenWidth - menuWidth - 8),
        );

        setMapTypeMenuPosition({
          top: y + height + 4,
          left: clampedLeft,
          width: menuWidth,
        });
        setMapTypeMenuVisible(true);
      });
    });
  };

  const handleMapTypeSelect = (nextMapType) => {
    setMapType(nextMapType);
    setMapTypeMenuVisible(false);
  };

  const handleMapPress = (event) => {
    const nextPoint = toMapPoint(event?.nativeEvent?.coordinate);
    if (!nextPoint) return;

    if (
      wardBoundary.length >= 3 &&
      !pointIsInsidePolygon(nextPoint, wardBoundary)
    ) {
      Alert.alert(
        "Outside Ward Boundary",
        "Informal ERF boundary points must be placed inside the selected ward.",
      );
      return;
    }

    setTempPoints((previous) => [...previous, nextPoint]);
  };

  const handleVertexDragEnd = (index, event) => {
    const nextPoint = toMapPoint(event?.nativeEvent?.coordinate);
    if (!nextPoint) return;

    setTempPoints((previous) =>
      previous.map((point, pointIndex) =>
        pointIndex === index ? nextPoint : point,
      ),
    );
  };

  const handleUndo = () => {
    setTempPoints((previous) => previous.slice(0, -1));
  };

  const handleClear = () => {
    setTempPoints([]);
  };

  const handleCenterMap = () => {
    const devicePosition = toMapPoint(initialGps);
    const targetRegion = devicePosition
      ? buildRegion([], devicePosition)
      : buildRegion(tempPoints, initialCenter);

    mapRef.current?.animateToRegion(targetRegion, 350);
  };

  const handleConfirm = () => {
    if (!draftValidation.isValid) return;

    const boundaryPoints = tempPoints.map((point) => ({
      lat: Number(point.latitude),
      lng: Number(point.longitude),
    }));

    setModalVisible(false);
    void setFieldValue(name, boundaryPoints, true);
  };

  const getErfLabel = (erf = {}) => {
    return (
      erf?.erfNo ||
      erf?.erf_no ||
      erf?.erfNumber ||
      erf?.sg?.erfNo ||
      erf?.sg?.parcelNo ||
      erf?.parcelNo ||
      erf?.code ||
      "NAv"
    );
  };

  const getErfLabelCoordinate = (erf = {}) => {
    const explicitCentroid = toMapPoint(erf?.centroid);
    if (explicitCentroid) return explicitCentroid;

    const boundary = normalizeBoundaryPoints(erf?.boundary);
    if (boundary.length === 0) return null;

    return getPreferredCenter({ boundary });
  };

  const getContextCoordinate = (item = {}) => {
    return toMapPoint(item?.coordinate || item?.centroid || item?.location);
  };

  const modalInitialRegion = buildRegion(tempPoints, initialCenter);
  const hasBoundary = currentBoundary.length >= 3;
  const pointCount = tempPoints.length;

  const insideWardText =
    draftValidation.insideWard === true
      ? "YES"
      : draftValidation.insideWard === false
        ? "NO"
        : "N/A";

  const modalHeading =
    erfNo && erfNo !== "N/A" ? `ERF ${erfNo}` : "INFORMAL ERF";

  return (
    <FormSection title={label}>
      <View style={[styles.container, disabled && styles.disabled]}>
        <View>
          <View
            style={[
              styles.previewMapShell,
              hasBoundary && styles.previewMapShellCaptured,
              hasError && styles.previewMapShellError,
            ]}
          >
            {hasBoundary && (
              <Svg
                pointerEvents="none"
                viewBox="0 0 100 100"
                preserveAspectRatio="xMidYMid meet"
                style={styles.previewBoundaryCanvas}
              >
                <SvgRect
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  fill="rgba(219, 234, 254, 0.72)"
                />
                {[20, 40, 60, 80].map((position) => (
                  <Fragment key={`preview-grid-${position}`}>
                    <SvgLine
                      x1={position}
                      y1="0"
                      x2={position}
                      y2="100"
                      stroke="rgba(100, 116, 139, 0.18)"
                      strokeWidth="0.5"
                    />
                    <SvgLine
                      x1="0"
                      y1={position}
                      x2="100"
                      y2={position}
                      stroke="rgba(100, 116, 139, 0.18)"
                      strokeWidth="0.5"
                    />
                  </Fragment>
                ))}
                <SvgPolygon
                  points={previewPolygonPoints}
                  fill="rgba(37, 99, 235, 0.38)"
                  stroke="#1d4ed8"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
              </Svg>
            )}

            {hasBoundary ? (
              <View pointerEvents="none" style={styles.previewCapturedOverlay}>
                <View style={styles.previewCapturedTopRow}>
                  <View style={styles.previewCapturedStatusBadge}>
                    <MaterialCommunityIcons
                      name="check-decagram-outline"
                      size={17}
                      color="#166534"
                    />
                    <Text style={styles.previewCapturedStatusText}>
                      BOUNDARY CAPTURED
                    </Text>
                  </View>

                  <View style={styles.previewPointCountBadge}>
                    <Text style={styles.previewPointCountText}>
                      {currentBoundary.length} POINTS
                    </Text>
                  </View>
                </View>

                <View style={styles.previewCapturedActionBadge}>
                  <Text style={styles.previewCapturedActionText}>
                    TAP TO REVIEW OR ADJUST BOUNDARY
                  </Text>
                </View>
              </View>
            ) : (
              <View pointerEvents="none" style={styles.previewOverlay}>
                <View
                  style={[
                    styles.locationStatusIcon,
                    styles.locationStatusIconRequired,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={icon}
                    size={30}
                    color={hasError ? "#b91c1c" : "#475569"}
                  />
                </View>

                <Text
                  style={[
                    styles.locationStatusTitle,
                    styles.locationStatusTitleRequired,
                  ]}
                >
                  ERF BOUNDARY REQUIRED
                </Text>

                <Text style={styles.locationStatusMessage}>
                  Open the map and tap around the Informal ERF boundary.
                </Text>

                <Text style={styles.locationStatusAction}>
                  TAP TO DRAW THE BOUNDARY
                </Text>
              </View>
            )}

            <Pressable
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={
                hasBoundary
                  ? "Review or adjust the Informal ERF boundary"
                  : "Draw the Informal ERF boundary"
              }
              onPress={handleOpenModal}
              style={styles.previewPressTarget}
            />
          </View>
        </View>

        {hasError && (
          <Text style={styles.errorText}>
            {typeof error === "string"
              ? error
              : "A valid Informal ERF boundary is required."}
          </Text>
        )}

        {modalVisible && (
          <Portal>
            <Modal
              visible
              onDismiss={() => setModalVisible(false)}
              contentContainerStyle={styles.modalContainer}
            >
            <Surface style={styles.modalSurface}>
              <View style={styles.modalHeader}>
                <IconButton
                  icon="close"
                  size={24}
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                />

                <View style={styles.titleGroup}>
                  <Text style={styles.modalTitle}>{modalHeading}</Text>
                  <Text style={styles.modalSubTitle}>
                    Draw the boundary on the map
                  </Text>
                </View>

                <TouchableOpacity
                  ref={mapTypeButtonRef}
                  style={styles.mapTypeBtn}
                  onPress={handleToggleMapTypeMenu}
                >
                  <MaterialCommunityIcons
                    name={getMapTypeIcon(mapType)}
                    size={18}
                    color="#0f172a"
                  />
                  <Text style={styles.mapTypeBtnText}>
                    {getMapTypeLabel(mapType)}
                  </Text>
                  <MaterialCommunityIcons
                    name={mapTypeMenuVisible ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#0f172a"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.contextBtn}
                  onPress={() => setShowNeighbourhoods((previous) => !previous)}
                >
                  <MaterialCommunityIcons
                    name={showNeighbourhoods ? "eye" : "eye-off"}
                    size={18}
                    color="#0f172a"
                  />
                  <Text style={styles.contextBtnText}>CONTEXT</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoBar}>
                <View style={styles.infoBarItem}>
                  <Text style={styles.infoBarLabel}>POINTS</Text>
                  <Text style={styles.infoBarValue}>{pointCount}</Text>
                </View>

                <View style={[styles.infoBarItem, styles.infoBarItemMiddle]}>
                  <Text style={styles.infoBarLabel}>STATUS</Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.infoBarValue,
                      draftValidation.isValid
                        ? styles.statusValid
                        : styles.statusInvalid,
                    ]}
                  >
                    {draftValidation.message}
                  </Text>
                </View>

                <View style={styles.infoBarItem}>
                  <Text style={styles.infoBarLabel}>INSIDE WARD</Text>
                  <Text
                    style={[
                      styles.infoBarValue,
                      draftValidation.insideWard === false
                        ? styles.statusInvalid
                        : draftValidation.insideWard === true
                          ? styles.statusValid
                          : null,
                    ]}
                  >
                    {insideWardText}
                  </Text>
                </View>
              </View>

              <MapView
                key={`informal-erf-boundary-map-${mapSession}`}
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.fullMap}
                mapType={mapType}
                initialRegion={modalInitialRegion}
                onPress={handleMapPress}
              >
                {wardBoundary.length >= 3 && (
                  <Polygon
                    coordinates={wardBoundary}
                    strokeColor="#f59e0b"
                    fillColor="rgba(245,158,11,0.08)"
                    strokeWidth={2}
                  />
                )}

                {showNeighbourhoods && (
                  <>
                    {nearbyErfs.map((erf) => {
                      const erfBoundary = normalizeBoundaryPoints(erf?.boundary);
                      const labelCoordinate = getErfLabelCoordinate(erf);

                      return (
                        <Fragment key={`erf-context-${erf.id}`}>
                          {erfBoundary.length >= 3 && (
                            <Polygon
                              coordinates={erfBoundary}
                              strokeColor="#64748b"
                              fillColor="rgba(100,116,139,0.10)"
                              strokeWidth={1}
                            />
                          )}

                          {labelCoordinate && (
                            <Marker
                              coordinate={labelCoordinate}
                              anchor={{ x: 0.5, y: 0.5 }}
                              tracksViewChanges={false}
                              zIndex={10}
                              onPress={(event) =>
                                event?.stopPropagation?.()
                              }
                            >
                              <View style={styles.neighbourErfLabel}>
                                <Text style={styles.neighbourErfLabelText}>
                                  {getErfLabel(erf)}
                                </Text>
                              </View>
                            </Marker>
                          )}
                        </Fragment>
                      );
                    })}

                    {nearbyPremises.map((premise) => {
                      const coordinate = getContextCoordinate(premise);
                      if (!coordinate) return null;

                      return (
                        <Marker
                          key={`prem-${premise.id}`}
                          coordinate={coordinate}
                          title={`${premise?.address?.strNo || ""} ${premise?.address?.strName || ""}`.trim()}
                          description={`${premise?.propertyType?.type || "NAv"} • ${premise?.propertyType?.name || "NAv"} • ${premise?.propertyType?.unitNo || "NAv"}`}
                          pinColor="#1bbe57"
                          onPress={(event) => event?.stopPropagation?.()}
                        />
                      );
                    })}

                    {nearbyMeters.map((meter) => {
                      const coordinate = getContextCoordinate(meter);
                      if (!coordinate) return null;

                      return (
                        <Marker
                          key={`meter-${meter.id}`}
                          coordinate={coordinate}
                          pinColor={
                            meter.meterType === "water"
                              ? "#0ea5e9"
                              : meter.meterType === "electricity"
                                ? "#f59e0b"
                                : "#94a3b8"
                          }
                          onPress={(event) => event?.stopPropagation?.()}
                        />
                      );
                    })}
                  </>
                )}

                {tempPoints.length === 2 && (
                  <Polyline
                    coordinates={tempPoints}
                    strokeColor="#2563eb"
                    strokeWidth={3}
                    zIndex={30}
                  />
                )}

                {tempPoints.length >= 3 && (
                  <Polygon
                    coordinates={tempPoints}
                    strokeColor={
                      draftValidation.isValid ? "#2563eb" : "#dc2626"
                    }
                    fillColor={
                      draftValidation.isValid
                        ? "rgba(37,99,235,0.24)"
                        : "rgba(220,38,38,0.16)"
                    }
                    strokeWidth={3}
                    zIndex={30}
                  />
                )}

                {tempPoints.map((point, index) => (
                  <Marker
                    key={`informal-erf-vertex-${index}`}
                    draggable
                    coordinate={point}
                    anchor={{ x: 0.5, y: 0.5 }}
                    zIndex={40 + index}
                    tracksViewChanges
                    onDragEnd={(event) => handleVertexDragEnd(index, event)}
                    onPress={(event) => event?.stopPropagation?.()}
                  >
                    <View
                      style={[
                        styles.vertexMarker,
                        !draftValidation.isValid &&
                          pointCount >= 3 &&
                          styles.vertexMarkerInvalid,
                      ]}
                    >
                      <Text style={styles.vertexMarkerText}>{index + 1}</Text>
                    </View>
                  </Marker>
                ))}
              </MapView>

              <View style={styles.modalFooter}>
                <Text style={styles.positionInstruction}>
                  Tap the map to add points. Drag a numbered point to correct the
                  boundary.
                </Text>

                <View style={styles.drawingActions}>
                  <TouchableOpacity
                    style={[
                      styles.drawingActionButton,
                      pointCount === 0 && styles.actionDisabled,
                    ]}
                    disabled={pointCount === 0}
                    onPress={handleUndo}
                  >
                    <MaterialCommunityIcons name="undo" size={19} />
                    <Text style={styles.drawingActionText}>UNDO</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.drawingActionButton,
                      pointCount === 0 && styles.actionDisabled,
                    ]}
                    disabled={pointCount === 0}
                    onPress={handleClear}
                  >
                    <MaterialCommunityIcons
                      name="delete-outline"
                      size={19}
                    />
                    <Text style={styles.drawingActionText}>CLEAR</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.drawingActionButton}
                    onPress={handleCenterMap}
                  >
                    <MaterialCommunityIcons
                      name="crosshairs-gps"
                      size={19}
                    />
                    <Text style={styles.drawingActionText}>MY LOCATION</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.confirmActions}>
                  <Button
                    mode="outlined"
                    onPress={() => setModalVisible(false)}
                    style={styles.cancelBtn}
                    labelStyle={styles.cancelBtnLabel}
                  >
                    CANCEL
                  </Button>

                  <Button
                    mode="contained"
                    onPress={handleConfirm}
                    disabled={!draftValidation.isValid}
                    icon="check"
                    style={styles.confirmBtn}
                    labelStyle={styles.confirmBtnLabel}
                  >
                    CONFIRM BOUNDARY
                  </Button>
                </View>
              </View>
            </Surface>
            </Modal>
          </Portal>
        )}

        <NativeModal
          transparent
          visible={mapTypeMenuVisible}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setMapTypeMenuVisible(false)}
        >
          <Pressable
            style={styles.nativeMenuBackdrop}
            onPress={() => setMapTypeMenuVisible(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={[
                styles.nativeMenuPanel,
                {
                  top: mapTypeMenuPosition.top,
                  left: mapTypeMenuPosition.left,
                  width: mapTypeMenuPosition.width,
                },
              ]}
            >
              {[
                { value: "standard", label: "NORMAL", icon: "map-outline" },
                {
                  value: "satellite",
                  label: "SATELLITE",
                  icon: "satellite-variant",
                },
                { value: "hybrid", label: "HYBRID", icon: "layers" },
              ].map((option) => {
                const isSelected = mapType === option.value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.75}
                    style={[
                      styles.nativeMenuItem,
                      isSelected && styles.nativeMenuItemSelected,
                    ]}
                    onPress={() => handleMapTypeSelect(option.value)}
                  >
                    <MaterialCommunityIcons
                      name={option.icon}
                      size={19}
                      color={isSelected ? "#1d4ed8" : "#334155"}
                    />
                    <Text
                      style={[
                        styles.nativeMenuItemText,
                        isSelected && styles.nativeMenuItemTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons
                        name="check"
                        size={19}
                        color="#1d4ed8"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        </NativeModal>
      </View>
    </FormSection>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },

  disabled: {
    opacity: 0.6,
  },

  previewMapShell: {
    height: 205,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    position: "relative",
    overflow: "hidden",
  },

  previewMapShellError: {
    borderColor: "#ef4444",
    borderLeftWidth: 8,
  },

  previewMapShellCaptured: {
    borderColor: "#86efac",
    backgroundColor: "#dbeafe",
  },

  previewBoundaryCanvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },

  previewPressTarget: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },

  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "rgba(255, 255, 255, 0.56)",
    borderRadius: 12,
  },

  previewCapturedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 9,
    zIndex: 10,
  },

  previewCapturedTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },

  previewCapturedStatusBadge: {
    maxWidth: "72%",
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(240, 253, 244, 0.94)",
    borderWidth: 1,
    borderColor: "#86efac",
  },

  previewCapturedStatusText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#166534",
  },

  previewPointCountBadge: {
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 246, 255, 0.94)",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },

  previewPointCountText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#1d4ed8",
  },

  previewCapturedActionBadge: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.86)",
  },

  previewCapturedActionText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
    textAlign: "center",
  },

  locationStatusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  locationStatusIconRequired: {
    backgroundColor: "#e2e8f0",
  },

  locationStatusIconLocked: {
    backgroundColor: "#dcfce7",
  },

  locationStatusTitle: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  locationStatusTitleRequired: {
    color: "#334155",
  },

  locationStatusTitleLocked: {
    color: "#166534",
  },

  locationStatusCoordinates: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },

  locationStatusMessage: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 15,
    color: "#64748b",
    textAlign: "center",
  },

  locationStatusAction: {
    marginTop: 7,
    fontSize: 9,
    fontWeight: "900",
    color: "#475569",
    textAlign: "center",
  },

  errorText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: "#b91c1c",
  },

  modalContainer: {
    flex: 1,
    margin: 5,
    justifyContent: "center",
  },

  modalSurface: {
    flex: 0.94,
    backgroundColor: "#fff",
    borderRadius: 10,
    overflow: "hidden",
  },

  modalHeader: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 8,
  },

  closeButton: {
    margin: 0,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    borderRadius: 6,
  },

  titleGroup: {
    flex: 1,
    minWidth: 90,
  },

  modalTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
  },

  modalSubTitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
  },

  mapTypeBtn: {
    minWidth: 104,
    height: 34,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
  },

  mapTypeBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#0f172a",
    marginHorizontal: 4,
    flex: 1,
    textAlign: "center",
  },

  contextBtn: {
    height: 34,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f8fafc",
  },

  contextBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#0f172a",
  },

  nativeMenuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
  },

  nativeMenuPanel: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },

  nativeMenuItem: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },

  nativeMenuItemSelected: {
    backgroundColor: "#eff6ff",
  },

  nativeMenuItemText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
  },

  nativeMenuItemTextSelected: {
    color: "#1d4ed8",
  },

  infoBar: {
    minHeight: 58,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },

  infoBarItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 7,
  },

  infoBarItemMiddle: {
    flex: 1.8,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#e2e8f0",
  },

  infoBarLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: "#64748b",
  },

  infoBarValue: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },

  statusValid: {
    color: "#15803d",
  },

  statusInvalid: {
    color: "#b91c1c",
  },

  fullMap: {
    flex: 1,
  },

  neighbourErfLabel: {
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#64748b",
  },

  neighbourErfLabelText: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "800",
  },

  vertexMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    borderWidth: 2,
    borderColor: "#ffffff",
    elevation: 5,
  },

  vertexMarkerInvalid: {
    backgroundColor: "#dc2626",
  },

  vertexMarkerText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },

  modalFooter: {
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },

  positionInstruction: {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },

  drawingActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  drawingActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 5,
  },

  drawingActionText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#1e293b",
  },

  actionDisabled: {
    opacity: 0.4,
  },

  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },

  cancelBtn: {
    flex: 0.8,
    borderRadius: 10,
    borderColor: "#94a3b8",
  },

  cancelBtnLabel: {
    color: "#334155",
    fontWeight: "900",
    fontSize: 11,
  },

  confirmBtn: {
    flex: 1.4,
    backgroundColor: "#2563eb",
    borderRadius: 10,
  },

  confirmBtnLabel: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 11,
  },
});

export default InformalErfLocationPicker;
