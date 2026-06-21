import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { ActivityIndicator } from "react-native-paper";
import { useGeo } from "../../../../src/context/GeoContext";
import { useAuth } from "../../../../src/hooks/useAuth";
import { useGetWardsByLocalMunicipalityQuery } from "../../../../src/redux/geoApi";
import {
  useCreateGeoFenceMutation,
  useGetGeoFencesByLmPcodeWardPcodeQuery,
} from "../../../../src/redux/geofenceApi";

export default function GeoFencesScreen() {
  const router = useRouter();
  const { isSPV, isFWR } = useAuth();
  const { geoState } = useGeo();

  const mapRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const selectedLm = geoState?.selectedLm || null;
  const selectedWard = geoState?.selectedWard || null;

  const [selectedGeoFence, setSelectedGeoFence] = useState(null);

  const lmPcode = selectedLm?.pcode || selectedLm?.id || null;
  const wardPcode = selectedWard?.pcode || selectedWard?.id || null;

  const [mapType, setMapType] = useState("standard");

  const [showDraftInputs, setShowDraftInputs] = useState(true);

  /* ================= STATE ================= */

  const [selectedView, setSelectedView] = useState("MAP");
  const [isCreateMode, setIsCreateMode] = useState(false);

  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPoints, setDraftPoints] = useState([]);

  /* ================= DATA ================= */

  const {
    data: geofences = [],
    isLoading: geofencesLoading,
    isError: geofencesError,
  } = useGetGeoFencesByLmPcodeWardPcodeQuery(
    { lmPcode, wardPcode },
    { skip: !lmPcode || !wardPcode },
  );

  const [createGeoFence, { isLoading: creating }] = useCreateGeoFenceMutation();

  /* ================= HELPERS ================= */

  const isPointInsidePolygon = (point, polygon = []) => {
    if (!point || !Array.isArray(polygon) || polygon.length < 3) {
      return false;
    }

    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;

      const intersect =
        yi > point.latitude !== yj > point.latitude &&
        point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  };

  const isPointInsideAnyPolygon = (point, polygons) => {
    if (!point || !Array.isArray(polygons) || polygons.length === 0)
      return false;

    return polygons.some((polygon) => isPointInsidePolygon(point, polygon));
  };

  const buildGeoFenceRegion = (geoFence) => {
    const bbox = geoFence?.geometry?.bbox;
    const centroid = geoFence?.geometry?.centroid;

    if (!bbox || !centroid) return null;

    // geofence centroid uses { lat, lng } pattern
    const latitude = Number(centroid?.lat ?? centroid?.latitude);
    const longitude = Number(centroid?.lng ?? centroid?.longitude);

    // geofence bbox uses { minLatitude, maxLatitude, minLongitude, maxLongitude } pattern
    const latitudeDelta = Math.max(
      Number(bbox?.maxLatitude ?? bbox?.maxLat) -
        Number(bbox?.minLatitude ?? bbox?.minLat),
      0.005,
    );

    const longitudeDelta = Math.max(
      Number(bbox?.maxLongitude ?? bbox?.maxLng) -
        Number(bbox?.minLongitude ?? bbox?.minLng),
      0.005,
    );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitudeDelta) ||
      !Number.isFinite(longitudeDelta)
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      latitudeDelta: latitudeDelta * 1.4,
      longitudeDelta: longitudeDelta * 1.4,
    };
  };

  /* ================= DERIVED ================= */

  const geofenceCount = geofences.length;
  const draftPointCount = draftPoints.length;
  const draftPolygonReady = draftPointCount >= 3;

  const hasScope = !!lmPcode && !!wardPcode;

  const isDraftValid =
    hasScope && draftName.trim().length > 0 && draftPoints.length >= 3;

  /* ================= WARDS ================= */

  const { data: wards = [] } = useGetWardsByLocalMunicipalityQuery(lmPcode, {
    skip: !lmPcode,
  });

  const selectedWardDoc = useMemo(() => {
    return (
      wards.find((w) => w?.id === wardPcode) ||
      wards.find((w) => w?.pcode === wardPcode) ||
      null
    );
  }, [wards, wardPcode]);

  const wardBoundaryPolygons = useMemo(() => {
    const geometry = selectedWardDoc?.geometry;

    if (!geometry) return [];

    if (geometry.type === "Polygon") {
      const ring = geometry?.coordinates?.[0] || [];

      const coords = ring.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));

      return coords.length >= 3 ? [coords] : [];
    }

    if (geometry.type === "MultiPolygon") {
      const allPolygons = [];

      for (const polygonCoords of geometry?.coordinates || []) {
        const ring = polygonCoords?.[0] || [];

        const coords = ring.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));

        if (coords.length >= 3) {
          allPolygons.push(coords);
        }
      }

      return allPolygons;
    }

    return [];
  }, [selectedWardDoc]);

  const wardBoundaryCoordinates = useMemo(() => {
    return wardBoundaryPolygons.flat();
  }, [wardBoundaryPolygons]);

  const wardRegion = useMemo(() => {
    const bbox = selectedWardDoc?.bbox;
    const centroid = selectedWardDoc?.centroid;

    if (!bbox || !centroid) return null;

    const latitude = Number(centroid?.lat);
    const longitude = Number(centroid?.lng);

    const latitudeDelta = Math.max(
      Number(bbox?.maxLat) - Number(bbox?.minLat),
      0.01,
    );

    const longitudeDelta = Math.max(
      Number(bbox?.maxLng) - Number(bbox?.minLng),
      0.01,
    );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitudeDelta) ||
      !Number.isFinite(longitudeDelta)
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      latitudeDelta: latitudeDelta * 1.2,
      longitudeDelta: longitudeDelta * 1.2,
    };
  }, [selectedWardDoc]);

  useEffect(() => {
    if (selectedView !== "MAP") return;
    if (!wardPcode) return;
    if (!isMapReady) return;
    if (!mapRef.current) return;
    if (!wardRegion) return;
    if (selectedGeoFence?.id) return;

    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion(wardRegion, 500);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    selectedView,
    wardPcode,
    selectedWardDoc?.id,
    isMapReady,
    wardRegion,
    selectedGeoFence?.id,
  ]);

  /* ================= HANDLERS ================= */

  const handleToggleView = () => {
    setSelectedView((prev) => (prev === "MAP" ? "LIST" : "MAP"));
  };

  const handleFilterPress = () => {
    Alert.alert("Coming Soon", "Filtering will be implemented next.");
  };

  const handleEnterCreateMode = () => {
    setSelectedView("MAP");

    setDraftName("");
    setDraftDescription("");
    setDraftPoints([]);
    setShowDraftInputs(true);
    setIsCreateMode(true);
  };

  const handleMapPress = (e) => {
    if (!isCreateMode) return;

    const coord = e?.nativeEvent?.coordinate;
    if (!coord) return;

    if (wardBoundaryPolygons.length > 0) {
      const insideWard = isPointInsideAnyPolygon(coord, wardBoundaryPolygons);

      if (!insideWard) {
        Alert.alert(
          "Outside Ward Boundary",
          "Geofence points must be placed inside the selected ward.",
        );
        return;
      }
    }

    setDraftPoints((prev) => [...prev, coord]);
  };
  const handleUndo = () => {
    setDraftPoints((prev) => prev.slice(0, -1));
  };

  const handleRestart = () => {
    setDraftPoints([]);
  };

  const handleSave = async () => {
    if (!isDraftValid || creating) return;

    try {
      await createGeoFence({
        name: draftName,
        description: draftDescription,
        points: draftPoints,
        parents: {
          countryPcode: selectedLm?.parents?.countryId || "NAv",
          provincePcode: selectedLm?.parents?.provinceId || "NAv",
          dmPcode: selectedLm?.parents?.districtId || "NAv",
          lmPcode,
          wardPcode,
        },
      }).unwrap();

      const fenceName = draftName.trim();

      Alert.alert("Success", `Geofence "${fenceName}" created successfully.`);

      setIsCreateMode(false);
      setDraftName("");
      setDraftDescription("");
      setDraftPoints([]);
    } catch (err) {
      Alert.alert("Error", err?.message || "Failed");
    }
  };

  const handleCancelCreateMode = () => {
    setIsCreateMode(false);
    setShowDraftInputs(true);
    setDraftName("");
    setDraftDescription("");
    setDraftPoints([]);
  };

  const handleToggleMapType = () => {
    setMapType((prev) => (prev === "standard" ? "satellite" : "standard"));
  };

  const handleOpenGeoFenceOnMap = (geoFence) => {
    if (!geoFence) return;

    setIsCreateMode(false);
    setSelectedView("MAP");
    setSelectedGeoFence(geoFence);

    const region = buildGeoFenceRegion(geoFence);

    if (!region) {
      Alert.alert(
        "Cannot Zoom",
        `The geofence "${geoFence?.name || "Unknown"}" has no location data to zoom to.`,
      );
      return;
    }

    setTimeout(() => {
      mapRef.current?.animateToRegion(region, 500);
    }, 300);
  };

  const handleToggleDraftInputs = () => {
    setShowDraftInputs((prev) => !prev);
  };

  /* ================= UI ================= */

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <Stack.Screen
        options={{
          // title: "Geofences",
          headerBackTitleVisible: false,

          headerLeft: () => (
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={() => router.back()}>
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={24}
                  color="#0f172a"
                />
              </TouchableOpacity>

              <Text style={styles.headerTitle}>Geofences</Text>

              <View style={styles.badge}>
                <Text style={styles.badgeText}>{geofenceCount}</Text>
              </View>
            </View>
          ),

          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleToggleView}>
                <MaterialCommunityIcons
                  name={
                    selectedView === "MAP"
                      ? "format-list-bulleted"
                      : "map-outline"
                  }
                  size={22}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleFilterPress}>
                <MaterialCommunityIcons name="filter-variant" size={22} />
              </TouchableOpacity>

              {!isSPV && !isFWR && (
                <TouchableOpacity
                  onPress={handleEnterCreateMode}
                  style={{
                    opacity: hasScope ? 1 : 0.4,
                  }}
                  disabled={!hasScope}
                >
                  <MaterialCommunityIcons name="plus" size={24} />
                </TouchableOpacity>
              )}

              {isCreateMode && (
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={!isDraftValid || creating}
                  style={{
                    opacity: !isDraftValid || creating ? 0.4 : 1,
                  }}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#0f172a" />
                  ) : (
                    <MaterialCommunityIcons
                      name="content-save-outline"
                      size={22}
                    />
                  )}
                </TouchableOpacity>
              )}
            </View>
          ),
        }}
      />

      {/* MAP VIEW */}
      {selectedView === "MAP" && (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          mapType={mapType}
          onPress={handleMapPress}
          onMapReady={() => {
            setIsMapReady(true);
          }}
        >
          {wardBoundaryPolygons.map((polygonCoords, index) => (
            <Polygon
              key={`ward-boundary-${index}`}
              coordinates={polygonCoords}
              strokeColor="#f59e0b"
              fillColor="rgba(245,158,11,0.08)"
              strokeWidth={2}
            />
          ))}

          {draftPoints.map((p, i) => (
            <Marker key={i} coordinate={p} />
          ))}

          {draftPolygonReady && (
            <Polygon
              coordinates={draftPoints}
              strokeColor="#2563eb"
              fillColor="rgba(37,99,235,0.25)"
            />
          )}

          {geofences.map((geoFence) => {
            const rawPoints = geoFence?.geometry?.points || [];
            if (rawPoints.length < 3) return null;

            const poly = [...rawPoints]
              .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
              .map((pt) => ({
                latitude: pt?.latitude ?? pt?.lat,
                longitude: pt?.longitude ?? pt?.lng,
              }))
              .filter(
                (pt) =>
                  typeof pt.latitude === "number" &&
                  typeof pt.longitude === "number",
              );

            if (poly.length < 3) return null;

            const isSelected = selectedGeoFence?.id === geoFence?.id;

            return (
              <Polygon
                key={geoFence.id}
                coordinates={poly}
                strokeColor={isSelected ? "#dc2626" : "#10b981"}
                fillColor={
                  isSelected ? "rgba(220,38,38,0.18)" : "rgba(16,185,129,0.15)"
                }
                strokeWidth={isSelected ? 3 : 2}
              />
            );
          })}
        </MapView>
      )}

      {/* LIST VIEW */}
      {selectedView === "LIST" && (
        <View style={styles.listContainer}>
          {geofencesLoading && geofenceCount === 0 && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.loadingText}>Loading geofences...</Text>
            </View>
          )}

          {!geofencesLoading && geofencesError && (
            <Text style={styles.errorText}>
              Failed to load geofences. Please try again.
            </Text>
          )}

          {!geofencesLoading && !geofencesError && geofenceCount === 0 ? (
            <Text style={styles.emptyText}>
              {isSPV || isFWR
                ? "No geofences available."
                : "No geofences yet. Tap + to create one."}
            </Text>
          ) : (
            <FlatList
              data={geofences}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardMain}>
                    <Text style={styles.cardTitle}>{item.name}</Text>

                    <Text style={styles.cardDescription}>
                      {item.description || "NAv"}
                    </Text>

                    <View style={styles.cardCountsRow}>
                      <Text style={styles.cardCountText}>
                        ERFs: {item?.counts?.erfs || 0}
                      </Text>

                      <Text style={styles.cardCountText}>
                        Premises: {item?.counts?.premises || 0}
                      </Text>

                      <Text style={styles.cardCountText}>
                        Meters: {item?.counts?.meters || 0}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.cardMapBtn}
                    onPress={() => handleOpenGeoFenceOnMap(item)}
                  >
                    <MaterialCommunityIcons
                      name="map-marker-radius-outline"
                      size={18}
                      color="#2563eb"
                    />
                    <Text style={styles.cardMapBtnText}>Map</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* CREATE PANEL */}
      {isCreateMode && (
        <View style={styles.panelKeyboardWrap}>
          <View style={styles.panel}>
            <View style={styles.panelHeaderRow}>
              <Text style={styles.panelTitle}>Create Geofence</Text>

              <View style={styles.panelHeaderActions}>
                <TouchableOpacity onPress={handleToggleDraftInputs}>
                  <MaterialCommunityIcons
                    name={showDraftInputs ? "chevron-up" : "chevron-down"}
                    size={22}
                    color="#0f172a"
                  />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleCancelCreateMode}>
                  <MaterialCommunityIcons
                    name="close"
                    size={22}
                    color="#0f172a"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {showDraftInputs && (
              <View>
                <TextInput
                  placeholder="Geofence Name"
                  placeholderTextColor="#94a3b8"
                  value={draftName}
                  onChangeText={setDraftName}
                  style={styles.input}
                />

                <TextInput
                  placeholder="Description"
                  placeholderTextColor="#94a3b8"
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  style={[styles.input, styles.descriptionInput]}
                  multiline
                />
              </View>
            )}

            <Text style={styles.infoText}>Points: {draftPointCount}</Text>

            <Text style={styles.helperText}>
              Tap the map to add points. Minimum 3 points required.
            </Text>

            {creating && (
              <View style={styles.savingRow}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.savingText}>Saving geofence...</Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  draftPointCount === 0 && styles.secondaryBtnDisabled,
                ]}
                onPress={handleUndo}
                disabled={draftPointCount === 0}
              >
                <MaterialCommunityIcons name="undo" size={18} />
                <Text style={styles.secondaryBtnText}>Undo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  draftPointCount === 0 && styles.secondaryBtnDisabled,
                ]}
                onPress={handleRestart}
                disabled={draftPointCount === 0}
              >
                <MaterialCommunityIcons name="restart" size={18} />
                <Text style={styles.secondaryBtnText}>Restart</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleToggleMapType}
              >
                <MaterialCommunityIcons
                  name={mapType === "standard" ? "satellite-variant" : "map"}
                  size={18}
                />
                <Text style={styles.secondaryBtnText}>
                  {mapType === "standard" ? "Satellite" : "Normal"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerTitle: {
    // fontWeight: "900",
    fontSize: 20,
    color: "#0f172a",
  },

  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },

  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  listContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },

  loadingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563eb",
  },

  errorText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#dc2626",
    marginBottom: 12,
  },

  emptyText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 2,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },

  cardDescription: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 8,
  },

  cardCountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },

  cardCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },

  panel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  panelTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
    marginBottom: 10,
  },

  descriptionInput: {
    minHeight: 56,
    textAlignVertical: "top",
  },

  infoText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
  },

  helperText: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 10,
  },

  actions: {
    flexDirection: "row",
    gap: 10,
  },

  secondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },

  secondaryBtnDisabled: {
    opacity: 0.45,
  },

  secondaryBtnText: {
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "800",
  },
  panelHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  savingText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563eb",
  },

  cardMain: {
    flex: 1,
  },

  cardMapBtn: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },

  cardMapBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#2563eb",
  },
  panelKeyboardWrap: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
  },

  panelHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
