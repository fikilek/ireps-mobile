import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Surface } from "react-native-paper";

import MissionDiscoveryModal from "../../../components/MissionDiscoveryModal";
import MissionInstallationModal from "../../../components/MissionInstallationModal";
import { useDiscovery } from "../../../src/context/DiscoveryContext";
import { useGeo } from "../../../src/context/GeoContext";
import { useInstallation } from "../../../src/context/InstallationContext";
import { usePremiseFilter } from "../../../src/context/PremiseFilterContext";
import { useWarehouse } from "../../../src/context/WarehouseContext";
import PremiseCard from "../../../src/features/premises/PremiseCard";
import { filterPremises } from "../../../src/features/premises/filterPremises";

export default function PremisesScreen() {
  const router = useRouter();
  const { all, loading, scopeState } = useWarehouse();

  const { openMissionDiscovery } = useDiscovery();
  const { openMissionInstallation } = useInstallation();

  const { geoState, updateGeo } = useGeo();
  const { selectedLm, selectedWard, selectedErf, selectedPremise } = geoState;

  const { filterState } = usePremiseFilter();

  const erfById = useMemo(() => {
    const map = {};
    (all?.erfs || []).forEach((erf) => {
      if (erf?.id) map[erf.id] = erf;
    });
    return map;
  }, [all?.erfs]);

  const screenMode = useMemo(() => {
    if (!selectedLm) return "no-lm";
    if (!selectedWard) return "lm-overview";
    if (scopeState === "invalid-ward") return "invalid-ward";
    if (loading) return "loading";
    if (selectedErf) return "erf-scope";
    return "ward-scope";
  }, [selectedLm, selectedWard, selectedErf, scopeState, loading]);

  const basePremises = useMemo(() => {
    if (!selectedWard) return [];
    if (!selectedErf) return all?.prems || [];
    return (all?.prems || []).filter((p) => p?.erfId === selectedErf?.id);
  }, [all?.prems, selectedWard, selectedErf]);

  const displayPremises = useMemo(() => {
    return filterPremises(basePremises, filterState);
  }, [basePremises, filterState]);

  const handleMapPress = useCallback(
    (p) => {
      const parentErf = erfById[p?.erfId] || null;

      updateGeo({
        selectedErf: parentErf,
        selectedPremise: p,
        lastSelectionType: "PREMISE",
      });

      router.replace("/(tabs)/maps");
    },
    [erfById, router, updateGeo],
  );

  const handleEditPremise = useCallback(
    (p) => {
      router.push({
        pathname: "/premises/formPremise",
        params: { id: p?.erfId, premiseId: p?.id },
      });
    },
    [router],
  );

  const handleInstall = useCallback(
    (p) => {
      const parentErf = erfById[p?.erfId] || null;

      updateGeo({
        selectedErf: parentErf || null,
        selectedPremise: p,
        lastSelectionType: "PREMISE",
      });

      openMissionInstallation({
        premiseId: p?.id,
        premise: p,
      });
    },
    [erfById, updateGeo, openMissionInstallation],
  );

  const handleDiscover = useCallback(
    (p) => {
      const parentErf = erfById[p?.erfId] || null;

      updateGeo({
        selectedErf: parentErf || null,
        selectedPremise: p,
        lastSelectionType: "PREMISE",
      });

      openMissionDiscovery({
        premiseId: p?.id,
        premise: p,
      });
    },
    [erfById, updateGeo, openMissionDiscovery],
  );

  const handleNaPress = useCallback(
    (p) => {
      router.push({
        pathname: "/premises/NaScreen",
        params: { premiseId: p?.id },
      });
    },
    [router],
  );

  const handleDuplicate = useCallback(
    (p) => {
      router.push({
        pathname: "/premises/formPremise",
        params: { id: p?.erfId, duplicateId: p?.id },
      });
    },
    [router],
  );

  const handleAccountPress = useCallback(
    (p) => {
      router.push({
        pathname: "/(tabs)/premises/formAccountData",
        params: { premiseId: p?.id },
      });
    },
    [router],
  );

  const renderPremiseItem = useCallback(
    ({ item }) => {
      const parentErf = erfById[item?.erfId];
      const wardName = parentErf?.admin?.ward?.name || "W?";
      const wardNo = String(wardName).replace(/\D/g, "");
      const isSelected = selectedPremise?.id === item?.id;

      return (
        <View
          style={[
            isSelected ? styles.selectedCardWrap : undefined,
            { marginVertical: 8 },
          ]}
        >
          <PremiseCard
            item={item}
            wardNo={wardNo}
            onMapPress={handleMapPress}
            onDiscover={handleDiscover}
            onInstall={handleInstall}
            onEditPress={handleEditPremise}
            onNaPress={handleNaPress}
            onDuplicate={handleDuplicate}
            onAccountPress={handleAccountPress}
          />
        </View>
      );
    },
    [
      erfById,
      selectedPremise?.id,
      handleEditPremise,
      handleMapPress,
      handleDiscover,
      handleInstall,
      handleNaPress,
      handleDuplicate,
      handleAccountPress,
    ],
  );

  const scopeTitle = useMemo(() => {
    if (!selectedLm) return "No municipality selected";
    if (!selectedWard) return "LM Overview";
    if (selectedErf) {
      return `Premises for ERF ${selectedErf?.erfNo || selectedErf?.id || ""}`;
    }
    return `Premises for ${selectedWard?.name || selectedWard?.id || ""}`;
  }, [selectedLm, selectedWard, selectedErf]);

  if (screenMode === "no-lm") {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons
          name="map-marker-off-outline"
          size={64}
          color="#CBD5E1"
        />
        <Text style={styles.emptyText}>No municipality selected.</Text>
      </View>
    );
  }

  if (screenMode === "lm-overview") {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons
          name="map-search-outline"
          size={64}
          color="#CBD5E1"
        />
        <Text style={styles.emptyText}>Select a ward to view premises.</Text>
      </View>
    );
  }

  if (screenMode === "invalid-ward") {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={64}
          color="#F59E0B"
        />
        <Text style={styles.emptyText}>
          Selected ward is invalid for this municipality.
        </Text>
      </View>
    );
  }

  if (screenMode === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2563eb" />
        <Text style={styles.loadingText}>Loading premises...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.scopeBanner}>
        <View>
          <Text style={styles.scopeTitle}>{scopeTitle}</Text>
          <Text style={styles.scopeSubtitle}>
            {displayPremises.length} premise
            {displayPremises.length === 1 ? "" : "s"}
          </Text>
        </View>
        <View>
          {selectedErf ? (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/premises/formPremise",
                  params: {
                    id: selectedErf?.id,
                  },
                })
              }
              style={styles.addHeaderBtn}
            >
              <MaterialCommunityIcons
                name="plus-box"
                size={48}
                color="#059669"
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/erfs")}
              style={styles.selectErfBtn}
            >
              <MaterialCommunityIcons
                name="vector-square"
                size={26}
                color="#2563eb"
              />

              <View style={styles.selectErfTextBlock}>
                <Text style={styles.selectErfSubtitle}>To ceate premise</Text>
                <Text style={styles.selectErfTitle}>SELECT ERF</Text>
              </View>

              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color="#64748b"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlashList
        data={displayPremises}
        keyExtractor={(item) => item?.id}
        estimatedItemSize={180}
        contentContainerStyle={{ padding: 12 }}
        renderItem={renderPremiseItem}
        ListEmptyComponent={() =>
          selectedErf ? (
            <View style={styles.container}>
              <View style={styles.emptyStateContainer}>
                <MaterialCommunityIcons
                  name="office-building-plus"
                  size={80}
                  color="#cbd5e1"
                />
                <Text style={styles.emptyTitle}>No Structure Captured</Text>
                <Text style={styles.emptySubText}>
                  This Erf currently has no premises recorded.
                </Text>
                <TouchableOpacity
                  style={styles.initializeBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/premises/formPremise",
                      params: {
                        id: selectedErf?.id,
                      },
                    })
                  }
                >
                  <Text style={styles.initializeBtnText}>
                    ADD FIRST PREMISE
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => router.push("/(tabs)/erfs")}>
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: 50,
                }}
              >
                <Surface style={styles.card} elevation={1}>
                  <Text style={{ margin: 10 }}>
                    There is currently no Erf selected
                  </Text>
                  <Text
                    style={{
                      margin: 30,
                      padding: 10,
                      fontSize: 30,
                      color: "blue",
                      fontWeight: "500",
                    }}
                  >
                    SELECT ERF
                  </Text>
                </Surface>
              </View>
            </TouchableOpacity>
          )
        }
      />

      <MissionDiscoveryModal />
      <MissionInstallationModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontWeight: "600",
  },

  scopeBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  scopeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },

  scopeSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },

  emptyContainer: {
    alignItems: "center",
    marginTop: 100,
    paddingHorizontal: 24,
  },

  emptyText: {
    color: "#94A3B8",
    marginTop: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  selectedCardWrap: {
    borderWidth: 4,
    borderColor: "#90b3ff",
    borderRadius: 16,
  },

  modalContainer: {
    backgroundColor: "white",
    padding: 20,
    margin: 20,
    borderRadius: 12,
  },

  modalTitle: {
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 20,
    fontSize: 18,
    color: "#0F172A",
  },

  modalCard: {
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },

  modalLabel: {
    fontWeight: "700",
    color: "#334155",
  },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },

  confirmButton: {
    marginTop: 10,
    borderRadius: 8,
    height: 50,
    justifyContent: "center",
  },

  groupContainer: { marginBottom: 16 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#e2e8f0",
    gap: 8,
  },
  groupHeaderText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 1,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#475569",
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  initializeBtn: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  initializeBtnText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  addBtn: {
    backgroundColor: "#059669",
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },

  selectErfBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },

  selectErfTextBlock: {
    marginLeft: 10,
    marginRight: 10,
  },

  selectErfTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2563eb",
    letterSpacing: 0.5,
  },

  selectErfSubtitle: {
    fontSize: 9,
    color: "#64748b",
    marginTop: 1,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
});
