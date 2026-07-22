import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getIn, useFormikContext } from "formik";
import { Fragment, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import {
  Button,
  IconButton,
  Menu,
  Modal,
  Portal,
  Surface,
} from "react-native-paper";
import { FormSection } from "../forms/FormSection";

const MIN_REQUIRED_MARKER_MOVE_M = 1;

const SovereignLocationPicker = ({
  label = "SITUATIONAL POSITIONING",
  name,
  initialGps = null,
  icon = "map-marker-radius",
  referenceBoundary = [],
  erfNo = "N/A",
  erfCentroid = null,
  disabled = false,

  // 🆕 NEW
  nearbyErfs = [],
  nearbyPremises = [],
  nearbyMeters = [],
}) => {
  const { values, setFieldValue, errors, touched, submitCount } =
    useFormikContext();

  const diagnosticIdRef = useRef(
    `SLP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  );
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const [modalVisible, setModalVisible] = useState(false);
  const [modalStartCoords, setModalStartCoords] = useState(null);
  const [hasMarkerMoved, setHasMarkerMoved] = useState(false);
  const [mapType, setMapType] = useState("standard");
  const [mapTypeMenuVisible, setMapTypeMenuVisible] = useState(false);

  const [showNeighbourhoods, setShowNeighbourhoods] = useState(true);
  const [selectedErfTracksViewChanges, setSelectedErfTracksViewChanges] =
    useState(true);

  const rawValue = getIn(values, name);
  const error = getIn(errors, name);
  const isTouched = getIn(touched, name);
  const hasError = !!error && (isTouched || submitCount > 0);

  useEffect(() => {
    console.log("🧪 [SLP_MOUNT]", {
      id: diagnosticIdRef.current,
      name,
      initialGps,
    });

    return () => {
      console.log("🧪 [SLP_UNMOUNT]", {
        id: diagnosticIdRef.current,
        name,
      });
    };
  }, [initialGps, name]);

  useEffect(() => {
    console.log("🧪 [SLP_RAW_VALUE_CHANGED]", {
      id: diagnosticIdRef.current,
      render: renderCountRef.current,
      name,
      rawValue,
      error,
      isTouched,
      submitCount,
      modalVisible,
    });
  }, [error, isTouched, modalVisible, name, rawValue, submitCount]);

  const getCoords = (val) => {
    if (Array.isArray(val) && val.length === 2) {
      return { latitude: val[0], longitude: val[1] };
    }

    if (val?.lat != null && val?.lng != null) {
      return { latitude: val.lat, longitude: val.lng };
    }

    if (val?.latitude != null && val?.longitude != null) {
      return { latitude: val.latitude, longitude: val.longitude };
    }

    if (Array.isArray(initialGps) && initialGps.length === 2) {
      return { latitude: initialGps[0], longitude: initialGps[1] };
    }

    if (initialGps?.lat != null && initialGps?.lng != null) {
      return { latitude: initialGps.lat, longitude: initialGps.lng };
    }

    if (Array.isArray(erfCentroid) && erfCentroid.length === 2) {
      return { latitude: erfCentroid[0], longitude: erfCentroid[1] };
    }

    if (erfCentroid?.lat != null && erfCentroid?.lng != null) {
      return { latitude: erfCentroid.lat, longitude: erfCentroid.lng };
    }

    return { latitude: -33.9249, longitude: 18.4241 };
  };

  const distanceBetweenCoordsM = (from, to) => {
    if (!from || !to) return 0;

    const fromLat = Number(from.latitude);
    const fromLng = Number(from.longitude);
    const toLat = Number(to.latitude);
    const toLng = Number(to.longitude);

    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      return 0;
    }

    const earthRadiusM = 6371000;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(toLat - fromLat);
    const deltaLng = toRadians(toLng - fromLng);
    const lat1 = toRadians(fromLat);
    const lat2 = toRadians(toLat);

    const haversine =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

    return 2 * earthRadiusM * Math.asin(Math.sqrt(haversine));
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

  const [tempCoords, setTempCoords] = useState(getCoords(rawValue));

  useEffect(() => {
    console.log("🧪 [SLP_MODAL_CHANGED]", {
      id: diagnosticIdRef.current,
      render: renderCountRef.current,
      modalVisible,
      rawValue,
      tempCoords,
    });

    if (modalVisible) {
      const nextTempCoords = getCoords(rawValue);

      console.log("🧪 [SLP_MODAL_OPEN_COORDS]", {
        id: diagnosticIdRef.current,
        rawValue,
        nextTempCoords,
      });

      setTempCoords(nextTempCoords);
      setModalStartCoords(nextTempCoords);
      setHasMarkerMoved(false);
      setMapType("standard");
      setMapTypeMenuVisible(false);
    }
  }, [modalVisible, rawValue]);

  const handleConfirm = async () => {
    if (!hasMarkerMoved) {
      console.warn("🧪 [SLP_CONFIRM_BLOCKED_PIN_NOT_MOVED]", {
        id: diagnosticIdRef.current,
        name,
        modalStartCoords,
        tempCoords,
      });

      return;
    }

    const finalValue = {
      lat: Number(tempCoords.latitude),
      lng: Number(tempCoords.longitude),
    };

    console.log("🧪 [SLP_CONFIRM_START]", {
      id: diagnosticIdRef.current,
      render: renderCountRef.current,
      name,
      tempCoords,
      rawValueBefore: rawValue,
      finalValue,
    });

    try {
      await setFieldValue(name, finalValue, true);

      console.log("🧪 [SLP_CONFIRM_FORMIK_DONE]", {
        id: diagnosticIdRef.current,
        name,
        finalValue,
        rawValueImmediatelyAfter: getIn(values, name),
      });

      requestAnimationFrame(() => {
        console.log("🧪 [SLP_CONFIRM_CLOSE_MODAL]", {
          id: diagnosticIdRef.current,
          name,
          finalValue,
        });

        setModalVisible(false);
      });
    } catch (confirmError) {
      console.error("🧪 [SLP_CONFIRM_ERROR]", {
        id: diagnosticIdRef.current,
        name,
        finalValue,
        message: confirmError?.message,
        stack: confirmError?.stack,
      });
    }
  };

  const handleMarkerDragEnd = (event) => {
    const nextCoords = event?.nativeEvent?.coordinate;

    if (!nextCoords) return;

    const normalizedCoords = {
      latitude: Number(nextCoords.latitude),
      longitude: Number(nextCoords.longitude),
    };

    const movedDistanceM = distanceBetweenCoordsM(
      modalStartCoords,
      normalizedCoords,
    );

    setTempCoords(normalizedCoords);
    setHasMarkerMoved(movedDistanceM >= MIN_REQUIRED_MARKER_MOVE_M);

    console.log("🧪 [SLP_MARKER_MOVED]", {
      id: diagnosticIdRef.current,
      name,
      modalStartCoords,
      nextCoords: normalizedCoords,
      movedDistanceM,
      moveRequiredM: MIN_REQUIRED_MARKER_MOVE_M,
      accepted: movedDistanceM >= MIN_REQUIRED_MARKER_MOVE_M,
    });
  };

  const currentCoordsRaw = getCoords(rawValue);
  const currentCoords = {
    latitude: Number(currentCoordsRaw.latitude),
    longitude: Number(currentCoordsRaw.longitude),
  };

  const selectedErfCoords = getCoords(erfCentroid);

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
    if (erf?.centroid?.latitude != null && erf?.centroid?.longitude != null) {
      return erf.centroid;
    }

    if (erf?.centroid?.lat != null && erf?.centroid?.lng != null) {
      return {
        latitude: Number(erf.centroid.lat),
        longitude: Number(erf.centroid.lng),
      };
    }

    const boundary = Array.isArray(erf?.boundary) ? erf.boundary : [];

    if (!boundary.length) return null;

    const validPoints = boundary
      .map((point) => ({
        latitude: Number(point?.latitude),
        longitude: Number(point?.longitude),
      }))
      .filter(
        (point) =>
          Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
      );

    if (!validPoints.length) return null;

    const sum = validPoints.reduce(
      (acc, point) => {
        acc.latitude += point.latitude;
        acc.longitude += point.longitude;
        return acc;
      },
      { latitude: 0, longitude: 0 },
    );

    return {
      latitude: sum.latitude / validPoints.length,
      longitude: sum.longitude / validPoints.length,
    };
  };

  useEffect(() => {
    if (!modalVisible) return;

    setSelectedErfTracksViewChanges(true);

    const timeout = setTimeout(() => {
      setSelectedErfTracksViewChanges(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, [modalVisible, erfNo, erfCentroid]);

  return (
    <FormSection title={label}>
      <View style={[styles.container, disabled && { opacity: 0.6 }]}>
        <TouchableOpacity
          disabled={disabled}
          activeOpacity={0.8}
          style={[
            styles.locationStatusCard,
            rawValue
              ? styles.locationStatusCardLocked
              : styles.locationStatusCardRequired,
            hasError && styles.previewError,
          ]}
          onPress={() => setModalVisible(true)}
        >
          <View
            style={[
              styles.locationStatusIcon,
              rawValue
                ? styles.locationStatusIconLocked
                : styles.locationStatusIconRequired,
            ]}
          >
            <MaterialCommunityIcons
              name={rawValue ? "crosshairs-gps" : icon}
              size={30}
              color={rawValue ? "#166534" : hasError ? "#b91c1c" : "#475569"}
            />
          </View>

          <Text
            style={[
              styles.locationStatusTitle,
              rawValue
                ? styles.locationStatusTitleLocked
                : styles.locationStatusTitleRequired,
            ]}
          >
            {rawValue ? "POSITION LOCKED" : "GPS POSITION REQUIRED"}
          </Text>

          {rawValue ? (
            <>
              <Text style={styles.locationStatusCoordinates}>
                Latitude: {currentCoords.latitude.toFixed(6)}
              </Text>

              <Text style={styles.locationStatusCoordinates}>
                Longitude: {currentCoords.longitude.toFixed(6)}
              </Text>

              <Text style={styles.locationStatusAction}>
                TAP TO RE-ADJUST POSITION
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.locationStatusMessage}>
                Open the locator and position the proposed Informal ERF.
              </Text>

              <Text style={styles.locationStatusAction}>
                TAP TO OPEN GPS LOCATOR
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Portal>
          <Modal
            visible={modalVisible}
            onDismiss={() => setModalVisible(false)}
            contentContainerStyle={styles.modalContainer}
          >
            <Surface style={styles.modalSurface}>
              <View style={styles.modalHeader}>
                <View
                  style={{
                    borderWidth: 0.5,
                    borderColor: "#cbd5e1",
                    // padding: 4,
                    borderRadius: 6,
                  }}
                >
                  <IconButton
                    icon="close"
                    size={24}
                    onPress={() => setModalVisible(false)}
                  />
                </View>

                <View style={styles.titleGroup}>
                  <Text style={styles.modalSubTitle}>ERF {erfNo}</Text>
                </View>

                <Menu
                  visible={mapTypeMenuVisible}
                  onDismiss={() => setMapTypeMenuVisible(false)}
                  anchor={
                    <TouchableOpacity
                      style={styles.mapTypeBtn}
                      onPress={() => setMapTypeMenuVisible(true)}
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
                        name="chevron-down"
                        size={18}
                        color="#0f172a"
                      />
                    </TouchableOpacity>
                  }
                >
                  <Menu.Item
                    onPress={() => {
                      setMapType("standard");
                      setMapTypeMenuVisible(false);
                    }}
                    title="NORMAL"
                  />
                  <Menu.Item
                    onPress={() => {
                      setMapType("satellite");
                      setMapTypeMenuVisible(false);
                    }}
                    title="SATELLITE"
                  />
                  <Menu.Item
                    onPress={() => {
                      setMapType("hybrid");
                      setMapTypeMenuVisible(false);
                    }}
                    title="HYBRID"
                  />
                </Menu>

                <TouchableOpacity
                  style={styles.contextBtn}
                  onPress={() => setShowNeighbourhoods((prev) => !prev)}
                >
                  <MaterialCommunityIcons
                    name={showNeighbourhoods ? "eye" : "eye-off"}
                    size={18}
                    color="#0f172a"
                  />
                  <Text style={styles.contextBtnText}>CONTEXT</Text>
                </TouchableOpacity>
              </View>

              {modalVisible && (
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.fullMap}
                  mapType={mapType}
                  showsUserLocation
                  showsMyLocationButton
                  initialRegion={{
                    ...tempCoords,
                    latitudeDelta: 0.0008,
                    longitudeDelta: 0.0008,
                  }}
                >
                  {referenceBoundary.length > 0 && (
                    <Polygon
                      coordinates={referenceBoundary}
                      strokeColor="#FFD700"
                      fillColor="rgba(255, 215, 0, 0.2)"
                      strokeWidth={4}
                    />
                  )}

                  {erfCentroid && (
                    <Marker
                      coordinate={selectedErfCoords}
                      anchor={{ x: 0.5, y: 0.5 }}
                      tracksViewChanges={selectedErfTracksViewChanges}
                      zIndex={20}
                    >
                      <View style={styles.selectedErfLabel}>
                        <Text style={styles.selectedErfLabelText}>{erfNo}</Text>
                      </View>
                    </Marker>
                  )}

                  {/* 🧭 NEIGHBOURHOODS */}
                  {showNeighbourhoods && (
                    <>
                      {/* 🔶 Nearby ERFs */}
                      {nearbyErfs.map((erf) => {
                        const labelCoordinate = getErfLabelCoordinate(erf);

                        return (
                          <Fragment key={`erf-context-${erf.id}`}>
                            {Array.isArray(erf.boundary) &&
                              erf.boundary.length > 0 && (
                                <Polygon
                                  coordinates={erf.boundary}
                                  strokeColor="#64748b"
                                  fillColor="rgba(100,116,139,0.1)"
                                  strokeWidth={1}
                                />
                              )}

                            {labelCoordinate && (
                              <Marker
                                coordinate={labelCoordinate}
                                anchor={{ x: 0.5, y: 0.5 }}
                                tracksViewChanges={false}
                                zIndex={10}
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

                      {/* 🔷 Nearby Premises */}
                      {nearbyPremises.map((prem) => (
                        <Marker
                          key={`prem-${prem.id}`}
                          coordinate={{
                            latitude: prem.coordinate?.lat,
                            longitude: prem.coordinate?.lng,
                          }}
                          title={`${prem?.address?.strNo || ""} ${prem?.address?.strName || ""}`}
                          description={`${prem?.propertyType?.type || "NAv"} • ${prem?.propertyType?.name || "NAv"} • ${prem?.propertyType?.unitNo || "NAv"}`}
                          pinColor="#1bbe57"
                        />
                      ))}

                      {/* ⚡ Nearby Meters */}
                      {nearbyMeters.map((meter) => (
                        <Marker
                          key={`meter-${meter.id}`}
                          coordinate={{
                            latitude: meter.coordinate?.lat,
                            longitude: meter.coordinate?.lng,
                          }}
                          pinColor={
                            meter.meterType === "water"
                              ? "#0ea5e9"
                              : meter.meterType === "electricity"
                                ? "#f59e0b"
                                : "#94a3b8"
                          }
                        />
                      ))}
                    </>
                  )}

                  <Marker
                    draggable
                    coordinate={tempCoords}
                    onDragEnd={handleMarkerDragEnd}
                    zIndex={40}
                    pinColor="#ce6b6b"
                    tracksViewChanges={true}
                  />
                </MapView>
              )}

              <View style={styles.modalFooter}>
                <Text
                  style={[
                    styles.markerMoveInstruction,
                    hasMarkerMoved && styles.markerMoveInstructionReady,
                  ]}
                >
                  {hasMarkerMoved
                    ? "PIN MOVED — POSITION READY TO CONFIRM"
                    : "MOVE THE RED PIN TO A NEW POSITION"}
                </Text>

                <Button
                  mode="contained"
                  onPress={handleConfirm}
                  disabled={!hasMarkerMoved}
                  style={[
                    styles.confirmBtn,
                    !hasMarkerMoved && styles.confirmBtnDisabled,
                  ]}
                  labelStyle={[
                    styles.confirmBtnLabel,
                    !hasMarkerMoved && styles.confirmBtnLabelDisabled,
                  ]}
                >
                  CONFIRM POSITION
                </Button>
              </View>
            </Surface>
          </Modal>
        </Portal>
      </View>
    </FormSection>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 10 },

  previewError: {
    borderColor: "#ef4444",
    borderLeftWidth: 8,
  },

  locationStatusCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
  },

  locationStatusCardRequired: {
    backgroundColor: "#f8fafc",
  },

  locationStatusCardLocked: {
    backgroundColor: "#f0fdf4",
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
    marginTop: 3,
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

  modalContainer: {
    flex: 1,
    margin: 5,
    justifyContent: "center",
  },

  modalSurface: {
    flex: 0.85,
    backgroundColor: "#fff",
    borderRadius: 10,
    overflow: "hidden",
  },

  modalHeader: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 10,
  },

  titleGroup: {
    flex: 1,
    alignItems: "center",
    // marginRight: 8,
    paddingVertical: 8,
    // minHeight: 40,
  },

  modalTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1e293b",
  },

  modalSubTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#0f172a",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 4,
    // marginTop: 4,
  },

  mapTypeBtn: {
    minWidth: 110,
    height: 34,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
  },

  mapTypeBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0f172a",
    marginHorizontal: 6,
    flex: 1,
    textAlign: "center",
  },

  fullMap: {
    flex: 1,
  },

  modalFooter: {
    padding: 20,
    backgroundColor: "#fff",
  },

  markerMoveInstruction: {
    marginBottom: 10,
    fontSize: 10,
    fontWeight: "900",
    color: "#b91c1c",
    textAlign: "center",
  },

  markerMoveInstructionReady: {
    color: "#166534",
  },

  confirmBtn: {
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
  },

  confirmBtnDisabled: {
    backgroundColor: "#e5e7eb",
  },

  confirmBtnLabel: {
    color: "#000",
    fontWeight: "900",
  },

  confirmBtnLabelDisabled: {
    color: "#9ca3af",
  },

  activeMarker: {
    alignItems: "center",
  },

  markerShadow: {
    width: 10,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 5,
    marginTop: -5,
  },

  contextBtn: {
    height: 34,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f8fafc",
  },

  contextBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0f172a",
  },
  selectedErfLabel: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#FFD700",
  },

  selectedErfLabelText: {
    color: "#848484",
    fontSize: 10,
    // fontWeight: "900",
  },
});

export default SovereignLocationPicker;
