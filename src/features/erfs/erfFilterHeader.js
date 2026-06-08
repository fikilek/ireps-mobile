import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Button, Dialog, Portal, Surface } from "react-native-paper";
import { useSelector } from "react-redux";

import { useGeo } from "../../context/GeoContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { getScopeDatasetSyncMetaByWard } from "../../storage/wardScopeStorage";


function getWardQueryCacheKey(lmPcode, wardPcode) {
  return `getErfsByLmPcodeWardPcode(${lmPcode}__${wardPcode})`;
}


const ErfFilterHeader = ({ selectedWard, setSelectedWard, filteredCount }) => {
  const [visible, setVisible] = useState(false);
  const showDialog = () => setVisible(true);
  const hideDialog = () => setVisible(false);

  const { geoState } = useGeo();
  const { available } = useWarehouse();
  const erfsQueries = useSelector((state) => state.erfsApi?.queries || {});

  const lmPcode = geoState?.selectedLm?.pcode || geoState?.selectedLm?.id || null;

  const wardSyncedCountsByPcode = useMemo(() => {
    if (!lmPcode) return new Map();

    const localMetaByPcode = getScopeDatasetSyncMetaByWard({
      lmPcode,
      dataset: "erfs",
    });
    const counts = new Map();

    (available?.wards || []).forEach((ward) => {
      const wardPcode = ward?.pcode || ward?.id || null;
      if (!wardPcode) return;

      const queryKey = getWardQueryCacheKey(lmPcode, wardPcode);
      const queryState = erfsQueries?.[queryKey];
      const sync = queryState?.data?.sync;
      const localMeta = localMetaByPcode.get(wardPcode);

      counts.set(
        wardPcode,
        Number(sync?.size || 0) || Number(localMeta?.size || 0),
      );
    });

    return counts;
  }, [available?.wards, erfsQueries, lmPcode]);

  const displayWardName =
    selectedWard === "ALL" || !selectedWard
      ? "All Wards"
      : selectedWard?.name || selectedWard?.code || "Ward";

  return (
    <Surface style={styles.header} elevation={1}>
      <View style={styles.row}>
        {/* 🎯 LEFT: WARD SELECTION */}
        <View style={styles.leftCol}>
          {/* <Text style={styles.label}>Active Ward</Text> */}
          <Button
            mode="outlined"
            onPress={showDialog}
            style={styles.wardButton}
            icon="filter-variant"
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            compact
          >
            {displayWardName}
          </Button>
        </View>

        {/* 📊 RIGHT: TACTICAL STATS */}
        <View style={styles.rightCol}>
          {/* <View style={styles.statsBox}> */}
          <Text style={styles.statsText}>
            Erfs:
            <Text style={{ fontWeight: "900", fontSize: 14, color: "blue" }}>
              {filteredCount}
            </Text>
          </Text>
        </View>
      </View>

      <Portal>
        <Dialog visible={visible} onDismiss={hideDialog} style={styles.dialog}>
          <Dialog.Title style={styles.modalTitle}>Select Ward</Dialog.Title>

          <Dialog.ScrollArea
            style={[styles.scrollArea, { paddingHorizontal: 0 }]}
          >
            <FlashList
              data={["ALL", ...(available?.wards || [])]}
              keyExtractor={(item, index) => `${item?.id || item || index}`}
              estimatedItemSize={60}
              renderItem={({ item }) => {
                const isAll = item === "ALL";
                const isSelected = isAll
                  ? selectedWard === "ALL" || !selectedWard
                  : selectedWard?.id === item?.id;

                const label = isAll
                  ? "All Wards (Reset)"
                  : `${item?.name || item?.code || "Ward"}`;
                const wardPcode = item?.pcode || item?.id || null;
                const syncedErfCount = isAll
                  ? 0
                  : wardSyncedCountsByPcode.get(wardPcode) || 0;

                return (
                  <TouchableOpacity
                    style={[
                      styles.wardItem,
                      isSelected && { backgroundColor: "#eff6ff" },
                    ]}
                    onPress={() => {
                      setSelectedWard(isAll ? null : item);
                      hideDialog();
                    }}
                  >
                    <View style={styles.itemInner}>
                      <View style={styles.wardLabelRow}>
                        <Text
                          style={[
                            styles.wardText,
                            isAll && { color: "#6366f1", fontWeight: "900" },
                            isSelected &&
                              !isAll && {
                                color: "#2563eb",
                                fontWeight: "bold",
                              },
                          ]}
                        >
                          {label}
                        </Text>

                        {!isAll && (
                          <>
                            <Text style={styles.wardMetaDot}>•</Text>
                            <Text style={styles.wardCountText}>
                              {syncedErfCount}
                            </Text>
                          </>
                        )}
                      </View>

                      {isSelected && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={20}
                          color={isAll ? "#6366f1" : "#2563eb"}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Dialog.ScrollArea>

          <Dialog.Actions>
            <Button onPress={hideDialog} textColor="#94a3b8">
              CLOSE
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Surface>
  );
};

export default ErfFilterHeader;

const styles = StyleSheet.create({
  targetBtn: {
    backgroundColor: "#00BFFF", // Deep Sky Blue
    flexDirection: "row",
    alignItems: "center",
    // paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 5,
    shadowColor: "#00BFFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    height: "100%",
  },
  targetText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 4,
  },
  description: {
    color: "gray", // Change description color
    fontSize: 14, // Change description font size
    fontStyle: "italic", // Make description italic
  },
  header: {
    padding: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    // flex: 1,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 40,
  },

  label: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  wardButton: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    // flex: 1,
  },
  buttonContent: {
    height: 36,
  },
  buttonLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  statsBox: {
    backgroundColor: "#f8fafc",
    // padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    // width: "100%",
  },
  statsText: {
    fontSize: 12,
    color: "#393939",
    textAlign: "right",
  },
  boldText: {
    color: "#413694",
    fontWeight: "900",
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    // marginVertical: 4,
  },

  dialog: {
    borderRadius: 20,
    backgroundColor: "white",
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1e293b",
    textAlign: "center",
    paddingVertical: 10,
  },
  scrollArea: {
    height: 350,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  wardItem: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  itemInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  wardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  wardText: {
    fontSize: 15,
    color: "#334155",
  },
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
  sortText: {
    fontSize: 6,
    fontWeight: "900",
    color: "#2563eb",
    marginTop: -2,
  },
  sortCol: {
    // flex: 0.1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#f1f5f9",
    // marginHorizontal: 4,
  },
  centerCol: {
    flex: 0.3,
    alignItems: "center",
    justifyContent: "center",
  },
  leftCol: {
    flex: 0.25,
    justifyContent: "center",
  },
  rightCol: {
    // flex: 0.4,
    padding: 10,
    borderWidth: 1,
    marginRight: 2,
    borderColor: "#cbd5e1",
    borderRadius: 8,
  },
});
