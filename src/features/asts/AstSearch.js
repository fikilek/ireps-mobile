import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export function AstSearch({ visible, onClose, value, onChange }) {
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
                name="magnify"
                size={22}
                color="#2563EB"
              />
            </View>

            <View style={styles.titleWrap}>
              <Text style={styles.title}>Search Meters</Text>
              <Text style={styles.subtitle}>
                Search by meter no, ERF, address, manufacturer, status, or
                geofence.
              </Text>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrap}>
            <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder="Search meters..."
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            {String(value || "").trim() ? (
              <TouchableOpacity onPress={() => onChange("")}>
                <MaterialCommunityIcons
                  name="close-circle"
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity style={styles.applyButton} onPress={onClose}>
            <Text style={styles.applyText}>APPLY SEARCH</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default AstSearch;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
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
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    lineHeight: 15,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 46,
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  applyButton: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
