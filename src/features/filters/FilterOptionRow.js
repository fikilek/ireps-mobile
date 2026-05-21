import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Checkbox, Divider, List } from "react-native-paper";

export function FilterOptionRow({
  title,
  description = "",
  count = null,
  selected = false,
  disabled = false,
  index = null,
  icon = "",
  showCheckbox = true,
  onPress,
}) {
  const displayTitle =
    index !== null && index !== undefined ? `${index + 1}. ${title}` : title;

  return (
    <View>
      <List.Item
        title={displayTitle}
        description={description}
        titleStyle={[
          styles.title,
          selected && styles.selectedText,
          disabled && styles.disabledText,
        ]}
        descriptionStyle={styles.description}
        left={
          icon
            ? () => (
                <View style={styles.leftIconWrap}>
                  <MaterialCommunityIcons
                    name={icon}
                    size={20}
                    color={selected ? "#2563eb" : "#64748b"}
                  />
                </View>
              )
            : undefined
        }
        right={() => (
          <View style={styles.rightContainer}>
            {count !== null && count !== undefined && (
              <Text
                style={[styles.countBadge, selected && styles.selectedCount]}
              >
                {count}
              </Text>
            )}

            {showCheckbox && (
              <Checkbox
                status={selected ? "checked" : "unchecked"}
                onPress={disabled ? undefined : onPress}
                color="#2563eb"
                disabled={disabled}
              />
            )}
          </View>
        )}
        onPress={disabled ? undefined : onPress}
        style={[
          styles.rowItem,
          selected && styles.selectedRow,
          disabled && styles.disabledRow,
        ]}
      />

      <Divider style={styles.divider} />
    </View>
  );
}

export default FilterOptionRow;

const styles = StyleSheet.create({
  rowItem: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },

  selectedRow: {
    backgroundColor: "#eff6ff",
  },

  disabledRow: {
    opacity: 0.55,
  },

  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },

  selectedText: {
    color: "#2563eb",
  },

  disabledText: {
    color: "#94a3b8",
  },

  description: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },

  leftIconWrap: {
    justifyContent: "center",
    paddingLeft: 6,
    paddingRight: 2,
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
    color: "#ffffff",
  },

  divider: {
    backgroundColor: "#f1f5f9",
  },
});
