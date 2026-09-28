import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * 🏛️ ERF ITEM (MEMOIZED)
 * Optimized for high-performance listing on budget devices.
 */
export const ErfItem = React.memo(
  ({ item, isActive, onSelect, onMapPress, onErfDetailPress }) => {
    // 🎯 CORE DATA EXTRACTION
    const premiseCount = item?.premises?.length ?? 0;
    const summaryIcon = item?.summaryIcon || "home-city-outline";
    const wardNo = item?.admin?.ward?.name || "N/A";

    // 🕒 CHRONOS OPTIMIZATION: Memoize time calculation to save CPU cycles during scroll
    const relativeTime = useMemo(() => {
      const updatedAt = item?.metadata?.updatedAt;
      if (!updatedAt) return "No recent activity";
      try {
        return formatDistanceToNow(new Date(updatedAt), { addSuffix: true });
      } catch (e) {
        return "Time sync error";
      }
    }, [item?.metadata?.updatedAt]);

    return (
      <View style={[styles.itemWrapper, isActive && styles.activeItemWrapper]}>
        <View style={styles.itemContainer}>
          {/* 🎯 PILLAR 1: SELECTION & INFO (LEFT) */}
          <TouchableOpacity
            style={styles.infoSection}
            onPress={() => onSelect(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.row}>
              <Text style={[styles.parcelText, isActive && styles.activeText]}>
                ERF {item.erfNo || "N/A"}
              </Text>
              <Text style={styles.wardTag}>{wardNo}</Text>
            </View>

            <Text style={styles.idText}>{item.id || "NAv"}</Text>

            <View style={styles.timeRow}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={10}
                color="#94a3b8"
              />
              <Text style={styles.timeText}>{relativeTime}</Text>
            </View>
          </TouchableOpacity>

          {/* 🎯 PILLAR 2: PREMISE DASHBOARD (CENTER) */}
          <TouchableOpacity
            style={styles.premiseSection}
            onPress={() => onErfDetailPress(item)}
          >
            <View style={styles.dashboardRowCentric}>
              <MaterialCommunityIcons
                name={summaryIcon}
                size={22}
                color={isActive ? "#4CAF50" : "#455a64"}
              />
              <Text style={styles.bigCountText}>{premiseCount}</Text>
            </View>
          </TouchableOpacity>

          {/* 🎯 PILLAR 3: MAP TRANSITION (RIGHT) */}
          <TouchableOpacity
            style={styles.actionSection}
            onPress={() => onMapPress(item.id)}
          >
            <View
              style={[styles.iconCircle, isActive && styles.activeIconCircle]}
            >
              <MaterialCommunityIcons
                name="map-search"
                size={24}
                color={isActive ? "#4CAF50" : "#00BFFF"}
              />
            </View>
            <Text
              style={[styles.mapLinkText, isActive && { color: "#4CAF50" }]}
            >
              {isActive ? "GO TO" : "MAP"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // 🛡️ THE GATEKEEPER: Prevent re-renders unless essential data actually changes

    return (
      prevProps.isActive === nextProps.isActive &&
      prevProps.item.id === nextProps.item.id &&
      // 🎯 THE CRITICAL ADDITION: Check if premises array length has changed
      prevProps.item.premises?.length === nextProps.item.premises?.length &&
      prevProps.item.metadata?.updatedAt === nextProps.item.metadata?.updatedAt
    );

    // return (
    //   prevProps.isActive === nextProps.isActive &&
    //   prevProps.item.id === nextProps.item.id &&
    //   prevProps.item.metadata?.updatedAt === nextProps.item.metadata?.updatedAt
    // );
  },
);

// 🏛️ FIX: Explicit Display Name for React DevTools
ErfItem.displayName = "ErfItem";

const styles = StyleSheet.create({
  itemWrapper: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "white",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  activeItemWrapper: {
    borderColor: "#00BFFF",
    borderWidth: 2,
    backgroundColor: "#f0faff",
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  infoSection: { flex: 1.5 },
  premiseSection: {
    flex: 0.6,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#f1f5f9",
  },
  actionSection: { flex: 0.5, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  parcelText: { fontSize: 18, fontWeight: "800", color: "#2c3e50" },
  activeText: { color: "#00BFFF" },
  wardTag: {
    paddingLeft: 6,
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
  idText: { fontSize: 10, color: "#94a3b8", fontFamily: "monospace" },
  timeRow: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 },
  timeText: {
    fontSize: 9,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dashboardRowCentric: { alignItems: "center", gap: 2 },
  bigCountText: { fontSize: 16, fontWeight: "900", color: "#334155" },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  activeIconCircle: { backgroundColor: "#e8f5e9" },
  mapLinkText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#00BFFF",
    marginTop: 4,
  },
});
