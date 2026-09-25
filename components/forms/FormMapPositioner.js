import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getIn, useFormikContext } from "formik";
import { useMemo, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { Button, Menu, Modal, Portal } from "react-native-paper";
import { useWarehouse } from "../../src/context/WarehouseContext";
import { FORM_TEXT } from "../../src/theme/formColors";

const { height } = Dimensions.get("window");

function isSamePoint(a, b, tolerance = 0.000001) {
  if (!a || !b) return false;

  const aLat = Number(a?.lat);
  const aLng = Number(a?.lng);
  const bLat = Number(b?.lat);

  const bLng = Number(b?.lng);

  if (
    Number.isNaN(aLat) ||
    Number.isNaN(aLng) ||
    Number.isNaN(bLat) ||
    Number.isNaN(bLng)
  ) {
    return false;
  }

  return Math.abs(aLat - bLat) < tolerance && Math.abs(aLng - bLng) < tolerance;
}

function getPremiseUnitLabel(prem = {}) {
  const unitNo = prem?.propertyType?.unitNo;
  const unitName = prem?.propertyType?.name;

  if (unitNo && unitNo !== "NAv") return String(unitNo);
  if (unitName && unitName !== "NAv") return String(unitName);

  return "";
}

const FormMapPositioner = ({
  label = "Physical Asset Positioning",
  name,
  erfId,
  defaultLocation,
}) => {
  const [showMap, setShowMap] = useState(false);
  const [mapType, setMapType] = useState("standard");
  const [mapTypeMenuVisible, setMapTypeMenuVisible] = useState(false);

  const { all } = useWarehouse();
  const { values, errors, setFieldValue } = useFormikContext();

  const targetGeo = all?.geoLibrary?.[erfId] || null;

  const startLat = defaultLocation?.lat ?? targetGeo?.centroid?.lat ?? -34.028;
  const startLng = defaultLocation?.lng ?? targetGeo?.centroid?.lng ?? 23.076;

  const erfCoordinates = useMemo(() => {
    if (!targetGeo?.geometry) return null;

    let geometryObj = targetGeo.geometry;

    if (typeof geometryObj === "string") {
      try {
        geometryObj = JSON.parse(geometryObj);
      } catch (e) {
        return null;
      }
    }

    if (!geometryObj?.coordinates) return null;

    const raw =
      geometryObj.type === "MultiPolygon"
        ? geometryObj.coordinates?.[0]?.[0]
        : geometryObj.coordinates?.[0];

    if (!Array.isArray(raw)) return null;

    return raw.map((c) => ({
      latitude: c[1],
      longitude: c[0],
    }));
  }, [targetGeo]);

  const fieldError = getIn(errors, name);
  const hasError = !!fieldError;

  const currentLocation = getIn(values, name);

  const resolvedLocation = useMemo(
    () =>
      currentLocation &&
      typeof currentLocation === "object" &&
      typeof currentLocation.lat === "number" &&
      typeof currentLocation.lng === "number"
        ? currentLocation
        : { lat: startLat, lng: startLng },
    [currentLocation, startLat, startLng],
  );

  const hasValidCurrentPoint =
    currentLocation &&
    typeof currentLocation === "object" &&
    typeof currentLocation.lat === "number" &&
    typeof currentLocation.lng === "number";

  const hasValidDefaultPoint =
    defaultLocation &&
    typeof defaultLocation === "object" &&
    typeof defaultLocation.lat === "number" &&
    typeof defaultLocation.lng === "number";

  const isVerified =
    hasValidCurrentPoint &&
    hasValidDefaultPoint &&
    !isSamePoint(currentLocation, defaultLocation);

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

  const existingPremises = useMemo(() => {
    return (all?.prems || []).filter((prem) => {
      if (!prem?.id) return false;
      if (prem?.parents?.erfId !== erfId && prem?.erfId !== erfId) return false;

      const lat = prem?.geometry?.centroid?.lat;
      const lng = prem?.geometry?.centroid?.lng;

      if (typeof lat !== "number" || typeof lng !== "number") return false;

      const sameAsCurrent = isSamePoint(
        { lat, lng },
        resolvedLocation,
        0.0000001,
      );

      return !sameAsCurrent;
    });
  }, [all?.prems, erfId, resolvedLocation]);

  const existingMeters = useMemo(() => {
    return (all?.meters || []).filter((meter) => {
      if (!meter?.id) return false;
      if (meter?.accessData?.erfId !== erfId) return false;

      const lat = meter?.ast?.location?.gps?.lat;
      const lng = meter?.ast?.location?.gps?.lng;

      return typeof lat === "number" && typeof lng === "number";
    });
  }, [all?.meters, erfId]);

  const erfCentroidCoords = useMemo(() => {
    const lat = targetGeo?.centroid?.lat;
    const lng = targetGeo?.centroid?.lng;

    if (typeof lat !== "number" || typeof lng !== "number") return null;

    return {
      latitude: lat,
      longitude: lng,
    };
  }, [targetGeo]);

  const handleDragEnd = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;

    setFieldValue(name, {
      lat: latitude,
      lng: longitude,
    });

    console.log(`📡 [POSITION SECURED]: ${latitude}, ${longitude}`);
  };

  const handleOpenMap = () => {
    setMapType("standard");
    setMapTypeMenuVisible(false);
    setShowMap(true);
  };

  const handleCloseMap = () => {
    setMapTypeMenuVisible(false);
    setShowMap(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.topLabel}>{label}</Text>

      <TouchableOpacity
        onPress={handleOpenMap}
        style={[styles.selector, hasError && styles.errorBorder]}
      >
        <View style={styles.row}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isVerified ? "#dcfce7" : "#fee2e2" },
            ]}
          >
            <MaterialCommunityIcons
              name={isVerified ? "map-marker-check" : "map-marker-alert"}
              size={24}
              color={isVerified ? "#059669" : "#dc2626"}
            />
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.selectorValue}>
              {isVerified
                ? `${resolvedLocation.lat.toFixed(6)}° , ${resolvedLocation.lng.toFixed(6)}°`
                : "VERIFY PREMISE POSITION"}
            </Text>

            <Text style={styles.actionText}>
              {isVerified
                ? "Coordinate Lock Secured"
                : "Long-press & Drag pin to verify"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <Portal>
        <Modal
          visible={showMap}
          onDismiss={handleCloseMap}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>DRAG PIN TO PHYSICAL ASSET</Text>

            <View style={styles.modalControlsRow}>
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

              <View style={styles.modalBtnRow}>
                <Button
                  mode="outlined"
                  onPress={handleCloseMap}
                  textColor="#475569"
                  style={styles.cancelBtn}
                >
                  CANCEL
                </Button>

                <Button
                  mode="contained"
                  onPress={handleCloseMap}
                  buttonColor="#059669"
                  disabled={!isVerified}
                >
                  DONE
                </Button>
              </View>
            </View>
          </View>

          <View style={styles.mapWrapper}>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              mapType={mapType}
              showsUserLocation={true}
              showsMyLocationButton={true}
              initialRegion={{
                latitude: resolvedLocation.lat,
                longitude: resolvedLocation.lng,
                latitudeDelta: 0.00035,
                longitudeDelta: 0.00035,
              }}
            >
              {erfCoordinates && (
                <Polygon
                  coordinates={erfCoordinates}
                  strokeColor="#059669"
                  fillColor="rgba(5, 150, 105, 0.15)"
                  strokeWidth={3}
                />
              )}

              {erfCentroidCoords && (
                <Marker
                  coordinate={erfCentroidCoords}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={true}
                  zIndex={5}
                >
                  <View style={styles.erfCentroidSquare} />
                </Marker>
              )}

              {existingPremises.map((prem) => {
                const unitLabel = getPremiseUnitLabel(prem);

                return (
                  <Marker
                    key={`existing-prem-${prem.id}`}
                    coordinate={{
                      latitude: prem.geometry.centroid.lat,
                      longitude: prem.geometry.centroid.lng,
                    }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={true}
                    zIndex={6}
                  >
                    <View style={styles.existingPremiseWrap}>
                      {!!unitLabel && (
                        <View style={styles.existingPremiseLabel}>
                          <Text style={styles.existingPremiseLabelText}>
                            {unitLabel}
                          </Text>
                        </View>
                      )}
                      <View style={styles.existingPremiseDot} />
                    </View>
                  </Marker>
                );
              })}

              {existingMeters.map((meter) => {
                const meterGps = meter?.ast?.location?.gps;
                const isWater = meter?.meterType === "water";

                return (
                  <Marker
                    key={`existing-meter-${meter.id}`}
                    coordinate={{
                      latitude: meterGps.lat,
                      longitude: meterGps.lng,
                    }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={true}
                    zIndex={7}
                  >
                    <MaterialCommunityIcons
                      name={isWater ? "water" : "lightning-bolt"}
                      size={18}
                      color={isWater ? "#3B82F6" : "#F59E0B"}
                    />
                  </Marker>
                );
              })}

              <Marker
                draggable
                coordinate={{
                  latitude: resolvedLocation.lat,
                  longitude: resolvedLocation.lng,
                }}
                onDragEnd={handleDragEnd}
                anchor={{ x: 0.5, y: 1 }}
                zIndex={20}
              />
            </MapView>

            <View pointerEvents="none" style={styles.mapTip}>
              <Text style={styles.mapTipText}>
                LONG-PRESS AND DRAG PIN TO EXACT LOCATION
              </Text>
            </View>
          </View>
        </Modal>
      </Portal>
    </View>
  );
};

export default FormMapPositioner;

const styles = StyleSheet.create({
  container: { paddingVertical: 10 },

  topLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: FORM_TEXT,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  errorBorder: { borderColor: "#ef4444", borderLeftWidth: 6 },

  row: { flexDirection: "row", alignItems: "center", flex: 1 },

  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  textBlock: { marginLeft: 12 },

  selectorValue: { fontSize: 13, fontWeight: "800" },

  actionText: {
    fontSize: 11,
    color: FORM_TEXT,
    marginTop: 2,
    fontWeight: "600",
  },

  map: { flex: 1 },

  markerWrapper: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 5,
  },

  modalContent: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginVertical: 34,
    height: height - 48,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "flex-start",
  },

  modalHeader: {
    flexDirection: "column",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },

  modalTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: FORM_TEXT,
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: "center",
  },

  modalControlsRow: {
    width: "100%",
    alignItems: "center",
  },

  mapTypeBtn: {
    minWidth: 130,
    height: 36,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    marginBottom: 12,
  },

  mapTypeBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0f172a",
    marginHorizontal: 6,
    flex: 1,
    textAlign: "center",
  },

  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },

  cancelBtn: {
    borderColor: "#cbd5e1",
  },

  mapTip: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },

  mapTipText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  mapWrapper: {
    flex: 1,
  },

  erfCentroidSquare: {
    width: 12,
    height: 12,
    backgroundColor: "#2563EB",
    borderWidth: 1,
    borderColor: "#ffffff",
  },

  existingPremiseWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  existingPremiseLabel: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },

  existingPremiseLabelText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#0f172a",
  },

  existingPremiseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#ffffff",
  },
});
