import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export default function TargetedBatchActionTile({ label, value, helperText, icon, tone = "default", disabled = false, opening = false, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value ?? "data issue"}`} disabled={disabled || opening} onPress={onPress}
      style={({ pressed }) => [styles.tile, tone === "issue" && styles.issue, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <View style={styles.labelRow}>
        {icon ? <MaterialCommunityIcons name={icon} size={14} color="#475569" /> : null}
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </View>
      {opening ? <ActivityIndicator size="small" color="#2563eb" /> : <Text style={[styles.value, tone === "issue" && styles.issueText]} numberOfLines={1}>{value === null || value === undefined ? "—" : value}</Text>}
      {helperText ? <Text style={styles.helper} numberOfLines={1}>{helperText}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minHeight: 78, paddingHorizontal: 4, paddingVertical: 8, alignItems: "center", justifyContent: "space-between", borderRightWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 3 }, label: { color: "#475569", fontSize: 9, fontWeight: "900" },
  value: { color: "#0f172a", fontSize: 18, fontWeight: "900" }, helper: { color: "#64748b", fontSize: 7, fontWeight: "800", textAlign: "center" },
  disabled: { backgroundColor: "#f8fafc", opacity: 0.72 }, issue: { backgroundColor: "#fff7ed" }, issueText: { color: "#c2410c" }, pressed: { backgroundColor: "#eff6ff" },
});
