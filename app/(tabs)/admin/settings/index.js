import { useAuth } from "@/src/hooks/useAuth";
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from "@/src/redux/settingsApi";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function SettingsManagerScreen() {
  const { user } = useAuth();
  const { data: settings, isLoading } = useGetSettingsQuery();
  const [updateSettings] = useUpdateSettingsMutation();

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [newItemText, setNewItemText] = useState("");

  // --- Logic: Update Firestore ---
  const handleSave = async (updatedOptions) => {
    try {
      await updateSettings({
        id: selectedDoc.id,
        data: {
          options: updatedOptions,
          metadata: {
            ...selectedDoc.metadata,
            updatedAt: new Date().toISOString(),
            updatedByUid: user.uid,
            updatedByUser: `${user.name} ${user.surname}`,
          },
        },
      }).unwrap();
      Alert.alert("Success", "Settings updated for all agents.");
    } catch (err) {
      Alert.alert("Error", "Failed to sync settings.");
    }
  };

  // --- Logic: Add Item to Array ---
  const addItem = () => {
    if (!newItemText.trim()) return;
    let newOptions = [];

    if (selectedDoc.name === "anomalies") {
      // Special handling for the PDF Nested Anomaly structure
      newOptions = [
        ...selectedDoc.options,
        { anomaly: newItemText, anomalyDetails: ["New Detail"] },
      ];
    } else {
      newOptions = [...selectedDoc.options, newItemText];
    }

    handleSave(newOptions);
    setNewItemText("");
  };

  const removeItem = (index) => {
    const filtered = selectedDoc.options.filter((_, i) => i !== index);
    handleSave(filtered);
  };

  if (isLoading)
    return (
      <View style={styles.center}>
        <Text>Syncing with SMARS Cloud...</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <FlatList
        data={settings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.settingCard}
            onPress={() => setSelectedDoc(item)}
          >
            <View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>
                {item.options.length} items active
              </Text>
            </View>
            <MaterialCommunityIcons
              name="cog-outline"
              size={24}
              color="#007bff"
            />
          </Pressable>
        )}
      />

      {/* 🛠️ Edit Modal */}
      <Modal visible={!!selectedDoc} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedDoc?.title}</Text>
              <Pressable onPress={() => setSelectedDoc(null)}>
                <MaterialCommunityIcons name="close" size={24} color="black" />
              </Pressable>
            </View>

            <ScrollView style={styles.itemList}>
              {selectedDoc?.options.map((opt, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemText}>
                    {typeof opt === "string" ? opt : opt.anomaly}
                  </Text>
                  <Pressable onPress={() => removeItem(index)}>
                    <MaterialCommunityIcons
                      name="delete-outline"
                      size={20}
                      color="red"
                    />
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Add new item..."
                value={newItemText}
                onChangeText={setNewItemText}
              />
              <Pressable style={styles.addButton} onPress={addItem}>
                <Text style={styles.addButtonText}>ADD</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  settingCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  cardSub: { fontSize: 12, color: "#777", marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    height: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold" },
  itemList: { flex: 1 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemText: { fontSize: 15 },
  inputContainer: { flexDirection: "row", marginTop: 10, paddingBottom: 20 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginRight: 10,
  },
  addButton: {
    backgroundColor: "#007bff",
    padding: 12,
    borderRadius: 8,
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "bold" },
});
