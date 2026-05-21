import { FlashList } from "@shopify/flash-list";
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useWarehouse } from "../../context/WarehouseContext";
import { useAstFilter } from "../../hooks/useAstFilter";
import AstItem from "./astItem";
import { filterAsts } from "./filterAsts";

export default function AstsScreen() {
  const { filtered, sync, loading } = useWarehouse();
  const { filterState, isFiltering } = useAstFilter();

  const baseAsts = useMemo(() => {
    return filtered?.meters || [];
  }, [filtered?.meters]);

  const asts = useMemo(() => {
    return filterAsts(baseAsts, filterState);
  }, [baseAsts, filterState]);

  const scopeSync = sync?.scope || {};

  const isLoading = loading;
  const noWard = scopeSync?.status === "awaiting-ward";

  if (noWard) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>
          Select a ward to view field meters.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Synchronizing Assets...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={asts}
        renderItem={({ item }) => <AstItem item={item} />}
        keyExtractor={(item) => item?.id || item?.trnId}
        estimatedItemSize={120}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={[styles.center, { paddingTop: 40 }]}>
            <Text style={styles.loadingText}>
              {isFiltering
                ? "No meters match the current filters."
                : "No meters in this ward."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
    textAlign: "center",
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "600",
  },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 8 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
  },
  iconContainer: { marginRight: 16 },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  details: { flex: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  meterNo: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  typeBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeText: { fontSize: 9, fontWeight: "900" },
  addressRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  addressText: {
    marginLeft: 4,
    color: "#1E293B",
    fontWeight: "600",
    fontSize: 13,
  },
  subDetail: { fontSize: 13, color: "#64748B", marginBottom: 8 },
  statusRow: { flexDirection: "row", alignItems: "center" },
  statusInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  statusLabel: { fontSize: 12, fontWeight: "700", marginLeft: 4 },
  mapButton: { padding: 8, backgroundColor: "#F1F5F9", borderRadius: 8 },
});
