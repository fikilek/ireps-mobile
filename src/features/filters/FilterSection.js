import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { List } from "react-native-paper";

export function FilterSection({
  title,
  subtitle = "",
  icon = "filter-variant",
  count = null,
  emptyText = "",
  isEmpty = false,
  onHelpPress,
  children,
}) {
  return (
    <List.Section>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name={icon} size={18} color="#2563eb" />
          <Text style={styles.sectionTitle}>{title}</Text>

          {count !== null && count !== undefined && (
            <Text style={styles.countBadge}>{count}</Text>
          )}

          {!!onHelpPress && (
            <TouchableOpacity style={styles.helpBtn} onPress={onHelpPress}>
              <MaterialCommunityIcons
                name="help-circle-outline"
                size={21}
                color="#2563eb"
              />
            </TouchableOpacity>
          )}
        </View>

        {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>

      {isEmpty ? (
        <View style={styles.emptySectionWrap}>
          <Text style={styles.emptySectionText}>
            {emptyText || "No filter options available."}
          </Text>
        </View>
      ) : (
        children
      )}
    </List.Section>
  );
}

export default FilterSection;

const styles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    color: "#334155",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  sectionSubtitle: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },

  countBadge: {
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 22,
  },

  helpBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
  },

  emptySectionWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  emptySectionText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
});
