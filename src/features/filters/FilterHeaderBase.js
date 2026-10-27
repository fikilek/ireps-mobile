import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Badge } from "react-native-paper";

export function FilterHeaderBase({
  totalLabel = "TOTAL",
  filteredLabel = "FILTERED",
  totalCount = 0,
  filteredCount = 0,
  searchLabel = "SEARCH",

  showSearch = false,
  isFiltering = false,
  filterCount = 0,

  onSearchPress,
  onStatsPress,
  onFilterPress,
  onQuickReset,
  onWorkOrdersPress,
  onFailedTogglePress,

  showStatsButton = true,
  showSearchButton = true,
  showFilterButton = true,
  showWorkOrdersButton = Boolean(onWorkOrdersPress),
  showFailedToggleButton = Boolean(onFailedTogglePress),
  isFailedActive = false,
  compactSearch = false,
}) {
  const safeTotalCount = Number(totalCount || 0);
  const safeFilteredCount = Number(filteredCount || 0);
  const safeFilterCount = Number(filterCount || 0);

  const isSearchCompact =
    compactSearch || showWorkOrdersButton || showFailedToggleButton;

  return (
    <View style={styles.headerContainer}>
      <View
        style={[
          styles.leftSection,
          !showStatsButton &&
            !showFilterButton &&
            !showWorkOrdersButton &&
            !showFailedToggleButton &&
            styles.leftSectionOnly,
        ]}
      >
        <View style={styles.statPod}>
          <Text style={styles.statLabel}>{totalLabel}</Text>
          <Text style={styles.statValue}>{safeTotalCount}</Text>
        </View>

        <View style={styles.podDivider} />

        <View style={styles.statPod}>
          <Text style={[styles.statLabel, isFiltering && styles.activeText]}>
            {filteredLabel}
          </Text>
          <Text style={[styles.statValue, isFiltering && styles.activeText]}>
            {safeFilteredCount}
          </Text>
        </View>

        {showSearchButton && !showSearch && (
          <>
            <View style={styles.podDivider} />
            <TouchableOpacity
              style={[
                styles.searchPod,
                isSearchCompact && styles.searchPodCompact,
              ]}
              onPress={onSearchPress}
              accessibilityRole="button"
              accessibilityLabel={searchLabel}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {!isSearchCompact && (
                <Text style={styles.statLabel} numberOfLines={1}>
                  {searchLabel}
                </Text>
              )}
              <MaterialCommunityIcons
                name="magnify"
                size={22}
                color="#2563eb"
                style={!isSearchCompact && { marginTop: -2 }}
              />
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.rightSection}>
        {showWorkOrdersButton && (
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={onWorkOrdersPress}
            accessibilityRole="button"
            accessibilityLabel="My Work Orders"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={22}
              color="#475569"
            />
          </TouchableOpacity>
        )}

        {showFailedToggleButton && (
          <TouchableOpacity
            style={[
              styles.actionIconBtn,
              isFailedActive && styles.failedToggleBtnActive,
            ]}
            onPress={onFailedTogglePress}
            accessibilityRole="button"
            accessibilityState={{ selected: isFailedActive }}
            accessibilityLabel={
              isFailedActive
                ? "Show all transactions"
                : "Show failed transactions"
            }
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons
              name={isFailedActive ? "alert-circle" : "alert-circle-outline"}
              size={22}
              color={isFailedActive ? "#dc2626" : "#64748b"}
            />
          </TouchableOpacity>
        )}

        {showStatsButton && (
          <TouchableOpacity
            style={styles.statsBtn}
            onPress={onStatsPress}
            accessibilityRole="button"
            accessibilityLabel="Statistics"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons
              name="chart-box-outline"
              size={22}
              color="#64748b"
            />
          </TouchableOpacity>
        )}

        {showFilterButton && (
          <View
            style={[styles.filterPod, isFiltering && styles.filterPodActive]}
          >
            {isFiltering && (
              <TouchableOpacity
                style={styles.podActionBtn}
                onPress={onQuickReset}
                accessibilityRole="button"
                accessibilityLabel="Reset filters"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialCommunityIcons
                  name="filter-off-outline"
                  size={20}
                  color="#ef4444"
                />
              </TouchableOpacity>
            )}

            {isFiltering && <View style={styles.podDivider} />}

            <TouchableOpacity
              style={styles.podActionBtn}
              onPress={onFilterPress}
              accessibilityRole="button"
              accessibilityLabel="Open filters"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <View>
                <MaterialCommunityIcons
                  name={isFiltering ? "filter" : "filter-variant"}
                  size={22}
                  color={isFiltering ? "#2563eb" : "#1e293b"}
                />

                {isFiltering && safeFilterCount > 0 && (
                  <Badge size={14} style={styles.filterBadge}>
                    {safeFilterCount}
                  </Badge>
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

export default FilterHeaderBase;

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginRight: 10,
  },

  leftSectionOnly: {
    marginRight: 0,
  },

  statPod: {
    alignItems: "center",
    paddingHorizontal: 6,
  },

  searchPod: {
    alignItems: "center",
    paddingHorizontal: 6,
    maxWidth: 78,
  },

  searchPodCompact: {
    maxWidth: 36,
    paddingHorizontal: 4,
    justifyContent: "center",
  },

  statLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: "#94a3b8",
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  statValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#334155",
  },

  activeText: {
    color: "#2563eb",
  },

  podDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 2,
  },

  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  actionIconBtn: {
    padding: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  failedToggleBtnActive: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },

  statsBtn: {
    padding: 6,
    marginRight: 2,
  },

  filterPod: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 2,
  },

  filterPodActive: {
    borderColor: "#dbeafe",
    backgroundColor: "#f0f7ff",
  },

  podActionBtn: {
    padding: 6,
  },

  filterBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#2563eb",
  },
});
