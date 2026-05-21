import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getAstCaptureSource,
  getAstMeterService,
  getAstMeterType,
  getAstOffGridSupplyState,
  getAstSealState,
  getAstStatus,
  getAstVisibility,
} from "./filterAsts";

function countValues(list = [], getValue) {
  const map = new Map();

  list.forEach((item) => {
    const value = getValue(item) || "NAv";
    map.set(value, (map.get(value) || 0) + 1);
  });

  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => String(a.value).localeCompare(String(b.value)));
}

function StatSection({ title, icon, rows = [] }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name={icon} size={18} color="#2563EB" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {rows.length === 0 ? (
        <Text style={styles.emptyText}>No values found.</Text>
      ) : (
        rows.map((row) => (
          <View key={`${title}-${row.value}`} style={styles.statRow}>
            <Text style={styles.statLabel}>
              {String(row.value).replaceAll("_", " ")}
            </Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{row.count}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export function AstStatsModal({
  visible,
  onClose,
  baseAsts = [],
  filteredAsts = [],
  isFiltering = false,
}) {
  const stats = useMemo(() => {
    const list = isFiltering ? filteredAsts : baseAsts;

    return {
      services: countValues(list, getAstMeterService),
      types: countValues(list, getAstMeterType),
      statuses: countValues(list, getAstStatus),
      visibility: countValues(list, getAstVisibility),
      offGrid: countValues(list, getAstOffGridSupplyState),
      seals: countValues(list, getAstSealState),
      sources: countValues(list, getAstCaptureSource),
    };
  }, [baseAsts, filteredAsts, isFiltering]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons
                name="chart-box-outline"
                size={23}
                color="#2563EB"
              />
            </View>

            <View style={styles.titleWrap}>
              <Text style={styles.title}>Meter Stats</Text>
              <Text style={styles.subtitle}>
                {isFiltering
                  ? `${filteredAsts.length} filtered from ${baseAsts.length}`
                  : `${baseAsts.length} meters in current scope`}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Visible List</Text>
              <Text style={styles.totalValue}>
                {isFiltering ? filteredAsts.length : baseAsts.length}
              </Text>
            </View>

            <StatSection
              title="Meter Service"
              icon="water-outline"
              rows={stats.services}
            />
            <StatSection title="Meter Type" icon="counter" rows={stats.types} />
            <StatSection
              title="Meter Status"
              icon="check-circle-outline"
              rows={stats.statuses}
            />
            <StatSection
              title="Visibility"
              icon="eye-outline"
              rows={stats.visibility}
            />
            <StatSection
              title="Off-grid Supply"
              icon="solar-power-variant-outline"
              rows={stats.offGrid}
            />
            <StatSection
              title="Seal Number"
              icon="lock-check-outline"
              rows={stats.seals}
            />
            <StatSection
              title="Meter Capture Source"
              icon="database-import-outline"
              rows={stats.sources}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default AstStatsModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "86%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  titleWrap: { flex: 1 },
  title: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { maxHeight: 600 },
  scrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  totalBox: {
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 14,
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#1D4ED8",
    textTransform: "uppercase",
  },
  totalValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "900",
    color: "#0F172A",
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0F172A",
  },
  statRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  statLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
  },
  countPill: {
    minWidth: 34,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#475569",
  },
  emptyText: {
    padding: 12,
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
});
