import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Polygon, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import GeoCascadingSelector from "../../../components/maps/GeoCascadingSelector";
import NeighbourhoodErfMarker from "../../../components/maps/NeighbourhoodErfMarker";
import NeighbourhoodMeterMarker from "../../../components/maps/NeighbourhoodMeterMarker";
import NeighbourhoodPremiseMarker from "../../../components/maps/NeighbourhoodPremiseMarker";
import PremiseMarkerActionModal from "../../../components/maps/PremiseMarkerActionModal";
import SelectedErf from "../../../components/maps/SelectedErf";
import SelecteMeter from "../../../components/maps/SelectedMeter";
import SelectedPremise from "../../../components/maps/SelectedPremise";
import { useDiscovery } from "../../../src/context/DiscoveryContext";
import { useGeo } from "../../../src/context/GeoContext";
import {
  bboxToRegion,
  getSafeCoords,
  useMap,
} from "../../../src/context/MapContext";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import { useUpdatePremiseMutation } from "../../../src/redux/premisesApi";
import { cutLastWord } from "../../../src/utils/stringsUtils";

function MapScopeState({ title, subtitle }) {
  return (
    <View style={styles.scopeStateOverlay}>
      <View style={styles.scopeStateCard}>
        <Text style={styles.scopeStateTitle}>{title}</Text>
        <Text style={styles.scopeStateSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

export default function MapsScreen() {
  const { mapRef, flyTo } = useMap();
  const { geoState, updateGeo } = useGeo();
  const { all, sync } = useWarehouse();
  const { openMissionDiscovery } = useDiscovery();
  const router = useRouter();
  const [updatePremise] = useUpdatePremiseMutation();

  const lastSignalRef = useRef(null);
  const geoLibraryRef = useRef({});

  const [region, setRegion] = useState(null);
  const [zoom, setZoom] = useState(10);
  const [mapType, setMapType] = useState("standard");

  const [gcsModalOpen, setGcsModalOpen] = useState(false);
  const [selectedGeofence, setSelectedGeofence] = useState(null);

  const [showLayers, setShowLayers] = useState({
    erfs: true,
    premises: true,
    asts: true,
    sc: true,
  });

  const selectedLm = geoState?.selectedLm || null;
  const selectedWard = geoState?.selectedWard || null;
  const selectedErf = geoState?.selectedErf || null;
  const selectedPremise = geoState?.selectedPremise || null;
  const selectedMeter = geoState?.selectedMeter || null;
  const lastSelectionType = geoState?.lastSelectionType || null;
  const flightSignal = geoState?.flightSignal || 0;

  useEffect(() => {
    geoLibraryRef.current = all?.geoLibrary || {};
  }, [all?.geoLibrary]);

  /*
  START - Marker Drag Mode
  */
  const [premiseActionPrem, setPremiseActionPrem] = useState(null);
  const [mapMode, setMapMode] = useState("browse");
  // "browse" | "edit-premise-marker"
  const [dragPremiseId, setDragPremiseId] = useState(null);
  const [draftCoordsById, setDraftCoordsById] = useState({});
  const [savingDragId, setSavingDragId] = useState(null);

  const getPremiseCoordinate = useCallback(
    (prem) => {
      const draft = draftCoordsById[prem.id];

      if (draft?.lat != null && draft?.lng != null) {
        return {
          latitude: draft.lat,
          longitude: draft.lng,
        };
      }

      const lat = prem?.geometry?.centroid?.lat;
      const lng = prem?.geometry?.centroid?.lng;

      if (lat == null || lng == null) return null;

      return {
        latitude: lat,
        longitude: lng,
      };
    },
    [draftCoordsById],
  );

  const handlePremiseMarkerPress = useCallback(
    (prem, e) => {
      if (mapMode === "edit-premise-marker") return;
      e?.stopPropagation?.();
      setPremiseActionPrem(prem);
    },
    [mapMode],
  );

  // Drag end - This stores local draft coordinates only.
  const handlePremiseMarkerDragEnd = useCallback((premiseId, coordinate) => {
    if (!coordinate) return;

    setDraftCoordsById((prev) => ({
      ...prev,
      [premiseId]: {
        lat: coordinate.latitude,
        lng: coordinate.longitude,
      },
    }));
  }, []);

  // Exit drag mode without saving - Useful immediately, even before LOCK save is wired.
  const handleCancelPremiseDrag = useCallback(() => {
    if (dragPremiseId) {
      setDraftCoordsById((prev) => {
        const next = { ...prev };
        delete next[dragPremiseId];
        return next;
      });
    }

    setDragPremiseId(null);
    setMapMode("browse");
  }, [dragPremiseId]);

  const activeDragPremise = useMemo(() => {
    if (!dragPremiseId) return null;
    return all?.prems?.find((p) => p.id === dragPremiseId) || null;
  }, [all?.prems, dragPremiseId]);

  const handleLockPremiseDrag = useCallback(async () => {
    if (!dragPremiseId) return;

    const prem = all?.prems?.find((p) => p.id === dragPremiseId);
    if (!prem?.id) return;

    const draft = draftCoordsById[dragPremiseId];

    if (!draft) {
      setDragPremiseId(null);
      setMapMode("browse");
      return;
    }

    try {
      setSavingDragId(dragPremiseId);

      const updatedPremise = {
        ...prem,
        geometry: {
          ...(prem?.geometry || {}),
          centroid: {
            ...(prem?.geometry?.centroid || {}),
            lat: draft.lat,
            lng: draft.lng,
          },
        },
        metadata: {
          ...(prem?.metadata || {}),
          updatedAt: new Date().toISOString(),
        },
      };

      await updatePremise(updatedPremise).unwrap();

      setDraftCoordsById((prev) => {
        const next = { ...prev };
        delete next[dragPremiseId];
        return next;
      });

      setDragPremiseId(null);
      setMapMode("browse");
    } catch (err) {
      console.error("❌ [LOCK_PREMISE_DRAG_FAIL]:", err);
    } finally {
      setSavingDragId(null);
    }
  }, [all?.prems, dragPremiseId, draftCoordsById, updatePremise]);
  /*
  END - Marker Drag Mode
  */

  /*
  START - Marker Drag Moodal
  */

  const handleSelectGeofence = useCallback(
    (gf) => {
      setSelectedGeofence(gf || null);

      if (!gf) {
        if (selectedWard?.bbox) {
          flyTo(selectedWard.bbox);
          return;
        }

        const wardCoords = getSafeCoords(selectedWard?.geometry);
        if (wardCoords.length > 0) {
          flyTo(wardCoords);
          return;
        }

        if (selectedLm?.bbox) {
          flyTo(selectedLm.bbox);
        }

        return;
      }

      if (gf?.geometry?.bbox) {
        const bbox = gf.geometry.bbox;

        flyTo({
          minLat: bbox.minLatitude,
          maxLat: bbox.maxLatitude,
          minLng: bbox.minLongitude,
          maxLng: bbox.maxLongitude,
        });

        return;
      }

      const points = Array.isArray(gf?.geometry?.points)
        ? [...gf.geometry.points]
            .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
            .map((pt) => ({
              latitude: pt?.latitude,
              longitude: pt?.longitude,
            }))
            .filter(
              (pt) =>
                typeof pt.latitude === "number" &&
                typeof pt.longitude === "number",
            )
        : [];

      if (points.length > 0) {
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
          animated: true,
        });
      }
    },
    [flyTo, mapRef, selectedLm, selectedWard],
  );

  // const handleSelectGeofence = useCallback(
  //   (gf) => {
  //     setSelectedGeofence(gf || null);

  //     if (!gf) return;

  //     if (gf?.geometry?.bbox) {
  //       const bbox = gf.geometry.bbox;

  //       flyTo({
  //         minLat: bbox.minLatitude,
  //         maxLat: bbox.maxLatitude,
  //         minLng: bbox.minLongitude,
  //         maxLng: bbox.maxLongitude,
  //       });

  //       return;
  //     }

  //     const points = Array.isArray(gf?.geometry?.points)
  //       ? [...gf.geometry.points]
  //           .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
  //           .map((pt) => ({
  //             latitude: pt?.latitude,
  //             longitude: pt?.longitude,
  //           }))
  //           .filter(
  //             (pt) =>
  //               typeof pt.latitude === "number" &&
  //               typeof pt.longitude === "number",
  //           )
  //       : [];

  //     if (points.length > 0) {
  //       mapRef.current?.fitToCoordinates(points, {
  //         edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
  //         animated: true,
  //       });
  //     }
  //   },
  //   [flyTo, mapRef],
  // );

  const handleClosePremiseActionModal = useCallback(() => {
    setPremiseActionPrem(null);
  }, []);

  const handleOpenMeterDiscoveryFromModal = useCallback(() => {
    const prem = premiseActionPrem;
    if (!prem?.id) return;

    const parentErf = all?.erfs?.find((erf) => erf?.id === prem?.erfId) || null;
    console.log(`Map - parenErf`, parentErf);
    console.log(`Map - premise`, prem);

    updateGeo({
      selectedErf: parentErf || null,
      selectedPremise: prem,
      lastSelectionType: "PREMISE",
    });

    setPremiseActionPrem(null);

    openMissionDiscovery({
      premiseId: prem.id,
      premise: prem,
    });
  }, [premiseActionPrem, all?.erfs, updateGeo, openMissionDiscovery]);

  const handleAdjustPremisePositionFromModal = useCallback(() => {
    const prem = premiseActionPrem;
    if (!prem?.id) return;

    setPremiseActionPrem(null);
    setMapMode("edit-premise-marker");
    setDragPremiseId(prem.id);
  }, [premiseActionPrem]);

  /*
  END - Marker Drag Moodal
  */

  const handleSelectedErfPress = useCallback(() => {
    const selectedErf = geoState?.selectedErf;
    if (!selectedErf?.id) return;

    router.push({
      pathname: "/(tabs)/premises/formPremise",
      params: {
        id: selectedErf.id,
      },
    });
  }, [geoState?.selectedErf, router]);

  const scopeSync = sync?.scope ?? { status: "idle" };

  const hasLm = !!selectedLm?.id;
  // const hasWard = !!geoState?.selectedWard?.id;
  const scopeReady = scopeSync?.status === "ready";
  const isLmOnly = scopeSync?.status === "lm-only";

  const initialRegion = useMemo(() => {
    const targetBBox = selectedWard?.bbox || selectedLm?.bbox || null;

    return targetBBox
      ? bboxToRegion(targetBBox)
      : {
          latitude: -34.035,
          longitude: 23.0483,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };
  }, [selectedLm?.bbox, selectedWard?.bbox]);

  const wardsList = useMemo(() => all?.wards || [], [all?.wards]);

  const wardPolygonModels = useMemo(() => {
    return wardsList
      .map((ward, index) => {
        if (!ward?.geometry) return null;

        const coordinates = getSafeCoords(ward.geometry);
        if (coordinates?.length < 3) return null;

        const id = ward?.id || null;
        const pcode = ward?.pcode || id;

        return {
          key: `ward-poly-${id || pcode || index}`,
          id,
          pcode,
          coordinates,
        };
      })
      .filter(Boolean);
  }, [wardsList]);

  const premiseById = useMemo(() => {
    return new Map((all?.prems || []).map((prem) => [prem.id, prem]));
  }, [all?.prems]);

  const handleRegionChange = (newRegion) => {
    const currentZoom = Math.round(Math.log2(360 / newRegion?.longitudeDelta));
    setZoom(currentZoom);
    setRegion(newRegion);
  };

  useEffect(() => {
    const signal = flightSignal;
    if (!signal || signal === lastSignalRef.current) return;

    if (!lastSelectionType) {
      lastSignalRef.current = signal;
      return;
    }

    const geoLibrary = geoLibraryRef.current || {};

    switch (lastSelectionType) {
      case "LM": {
        if (selectedLm?.bbox) flyTo(selectedLm.bbox);
        break;
      }

      case "WARD": {
        if (selectedWard?.bbox) flyTo(selectedWard.bbox);
        break;
      }

      case "ERF": {
        const erfGeo = geoLibrary?.[selectedErf?.id];
        if (erfGeo?.bbox) flyTo(erfGeo.bbox, 90);
        break;
      }

      case "PREMISE": {
        const premisePoint = selectedPremise?.geometry?.centroid;
        const pErfEntry = geoLibrary?.[selectedErf?.id];
        const pErfCoords = getSafeCoords(pErfEntry?.geometry);
        const pBundle = [];

        if (
          premisePoint &&
          typeof premisePoint.lat === "number" &&
          typeof premisePoint.lng === "number"
        ) {
          pBundle.push({
            latitude: premisePoint.lat,
            longitude: premisePoint.lng,
          });
        }

        if (pErfCoords?.length > 0) {
          pErfCoords.forEach((coord) => pBundle.push(coord));
        }

        if (pBundle.length > 0) {
          mapRef.current?.fitToCoordinates(pBundle, {
            edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
            animated: true,
          });
        }
        break;
      }

      case "METER": {
        const meterGps = selectedMeter?.ast?.location?.gps;

        const pCentroid = selectedPremise?.geometry?.centroid;

        const erfEntry = geoLibrary?.[selectedErf?.id];

        const erfCoords = getSafeCoords(erfEntry?.geometry);

        const bundleCoords = [];

        if (meterGps?.lat && meterGps?.lng) {
          bundleCoords.push({
            latitude: meterGps.lat,
            longitude: meterGps.lng,
          });
        }

        if (
          pCentroid &&
          typeof pCentroid.lat === "number" &&
          typeof pCentroid.lng === "number"
        ) {
          bundleCoords.push({
            latitude: pCentroid.lat,
            longitude: pCentroid.lng,
          });
        }

        if (erfCoords?.length > 0) {
          erfCoords.forEach((coord) => bundleCoords.push(coord));
        }

        if (bundleCoords.length > 0) {
          mapRef.current?.fitToCoordinates(bundleCoords, {
            edgePadding: { top: 100, right: 100, bottom: 100, left: 100 },
            animated: true,
          });
        }
        break;
      }

      default:
        break;
    }

    lastSignalRef.current = signal;
  }, [
    flightSignal,
    lastSelectionType,
    selectedLm,
    selectedWard,
    selectedErf,
    selectedPremise,
    selectedMeter,
    flyTo,
    mapRef,
  ]);

  const renderLM = () => {
    const lmId = geoState?.selectedLm?.id || null;
    if (!lmId) return null;

    const lmEntry = all?.geoLibrary?.[lmId];
    const targetGeo =
      lmEntry?.geometry?.coordinates ||
      lmEntry?.coordinates ||
      lmEntry?.geometry ||
      lmEntry;

    const lmCoords = getSafeCoords(targetGeo);

    if (!lmCoords || lmCoords.length < 3) {
      const fallbackGeo = geoState?.selectedLm?.geometry;
      const fallbackCoords = getSafeCoords(fallbackGeo);
      if (fallbackCoords?.length < 3) return null;

      return (
        <Polygon
          coordinates={fallbackCoords}
          strokeColor="#0f172a"
          fillColor="transparent"
          strokeWidth={3}
          zIndex={10}
        />
      );
    }

    return (
      <Polygon
        key={`lm-boundary-${lmId}`}
        coordinates={lmCoords}
        strokeColor="#0f172a"
        fillColor="transparent"
        strokeWidth={3}
        zIndex={10}
      />
    );
  };

  const renderWards = () => {
    const selectedWardKey = selectedWard?.pcode || selectedWard?.id || null;

    return wardPolygonModels.map((ward) => {
      const isSelected =
        !!selectedWardKey &&
        (selectedWardKey === ward.id || selectedWardKey === ward.pcode);
      const wardInteractive =
        !gcsModalOpen &&
        !premiseActionPrem &&
        zoom < 18 &&
        mapMode === "browse";

      return (
        <Polygon
          key={ward.key}
          coordinates={ward.coordinates}
          strokeColor={isSelected ? "#2563eb" : "#475569"}
          fillColor={
            isSelected
              ? "rgba(160, 190, 255, 0.2)"
              : "rgba(148, 163, 184, 0.05)"
          }
          strokeWidth={isSelected ? 3 : 1.5}
          zIndex={isSelected ? 100 : 50}
          tappable={wardInteractive}
        />
      );
    });
  };

  const renderSelectedGeofence = () => {
    if (!selectedGeofence?.geometry?.points?.length) return null;

    const coords = [...selectedGeofence.geometry.points]
      .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
      .map((pt) => ({
        latitude: pt?.latitude,
        longitude: pt?.longitude,
      }))
      .filter(
        (pt) =>
          typeof pt.latitude === "number" && typeof pt.longitude === "number",
      );

    if (coords.length < 3) return null;

    return (
      <Polygon
        key={`selected-geofence-${selectedGeofence?.id}`}
        coordinates={coords}
        strokeColor="#dc2626"
        fillColor="rgba(239, 68, 68, 0.12)"
        strokeWidth={3}
        zIndex={950}
      />
    );
  };

  const renderSelectedErf = () => {
    const selectedId = geoState?.selectedErf?.id;
    if (!selectedId) return null;

    const heavyEntry = all?.geoLibrary?.[selectedId];
    const borderCoords = getSafeCoords(heavyEntry?.geometry);
    const centroid = heavyEntry?.centroid;

    if (borderCoords?.length < 3 || !centroid?.lat) return null;

    return (
      <>
        <Polygon
          key={`sovereign-border-${selectedId}`}
          coordinates={borderCoords}
          strokeColor="#FFD700"
          fillColor="rgba(255, 215, 0, 0.15)"
          strokeWidth={4}
          zIndex={1000}
          onPress={handleSelectedErfPress}
        />
        <SelectedErf
          coordinate={{ latitude: centroid?.lat, longitude: centroid?.lng }}
          erfNo={geoState?.selectedErf?.erfNo}
          onPress={handleSelectedErfPress}
        />
      </>
    );
  };

  const renderSelectedPremise = () => {
    const selectedPremise = geoState?.selectedPremise;
    const centroid = selectedPremise?.geometry?.centroid;

    if (
      !selectedPremise?.id ||
      !centroid ||
      typeof centroid.lat !== "number" ||
      typeof centroid.lng !== "number"
    ) {
      return null;
    }

    const addr = selectedPremise?.address;
    const adrLn1 = addr
      ? `${addr?.strNo || ""} ${addr?.strName}`.trim()
      : "NO ADR";
    const adrLn2 = addr ? `${addr?.strType || ""}`.trim() : "";

    return (
      <SelectedPremise
        coordinate={{ latitude: centroid.lat, longitude: centroid.lng }}
        erfNo={selectedPremise?.erfNo}
        adrLn1={adrLn1}
        adrLn2={adrLn2}
        premiseId={selectedPremise?.id}
      />
    );
  };

  const renderAssetMarker = () => {
    const selectedMeter = geoState?.selectedMeter;
    const gps = selectedMeter?.ast?.location?.gps;
    if (!gps?.lat || !gps?.lng) return null;

    return (
      <SelecteMeter
        isWater={selectedMeter?.meterType === "water"}
        meterNo={selectedMeter?.ast?.astData?.astNo || "NO ID"}
        coordinates={{ latitude: gps.lat, longitude: gps.lng }}
        shortAdr={cutLastWord(
          selectedMeter?.accessData?.premise?.address || "N/A",
        )}
        erfNo={selectedMeter?.accessData?.erfNo || "N/A"}
      />
    );
  };

  const renderErfsNeighborhood = () => {
    if (!scopeReady || !showLayers?.erfs || !region || zoom < 18) return null;

    const latMin = region.latitude - region.latitudeDelta / 2;
    const latMax = region.latitude + region.latitudeDelta / 2;
    const lngMin = region.longitude - region.longitudeDelta / 2;
    const lngMax = region.longitude + region.longitudeDelta / 2;

    const isLevel1 = zoom >= 18;

    return all?.erfs
      ?.filter((erf) => {
        if (erf?.id === geoState?.selectedErf?.id) return false;

        const rawCentroid = all?.geoLibrary?.[erf?.id]?.centroid;
        const cLat =
          rawCentroid?.lat ||
          (Array.isArray(rawCentroid) ? rawCentroid[0] : null);
        const cLng =
          rawCentroid?.lng ||
          (Array.isArray(rawCentroid) ? rawCentroid[1] : null);

        return (
          cLat >= latMin && cLat <= latMax && cLng >= lngMin && cLng <= lngMax
        );
      })
      .map((erf) => {
        const heavyEntry = all?.geoLibrary?.[erf?.id];
        const rawCentroid = heavyEntry?.centroid;
        const cLat = rawCentroid?.lat || rawCentroid?.[0];
        const cLng = rawCentroid?.lng || rawCentroid?.[1];

        if (cLat == null || cLng == null) return null;

        return (
          <React.Fragment key={`nb-erf-${erf?.id}`}>
            {isLevel1 ? (
              <Polygon
                coordinates={getSafeCoords(heavyEntry?.geometry)}
                strokeColor="#94a3b8"
                fillColor="transparent"
                strokeWidth={0.5}
                zIndex={900}
              />
            ) : null}

            <NeighbourhoodErfMarker
              coordinate={{ latitude: cLat, longitude: cLng }}
              erfNo={erf?.erfNo}
              onPress={(e) => {
                // e?.stopPropagation?.();
                updateGeo({ selectedErf: erf, lastSelectionType: "ERF" });
              }}
            />
          </React.Fragment>
        );
      });
  };

  const renderPremisesNeighborhood = () => {
    if (!scopeReady || !showLayers?.premises || !region || zoom < 18) {
      return null;
    }

    const latMin = region.latitude - region.latitudeDelta / 2;
    const latMax = region.latitude + region.latitudeDelta / 2;
    const lngMin = region.longitude - region.longitudeDelta / 2;
    const lngMax = region.longitude + region.longitudeDelta / 2;

    return all?.prems
      ?.filter((prem) => {
        if (prem?.id === geoState?.selectedPremise?.id) return false;

        const coordinate = getPremiseCoordinate(prem);

        if (coordinate?.latitude == null || coordinate?.longitude == null) {
          return false;
        }

        return (
          coordinate.latitude >= latMin &&
          coordinate.latitude <= latMax &&
          coordinate.longitude >= lngMin &&
          coordinate.longitude <= lngMax
        );
      })
      .map((prem) => {
        const coordinate = getPremiseCoordinate(prem);

        if (coordinate?.latitude == null || coordinate?.longitude == null) {
          return null;
        }

        return (
          <NeighbourhoodPremiseMarker
            key={`nb-prem-${prem?.id}`}
            prem={prem}
            zoom={zoom}
            coordinate={coordinate}
            isDragging={
              mapMode === "edit-premise-marker" && dragPremiseId === prem?.id
            }
            isSaving={savingDragId === prem?.id}
            onPress={(e) => handlePremiseMarkerPress(prem, e)}
            onDragEnd={(nextCoordinate) =>
              handlePremiseMarkerDragEnd(prem?.id, nextCoordinate)
            }
            showAddressFromZoom={18}
            showTypeFromZoom={18}
          />
        );
      });
  };

  const renderMetersNeighborhood = () => {
    if (!scopeReady || !showLayers?.asts || !region || zoom < 18) return null;

    const latMin = region.latitude - region.latitudeDelta / 2;
    const latMax = region.latitude + region.latitudeDelta / 2;
    const lngMin = region.longitude - region.longitudeDelta / 2;
    const lngMax = region.longitude + region.longitudeDelta / 2;

    return all?.meters
      ?.filter((m) => {
        const lat = m?.ast?.location?.gps?.lat;
        const lng = m?.ast?.location?.gps?.lng;

        return (
          lat &&
          lng &&
          lat >= latMin &&
          lat <= latMax &&
          lng >= lngMin &&
          lng <= lngMax
        );
      })
      .map((m) => {
        const coordinate = {
          latitude: m.ast.location.gps.lat,
          longitude: m.ast.location.gps.lng,
        };

        const isWater = m.meterType === "water";
        const isAnomaly =
          !!m.ast?.anomalies?.anomaly && m.ast.anomalies.anomaly !== "N/A";

        return (
          <NeighbourhoodMeterMarker
            key={`nb-meter-${m.id}`}
            coordinate={coordinate}
            isWater={isWater}
            isAnomaly={isAnomaly}
          />
        );
      });
  };

  const renderServiceConnections = () => {
    if (!scopeReady || !showLayers?.sc || !region || zoom < 18) return null;

    const latMin = region.latitude - region.latitudeDelta / 2;
    const latMax = region.latitude + region.latitudeDelta / 2;
    const lngMin = region.longitude - region.longitudeDelta / 2;
    const lngMax = region.longitude + region.longitudeDelta / 2;

    return all?.meters
      ?.filter((m) => {
        const mLat = m?.ast?.location?.gps?.lat;
        const mLng = m?.ast?.location?.gps?.lng;

        const inView =
          mLat >= latMin && mLat <= latMax && mLng >= lngMin && mLng <= lngMax;

        const hasPremiseLink = !!m.accessData?.premise?.id;

        return inView && hasPremiseLink;
      })
      .map((m) => {
        const parentPrem = premiseById.get(m.accessData.premise.id);
        const pCentroid = parentPrem?.geometry?.centroid;

        if (
          !pCentroid ||
          typeof pCentroid.lat !== "number" ||
          typeof pCentroid.lng !== "number"
        ) {
          return null;
        }

        const mLat = m.ast.location.gps.lat;
        const mLng = m.ast.location.gps.lng;

        const pLat = pCentroid.lat;
        const pLng = pCentroid.lng;

        const isWater = m.meterType === "water";
        const connectionColor = isWater
          ? "rgba(59, 130, 246, 0.6)"
          : "rgba(234, 179, 8, 0.6)";

        return (
          <Polyline
            key={`sc-link-${m.id}`}
            coordinates={[
              { latitude: mLat, longitude: mLng },
              { latitude: pLat, longitude: pLng },
            ]}
            strokeColor={connectionColor}
            strokeWidth={2}
            lineDashPattern={[4, 4]}
            zIndex={850}
          />
        );
      });
  };

  const renderAssetLink = () => {
    const meter = geoState?.selectedMeter;
    const premise = geoState?.selectedPremise;

    if (
      !meter?.id ||
      !premise?.id ||
      meter?.accessData?.premise?.id !== premise?.id
    ) {
      return null;
    }

    const meterGps = meter?.ast?.location?.gps;
    const pCentroid = premise?.geometry?.centroid;

    if (
      !meterGps?.lat ||
      !meterGps?.lng ||
      !pCentroid ||
      typeof pCentroid.lat !== "number" ||
      typeof pCentroid.lng !== "number"
    ) {
      return null;
    }

    return (
      <Polyline
        coordinates={[
          { latitude: meterGps.lat, longitude: meterGps.lng },
          { latitude: pCentroid.lat, longitude: pCentroid.lng },
        ]}
        strokeColor="#3b82f6"
        strokeWidth={3}
        lineDashPattern={[5, 5]}
        zIndex={1200}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* <View style={styles.hudOverlay}>
        <GeoStatusHUD />
      </View> */}

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        mapType={mapType}
        initialRegion={initialRegion}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation
      >
        {renderLM()}
        {renderWards()}
        {renderSelectedGeofence()}
        {renderSelectedErf()}
        {renderAssetLink()}
        {renderSelectedPremise()}
        {renderErfsNeighborhood()}
        {renderPremisesNeighborhood()}
        {renderMetersNeighborhood()}
        {renderServiceConnections()}
        {renderAssetMarker()}
      </MapView>

      {!hasLm ? (
        <MapScopeState
          title="NO ACTIVE WORKBASE"
          subtitle="Select a workbase and ward to begin."
        />
      ) : isLmOnly ? (
        <MapScopeState
          title="LM OVERVIEW"
          subtitle="Select a ward to drill into this local municipality."
        />
      ) : scopeSync?.status === "invalid-ward" ? (
        <MapScopeState
          title="INVALID WARD"
          subtitle="The selected ward does not belong to the active workbase."
        />
      ) : null}

      <GeoCascadingSelector
        onModalStateChange={setGcsModalOpen}
        onSelectGeofence={handleSelectGeofence}
        selectedGeofence={selectedGeofence}
      />

      <View style={styles.layerControl}>
        <TouchableOpacity
          style={[styles.layerBtn, showLayers.erfs && styles.layerBtnActive]}
          onPress={() => setShowLayers((p) => ({ ...p, erfs: !p.erfs }))}
        >
          <MaterialCommunityIcons
            name="layers-outline"
            size={20}
            color={showLayers.erfs ? "#fff" : "#64748b"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.layerBtn,
            showLayers.premises && styles.layerBtnActive,
          ]}
          onPress={() =>
            setShowLayers((p) => ({ ...p, premises: !p.premises }))
          }
        >
          <MaterialCommunityIcons
            name="home-outline"
            size={20}
            color={showLayers.premises ? "#fff" : "#64748b"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.layerBtn, showLayers.asts && styles.layerBtnActive]}
          onPress={() => setShowLayers((p) => ({ ...p, asts: !p.asts }))}
        >
          <MaterialCommunityIcons
            name="lightning-bolt-outline"
            size={20}
            color={showLayers.asts ? "#fff" : "#64748b"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.layerBtn, showLayers.sc && styles.layerBtnActive]}
          onPress={() => setShowLayers((p) => ({ ...p, sc: !p.sc }))}
        >
          <MaterialCommunityIcons
            name="vector-line"
            size={20}
            color={showLayers.sc ? "#fff" : "#64748b"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.layerBtn,
            mapType !== "standard" && styles.layerBtnActive,
          ]}
          onPress={() =>
            setMapType((prev) =>
              prev === "standard" ? "satellite" : "standard",
            )
          }
        >
          <MaterialCommunityIcons
            name={mapType === "standard" ? "satellite-variant" : "map-outline"}
            size={20}
            color={mapType !== "standard" ? "#fff" : "#64748b"}
          />
        </TouchableOpacity>

        <View style={styles.zoomDisplay}>
          <Text style={styles.zoomText}>{zoom}</Text>
          <Text style={styles.zoomLabel}>ZOOM</Text>
        </View>
      </View>

      {mapMode === "edit-premise-marker" && activeDragPremise ? (
        <View style={styles.dragEditBar}>
          <View style={styles.dragEditInfo}>
            <Text style={styles.dragEditTitle}>
              Adjusting Erf {activeDragPremise?.erfNo || "?"}
            </Text>
            <Text style={styles.dragEditSub}>
              Drag the marker, then lock to save
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.dragEditBtn, styles.dragCancelBtn]}
            onPress={handleCancelPremiseDrag}
            disabled={!!savingDragId}
          >
            <Text style={styles.dragCancelText}>CANCEL</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dragEditBtn, styles.dragLockBtn]}
            onPress={handleLockPremiseDrag}
            disabled={!!savingDragId}
          >
            <Text style={styles.dragLockText}>
              {savingDragId ? "SAVING..." : "LOCK"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <PremiseMarkerActionModal
        visible={!!premiseActionPrem}
        premise={premiseActionPrem}
        onClose={handleClosePremiseActionModal}
        onOpenMeterDiscovery={handleOpenMeterDiscoveryFromModal}
        onAdjustPosition={handleAdjustPremisePositionFromModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject, flex: 1 },
  hudOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 10,
  },
  gcsOverlay: {
    position: "absolute",
    bottom: 30,
    left: 10,
    right: 10,
    zIndex: 10,
    elevation: 10,
  },
  scopeStateOverlay: {
    position: "absolute",
    top: 120,
    left: 20,
    right: 20,
    zIndex: 120,
    alignItems: "center",
  },
  scopeStateCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 220,
  },
  scopeStateTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  scopeStateSubtitle: {
    marginTop: 6,
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
  },
  layerControl: {
    // flexDirection: "row",
    gap: 6,
    position: "absolute",
    top: 8,
    // left: 10,
    right: 10,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 8,
    padding: 6,
    elevation: 5,
    zIndex: 100,
  },
  layerBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 0.5,
    marginBottom: 4,
  },
  layerBtnActive: { backgroundColor: "#2563eb" },
  neighborhoodDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: "#7b8492",
    borderWidth: 1.5,
    borderColor: "white",
    elevation: 3,
  },
  neighborhoodLabel: {
    backgroundColor: "white",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#94a3b8",
    elevation: 4,
  },
  neighborhoodLabelText: { fontSize: 9, fontWeight: "400", color: "#1e293b" },
  zoomDisplay: {
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  zoomText: {
    color: "#4CD964",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  zoomLabel: {
    color: "#94a3b8",
    fontSize: 7,
    fontWeight: "800",
    marginTop: -2,
  },
  distanceBadge: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  distanceText: { color: "white", fontSize: 8, fontWeight: "900" },

  premiseSquare: {
    width: 15,
    height: 15,
    backgroundColor: "#3B82F6",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    borderRadius: 1,
    elevation: 2,
  },
  meterMarkerCircle: {
    width: 10,
    height: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 1,
  },

  dragEditBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 110,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    zIndex: 120,
    elevation: 12,
  },

  dragEditInfo: {
    marginBottom: 10,
  },

  dragEditTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
  },

  dragEditSub: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748B",
  },

  dragEditBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  dragCancelBtn: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },

  dragLockBtn: {
    backgroundColor: "#2563EB",
  },

  dragCancelText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#475569",
  },

  dragLockText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
