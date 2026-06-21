import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Modal, Portal, Searchbar, Surface } from "react-native-paper";
import { shallowEqual, useSelector } from "react-redux";
import { useGeo } from "../../src/context/GeoContext";
import { useMap } from "../../src/context/MapContext";
import { useWarehouse } from "../../src/context/WarehouseContext";
import {
  getWardErfLocalMetaByWard,
  getWardErfQueryCacheKey,
  getWardErfSyncInfo,
  getWardPcode,
  WARD_ERF_SYNC_STATUS,
} from "../../src/features/erfs/wardErfSyncStatus";
import { useGetGeoFencesByLmPcodeWardPcodeQuery } from "../../src/redux/geofenceApi";

export default function GeoCascadingSelector({
  onModalStateChange,
  onSelectGeofence,
  selectedGeofence,
}) {
  // console.log(`GeoCascadingSelector mounting`);
  const { geoState, updateGeo } = useGeo();
  const { all, available } = useWarehouse();
  // console.log(
  //   `GeoCascadingSelector all?.meters.slice(0,2)`,
  //   all?.meters.slice(0, 2),
  // );
  // const { profile } = useAuth();
  // console.log(`profile`, profile);

  const { flyTo } = useMap();
  const router = useRouter();

  const [showWards, setShowWards] = useState(false);
  const [showErfs, setShowErfs] = useState(false);
  const [showPrems, setShowPrems] = useState(false);
  const [showMeters, setShowMeters] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const anyModalOpen =
    showWards || showGeofences || showErfs || showPrems || showMeters;
  // const anyModalOpen = showWards || showErfs || showPrems || showMeters;

  const [erfSearchQuery, setErfSearchQuery] = useState("");
  const [premSearchQuery, setPremSearchQuery] = useState("");
  const [meterSearchQuery, setMeterSearchQuery] = useState("");
  const [storageRevision, setStorageRevision] = useState(0);

  const {
    selectedLm,
    selectedWard,
    selectedErf,
    selectedPremise,
    selectedMeter,
  } = geoState;

  const lmPcode = selectedLm?.pcode || selectedLm?.id || null;
  const wardPcode = getWardPcode(selectedWard);

  const { data: wardGeofences = [] } = useGetGeoFencesByLmPcodeWardPcodeQuery(
    { lmPcode, wardPcode },
    { skip: !showGeofences || !lmPcode || !wardPcode },
  );

  const canOpenWardSelector = !!lmPcode;
  const canOpenGeofenceSelector = !!lmPcode && !!wardPcode;

  useEffect(() => {
    onModalStateChange?.(anyModalOpen);
  }, [anyModalOpen, onModalStateChange]);

  useEffect(() => {
    if (!showWards) return;
    setStorageRevision((value) => value + 1);
  }, [showWards, lmPcode]);

  // -----------------------------
  // OPTION POOLS FOR MODALS
  // These are NOT screen filtered pools.
  // They are user choice pools.
  // -----------------------------

  const availableWards = useMemo(() => {
    return [...(available?.wards || all?.wards || [])].sort((a, b) => {
      const aCode = Number(a?.code ?? 9999);
      const bCode = Number(b?.code ?? 9999);

      if (aCode !== bCode) return aCode - bCode;

      return String(a?.name || a?.id || "").localeCompare(
        String(b?.name || b?.id || ""),
      );
    });
  }, [available?.wards, all?.wards]);

  const geofenceOptions = useMemo(() => {
    if (!showGeofences) return [];

    return [...wardGeofences]
      .filter((gf) => gf?.status === "ACTIVE")
      .sort((a, b) =>
        String(a?.description || a?.name || a?.id || "").localeCompare(
          String(b?.description || b?.name || b?.id || ""),
        ),
      );
  }, [showGeofences, wardGeofences]);

  const erfOptions = useMemo(() => {
    if (!showErfs) return [];

    let base = [...(all?.erfs || [])];

    if (selectedWard?.id) {
      const wardId = selectedWard.id;
      base = base.filter(
        (e) =>
          e?.admin?.ward?.id === wardId || e?.admin?.ward?.pcode === wardId,
      );
    }

    if (erfSearchQuery) {
      const q = erfSearchQuery.toLowerCase();
      base = base.filter((e) =>
        `${e?.erfNo || ""} ${e?.id || ""}`.toLowerCase().includes(q),
      );
    }

    return base;
  }, [showErfs, all?.erfs, selectedWard?.id, erfSearchQuery]);

  const premiseOptions = useMemo(() => {
    if (!showPrems) return [];

    let base = [...(all?.prems || [])];

    if (selectedErf?.id) {
      base = base.filter((p) => p?.erfId === selectedErf.id);
    } else if (selectedWard?.id) {
      const wardId = selectedWard.id;

      const erfIdsInWard = new Set(
        (all?.erfs || [])
          .filter(
            (e) =>
              e?.admin?.ward?.id === wardId || e?.admin?.ward?.pcode === wardId,
          )
          .map((e) => e.id),
      );

      base = base.filter((p) => erfIdsInWard.has(p?.erfId));
    }

    if (premSearchQuery) {
      const q = premSearchQuery.toLowerCase();
      base = base.filter((p) => {
        const addr = p?.address;
        return `${p?.id || ""} ${addr?.strNo || ""} ${addr?.strName || ""} ${p?.propertyType?.type || ""} ${p?.erfNo || ""}`
          .toLowerCase()
          .includes(q);
      });
    }

    return base;
  }, [
    showPrems,
    all?.prems,
    all?.erfs,
    selectedErf?.id,
    selectedWard?.id,
    premSearchQuery,
  ]);

  const meterErfById = useMemo(() => {
    if (!showMeters) return new Map();

    return new Map((all?.erfs || []).map((e) => [e.id, e]));
  }, [showMeters, all?.erfs]);

  const meterOptions = useMemo(() => {
    if (!showMeters) return [];

    let base = [...(all?.meters || [])];

    if (selectedPremise?.id) {
      base = base.filter(
        (m) => m?.accessData?.premise?.id === selectedPremise.id,
      );
    } else if (selectedErf?.id) {
      base = base.filter((m) => m?.accessData?.erfId === selectedErf.id);
    } else if (selectedWard?.id) {
      const wardId = selectedWard.id;
      base = base.filter((m) => {
        const parentErf = meterErfById.get(m?.accessData?.erfId);
        return (
          parentErf?.admin?.ward?.id === wardId ||
          parentErf?.admin?.ward?.pcode === wardId
        );
      });
    }

    if (meterSearchQuery) {
      const q = meterSearchQuery.toLowerCase();
      base = base.filter((m) =>
        (m?.ast?.astData?.astNo || "").toLowerCase().includes(q),
      );
    }

    return base;
  }, [
    showMeters,
    all?.meters,
    meterErfById,
    selectedPremise?.id,
    selectedErf?.id,
    selectedWard?.id,
    meterSearchQuery,
  ]);

  const availableWardPcodes = useMemo(
    () => availableWards.map((ward) => getWardPcode(ward)).filter(Boolean),
    [availableWards],
  );

  const erfsQueries = useSelector((state) => {
    if (!showWards || !lmPcode || availableWardPcodes.length === 0) {
      return {};
    }

    const queries = state.erfsApi?.queries || {};
    const relevantQueries = {};

    availableWardPcodes.forEach((pcode) => {
      const queryKey = getWardErfQueryCacheKey(lmPcode, pcode);
      const query = queries?.[queryKey];

      if (query) {
        relevantQueries[queryKey] = query;
      }
    });

    return relevantQueries;
  }, shallowEqual);

  const localWardErfMetaByPcode = useMemo(
    () => {
      void storageRevision;
      return getWardErfLocalMetaByWard(lmPcode);
    },
    [lmPcode, storageRevision],
  );

  const wardSyncedCountsByPcode = useMemo(() => {
    if (!showWards || !lmPcode) return new Map();

    const counts = new Map();

    (availableWards || []).forEach((ward) => {
      const wardPcode = getWardPcode(ward);
      if (!wardPcode) return;

      const syncInfo = getWardErfSyncInfo({
        erfsQueries,
        localMetaByPcode: localWardErfMetaByPcode,
        lmPcode,
        wardPcode,
      });

      counts.set(wardPcode, syncInfo.size);
    });

    return counts;
  }, [
    showWards,
    availableWards,
    erfsQueries,
    localWardErfMetaByPcode,
    lmPcode,
  ]);

  // -----------------------------
  // HIERARCHY ACTIONS
  // GCS updates state only.
  // MapsScreen pilot handles flights.
  // -----------------------------

  const handleLmReset = () => {
    if (!selectedLm?.id) return;

    updateGeo({
      selectedLm,
      selectedWard: null,
      selectedErf: null,
      selectedPremise: null,
      selectedMeter: null,
      lastSelectionType: "LM",
    });

    setShowWards(false);
    setShowErfs(false);
    setShowPrems(false);
    setShowMeters(false);
  };

  const selectWard = (ward) => {
    const syncInfo = getWardErfSyncInfo({
      erfsQueries,
      localMetaByPcode: localWardErfMetaByPcode,
      lmPcode,
      wardPcode: getWardPcode(ward),
    });

    if (syncInfo.status !== WARD_ERF_SYNC_STATUS.READY) {
      setShowWards(false);
      router.push("/(tabs)/erfs/ward-erfs-sync");
      return;
    }

    setShowWards(false);

    requestAnimationFrame(() => {
      updateGeo({
        selectedWard: ward,
        selectedErf: null,
        selectedPremise: null,
        selectedMeter: null,
        lastSelectionType: "WARD",
      });
    });
  };

  const selectGeofence = (gf) => {
    onSelectGeofence?.(gf || null);
    setShowGeofences(false);
  };

  const selectErf = (erf) => {
    updateGeo({
      selectedErf: erf,
      lastSelectionType: "ERF",
    });
    setShowErfs(false);
  };

  const selectPremise = (prem) => {
    const parentErf = all?.erfs?.find((e) => e.id === prem?.erfId);

    updateGeo({
      selectedErf: parentErf || null,
      selectedPremise: prem,
      selectedMeter: null,
      lastSelectionType: "PREMISE",
    });

    setShowPrems(false);
  };

  const selectMeter = (meter) => {
    const pId = meter?.accessData?.premise?.id;
    const parentPremise = all?.prems?.find((p) => p?.id === pId);
    const parentErf = all?.erfs?.find((e) => e.id === parentPremise?.erfId);

    updateGeo({
      selectedErf: parentErf || null,
      selectedPremise: parentPremise || null,
      selectedMeter: meter,
      lastSelectionType: "METER",
    });

    setMeterSearchQuery("");
    setShowMeters(false);
  };

  // Utility action - okay to fly directly
  const handleCenterOnMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      flyTo(
        [
          {
            latitude: location?.coords?.latitude,
            longitude: location?.coords?.longitude,
          },
        ],
        100,
      );
    } catch (error) {
      console.error("❌ Pilot: GPS acquisition failed", error);
    }
  };

  // -----------------------------
  // LABELS
  // -----------------------------

  const lmNameStr = `${selectedLm?.name || "LM"}`;
  const wardNameStr = `${selectedWard?.name || "Select Ward"}`;

  const adrLn1 = selectedPremise?.address
    ? `${selectedPremise?.address?.strNo || ""} ${selectedPremise?.address?.strName || ""}`.trim()
    : "Premise";

  const adrLn2 = selectedPremise?.address
    ? `${selectedPremise?.address?.strType || ""}`.trim()
    : "";

  const meterNoStr = selectedMeter?.ast?.astData?.astNo
    ? `${selectedMeter?.ast?.astData?.astNo}`
    : "Meter";

  const erfLabelStr = selectedErf?.erfNo ? `Erf ${selectedErf?.erfNo}` : "Erf";

  const geofenceLabelStr = selectedGeofence?.name || "GF";

  return (
    <>
      <Portal>
        {/* WARD MODAL */}
        <Modal
          visible={showWards}
          onDismiss={() => setShowWards(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Surface style={styles.modalContent}>
            <Text
              style={styles.modalTitle}
            >{`${lmNameStr} : Select Ward`}</Text>

            <FlatList
              data={availableWards}
              keyExtractor={(item, index) =>
                getWardPcode(item) || item?.id || String(index)
              }
              style={{ maxHeight: 400 }}
              ListHeaderComponent={
                <TouchableOpacity
                  style={[
                    styles.wardItem,
                    !selectedWard && { backgroundColor: "#f1f5f9" },
                  ]}
                  onPress={() => {
                    setShowWards(false);

                    requestAnimationFrame(() => {
                      updateGeo({
                        selectedWard: null,
                        selectedErf: null,
                        selectedPremise: null,
                        selectedMeter: null,
                        lastSelectionType: "WARD",
                      });
                    });
                  }}
                >
                  <Text
                    style={[
                      styles.wardText,
                      { fontWeight: "800", color: "#6366f1" },
                    ]}
                  >
                    All Wards (Ward Reset)
                  </Text>
                </TouchableOpacity>
              }
              renderItem={({ item: ward, index }) => {
                const wardPcodeForCount = getWardPcode(ward);
                const syncedErfCount = wardPcodeForCount
                  ? wardSyncedCountsByPcode.get(wardPcodeForCount) || 0
                  : 0;

                return (
                  <TouchableOpacity
                    key={ward?.id || index}
                    style={[
                      styles.wardItem,
                      selectedWard?.id === ward?.id && {
                        backgroundColor: "#eff6ff",
                      },
                    ]}
                    onPress={() => selectWard(ward)}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text
                        style={[
                          styles.wardText,
                          selectedWard?.id === ward?.id && {
                            fontWeight: "bold",
                            color: "#2563eb",
                          },
                        ]}
                      >
                        {ward?.name || ward?.code || `Ward ${index + 1}`}
                      </Text>

                      <Text style={styles.wardMetaDot}>•</Text>

                      <Text style={styles.wardCountText}>{syncedErfCount}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Surface>
        </Modal>

        {/* GEOFENCE MODAL */}
        <Modal
          visible={showGeofences}
          onDismiss={() => setShowGeofences(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Surface style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {`Geofences (${geofenceOptions?.length})`}
            </Text>

            <TouchableOpacity
              style={[
                styles.wardItem,
                !selectedGeofence && { backgroundColor: "#f1f5f9" },
              ]}
              onPress={() => {
                onSelectGeofence?.(null);
                setShowGeofences(false);
              }}
            >
              <Text
                style={[
                  styles.wardText,
                  { fontWeight: "800", color: "#6366f1" },
                ]}
              >
                All Geofences (Clear Boundary)
              </Text>
            </TouchableOpacity>

            <FlatList
              data={geofenceOptions}
              keyExtractor={(item) => item?.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item: gf }) => (
                <TouchableOpacity
                  style={[
                    styles.wardItem,
                    selectedGeofence?.id === gf?.id && {
                      backgroundColor: "#eff6ff",
                    },
                  ]}
                  onPress={() => selectGeofence(gf)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.wardText,
                        selectedGeofence?.id === gf?.id && {
                          fontWeight: "bold",
                          color: "#2563eb",
                        },
                      ]}
                    >
                      {`${gf?.name} ${gf?.description ? `- ${gf?.description}` : ""}` ||
                        "NAv"}
                    </Text>

                    <Text style={styles.subLabel}>
                      {`ERFs: ${gf?.counts?.erfs || 0} | Premises: ${gf?.counts?.premises || 0} | Meters: ${gf?.counts?.meters || 0}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </Surface>
        </Modal>

        {/* ERFS MODAL */}
        <Modal
          visible={showErfs}
          onDismiss={() => setShowErfs(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Surface style={styles.modalContent}>
            <Text
              style={styles.modalTitle}
            >{`Erfs (${erfOptions?.length})`}</Text>

            <Searchbar
              placeholder="Search Erf No..."
              onChangeText={setErfSearchQuery}
              value={erfSearchQuery}
              style={styles.searchBar}
            />

            <TouchableOpacity
              style={styles.wardItem}
              onPress={() => {
                updateGeo({
                  selectedErf: null,
                  lastSelectionType: "ERF",
                });
                setShowErfs(false);
              }}
            >
              <Text
                style={[
                  styles.wardText,
                  { fontWeight: "800", color: "#6366f1" },
                ]}
              >
                All Erfs (Reset Filter)
              </Text>
            </TouchableOpacity>

            <FlatList
              data={erfOptions}
              keyExtractor={(item) => item?.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item: e }) => (
                <TouchableOpacity
                  style={[
                    styles.wardItem,
                    selectedErf?.id === e?.id && { backgroundColor: "#eff6ff" },
                  ]}
                  onPress={() => selectErf(e)}
                >
                  <Text
                    style={[
                      styles.wardText,
                      selectedErf?.id === e?.id && {
                        fontWeight: "bold",
                        color: "#2563eb",
                      },
                    ]}
                  >
                    {`ERF ${e?.erfNo} `}
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                      {`(W${e?.admin?.ward?.name?.replace(/\D/g, "") || "?"})`}
                    </Text>
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Surface>
        </Modal>

        {/* PREMISE MODAL */}
        <Modal
          visible={showPrems}
          onDismiss={() => setShowPrems(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Surface style={styles.modalContent}>
            <Text
              style={styles.modalTitle}
            >{`Premises (${premiseOptions?.length})`}</Text>

            <Searchbar
              placeholder="Search address or Erf..."
              onChangeText={setPremSearchQuery}
              value={premSearchQuery}
              style={styles.searchBar}
            />

            <TouchableOpacity
              style={styles.wardItem}
              onPress={() => {
                updateGeo({
                  selectedPremise: null,
                  lastSelectionType: "PREMISE",
                });
                setShowPrems(false);
              }}
            >
              <Text
                style={[
                  styles.wardText,
                  { fontWeight: "800", color: "#6366f1" },
                ]}
              >
                All Premises (Reset Filter)
              </Text>
            </TouchableOpacity>

            <FlatList
              data={premiseOptions}
              keyExtractor={(item) => item?.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item: p }) => {
                const erf = (all?.erfs || []).find(
                  (erf) => erf?.id === p?.erfId,
                );
                const wardDigits = erf?.admin?.ward?.name;

                const name = p?.propertyType?.name;
                const unitNo = p?.propertyType?.unitNo;
                const nameUnitNo = `${name} ${unitNo}`;

                return (
                  <TouchableOpacity
                    style={[
                      styles.wardItem,
                      selectedPremise?.id === p?.id && {
                        backgroundColor: "#eff6ff",
                      },
                    ]}
                    onPress={() => selectPremise(p)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.wardText,
                          selectedPremise?.id === p?.id && {
                            fontWeight: "bold",
                            color: "#2563eb",
                          },
                        ]}
                      >
                        {`${p?.propertyType?.type || ""} - ${nameUnitNo || ""} - ${p?.address?.strNo || ""} ${p?.address?.strName || ""}`}
                      </Text>
                      <Text style={styles.subLabel}>
                        {`Erf ${p?.erfNo || "N/A"} - ${wardDigits || ""}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Surface>
        </Modal>

        {/* METERS MODAL */}
        <Modal
          visible={showMeters}
          onDismiss={() => setShowMeters(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Surface style={styles.modalContent}>
            <Text
              style={styles.modalTitle}
            >{`Meters (${meterOptions?.length})`}</Text>

            <Searchbar
              placeholder="Search meter no..."
              onChangeText={setMeterSearchQuery}
              value={meterSearchQuery}
              style={styles.searchBar}
            />

            <TouchableOpacity
              style={[
                styles.wardItem,
                !selectedMeter && { backgroundColor: "#f1f5f9" },
              ]}
              onPress={() => {
                updateGeo({
                  selectedMeter: null,
                  lastSelectionType: "METER",
                });
                setMeterSearchQuery("");
                setShowMeters(false);
              }}
            >
              <Text
                style={[
                  styles.wardText,
                  { fontWeight: "800", color: "#6366f1" },
                ]}
              >
                All Meters (Reset Selection)
              </Text>
            </TouchableOpacity>

            <FlatList
              data={meterOptions}
              keyExtractor={(item) => item?.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item: m }) => {
                const addr = m?.accessData?.premise?.address || "No Address";
                const erfNo = m?.accessData?.erfNo || "N/A";
                const erfId = m?.accessData?.erfId || "";
                const erf = meterErfById.get(erfId);
                const wardName = erf?.admin?.ward?.name;
                const ward = wardName?.split(" ").pop() || "?";

                return (
                  <TouchableOpacity
                    style={[
                      styles.wardItem,
                      selectedMeter?.id === m?.id && {
                        backgroundColor: "#eff6ff",
                      },
                    ]}
                    onPress={() => selectMeter(m)}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flex: 1,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={
                          m?.meterType === "water" ? "water" : "lightning-bolt"
                        }
                        size={18}
                        color={m?.meterType === "water" ? "#3b82f6" : "#eab308"}
                        style={{ marginRight: 8 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.wardText,
                            selectedMeter?.id === m?.id && {
                              fontWeight: "bold",
                              color: "#2563eb",
                            },
                          ]}
                        >
                          {m?.ast?.astData?.astNo}
                        </Text>
                        <Text style={styles.subLabel}>
                          {`${addr} - Erf ${erfNo} - W${ward}`}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Surface>
        </Modal>
      </Portal>

      <View style={styles.container}>
        <View style={styles.buttonRow}>
          {/* LM BTN */}
          <Button
            mode="contained"
            icon="city"
            onPress={handleLmReset}
            style={styles.pill}
            labelStyle={styles.labelText}
            contentStyle={styles.buttonContent}
          >
            {lmNameStr}
          </Button>

          <View style={{ width: 6 }} />

          {/* WARD BTN */}
          <Button
            mode="contained"
            icon="layers-outline"
            onPress={() => canOpenWardSelector && setShowWards(true)}
            style={styles.pill}
            labelStyle={styles.labelText}
            contentStyle={styles.buttonContent}
            disabled={!canOpenWardSelector}
          >
            {wardNameStr}
          </Button>

          <View style={{ width: 6 }} />

          {/* GEOFENCE BTN */}
          <Button
            mode="contained"
            icon="vector-polygon"
            onPress={() => canOpenGeofenceSelector && setShowGeofences(true)}
            style={styles.pill}
            labelStyle={styles.labelText}
            contentStyle={styles.buttonContent}
            disabled={!canOpenGeofenceSelector}
          >
            {geofenceLabelStr}
          </Button>

          <View style={{ width: 6 }} />

          {/* ME BTN */}
          <TouchableOpacity
            style={[styles.pill, styles.locationButtonRowVersion]}
            onPress={handleCenterOnMe}
            activeOpacity={0.7}
          >
            <View style={styles.centerMeContent}>
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={20}
                color="white"
              />
              {/* <Text style={styles.locationTextSmall}>ME</Text> */}
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.buttonRow, { marginTop: 8 }]}>
          {/* ERF BTN */}
          <Button
            mode="contained"
            icon="map-marker-path"
            onPress={() => setShowErfs(true)}
            style={styles.pill}
            labelStyle={styles.labelText}
            contentStyle={styles.buttonContent}
          >
            {erfLabelStr}
          </Button>

          <View style={{ width: 6 }} />

          {/* PREMISE BTN */}
          <Button
            mode="contained"
            icon="home-city"
            onPress={() => setShowPrems(true)}
            style={styles.pill}
            labelStyle={styles.labelText}
            contentStyle={styles.buttonContent}
          >
            {`${adrLn1} ${adrLn2}`.trim()}
          </Button>

          <View style={{ width: 6 }} />

          {/* AST / METER BTN  */}
          <Button
            mode="contained"
            icon="counter"
            onPress={() => setShowMeters(true)}
            style={styles.pill}
            labelStyle={styles.labelText}
            contentStyle={styles.buttonContent}
          >
            {meterNoStr}
          </Button>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: "lightgray",
    padding: 10,
    borderBlockColor: "gray",
    borderBottomWidth: 1,
  },
  buttonRow: { flexDirection: "row", alignItems: "center" },

  labelText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.1,
  },

  modalContainer: { padding: 10, justifyContent: "center" },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
    color: "#1e293b",
  },
  wardItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  wardText: { fontSize: 15, color: "#334155" },
  subLabel: { fontSize: 12, color: "#64748b", fontWeight: "500", marginTop: 2 },
  searchBar: { marginBottom: 10, borderRadius: 10, backgroundColor: "#f8fafc" },

  pill: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "rgba(241, 245, 249, 0.98)",
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(203, 213, 225, 0.8)",
    overflow: "hidden",
  },

  locationButtonRowVersion: {
    backgroundColor: "#ef4444",
    borderColor: "#dc2626",
    borderWidth: 1,
  },

  centerMeContent: {
    height: 52,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },

  locationTextSmall: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 4,
    letterSpacing: 0.5,
  },

  buttonContent: {
    height: 52,
  },
  // wardCountText: {
  //   fontSize: 12,
  //   fontWeight: "900",
  //   color: "#2563eb",
  // },

  wardMetaDot: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94a3b8",
  },

  wardCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#106ae9",
  },
});
