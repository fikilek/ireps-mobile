import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Checkbox,
  Divider,
  List,
  Modal,
  Portal,
  Text,
} from "react-native-paper";
import { FORM_TEXT } from "../../theme/formColors";

export const PremiseFilterModal = ({
  visible,
  onClose,
  filterState,
  setFilterState,
  allData,
  stats,
}) => {
  // 🛰️ TACTICAL INTELLIGENCE: Calculate counts per property type
  const typeStats = useMemo(() => {
    const stats = {};
    allData?.prems?.forEach((p) => {
      const type = p?.propertyType?.type || "Uncategorized";
      stats[type] = (stats[type] || 0) + 1;
    });

    // Convert to sorted array for consistent display
    return Object.entries(stats)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [allData]);

  const geofenceStats = useMemo(() => {
    const statsMap = {};

    (allData?.prems || []).forEach((premise) => {
      const refs = Array.isArray(premise?.geofenceRefs)
        ? premise.geofenceRefs
        : [];

      refs.forEach((gf) => {
        if (!gf?.id) return;

        if (!statsMap[gf.id]) {
          statsMap[gf.id] = {
            id: gf.id,
            name: gf.name || gf.id,
            count: 0,
          };
        }

        statsMap[gf.id].count += 1;
      });
    });

    return Object.values(statsMap).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")),
    );
  }, [allData?.prems]);

  // const geofenceStats = useMemo(() => {
  //   const geofenceMap = {};
  //   const sourceGeofences = allData?.geofences || [];

  //   sourceGeofences.forEach((gf) => {
  //     if (!gf?.id) return;
  //     geofenceMap[gf.id] = gf;
  //   });

  //   const statsMap = {};

  //   (allData?.prems || []).forEach((premise) => {
  //     const ids = Array.isArray(premise?.geofenceIds)
  //       ? premise.geofenceIds
  //       : [];

  //     ids.forEach((geofenceId) => {
  //       if (!geofenceId) return;

  //       if (!statsMap[geofenceId]) {
  //         const geofence = geofenceMap[geofenceId];

  //         statsMap[geofenceId] = {
  //           id: geofenceId,
  //           name: geofence?.name || geofence?.description,
  //           count: 0,
  //         };
  //       }

  //       statsMap[geofenceId].count += 1;
  //     });
  //   });

  //   return Object.values(statsMap).sort((a, b) =>
  //     String(a.name || "").localeCompare(String(b.name || "")),
  //   );
  // }, [allData?.prems, allData?.geofences]);

  const toggleType = (type) => {
    setFilterState((prev) => {
      const activeTypes = prev?.propertyTypes || [];
      const isSelected = activeTypes.includes(type);
      return {
        ...prev,
        propertyTypes: isSelected
          ? activeTypes.filter((t) => t !== type)
          : [...activeTypes, type],
      };
    });
  };

  const toggleGeofence = (geofenceId) => {
    setFilterState((prev) => {
      const activeIds = prev?.geofenceIds || [];
      const isSelected = activeIds.includes(geofenceId);

      return {
        ...prev,
        geofenceIds: isSelected
          ? activeIds.filter((id) => id !== geofenceId)
          : [...activeIds, geofenceId],
      };
    });
  };

  const resetFilters = () =>
    setFilterState({
      searchQuery: "",
      propertyTypes: [],
      occupancyStatuses: [],
      geofenceIds: [],
      electricityMeterCounts: [],
      waterMeterCounts: [],
      noAccessCounts: [],
    });

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Tactical Filter</Text>
          <Button onPress={resetFilters} textColor="#ef4444">
            RESET
          </Button>
        </View>

        <ScrollView style={styles.scroll}>
          <List.Section title="1. Property Type Distribution">
            {typeStats.map((item, index) => {
              const isSelected = filterState?.propertyTypes?.includes(
                item.type,
              );
              return (
                <View key={item.type}>
                  <List.Item
                    title={`${index + 1}. ${item.type}`}
                    titleStyle={[
                      styles.typeTitle,
                      isSelected && styles.selectedText,
                    ]}
                    right={() => (
                      <View style={styles.rightContainer}>
                        <Text
                          style={[
                            styles.countBadge,
                            isSelected && styles.selectedCount,
                          ]}
                        >
                          {item.count}
                        </Text>
                        <Checkbox
                          status={isSelected ? "checked" : "unchecked"}
                          onPress={() => toggleType(item.type)}
                          color="#2563eb"
                        />
                      </View>
                    )}
                    onPress={() => toggleType(item.type)}
                    style={[styles.rowItem, isSelected && styles.selectedRow]}
                  />
                  <Divider style={styles.divider} />
                </View>
              );
            })}
          </List.Section>

          <List.Section title="2. Geofence Membership">
            {geofenceStats.length === 0 ? (
              <View style={styles.emptySectionWrap}>
                <Text style={styles.emptySectionText}>
                  No geofence-linked premises found.
                </Text>
              </View>
            ) : (
              geofenceStats.map((item, index) => {
                const isSelected = filterState?.geofenceIds?.includes(item.id);
                console.log(`item`, item);
                return (
                  <View key={item.id}>
                    <List.Item
                      title={`${index + 1}. ${item.name}`}
                      titleStyle={[
                        styles.typeTitle,
                        isSelected && styles.selectedText,
                      ]}
                      right={() => (
                        <View style={styles.rightContainer}>
                          <Text
                            style={[
                              styles.countBadge,
                              isSelected && styles.selectedCount,
                            ]}
                          >
                            {item.count}
                          </Text>
                          <Checkbox
                            status={isSelected ? "checked" : "unchecked"}
                            onPress={() => toggleGeofence(item.id)}
                            color="#2563eb"
                          />
                        </View>
                      )}
                      onPress={() => toggleGeofence(item.id)}
                      style={[styles.rowItem, isSelected && styles.selectedRow]}
                    />
                    <Divider style={styles.divider} />
                  </View>
                );
              })
            )}
          </List.Section>
        </ScrollView>

        <Button mode="contained" onPress={onClose} style={styles.applyBtn}>
          APPLY TO {allData?.prems?.length || 0} PREMISES
        </Button>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    margin: 20,
    borderRadius: 20,
    maxHeight: "80%", // 🛡️ Larger height for the list view
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  title: { fontSize: 20, fontWeight: "900", color: FORM_TEXT },
  scroll: { paddingBottom: 20 },
  rowItem: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  selectedRow: {
    backgroundColor: "#eff6ff", // Very light blue
  },
  typeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: FORM_TEXT,
  },
  selectedText: {
    color: "#2563eb",
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
    minWidth: 35,
    textAlign: "center",
  },
  selectedCount: {
    backgroundColor: "#2563eb",
    color: "white",
  },
  divider: { backgroundColor: "#f1f5f9" },
  applyBtn: {
    margin: 20,
    borderRadius: 12,
    paddingVertical: 6,
    backgroundColor: "#2563eb",
  },
  rowDescription: {
    color: FORM_TEXT,
    fontSize: 12,
    fontWeight: "600",
  },

  emptySectionWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  emptySectionText: {
    color: FORM_TEXT,
    fontSize: 13,
    fontWeight: "600",
  },
});
